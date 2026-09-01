'use client';

import { useState } from 'react';
import { useMultiplayer } from '@/game/net/client/useMultiplayer';
import { MP_MAP_SEEDS, Team, GameMode, MapId } from '@/game/net/protocol';

export function Lobby() {
  const { state, send } = useMultiplayer();
  const lobby = state.lobby!;
  // Use myPlayerId (authoritative, always available once server acks us)
  // with profile.playerId as fallback.
  const myId = state.myPlayerId ?? state.profile?.playerId;
  const isHost = myId === lobby.hostId;
  const me = lobby.players.find(p => p.playerId === myId);
  const myReady = me?.status === 'READY';
  const humans = lobby.players.filter(p => !p.isAI);
  const allReady = humans.every(p => p.status === 'READY');
  const cfg = lobby.config;
  const mapDef = MP_MAP_SEEDS[cfg.map];

  const setTeam = (team: Team) => send({ type: 'SET_TEAM', team });
  const setReady = (ready: boolean) => send({ type: 'SET_READY', ready });

  return (
    <div className="mp-lobby-grid">
      {/* Main panel — roster */}
      <div className="mp-lobby-main">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <div className="mp-section-label" style={{ marginBottom: 4 }}>OPERATION</div>
            <h2 className="mp-operation-name">{mapDef.name.replace('_', ' ')}</h2>
            <div className="mp-lobby-meta">
              {cfg.mode.replace('_', ' ')} · {cfg.maxPlayers} PLAYERS · {cfg.teams.BLACK}v{cfg.teams.GRAY}
            </div>
          </div>
          {lobby.status === 'COUNTDOWN' && (
            <div className="mp-info" style={{ margin: 0 }}>
              COUNTDOWN IN PROGRESS
            </div>
          )}
        </div>

        <div className="mp-roster">
          <div className="mp-roster-header">
            <div>PLAYER</div>
            <div>TEAM</div>
            <div>STATUS</div>
            <div style={{ textAlign: 'right' }}>PING</div>
          </div>
          {/* Sort: BLACK first, then GRAY; host first within each */}
          {[...lobby.players]
            .sort((a, b) => {
              if (a.team !== b.team) return a.team === 'BLACK' ? -1 : 1;
              if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
              return 0;
            })
            .map(p => (
              <div key={p.playerId} className="mp-roster-row" data-team={p.team}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: p.connected ? 'var(--ps-paper)' : 'var(--ps-faint)' }}>
                    {p.name}
                  </span>
                  {p.isHost && <span className="mp-host-badge">HOST</span>}
                  {!p.connected && p.status !== 'AI' && (
                    <span style={{ fontSize: 8, marginLeft: 6, color: '#e0a098' }} className="ps-blink">
                      DISCONNECTED
                    </span>
                  )}
                </div>
                <div>
                  <span className="mp-team-tag" data-t={p.team}>{p.team}</span>
                </div>
                <div>
                  <span className="mp-ready-tag" data-r={p.status}>{p.status.replace('_', ' ')}</span>
                </div>
                <div style={{ textAlign: 'right', color: 'var(--ps-faint)', fontSize: 9 }}>
                  {p.isAI ? '—' : `${p.ping}ms`}
                </div>
              </div>
            ))}
        </div>

        {/* Team switcher (non-host) */}
        {!isHost && me && !me.isAI && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              className={`mp-btn ${me.team === 'BLACK' ? 'mp-btn-cta' : ''}`}
              style={{ width: 'auto', padding: '8px 16px' }}
              onClick={() => setTeam('BLACK')}
              disabled={me.team === 'BLACK'}>
              JOIN BLACK
            </button>
            <button
              className={`mp-btn ${me.team === 'GRAY' ? 'mp-btn-cta' : ''}`}
              style={{ width: 'auto', padding: '8px 16px' }}
              onClick={() => setTeam('GRAY')}
              disabled={me.team === 'GRAY'}>
              JOIN GRAY
            </button>
          </div>
        )}

        {/* Ready + Start controls */}
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          {me && !me.isAI && (
            <button
              className={`mp-btn ${myReady ? 'mp-btn-cta' : ''}`}
              style={{ width: 'auto', padding: '12px 18px' }}
              onClick={() => setReady(!myReady)}>
              {myReady ? '✓ READY' : 'NOT READY'}
            </button>
          )}
          {isHost && (
            <>
              <button
                className="mp-btn mp-btn-cta"
                style={{ flex: 1 }}
                disabled={!allReady || lobby.status === 'COUNTDOWN'}
                onClick={() => send({ type: 'HOST_START_MATCH' })}>
                {allReady ? 'LAUNCH OPERATION →' : 'WAITING FOR READY…'}
              </button>
              {lobby.status === 'COUNTDOWN' && (
                <button
                  className="mp-btn mp-btn-danger"
                  style={{ width: 'auto', padding: '12px 18px' }}
                  onClick={() => send({ type: 'HOST_CANCEL_COUNTDOWN' })}>
                  ABORT
                </button>
              )}
            </>
          )}
        </div>

        {!allReady && isHost && (
          <div style={{ marginTop: 12, fontSize: 10, color: 'var(--ps-dim)', letterSpacing: '0.06em' }}>
            {humans.filter(p => p.status !== 'READY').map(p => p.name).join(', ')} — NOT READY
          </div>
        )}
      </div>

      {/* Side panel — config + join code */}
      <div className="mp-lobby-side">
        {cfg.privateLobby && (
          <div>
            <div className="mp-section-label" style={{ marginBottom: 8 }}>JOIN CODE</div>
            <div className="mp-join-code">{lobby.joinCode}</div>
            <div style={{ fontSize: 9, color: 'var(--ps-faint)', marginTop: 6, letterSpacing: '0.12em' }}>
              SHARE WITH COMRADES · VALID UNTIL MATCH STARTS
            </div>
          </div>
        )}

        <div>
          <div className="mp-section-label" style={{ marginBottom: 8 }}>OPERATION PARAMETERS</div>
          <div className="mp-config-row">
            <span className="mp-config-label">THEATER</span>
            {isHost ? (
              <HostConfigSelect value={cfg.map} onChange={v => send({ type: 'HOST_UPDATE_CONFIG', config: { map: v as MapId } })}>
                {(Object.keys(MP_MAP_SEEDS) as MapId[]).map(id => <option key={id} value={id}>{MP_MAP_SEEDS[id].name}</option>)}
              </HostConfigSelect>
            ) : (
              <span className="mp-config-value">{mapDef.name}</span>
            )}
          </div>
          <div className="mp-config-row">
            <span className="mp-config-label">MODE</span>
            {isHost ? (
              <HostConfigSelect value={cfg.mode} onChange={v => send({ type: 'HOST_UPDATE_CONFIG', config: { mode: v as GameMode } })}>
                <option value="COMBINED_ARMS">COMBINED ARMS</option>
                <option value="ARMORED_ASSAULT">ARMORED ASSAULT</option>
                <option value="NAVAL_SUPERIORITY">NAVAL SUPERIORITY</option>
              </HostConfigSelect>
            ) : (
              <span className="mp-config-value">{cfg.mode.replace('_', ' ')}</span>
            )}
          </div>
          <div className="mp-config-row">
            <span className="mp-config-label">PLAYERS</span>
            {isHost ? (
              <HostConfigSelect
                value={String(cfg.maxPlayers)}
                onChange={v => {
                  const n = parseInt(v);
                  const ts = n / 2;
                  send({ type: 'HOST_UPDATE_CONFIG', config: {
                    maxPlayers: n,
                    teams: { BLACK: ts, GRAY: ts },
                  }});
                }}>
                {[2, 4, 6, 8].map(n => <option key={n} value={n}>{n} ({n/2}v{n/2})</option>)}
              </HostConfigSelect>
            ) : (
              <span className="mp-config-value">{cfg.maxPlayers} ({cfg.teams.BLACK}v{cfg.teams.GRAY})</span>
            )}
          </div>
          <div className="mp-config-row">
            <span className="mp-config-label">STARTING INK</span>
            {isHost ? (
              <HostConfigSelect value={String(cfg.startingInk)} onChange={v => send({ type: 'HOST_UPDATE_CONFIG', config: { startingInk: parseInt(v) } })}>
                {[200, 400, 800].map(v => <option key={v} value={v}>{v}</option>)}
              </HostConfigSelect>
            ) : (
              <span className="mp-config-value">{cfg.startingInk}</span>
            )}
          </div>
          <div className="mp-config-row">
            <span className="mp-config-label">AI BACKFILL</span>
            {isHost ? (
              <HostConfigSelect value={cfg.aiFillEnabled ? '1' : '0'} onChange={v => send({ type: 'HOST_UPDATE_CONFIG', config: { aiFillEnabled: v === '1' } })}>
                <option value="1">ENABLED</option>
                <option value="0">DISABLED</option>
              </HostConfigSelect>
            ) : (
              <span className="mp-config-value">{cfg.aiFillEnabled ? 'ENABLED' : 'DISABLED'}</span>
            )}
          </div>
        </div>

        {/* Host controls */}
        {isHost && lobby.players.length > 1 && (
          <div>
            <div className="mp-section-label" style={{ marginBottom: 8 }}>HOST CONTROLS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lobby.players.filter(p => p.playerId !== myId && !p.isAI).map(p => (
                <div key={p.playerId} style={{ display: 'flex', gap: 6 }}>
                  <button className="mp-btn mp-btn-danger" style={{ flex: 1, padding: '6px 10px', fontSize: 9 }}
                    onClick={() => send({ type: 'HOST_KICK', playerId: p.playerId })}>
                    KICK {p.name}
                  </button>
                  <button className="mp-btn" style={{ width: 'auto', padding: '6px 10px', fontSize: 9 }}
                    onClick={() => send({ type: 'HOST_TRANSFER', playerId: p.playerId })}>
                    → HOST
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HostConfigSelect({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--ps-panel)',
        color: 'var(--ps-paper)',
        border: '1px solid var(--ps-line)',
        borderRadius: 2,
        padding: '2px 6px',
        fontSize: 10,
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        letterSpacing: '0.06em',
        cursor: 'pointer',
      }}>
      {children}
    </select>
  );
}
