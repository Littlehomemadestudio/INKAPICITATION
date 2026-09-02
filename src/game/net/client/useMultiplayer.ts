'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · useMultiplayer hook
// Single source of truth for multiplayer state on the client.
//
// Connection lifecycle:
//   1. On mount: connect with stored playerId as reconnect token
//   2. On IDENTITY: store playerId, clear reconnecting flag
//   3. On disconnect: set RECONNECTING, keep lobby state (server may restore it)
//   4. On reconnect: if server sends RECONNECTED, restore lobby/match state
//   5. On reconnect with new session (no RECONNECTED): clear stale lobby state
//
// Stale state prevention:
//   - If we receive IDENTITY with a NEW playerId (different from stored),
//     the server was restarted or our session expired. Clear all lobby/match state.
//   - If we receive LOBBY_STATE and our myPlayerId is NOT in the lobby's players,
//     we're seeing someone else's lobby or a stale state — clear it.
// ─────────────────────────────────────────────────────────────

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { NetClient, ConnectionStatus } from './NetClient';
import {
  LobbyState, LobbyServerMessage, LobbyClientMessage, PlayerProfile,
  ClientCommand, GameStateSnapshot, MatchResultsPayload, MatchPhase,
  LobbyErrorCode,
} from '../protocol';

// ── State shape ─────────────────────────────────────────────

export interface MultiplayerState {
  status: ConnectionStatus;
  ping: number;
  profile: PlayerProfile | null;
  phase: MatchPhase;
  lobby: LobbyState | null;
  latestSnapshot: GameStateSnapshot | null;
  results: MatchResultsPayload | null;
  error: { code: LobbyErrorCode; message: string } | null;
  info: string | null;
  quickMatch: {
    searching: boolean;
    searchId: string | null;
    playersFound: number;
    playersNeeded: number;
    elapsedSec: number;
  } | null;
  countdownEndsAt: number | null;
  reconnecting: boolean;
  myPlayerId: string | null;
}

const INITIAL_STATE: MultiplayerState = {
  status: 'DISCONNECTED',
  ping: 0,
  profile: null,
  myPlayerId: null,
  phase: 'SEARCHING',
  lobby: null,
  latestSnapshot: null,
  results: null,
  error: null,
  info: null,
  quickMatch: null,
  countdownEndsAt: null,
  reconnecting: false,
};

const STORAGE_KEY = 'ps_mp_player_id';

// ── MPStore ─────────────────────────────────────────────────

class MPStore {
  private state: MultiplayerState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();
  private client: NetClient | null = null;
  private storedPlayerId: string | null = null;
  private infoTimeout: ReturnType<typeof setTimeout> | null = null;
  private errorTimeout: ReturnType<typeof setTimeout> | null = null;

