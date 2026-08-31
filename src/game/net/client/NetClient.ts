'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · NetClient
// Browser-side socket.io wrapper. Handles connection, reconnection,
// ping measurement, and message dispatch.
// ─────────────────────────────────────────────────────────────

import { io, Socket } from 'socket.io-client';
import {
  LobbyClientMessage, LobbyServerMessage, NET, PlayerProfile,
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
  private reconnectAttempts = 0;
  private lastReconnectToken: string | null = null;
  private disposed = false;
  // Track if we've been connected before (for reconnect logic)
  private everConnected = false;

  constructor(opts: NetClientOptions) {
    this.opts = opts;
  }

  connect(reconnectToken?: string) {
    if (this.socket?.connected) return;
    this.lastReconnectToken = reconnectToken ?? null;
    this.disposed = false;
    this.setStatus('CONNECTING');

    // CRITICAL: per the fullstack-dev skill gateway rules:
    // - Must use a RELATIVE connection (same origin, goes through Caddy on :81)
    // - Must add ?XTransformPort=3030 so Caddy routes to the match-server
    // - Path must be /socket.io (the default)
    // Calling io() with no URL uses window.location.origin automatically.
    this.socket = io({
      path: '/socket.io',
      // Polling only for now — Caddy WebSocket upgrade has issues.
      // Polling is slower but reliable through the gateway.
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: NET.MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: NET.RECONNECT_BACKOFF_MS[0],
      reconnectionDelayMax: NET.RECONNECT_BACKOFF_MS[NET.RECONNECT_BACKOFF_MS.length - 1],
      auth: reconnectToken ? { reconnectToken } : undefined,
      // CRITICAL: this is how the gateway routes us to port 3030
      query: { XTransformPort: '3030' },
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[NetClient] ✓ connected, id=', this.socket?.id);
      this.everConnected = true;
      this.reconnectAttempts = 0;
      this.setStatus('CONNECTED');
      this.startPingLoop();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[NetClient] disconnected:', reason);
      this.stopPingLoop();
      if (this.disposed) {
        this.setStatus('DISCONNECTED');
        return;
      }
      // If we've been connected before, treat as RECONNECTING
      if (this.everConnected) {
        this.setStatus('RECONNECTING');
      } else {
        this.setStatus('CONNECTING');
      }
    });

    this.socket.on('reconnect_attempt', (attempt) => {
      console.log('[NetClient] reconnect attempt', attempt);
      this.reconnectAttempts = attempt;
      this.setStatus('RECONNECTING');
    });

    this.socket.on('reconnect_failed', () => {
      console.log('[NetClient] reconnect failed');
      this.opts.onReconnectFailed();
      this.setStatus('DISCONNECTED');
    });

    this.socket.on('reconnect', () => {
      console.log('[NetClient] reconnected');
      this.reconnectAttempts = 0;
      this.setStatus('CONNECTED');
    });

    this.socket.on('msg', (msg: LobbyServerMessage) => {
      this.opts.onMessage(msg);
    });

    this.socket.on('connect_error', (err) => {
      console.warn('[NetClient] connect_error', err.message, err.context || '');
    });
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      const t0 = Date.now();
      this.socket.emit('ping', () => {
        this.ping = Date.now() - t0;
        // Re-evaluate status based on ping
        if (this.ping > 400) {
          this.opts.onStatusChange('CONNECTED', this.ping);
          // We don't downgrade to DEGRADED here — that's a UI concern.
          // The UI layer decides based on ping.
        } else {
          this.opts.onStatusChange('CONNECTED', this.ping);
        }
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

  send(msg: LobbyClientMessage) {
    if (!this.socket?.connected) {
      console.warn('[NetClient] cannot send — not connected', msg.type);
      return false;
    }
    this.socket.emit('msg', msg);
    return true;
  }

  get connected() { return this.socket?.connected ?? false; }
  get currentStatus() { return this.status; }
  get currentPing() { return this.ping; }

  dispose() {
    this.disposed = true;
    this.stopPingLoop();
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.setStatus('DISCONNECTED');
  }
}
