'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · NetClient
// Browser-side socket.io wrapper with a clean connection lifecycle.
//
// State machine:
//   DISCONNECTED → CONNECTING → CONNECTED → (RECONNECTING → CONNECTED)* → DISCONNECTED
//
// Guarantees:
//   - Only ONE socket exists at any time
//   - Event listeners are attached exactly once per socket
//   - Reconnect attempts are controlled by socket.io's built-in reconnection
//   - Calling connect() while already connected is a no-op
//   - Calling connect() while connecting is a no-op
//   - Calling connect() after a disconnect cleanly disposes the old socket first
// ─────────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import {
  LobbyClientMessage, LobbyServerMessage, NET,
} from '../protocol';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export interface NetClientOptions {
  onMessage: (msg: LobbyServerMessage) => void;
  onStatusChange: (status: ConnectionStatus, ping: number) => void;
  onReconnectFailed: () => void;
}

export class NetClient {
  private socket: Socket | null = null;
  private opts: NetClientOptions;
  private status: ConnectionStatus = 'DISCONNECTED';
  private ping = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private connecting = false; // guards against duplicate connect() calls

  constructor(opts: NetClientOptions) {
    this.opts = opts;
  }

  /**
   * Connect to the server. Idempotent — calling while already connected
   * or while a connection attempt is in progress is a no-op.
   * If a previous socket exists (disconnected), it is cleaned up first.
   */
  connect(reconnectToken?: string): void {
    // Already connected — nothing to do
    if (this.socket?.connected) return;
    // Connection attempt already in progress — don't start a second one
    if (this.connecting && this.socket) return;

    // Clean up any stale socket first
    if (this.socket) {
      this.destroySocket();
    }

    this.disposed = false;
    this.connecting = true;
    this.setStatus('CONNECTING');

    this.socket = io({
      path: '/socket.io',
      // Polling only — Caddy WebSocket upgrade is unreliable through the gateway.
      transports: ['polling'],
      upgrade: false,
      // Socket.io's built-in reconnection handles retry logic.
      reconnection: true,
      reconnectionAttempts: NET.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: NET.RECONNECT_BACKOFF_MS[0],
      reconnectionDelayMax: NET.RECONNECT_BACKOFF_MS[NET.RECONNECT_BACKOFF_MS.length - 1],
      auth: reconnectToken ? { reconnectToken } : undefined,
      // CRITICAL: this is how the Caddy gateway routes us to port 3030
      query: { XTransformPort: '3030' },
      timeout: 10000,
    });

    this.attachListeners();
  }

  private attachListeners() {
    const s = this.socket;
    if (!s) return;

    s.on('connect', () => {
      this.connecting = false;
      this.setStatus('CONNECTED');
      this.startPingLoop();
    });

    s.on('disconnect', (reason) => {
      this.stopPingLoop();
      if (this.disposed) {
        this.setStatus('DISCONNECTED');
        return;
      }
      // socket.io will auto-reconnect unless reason is a permanent failure
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        this.setStatus('DISCONNECTED');
      } else {
        this.setStatus('RECONNECTING');
      }
    });

    s.on('reconnect_attempt', () => {
      this.setStatus('RECONNECTING');
    });

    s.on('reconnect_failed', () => {
      this.connecting = false;
      this.opts.onReconnectFailed();
      this.setStatus('DISCONNECTED');
    });

    s.on('reconnect', () => {
      this.setStatus('CONNECTED');
    });

    s.on('msg', (msg: LobbyServerMessage) => {
      this.opts.onMessage(msg);
    });

    s.on('connect_error', (_err) => {
      // Don't spam console — socket.io retries automatically.
      // The status is already RECONNECTING from the disconnect handler.
    });
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      const t0 = Date.now();
      this.socket.emit('ping', () => {
        this.ping = Date.now() - t0;
        this.opts.onStatusChange('CONNECTED', this.ping);
      });
    }, NET.PING_INTERVAL_MS);
  }

  private stopPingLoop() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatusChange(s, this.ping);
  }

  /**
   * Send a message to the server. Returns false if not connected.
   * Does NOT throw — callers should check the return value.
   */
  send(msg: LobbyClientMessage): boolean {
    if (!this.socket?.connected) return false;
    this.socket.emit('msg', msg);
    return true;
  }
  private destroySocket() {
    this.stopPingLoop();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connecting = false;
  }

  get connected(): boolean { return this.socket?.connected ?? false; }
  get currentStatus(): ConnectionStatus { return this.status; }
  get currentPing(): number { return this.ping; }

  dispose() {
    this.disposed = true;
    this.destroySocket();
    this.setStatus('DISCONNECTED');
  }
}
