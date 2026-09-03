// ─────────────────────────────────────────────────────────────
// PAPER STORM · MatchServer
// Authoritative lobby + match registry with a clean lifecycle.
//
// Guarantees:
//   - One player per connection (no duplicates)
//   - Reconnection restores the same player (via reconnect token)
//   - Lobby state is consistent across all clients
//   - Host migration on host disconnect
//   - AI backfill for disconnected players (if enabled)
//   - Matches are cleaned up when they end or all players leave
//   - No orphaned matches or players
// ─────────────────────────────────────────────────────────────

import { Server as IOServer, Socket } from 'socket.io';
import { nanoid } from 'nanoid';
import {
  LobbyState, LobbyPlayer, LobbyConfig, PlayerProfile, Team, GameMode,
  LobbyClientMessage, LobbyServerMessage, LobbyErrorCode,
  DEFAULT_LOBBY_CONFIG, NET, ClientCommand, MP_MAP_SEEDS,
} from '../../src/game/net/protocol';
import { ServerGame } from '../../src/game/net/server/ServerGame';

// ── Player connection ───────────────────────────────────────

interface PlayerConn {
  playerId: string;
  name: string;
  socket: Socket | null;  // null when disconnected (pending reconnect)
  lobbyId: string | null;
  lastSeen: number;
}

// ── Lobby / Match ───────────────────────────────────────────

interface Match {
  matchId: string;
  game: ServerGame;
  timer: NodeJS.Timeout;
  startedAt: number;
}

interface Lobby {
  state: LobbyState;
  match: Match | null;
  teamsLocked: boolean;
}

interface QMSearch {
  searchId: string;
  playerId: string;
  name: string;
  mode: GameMode;
  teamSize: 1 | 2 | 3 | 4;
  startedAt: number;
}

// ── MatchServer ─────────────────────────────────────────────

export class MatchServer {
  private io: IOServer;
  private players = new Map<string, PlayerConn>();
  private lobbies = new Map<string, Lobby>();
  private quickMatchQueue: QMSearch[] = [];
  private quickMatchTimer: NodeJS.Timeout | null = null;

  constructor(io: IOServer) {
    this.io = io;
    this.startQuickMatchPoller();
  }

  // ── Connection lifecycle ─────────────────────────────────

  handleConnection(socket: Socket): void {
    const reconnectToken = socket.handshake.auth?.reconnectToken as string | undefined;
    let playerId: string;
    let profile: PlayerProfile;

    if (reconnectToken && this.players.has(reconnectToken)) {
      // Reconnection: restore the existing player
      playerId = reconnectToken;
      const conn = this.players.get(playerId)!;
      // Clean up the old socket if it still exists
      if (conn.socket && conn.socket.connected) {
        conn.socket.removeAllListeners();
        conn.socket.disconnect();
      }
      conn.socket = socket;
      conn.lastSeen = Date.now();
      profile = { playerId, name: conn.name };
      this.handleReconnect(conn);
    } else {
      // New player
      playerId = `p_${nanoid(12)}`;
      const name = `COMMANDER_${playerId.slice(-4).toUpperCase()}`;
      this.players.set(playerId, {
        playerId, name, socket, lobbyId: null, lastSeen: Date.now(),
      });
      profile = { playerId, name };
    }

    socket.data.playerId = playerId;
    this.send(socket, { type: 'IDENTITY', profile });

    socket.on('msg', (msg: LobbyClientMessage) => {
      const conn = this.players.get(playerId);
      if (conn) conn.lastSeen = Date.now();
      this.handleMessage(playerId, msg).catch(err => {
        console.error(`[MatchServer] handleMessage error for ${playerId}:`, err);
        this.send(socket, { type: 'LOBBY_ERROR', code: 'SERVER_ERROR', message: 'INTERNAL ERROR' });
      });
    });

    socket.on('disconnect', () => {
      this.handleDisconnection(playerId);
    });

    console.log(`[MatchServer] connected: ${playerId} (${profile.name})`);
  }