  getState = (): MultiplayerState => this.state;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  private set(patch: Partial<MultiplayerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Connection ───────────────────────────────────────────

  private ensureClient(): NetClient {
    if (this.client) return this.client;
    this.client = new NetClient({
      onMessage: (msg) => this.handleMessage(msg),
      onStatusChange: (status, ping) => {
        if (status === 'RECONNECTING') {
          this.set({ status, ping, reconnecting: true });
        } else if (status === 'DISCONNECTED') {
          // Permanent disconnect — clear reconnecting, keep lobby state
          // (the user can still see the lobby they were in)
          this.set({ status, ping, reconnecting: false });
        } else {
          this.set({ status, ping });
        }
      },
      onReconnectFailed: () => {
        // Socket.io gave up reconnecting. Show error, clear reconnecting.
        this.set({
          error: { code: 'SERVER_ERROR', message: 'CANNOT REACH MATCH SERVER' },
          reconnecting: false,
        });
      },
    });
    return this.client;
  }

  connect(): void {
    const c = this.ensureClient();
    const token = this.loadStoredToken();
    c.connect(token ?? undefined);
  }

  private loadStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      this.storedPlayerId = id;
      return id;
    } catch {
      return null;
    }
  }

  private saveStoredToken(id: string): void {
    this.storedPlayerId = id;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }

  private clearStoredToken(): void {
    this.storedPlayerId = null;
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // ── Send ─────────────────────────────────────────────────

  send(msg: LobbyClientMessage): boolean {
    if (!this.client) return false;
    return this.client.send(msg);
  }

  sendCommand(command: ClientCommand): boolean {
    return this.send({ type: 'SEND_COMMAND', command });
  }

  // ── Message handler ──────────────────────────────────────

  private handleMessage(msg: LobbyServerMessage) {
    switch (msg.type) {
      case 'IDENTITY': {
        const newId = msg.profile.playerId;
        const hadOldId = this.storedPlayerId && this.storedPlayerId !== newId;
        // If the server gave us a different ID than what we stored,
        // the server was restarted or our session expired.
        // Clear all stale lobby/match state.
        if (hadOldId) {
          this.set({
            ...INITIAL_STATE,
            status: this.state.status,
            ping: this.state.ping,
            profile: msg.profile,
            myPlayerId: newId,
            reconnecting: false,
          });
        } else {
          this.set({
            profile: msg.profile,
            myPlayerId: newId,
            reconnecting: false,
          });
        }
        this.saveStoredToken(newId);
        break;
      }

      case 'RECONNECTED': {
        // Server confirmed our session is restored.
        this.set({
          reconnecting: false,
          lobby: msg.lobby,
          latestSnapshot: msg.snapshot ?? null,
          phase: msg.snapshot ? 'IN_MATCH' :
                 msg.lobby.status === 'IN_MATCH' ? 'IN_MATCH' : 'LOBBY',
          info: 'RECONNECTED',
        });
        this.queueInfoClear('RECONNECTED', 3000);
        break;
      }

      case 'LOBBY_JOINED': {
        const myId = msg.yourPlayerId ?? this.state.myPlayerId;
        // Verify our player is actually in the lobby roster
        const amInLobby = msg.lobby.players.some(p => p.playerId === myId);
        if (!amInLobby) {
          // Stale state — we're not in this lobby. Ignore.
          break;
        }
        this.set({
          lobby: msg.lobby,
          myPlayerId: myId,
          profile: this.state.profile ?? (myId
            ? { playerId: myId, name: 'COMMANDER' }
            : null),
          phase: this.phaseFromLobby(msg.lobby),
          countdownEndsAt: msg.lobby.countdownEndsAt ?? null,
          error: null,
        });
        break;
      }

      case 'LOBBY_STATE': {
        // If we have a myPlayerId, verify we're in this lobby.
        // If we're NOT in the roster but have a lobby, it's stale — clear it.
        if (this.state.myPlayerId && this.state.lobby?.lobbyId === msg.lobby.lobbyId) {
          const amInLobby = msg.lobby.players.some(p => p.playerId === this.state.myPlayerId);
          if (!amInLobby) {
            // We were removed from the lobby (kicked or lobby closed)
            this.set({
              lobby: null,
              phase: 'SEARCHING',
              latestSnapshot: null,
              results: null,
              countdownEndsAt: null,
            });
            break;
          }
        }
        this.set({
          lobby: msg.lobby,
          phase: this.phaseFromLobby(msg.lobby),
          countdownEndsAt: msg.lobby.countdownEndsAt ?? null,
          error: null,
        });
        break;
      }

      case 'LOBBY_ERROR':
        this.set({ error: { code: msg.code, message: msg.message } });
        this.queueErrorClear(msg.message, 5000);
        break;

      case 'LOBBY_LEFT':
        this.set({
          lobby: null,
          phase: 'SEARCHING',
          latestSnapshot: null,
          results: null,
          quickMatch: null,
          countdownEndsAt: null,
          info: msg.reason,
        });
        this.queueInfoClear(msg.reason, 4000);
        break;

      case 'QUICK_MATCH_SEARCHING':
        this.set({
          phase: 'SEARCHING',
          quickMatch: {
            searching: true,
            searchId: msg.searchId,
            playersFound: 1,
            playersNeeded: 4,
            elapsedSec: 0,
          },
          error: null,
        });
        break;

      case 'QUICK_MATCH_PROGRESS':
        if (this.state.quickMatch) {
          this.set({
            quickMatch: {
              ...this.state.quickMatch,
              playersFound: msg.playersFound,
              playersNeeded: msg.playersNeeded,
              elapsedSec: msg.elapsedSec,
            },
          });
        }
        break;

      case 'QUICK_MATCH_FOUND':
        this.set({
          phase: 'LOBBY',
          quickMatch: null,
          info: 'MATCH FOUND',
        });
        this.queueInfoClear('MATCH FOUND', 3000);
        break;

      case 'QUICK_MATCH_CANCELLED':
        this.set({ quickMatch: null, phase: 'SEARCHING' });
        break;

      case 'COUNTDOWN':
        this.set({
          phase: 'STARTING',
          countdownEndsAt: msg.endsAt,
        });
        break;

      case 'COUNTDOWN_CANCELLED':
        this.set({
          phase: 'LOBBY',
          countdownEndsAt: null,
          info: `COUNTDOWN CANCELLED — ${msg.reason}`,
        });
        this.queueInfoClear(`COUNTDOWN CANCELLED — ${msg.reason}`, 4000);
        break;

      case 'MATCH_STARTING':
        this.set({
          phase: 'LOADING',
          countdownEndsAt: null,
        });
        break;

      case 'MATCH_STARTED':
        this.set({
          phase: 'IN_MATCH',
          latestSnapshot: msg.initialState,
          results: null,
        });
        break;

      case 'MATCH_SNAPSHOT':
        this.set({ latestSnapshot: msg.snapshot });
        break;

      case 'MATCH_RESULT':
        this.set({
          phase: 'RESULTS',
          results: msg.results,
        });
        break;

      case 'MATCH_ENDED':
        this.set({
          phase: 'RESULTS',
          results: msg.results ?? null,
          info: msg.reason,
        });
        this.queueInfoClear(msg.reason, 4000);
        break;

      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_READY_CHANGED':
      case 'PLAYER_TEAM_CHANGED':
      case 'HOST_CHANGED':
      case 'CONFIG_UPDATED':
        // Server follows up with LOBBY_STATE — handled there
        break;

      case 'CONNECTION_STATUS':
        break;

      case 'INFO':
        this.set({ info: msg.message });
        this.queueInfoClear(msg.message, 4000);
        break;
    }
  }

  private phaseFromLobby(lobby: LobbyState): MatchPhase {
    if (lobby.status === 'COUNTDOWN') return 'STARTING';
    if (lobby.status === 'IN_MATCH') return 'IN_MATCH';
    if (lobby.status === 'CLOSED') return 'FINISHED';
    return 'LOBBY';
  }

  private queueInfoClear(text: string, ms: number) {
    if (this.infoTimeout) clearTimeout(this.infoTimeout);
    this.infoTimeout = setTimeout(() => {
      if (this.state.info === text) this.set({ info: null });
    }, ms);
  }

  private queueErrorClear(text: string, ms: number) {
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => {
      if (this.state.error?.message === text) this.set({ error: null });
    }, ms);
  }

  // ── Lifecycle ───────────────────────────────────────────

  dispose(): void {
    if (this.infoTimeout) clearTimeout(this.infoTimeout);
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
    this.state = { ...INITIAL_STATE };
    for (const l of this.listeners) l();
  }
}

