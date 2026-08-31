'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · useMultiplayer hook
// Single source of truth for multiplayer state on the client.
// Wraps NetClient, manages lobby/match/snapshot state.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from 'react';
import { NetClient, ConnectionStatus } from './NetClient';
import {
  LobbyState, LobbyServerMessage, LobbyClientMessage, PlayerProfile,
  ClientCommand, GameStateSnapshot, MatchResultsPayload, MatchPhase,
  LobbyErrorCode, NET,
} from '../protocol';

// ── State shape ─────────────────────────────────────────────

export interface MultiplayerState {
  status: ConnectionStatus;
  ping: number;
  profile: PlayerProfile | null;
  phase: MatchPhase;
  lobby: LobbyState | null;
  // Match state
  latestSnapshot: GameStateSnapshot | null;
  results: MatchResultsPayload | null;
  // UI feedback
  error: { code: LobbyErrorCode; message: string } | null;
  info: string | null;
  // Quick match search
  quickMatch: {
    searching: boolean;
    searchId: string | null;
    playersFound: number;
    playersNeeded: number;
    elapsedSec: number;
  } | null;
  // Countdown
  countdownEndsAt: number | null;
  // Reconnect
  reconnecting: boolean;
  // Authoritative local player ID — set from IDENTITY and LOBBY_JOINED.
  // Always available once the server has acknowledged us, even if profile
  // hasn't fully propagated yet.
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

// ── Simple external store (avoids react-router dependency) ──

class MPStore {
  private state: MultiplayerState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();
  private client: NetClient | null = null;
  private snapshotBuffer: GameStateSnapshot[] = [];

  getState = () => this.state;

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  };