  private handleReconnect(conn: PlayerConn): void {
    if (!conn.lobbyId) return;
    const lobby = this.lobbies.get(conn.lobbyId);
    if (!lobby) {
      this.send(conn.socket, { type: 'LOBBY_LEFT', reason: 'LOBBY NO LONGER EXISTS' });
      conn.lobbyId = null;
      return;
    }
    const lp = lobby.state.players.find(p => p.playerId === conn.playerId);
    if (!lp) return;
    lp.connected = true;
    if (lobby.match) {
      lobby.match.game.markPlayerReconnected(conn.playerId);
      const snapshot = lobby.match.game.snapshot(conn.playerId);
      this.send(conn.socket, { type: 'RECONNECTED', lobby: lobby.state, snapshot });
    } else {
      this.send(conn.socket, { type: 'RECONNECTED', lobby: lobby.state });
    }
    this.broadcastLobby(lobby);
  }

  private handleDisconnection(playerId: string): void {
    const conn = this.players.get(playerId);
    if (!conn) return;
    console.log(`[MatchServer] disconnected: ${playerId}`);

    conn.socket = null;
    this.quickMatchQueue = this.quickMatchQueue.filter(q => q.playerId !== playerId);

    if (!conn.lobbyId) {
      setTimeout(() => {
        const c = this.players.get(playerId);
        if (c && !c.socket && !c.lobbyId) this.players.delete(playerId);
      }, 30000);
      return;
    }

    const lobby = this.lobbies.get(conn.lobbyId);
    if (!lobby) { this.players.delete(playerId); return; }

    const lp = lobby.state.players.find(p => p.playerId === playerId);
    if (!lp) { this.players.delete(playerId); return; }

    if (lobby.match) {
      lobby.match.game.markPlayerDisconnected(playerId);
      lp.connected = false;
      if (lobby.state.config.aiFillEnabled) {
        lp.isAI = true;
        this.broadcast(lobby, {
          type: 'PLAYER_LEFT', playerId, reason: 'DISCONNECTED — AI ASSUMING COMMAND',
          replacedByAI: true,
        });
      } else {
        this.broadcast(lobby, { type: 'PLAYER_LEFT', playerId, reason: 'DISCONNECTED' });
      }
      this.broadcastLobby(lobby);
      return;
    }

    lp.connected = false;
    if (lobby.state.hostId === playerId) {
      const nextHost = lobby.state.players.find(
        p => p.playerId !== playerId && p.connected && !p.isAI
      );
      if (nextHost) {
        lobby.state.hostId = nextHost.playerId;
        nextHost.isHost = true;
        this.broadcast(lobby, { type: 'HOST_CHANGED', newHostId: nextHost.playerId });
      } else {
        setTimeout(() => {
          const c = this.players.get(playerId);
          if (c && !c.socket) this.closeLobby(lobby, 'HOST DISCONNECTED');
        }, 30000);
        return;
      }
    }
    this.broadcast(lobby, { type: 'PLAYER_LEFT', playerId, reason: 'DISCONNECTED' });
    this.broadcastLobby(lobby);

    const anyConnected = lobby.state.players.some(p => p.connected && !p.isAI);
    if (!anyConnected) {
      setTimeout(() => {
        const l = this.lobbies.get(lobby.state.lobbyId);
        if (l && !l.state.players.some(p => p.connected && !p.isAI))
          this.closeLobby(l, 'ALL PLAYERS DISCONNECTED');
      }, 30000);
    }
  }

  // ── Message dispatch ─────────────────────────────────────