// ── Singleton (per browser tab) ─────────────────────────────

let _store: MPStore | null = null;

function getStore(): MPStore {
  if (typeof window === 'undefined') {
    // SSR — return a throwaway store that does nothing
    return new MPStore();
  }
  if (!_store) _store = new MPStore();
  return _store;
}

// ── React hook ─────────────────────────────────────────────

export function useMultiplayer() {
  const store = getStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Auto-connect on first mount. The NetClient.connect() is idempotent,
  // so calling it multiple times (HMR, Strict Mode) is safe.
  useEffect(() => {
    store.connect();
  }, [store]);

  const send = useCallback((msg: LobbyClientMessage) => store.send(msg), [store]);
  const sendCommand = useCallback((cmd: ClientCommand) => store.sendCommand(cmd), [store]);

  return { state, send, sendCommand, store };
}

// ── Connection quality helper ──────────────────────────────

export function connectionQuality(ping: number, status: ConnectionStatus):
  'GOOD' | 'DEGRADED' | 'DISCONNECTED' {
  if (status === 'DISCONNECTED') return 'DISCONNECTED';
  if (status === 'RECONNECTING' || status === 'CONNECTING') return 'DEGRADED';
  if (ping > 300) return 'DEGRADED';
  return 'GOOD';
}