  private set(patch: Partial<MultiplayerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  init(): NetClient {
    if (this.client) return this.client;
    this.client = new NetClient({
      onMessage: (msg) => this.handleMessage(msg),
      onStatusChange: (status, ping) => this.set({ status, ping }),
      onReconnectFailed: () => this.set({
        error: { code: 'SERVER_ERROR', message: 'CANNOT REACH MATCH SERVER' },
        reconnecting: false,
      }),
    });
    return this.client;
  }

  connect(reconnectToken?: string) {
    const c = this.init();
    if (reconnectToken) {
      this.set({ reconnecting: true });
    }
    c.connect(reconnectToken);
  }

  send(msg: LobbyClientMessage) {
    if (!this.client) return false;
    return this.client.send(msg);
  }

  // ── Message handler ──────────────────────────────────────

  private handleMessage(msg: LobbyServerMessage) {
    switch (msg.type) {
      case 'IDENTITY':
        // Set both profile and myPlayerId — myPlayerId is the authoritative
        // id used for lobby lookups, available immediately.
        this.set({ profile: msg.profile, myPlayerId: msg.profile.playerId });
        break;

      case 'LOBBY_JOINED':
        // LOBBY_JOINED carries yourPlayerId — use it as a fallback in case
        // IDENTITY hasn't been processed yet (race condition on join).
        this.set({
          lobby: msg.lobby,
          myPlayerId: msg.yourPlayerId ?? this.state.myPlayerId,
          profile: this.state.profile ?? (msg.yourPlayerId
            ? { playerId: msg.yourPlayerId, name: 'COMMANDER' }
            : null),
          phase: msg.lobby.status === 'COUNTDOWN' ? 'STARTING' :
                 msg.lobby.status === 'IN_MATCH' ? 'IN_MATCH' :
                 msg.lobby.status === 'CLOSED' ? 'FINISHED' : 'LOBBY',
          countdownEndsAt: msg.lobby.countdownEndsAt ?? null,
          error: null,
        });
        break;

      case 'LOBBY_STATE':
        this.set({
          lobby: msg.lobby,
          phase: msg.lobby.status === 'COUNTDOWN' ? 'STARTING' :
                 msg.lobby.status === 'IN_MATCH' ? 'IN_MATCH' :
                 msg.lobby.status === 'CLOSED' ? 'FINISHED' : 'LOBBY',
          countdownEndsAt: msg.lobby.countdownEndsAt ?? null,
          error: null,
        });
        break;

      case 'LOBBY_ERROR':
        this.set({ error: { code: msg.code, message: msg.message } });
        // Auto-clear error after 5 seconds
        setTimeout(() => {
          if (this.state.error?.message === msg.message) {
            this.set({ error: null });
          }
        }, 5000);
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
        setTimeout(() => {
          if (this.state.info === 'MATCH FOUND') this.set({ info: null });
        }, 3000);
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
        break;

      case 'MATCH_STARTING':
        this.set({
          phase: 'LOADING',
          countdownEndsAt: null,
        });
        break;

      case 'MATCH_STARTED':
        this.snapshotBuffer = [msg.initialState];
        this.set({
          phase: 'IN_MATCH',
          latestSnapshot: msg.initialState,
          results: null,
        });
        break;

      case 'MATCH_SNAPSHOT':
        this.snapshotBuffer.push(msg.snapshot);
        if (this.snapshotBuffer.length > 4) this.snapshotBuffer.shift();
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
        break;

      case 'PLAYER_JOINED':
      case 'PLAYER_LEFT':
      case 'PLAYER_READY_CHANGED':
      case 'PLAYER_TEAM_CHANGED':
      case 'HOST_CHANGED':
      case 'CONFIG_UPDATED':
        // Server will follow up with LOBBY_STATE — wait for it
        break;

      case 'CONNECTION_STATUS':
        // Already handled via onStatusChange
        break;

      case 'RECONNECTED':
        this.set({
          reconnecting: false,
          lobby: msg.lobby,
          latestSnapshot: msg.snapshot ?? null,
          phase: msg.snapshot ? 'IN_MATCH' :
                 msg.lobby.status === 'IN_MATCH' ? 'IN_MATCH' : 'LOBBY',
          info: 'RECONNECTED',
        });
        // myPlayerId is preserved across reconnection — the server resumes
        // the same session via reconnectToken.
        setTimeout(() => {
          if (this.state.info === 'RECONNECTED') this.set({ info: null });
        }, 3000);
        break;

      case 'INFO':
        this.set({ info: msg.message });
        setTimeout(() => {
          if (this.state.info === msg.message) this.set({ info: null });
        }, 4000);
        break;
    }
  }

  // ── Command helpers ──────────────────────────────────────

  sendCommand(command: ClientCommand) {
    return this.send({ type: 'SEND_COMMAND', command });
  }

  dispose() {
    if (this.client) {
      this.client.dispose();
      this.client = null;
    }
    this.state = { ...INITIAL_STATE };
    for (const l of this.listeners) l();
  }

  // ── Snapshot buffer for interpolation ────────────────────
  getSnapshots(): GameStateSnapshot[] {
    return this.snapshotBuffer;
  }
}

// ── Singleton instance (per browser tab) ───────────────────

let _store: MPStore | null = null;

function getStore(): MPStore {
  if (typeof window === 'undefined') {
    // SSR — return a stub that does nothing
    return new MPStore();
  }
  if (!_store) _store = new MPStore();
  return _store;
}

// ── React hook ─────────────────────────────────────────────

export function useMultiplayer() {
  const store = getStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Auto-connect on first mount
  useEffect(() => {
    store.connect();
    return () => {
      // Don't dispose on unmount — keep connection alive across navigations
      // (user might navigate between landing and /play)
    };
  }, [store]);

  const send = useCallback((msg: LobbyClientMessage) => store.send(msg), [store]);
  const sendCommand = useCallback((cmd: ClientCommand) => store.sendCommand(cmd), [store]);

  return { state, send, sendCommand, store };
}

// ── Connection quality helper ──────────────────────────────

export function connectionQuality(ping: number, status: ConnectionStatus):
  'GOOD' | 'DEGRADED' | 'DISCONNECTED' {
  if (status === 'DISCONNECTED' && !ping) return 'DISCONNECTED';
  if (status === 'RECONNECTING') return 'DEGRADED';
  if (status === 'CONNECTING') return 'DEGRADED';
  if (ping > 300) return 'DEGRADED';
  return 'GOOD';
}