  private async handleMessage(playerId: string, msg: LobbyClientMessage): Promise<void> {
    const conn = this.players.get(playerId);
    if (!conn) return;

    switch (msg.type) {
      case 'CREATE_LOBBY':       return this.createLobby(conn, msg.name, msg.config);
      case 'JOIN_BY_CODE':       return this.joinByCode(conn, msg.code, msg.name);
      case 'QUICK_MATCH':        return this.startQuickMatch(conn, msg.name, msg.mode, msg.teamSize);
      case 'LEAVE_LOBBY':        return this.leaveLobby(conn);
      case 'SET_TEAM':           return this.setTeam(conn, msg.team);
      case 'SET_READY':          return this.setReady(conn, msg.ready);
      case 'SET_NAME':           return this.setName(conn, msg.name);
      case 'HOST_UPDATE_CONFIG': return this.hostUpdateConfig(conn, msg.config);
      case 'HOST_KICK':          return this.hostKick(conn, msg.playerId);
      case 'HOST_TRANSFER':      return this.hostTransfer(conn, msg.playerId);
      case 'HOST_LOCK_TEAMS':    return this.hostLockTeams(conn, msg.locked);
      case 'HOST_START_MATCH':   return this.hostStartMatch(conn);
      case 'HOST_CANCEL_COUNTDOWN': return this.hostCancelCountdown(conn);
      case 'CANCEL_QUICK_MATCH': return this.cancelQuickMatch(conn);
      case 'SEND_COMMAND':       return this.sendCommand(conn, msg.command);
      case 'REQUEST_STATE':      return this.requestState(conn);
      case 'RETURN_TO_LOBBY':    return this.returnToLobby(conn);
    }
  }

  // ── Lobby operations ─────────────────────────────────────

  private createLobby(conn: PlayerConn, name: string, config?: Partial<LobbyConfig>): void {
    if (conn.lobbyId) this.leaveLobby(conn);
    conn.name = this.sanitizeName(name, conn.playerId);
    const lobby = this.newLobby(conn, { ...DEFAULT_LOBBY_CONFIG, ...config, privateLobby: true });
    this.send(conn.socket, { type: 'LOBBY_JOINED', lobby: lobby.state, yourPlayerId: conn.playerId });
    this.send(conn.socket, { type: 'INFO', message: `LOBBY CREATED — JOIN CODE ${lobby.state.joinCode}` });
  }

