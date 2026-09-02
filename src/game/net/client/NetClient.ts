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
//
// Transport: WebSocket primary, polling fallback.
//   WebSocket gives ~5ms RTT locally. Polling gives ~500-1500ms through a proxy.
//   We let socket.io upgrade to WebSocket automatically — Caddy v2 supports it.
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
  private connecting = false;
  // RTT measurement — smoothed average for stability
  private rttHistory: number[] = [];
  private static readonly RTT_SAMPLES = 5;

  constructor(opts: NetClientOptions) {
    this.opts = opts;
  }

  connect(reconnectToken?: string): void {
    if (this.socket?.connected) return;
    if (this.connecting && this.socket) return;
    if (this.socket) this.destroySocket();

    this.disposed = false;
    this.connecting = true;
    this.setStatus('CONNECTING');

    this.socket = io({
      path: '/socket.io',
      // Try WebSocket first — if it works, RTT is ~1-5ms.
      // Fall back to polling if WS is unavailable.
      // Both work through Caddy v2 (confirmed via HTTP 101 upgrade test).
      transports: ['websocket', 'polling'],
      upgrade: true,
      // Socket.io's built-in reconnection.
      reconnection: true,
      reconnectionAttempts: NET.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: NET.RECONNECT_BACKOFF_MS[0],
      reconnectionDelayMax: NET.RECONNECT_BACKOFF_MS[NET.RECONNECT_BACKOFF_MS.length - 1],
      auth: reconnectToken ? { reconnectToken } : undefined,
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
      // socket.io retries automatically.
    });

    // Proper timestamped PING/PONG for RTT measurement.
    // Server echoes back the timestamp — we compute pure network RTT.
    s.on('pong_ts', (clientTimestamp: number) => {
      const rtt = Date.now() - clientTimestamp;
      this.recordRTT(rtt);
    });
  }

  private recordRTT(rtt: number) {
    this.rttHistory.push(rtt);
    if (this.rttHistory.length > NetClient.RTT_SAMPLES) this.rttHistory.shift();
    // Use median for stability (less affected by outliers)
    const sorted = [...this.rttHistory].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    this.ping = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
    this.opts.onStatusChange('CONNECTED', this.ping);
  }

  private startPingLoop() {
    this.stopPingLoop();
    // Send timestamped ping immediately, then on interval.
    this.sendPing();
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, NET.PING_INTERVAL_MS);
  }

  private sendPing() {
    if (!this.socket?.connected) return;
    // Timestamped ping — server echoes it back as 'pong_ts'.
    // RTT = currentTime - timestamp (pure network round-trip).
    this.socket.emit('ping_ts', Date.now());
  }

  private stopPingLoop() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatusChange(s, this.ping);
  }

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