  private joinByCode(conn: PlayerConn, code: string, name: string): void {
    if (conn.lobbyId) this.leaveLobby(conn);
    conn.name = this.sanitizeName(name, conn.playerId);
    const c = code.toUpperCase().trim();
    const lobby = [...this.lobbies.values()].find(l => l.state.joinCode === c);
    if (!lobby) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'INVALID_CODE', message: 'NO LOBBY WITH THAT CODE' });
      return;
    }
    if (lobby.state.status === 'CLOSED') {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'LOBBY_CLOSED', message: 'LOBBY CLOSED' });
      return;
    }
    if (lobby.state.status === 'IN_MATCH' || lobby.state.status === 'COUNTDOWN') {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'MATCH_ALREADY_STARTED', message: 'MATCH ALREADY IN PROGRESS' });
      return;
    }
    if (lobby.state.players.filter(p => !p.isAI).length >= lobby.state.config.maxPlayers) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'LOBBY_FULL', message: 'LOBBY FULL' });
      return;
    }
    this.addPlayerToLobby(conn, lobby);
    this.send(conn.socket, { type: 'LOBBY_JOINED', lobby: lobby.state, yourPlayerId: conn.playerId });
    this.broadcastLobby(lobby);
  }

  private leaveLobby(conn: PlayerConn): void {
    if (!conn.lobbyId) return;
    const lobby = this.lobbies.get(conn.lobbyId);
    if (!lobby) { conn.lobbyId = null; return; }

    if (lobby.state.hostId === conn.playerId) {
      const next = lobby.state.players.find(
        p => p.playerId !== conn.playerId && p.connected && !p.isAI
      );
      if (next) {
        lobby.state.hostId = next.playerId;
        next.isHost = true;
        this.broadcast(lobby, { type: 'HOST_CHANGED', newHostId: next.playerId });
      } else {
        this.closeLobby(lobby, 'HOST LEFT');
        return;
      }
    }
    lobby.state.players = lobby.state.players.filter(p => p.playerId !== conn.playerId);
    conn.lobbyId = null;
    this.send(conn.socket, { type: 'LOBBY_LEFT', reason: 'LEFT LOBBY' });
    this.broadcastLobby(lobby);
    if (lobby.state.players.length === 0) this.closeLobby(lobby, 'LOBBY EMPTY');
  }

  private setTeam(conn: PlayerConn, team: Team): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.teamsLocked && lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'TEAMS_LOCKED', message: 'TEAMS LOCKED BY HOST' });
      return;
    }
    const lp = lobby.state.players.find(p => p.playerId === conn.playerId);
    if (!lp) return;
    const teamCount = lobby.state.players.filter(p => p.team === team && p.playerId !== conn.playerId).length;
    if (teamCount >= lobby.state.config.teams[team]) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'TEAMS_UNBALANCED', message: `${team} TEAM FULL` });
      return;
    }
    lp.team = team;
    this.broadcast(lobby, { type: 'PLAYER_TEAM_CHANGED', playerId: conn.playerId, team });
    this.broadcastLobby(lobby);
  }

  private setReady(conn: PlayerConn, ready: boolean): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    const lp = lobby.state.players.find(p => p.playerId === conn.playerId);
    if (!lp || lp.isAI) return;
    lp.status = ready ? 'READY' : 'NOT_READY';
    this.broadcast(lobby, { type: 'PLAYER_READY_CHANGED', playerId: conn.playerId, ready });
    this.broadcastLobby(lobby);
  }

  private setName(conn: PlayerConn, name: string): void {
    conn.name = this.sanitizeName(name, conn.playerId);
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    const lp = lobby.state.players.find(p => p.playerId === conn.playerId);
    if (lp) lp.name = conn.name;
    this.broadcastLobby(lobby);
  }

  private hostUpdateConfig(conn: PlayerConn, config: Partial<LobbyConfig>): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_HOST', message: 'ONLY HOST CAN CHANGE CONFIG' });
      return;
    }
    if (lobby.state.status !== 'OPEN') {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'SERVER_ERROR', message: 'CANNOT CHANGE CONFIG NOW' });
      return;
    }
    if (config.teams) {
      const sum = config.teams.BLACK + config.teams.GRAY;
      if (sum !== (config.maxPlayers ?? lobby.state.config.maxPlayers)) {
        this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'TEAMS_UNBALANCED', message: 'TEAM SIZES MUST SUM TO MAX PLAYERS' });
        return;
      }
    }
    lobby.state.config = { ...lobby.state.config, ...config };
    this.broadcast(lobby, { type: 'CONFIG_UPDATED', config: lobby.state.config });
    this.broadcastLobby(lobby);
  }

  private hostKick(conn: PlayerConn, targetId: string): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_HOST', message: 'ONLY HOST CAN KICK' });
      return;
    }
    if (targetId === conn.playerId) return;
    const target = this.players.get(targetId);
    if (target) {
      this.send(target.socket, { type: 'LOBBY_LEFT', reason: 'KICKED BY HOST' });
      this.leaveLobby(target);
    }
  }

  private hostTransfer(conn: PlayerConn, targetId: string): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_HOST', message: 'ONLY HOST CAN TRANSFER' });
      return;
    }
    const target = lobby.state.players.find(p => p.playerId === targetId);
    if (!target || target.isAI) return;
    lobby.state.hostId = targetId;
    lobby.state.players.forEach(p => p.isHost = p.playerId === targetId);
    this.broadcast(lobby, { type: 'HOST_CHANGED', newHostId: targetId });
    this.broadcastLobby(lobby);
  }

  private hostLockTeams(conn: PlayerConn, locked: boolean): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_HOST', message: 'ONLY HOST CAN LOCK TEAMS' });
      return;
    }
    lobby.teamsLocked = locked;
    this.broadcastLobby(lobby);
  }

  private hostStartMatch(conn: PlayerConn): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_HOST', message: 'ONLY HOST CAN START' });
      return;
    }
    if (lobby.state.status !== 'OPEN') return;

    const humans = lobby.state.players.filter(p => !p.isAI);
    const allReady = humans.every(p => p.status === 'READY');
    if (!allReady) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'NOT_READY', message: 'ALL PLAYERS MUST BE READY' });
      return;
    }
    if (humans.length === 0) {
      this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'TEAMS_UNBALANCED', message: 'NO PLAYERS' });
      return;
    }

    if (lobby.state.config.aiFillEnabled) this.fillWithAI(lobby);

    lobby.state.status = 'COUNTDOWN';
    const endsAt = Date.now() + NET.COUNTDOWN_SEC * 1000;
    lobby.state.countdownEndsAt = endsAt;
    this.broadcast(lobby, { type: 'COUNTDOWN', endsAt, secondsLeft: NET.COUNTDOWN_SEC });
    this.broadcastLobby(lobby);

    setTimeout(() => {
      if (lobby.state.status !== 'COUNTDOWN') return;
      this.startMatch(lobby);
    }, NET.COUNTDOWN_SEC * 1000);
  }

  private hostCancelCountdown(conn: PlayerConn): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) return;
    if (lobby.state.status !== 'COUNTDOWN') return;
    lobby.state.status = 'OPEN';
    lobby.state.countdownEndsAt = undefined;
    this.broadcast(lobby, { type: 'COUNTDOWN_CANCELLED', reason: 'HOST CANCELLED' });
    this.broadcastLobby(lobby);
  }

  private sendCommand(conn: PlayerConn, command: ClientCommand): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby || !lobby.match) return;
    lobby.match.game.applyCommand(conn.playerId, command);
  }

  private requestState(conn: PlayerConn): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby || !lobby.match) return;
    const snapshot = lobby.match.game.snapshot(conn.playerId);
    this.send(conn.socket, { type: 'MATCH_SNAPSHOT', snapshot });
  }

  private returnToLobby(conn: PlayerConn): void {
    const lobby = this.lobbyOf(conn);
    if (!lobby) return;
    if (lobby.state.hostId !== conn.playerId) return;
    if (lobby.state.status !== 'IN_MATCH' && lobby.state.status !== 'CLOSED') return;
    if (lobby.match) {
      clearInterval(lobby.match.timer);
      lobby.match = null;
    }
    lobby.state.status = 'OPEN';
    lobby.state.countdownEndsAt = undefined;
    lobby.state.players.forEach(p => { if (!p.isAI) p.status = 'NOT_READY'; });
    this.broadcastLobby(lobby);
  }

  // ── Helpers ──────────────────────────────────────────────

  private newLobby(conn: PlayerConn, config: LobbyConfig): Lobby {
    const lobbyId = `l_${nanoid(8)}`;
    const joinCode = this.generateJoinCode();
    const host: LobbyPlayer = {
      playerId: conn.playerId, name: conn.name, team: 'BLACK',
      status: 'NOT_READY', isHost: true, isAI: false, connected: true, ping: 0,
    };
    const state: LobbyState = {
      lobbyId, joinCode, hostId: conn.playerId, config,
      players: [host], status: 'OPEN', createdAt: Date.now(),
    };
    const lobby: Lobby = { state, match: null, teamsLocked: false };
    this.lobbies.set(lobbyId, lobby);
    conn.lobbyId = lobbyId;
    return lobby;
  }

  private addPlayerToLobby(conn: PlayerConn, lobby: Lobby): void {
    const blackCount = lobby.state.players.filter(p => p.team === 'BLACK').length;
    const grayCount = lobby.state.players.filter(p => p.team === 'GRAY').length;
    const team: Team = blackCount <= grayCount ? 'BLACK' : 'GRAY';
    const lp: LobbyPlayer = {
      playerId: conn.playerId, name: conn.name, team,
      status: 'NOT_READY', isHost: false, isAI: false, connected: true, ping: 0,
    };
    lobby.state.players.push(lp);
    conn.lobbyId = lobby.state.lobbyId;
    this.broadcast(lobby, { type: 'PLAYER_JOINED', player: lp });
  }

  private fillWithAI(lobby: Lobby): void {
    const cfg = lobby.state.config;
    const black = lobby.state.players.filter(p => p.team === 'BLACK').length;
    const gray = lobby.state.players.filter(p => p.team === 'GRAY').length;
    for (let i = 0; i < cfg.teams.BLACK - black; i++) {
      lobby.state.players.push({
        playerId: `ai_b_${nanoid(6)}`, name: `AI_BLACK_${i + 1}`, team: 'BLACK',
        status: 'AI', isHost: false, isAI: true, connected: true, ping: 0,
      });
    }
    for (let i = 0; i < cfg.teams.GRAY - gray; i++) {
      lobby.state.players.push({
        playerId: `ai_g_${nanoid(6)}`, name: `AI_GRAY_${i + 1}`, team: 'GRAY',
        status: 'AI', isHost: false, isAI: true, connected: true, ping: 0,
      });
    }
  }

  private closeLobby(lobby: Lobby, reason: string): void {
    lobby.state.status = 'CLOSED';
    this.broadcast(lobby, { type: 'LOBBY_LEFT', reason });
    if (lobby.match) clearInterval(lobby.match.timer);
    for (const p of lobby.state.players) {
      if (p.isAI) continue;
      const conn = this.players.get(p.playerId);
      if (conn) conn.lobbyId = null;
    }
    this.lobbies.delete(lobby.state.lobbyId);
  }

  // ── Match lifecycle ──────────────────────────────────────

  private startMatch(lobby: Lobby): void {
    const matchId = `m_${nanoid(8)}`;
    const seed = MP_MAP_SEEDS[lobby.state.config.map].seed;
    lobby.state.status = 'IN_MATCH';

    const game = new ServerGame(seed, lobby.state.config, lobby.state.players);
    const match: Match = { matchId, game, timer: null as any, startedAt: Date.now() };
    lobby.match = match;

    this.broadcast(lobby, { type: 'MATCH_STARTING', matchId, seed, lobby: lobby.state });

    for (const p of lobby.state.players) {
      if (p.isAI) continue;
      const conn = this.players.get(p.playerId);
      if (!conn) continue;
      const init = game.snapshot(p.playerId);
      this.send(conn.socket, { type: 'MATCH_STARTED', matchId, initialState: init });
    }

    match.timer = setInterval(() => this.tickMatch(lobby, match), 1000 / NET.TICK_RATE);
    console.log(`[MatchServer] match started: ${matchId} — REAL engine`);
  }

  private tickMatch(lobby: Lobby, match: Match): void {
    const dt = 1000 / NET.TICK_RATE / 1000;
    if (match.game.result) {
      const results = match.game.buildResults();
      this.broadcast(lobby, { type: 'MATCH_RESULT', results });
      this.broadcast(lobby, { type: 'MATCH_ENDED', reason: 'MATCH COMPLETE', results });
      clearInterval(match.timer);
      lobby.state.status = 'CLOSED';
      return;
    }
    match.game.simStep(dt);
    for (const p of lobby.state.players) {
      if (p.isAI) continue;
      const conn = this.players.get(p.playerId);
      if (!conn?.socket) continue;
      this.send(conn.socket, { type: 'MATCH_SNAPSHOT', snapshot: match.game.snapshot(p.playerId) });
    }
  }

  // ── Quick match ──────────────────────────────────────────

  private startQuickMatch(conn: PlayerConn, name: string, mode: GameMode, teamSize: 1|2|3|4): void {
    if (conn.lobbyId) this.leaveLobby(conn);
    conn.name = this.sanitizeName(name, conn.playerId);
    const search: QMSearch = {
      searchId: `qm_${nanoid(8)}`, playerId: conn.playerId, name: conn.name,
      mode, teamSize, startedAt: Date.now(),
    };
    this.quickMatchQueue.push(search);
    this.send(conn.socket, { type: 'QUICK_MATCH_SEARCHING', searchId: search.searchId, estimatedSec: 30 });
    this.tryMatchmake();
  }

  private cancelQuickMatch(conn: PlayerConn): void {
    const before = this.quickMatchQueue.length;
    this.quickMatchQueue = this.quickMatchQueue.filter(q => q.playerId !== conn.playerId);
    if (before !== this.quickMatchQueue.length)
      this.send(conn.socket, { type: 'QUICK_MATCH_CANCELLED' });
  }

  private startQuickMatchPoller(): void {
    this.quickMatchTimer = setInterval(() => {
      this.tryMatchmake();
      const now = Date.now();
      this.quickMatchQueue = this.quickMatchQueue.filter(q => {
        if (now - q.startedAt > NET.QUICK_MATCH_TIMEOUT_SEC * 1000) {
          const conn = this.players.get(q.playerId);
          if (conn) {
            this.send(conn.socket, { type: 'QUICK_MATCH_CANCELLED' });
            this.send(conn.socket, { type: 'LOBBY_ERROR', code: 'SERVER_ERROR', message: 'MATCHMAKING TIMED OUT' });
          }
          return false;
        }
        return true;
      });
      for (const q of this.quickMatchQueue) {
        const conn = this.players.get(q.playerId);
        if (!conn) continue;
        const elapsed = Math.floor((now - q.startedAt) / 1000);
        const compatible = this.quickMatchQueue.filter(o => o.mode === q.mode && o.teamSize === q.teamSize);
        this.send(conn.socket, {
          type: 'QUICK_MATCH_PROGRESS',
          playersFound: Math.min(compatible.length, q.teamSize * 2),
          playersNeeded: q.teamSize * 2,
          elapsedSec: elapsed,
        });
      }
    }, 1500);
  }

  private tryMatchmake(): void {
    if (this.quickMatchQueue.length < 2) return;
    const groups = new Map<string, QMSearch[]>();
    for (const q of this.quickMatchQueue) {
      const key = `${q.mode}_${q.teamSize}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(q);
    }
    for (const [key, group] of groups) {
      const teamSize = parseInt(key.split('_')[1]);
      const needed = teamSize * 2;
      if (group.length >= needed) {
        const matched = group.slice(0, needed);
        const host = matched[0];
        const hostConn = this.players.get(host.playerId);
        if (!hostConn) continue;
        const config: LobbyConfig = {
          ...DEFAULT_LOBBY_CONFIG, mode: host.mode,
          maxPlayers: needed, teams: { BLACK: teamSize, GRAY: teamSize },
          privateLobby: false,
        };
        const lobby = this.newLobby(hostConn, config);
        this.send(hostConn.socket, { type: 'QUICK_MATCH_FOUND', lobby: lobby.state });
        this.send(hostConn.socket, { type: 'LOBBY_JOINED', lobby: lobby.state, yourPlayerId: hostConn.playerId });
        for (let i = 1; i < matched.length; i++) {
          const conn = this.players.get(matched[i].playerId);
          if (!conn) continue;
          this.addPlayerToLobby(conn, lobby);
          this.send(conn.socket, { type: 'QUICK_MATCH_FOUND', lobby: lobby.state });
          this.send(conn.socket, { type: 'LOBBY_JOINED', lobby: lobby.state, yourPlayerId: conn.playerId });
        }
        this.quickMatchQueue = this.quickMatchQueue.filter(q => !matched.includes(q));
        this.broadcastLobby(lobby);
      }
    }
  }

  // ── Utilities ────────────────────────────────────────────

  private lobbyOf(conn: PlayerConn): Lobby | null {
    if (!conn.lobbyId) return null;
    return this.lobbies.get(conn.lobbyId) ?? null;
  }

  private send(socket: Socket, msg: LobbyServerMessage): void {
    socket.emit('msg', msg);
  }

  private broadcast(lobby: Lobby, msg: LobbyServerMessage): void {
    for (const p of lobby.state.players) {
      if (p.isAI) continue;
      const conn = this.players.get(p.playerId);
      if (conn?.socket) this.send(conn.socket, msg);
    }
  }

  private broadcastLobby(lobby: Lobby): void {
    this.broadcast(lobby, { type: 'LOBBY_STATE', lobby: lobby.state });
  }

  private sanitizeName(name: string, playerId: string): string {
    const n = (name || '').trim().slice(0, 16);
    if (!n) return `COMMANDER_${playerId.slice(-4).toUpperCase()}`;
    return n.toUpperCase().replace(/[^A-Z0-9_\- ]/g, '');
  }

  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if ([...this.lobbies.values()].some(l => l.state.joinCode === code)) return this.generateJoinCode();
    return code;
  }

  dispose(): void {
    if (this.quickMatchTimer) clearInterval(this.quickMatchTimer);
    for (const lobby of this.lobbies.values()) {
      if (lobby.match) clearInterval(lobby.match.timer);
    }
  }
}
