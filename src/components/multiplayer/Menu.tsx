'use client';

import { useState } from 'react';
import { useMultiplayer } from '@/game/net/client/useMultiplayer';
import { MP_MAP_SEEDS, GameMode, MapId } from '@/game/net/protocol';

export function MultiplayerMenu() {
  const { state, send } = useMultiplayer();
  const [view, setView] = useState<'main' | 'create' | 'join'>('main');
  const [name, setName] = useState(state.profile?.name ?? 'COMMANDER');
  const [joinCode, setJoinCode] = useState('');

  // Create lobby form
  const [map, setMap] = useState<MapId>('COASTAL_THEATER');
  const [mode, setMode] = useState<GameMode>('COMBINED_ARMS');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [teamSize, setTeamSize] = useState<1 | 2 | 3 | 4>(2);
  const [aiFill, setAiFill] = useState(true);
  const [startingInk, setStartingInk] = useState(400);

  const startQuickMatch = () => {
    if (!name.trim()) return;
    send({ type: 'QUICK_MATCH', name, mode, teamSize });
  };

  const createLobby = () => {
    if (!name.trim()) return;
    send({
      type: 'CREATE_LOBBY', name,
      config: {
        map, mode, maxPlayers,
        teams: { BLACK: teamSize, GRAY: teamSize },
        aiFillEnabled: aiFill,
        privateLobby: true,
        startingInk,
        inkIncomeRate: 1.0,
      },
    });
  };

  const joinLobby = () => {
    if (!name.trim() || joinCode.length !== 5) return;
    send({ type: 'JOIN_BY_CODE', code: joinCode, name });
  };

  if (view === 'main') {
    return (
      <div className="mp-card">
        <div className="mp-card-header">MULTIPLAYER · COMMAND DECK</div>
        <h1 className="mp-title">DEPLOY</h1>
        <p className="mp-subtitle">
          AUTHORIZED OPERATIONS ONLY — ALL COMMANDS VALIDATED BY THE AUTHORITY.
          POSITIONS ARE SYNCHRONIZED; INK AND KILLS ARE SERVER-CERTIFIED.
        </p>

        <div className="mp-form-row">
          <label className="mp-input-label">COMMANDER DESIGNATION</label>
          <input
            className="mp-input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16).toUpperCase())}
            placeholder="CALLSIGN"
            maxLength={16}
          />
        </div>

        <div className="mp-btn-grid">
          <button className="mp-btn mp-btn-cta" onClick={startQuickMatch}>
            <span>QUICK MATCH</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>AUTO-FIND OPERATION →</span>
          </button>
          <button className="mp-btn" onClick={() => setView('create')}>
            <span>CREATE LOBBY</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>CONFIGURE →</span>
          </button>
          <button className="mp-btn" onClick={() => setView('join')}>
            <span>JOIN WITH CODE</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>5-CHAR CODE →</span>
          </button>
        </div>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--ps-line-soft)' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--ps-faint)', marginBottom: 8 }}>
            QUICK MATCH PRESET
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="mp-segment">
              {(['COMBINED_ARMS', 'ARMORED_ASSAULT', 'NAVAL_SUPERIORITY'] as GameMode[]).map(m => (
                <button key={m} className={mode === m ? 'is-active' : ''} onClick={() => setMode(m)}>
                  {m.replace('_', ' ')}
                </button>
              ))}
            </div>
            <div className="mp-segment">
              {([1, 2, 3, 4] as const).map(s => (
                <button key={s} className={teamSize === s ? 'is-active' : ''} onClick={() => setTeamSize(s)}>
                  {s}v{s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="mp-card" style={{ maxWidth: 580 }}>
        <div className="mp-card-header">CREATE LOBBY · OPERATION CONFIG</div>
        <h1 className="mp-title">CONFIGURE</h1>

        <div className="mp-form-row">
          <label className="mp-input-label">COMMANDER DESIGNATION</label>
          <input
            className="mp-input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16).toUpperCase())}
            placeholder="CALLSIGN"
            maxLength={16}
          />
        </div>

        <div className="mp-form-row">
          <label className="mp-input-label">THEATER</label>
          <div className="mp-segment" style={{ display: 'flex', width: '100%' }}>
            {(Object.keys(MP_MAP_SEEDS) as MapId[]).map(id => (
              <button key={id} style={{ flex: 1 }} className={map === id ? 'is-active' : ''} onClick={() => setMap(id)}>
                {MP_MAP_SEEDS[id].name}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--ps-faint)', marginTop: 6, lineHeight: 1.5 }}>
            {MP_MAP_SEEDS[map].description}
          </div>
        </div>

        <div className="mp-form-row">
          <label className="mp-input-label">GAME MODE</label>
          <div className="mp-segment">
            {(['COMBINED_ARMS', 'ARMORED_ASSAULT', 'NAVAL_SUPERIORITY'] as GameMode[]).map(m => (
              <button key={m} className={mode === m ? 'is-active' : ''} onClick={() => setMode(m)}>
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="mp-form-row">
          <label className="mp-input-label">TEAM SIZE</label>
          <div className="mp-segment">
            {([1, 2, 3, 4] as const).map(s => (
              <button key={s} className={teamSize === s ? 'is-active' : ''}
                onClick={() => { setTeamSize(s); setMaxPlayers(s * 2); }}>
                {s}v{s}
              </button>
            ))}
          </div>
        </div>

        <div className="mp-form-row">
          <label className="mp-input-label">STARTING INK</label>
          <div className="mp-segment">
            {[200, 400, 800].map(v => (
              <button key={v} className={startingInk === v ? 'is-active' : ''} onClick={() => setStartingInk(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="mp-form-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="mp-input-label" style={{ marginBottom: 0 }}>AI BACKFILL</label>
          <div className="mp-segment">
            <button className={aiFill ? 'is-active' : ''} onClick={() => setAiFill(true)}>ENABLED</button>
            <button className={!aiFill ? 'is-active' : ''} onClick={() => setAiFill(false)}>DISABLED</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="mp-btn" style={{ width: 'auto', flex: '0 0 auto' }}
            onClick={() => setView('main')}>
            ← BACK
          </button>
          <button className="mp-btn mp-btn-cta" onClick={createLobby}>
            CREATE LOBBY →
          </button>
        </div>
      </div>
    );
  }

  // join view
  return (
    <div className="mp-card" style={{ maxWidth: 480 }}>
      <div className="mp-card-header">JOIN WITH CODE</div>
      <h1 className="mp-title">ENTER CODE</h1>
      <p className="mp-subtitle">5-CHARACTER OPERATION CODE — PROVIDED BY HOST</p>

      <div className="mp-form-row">
        <label className="mp-input-label">COMMANDER DESIGNATION</label>
        <input
          className="mp-input"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 16).toUpperCase())}
          placeholder="CALLSIGN"
          maxLength={16}
        />
      </div>

      <div className="mp-form-row">
        <label className="mp-input-label">OPERATION CODE</label>
        <input
          className="mp-input"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="• • • • •"
          maxLength={5}
          style={{ letterSpacing: '0.6em', textAlign: 'center', fontSize: 24 }}
          onKeyDown={(e) => { if (e.key === 'Enter') joinLobby(); }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="mp-btn" style={{ width: 'auto', flex: '0 0 auto' }}
          onClick={() => setView('main')}>
          ← BACK
        </button>
        <button className="mp-btn mp-btn-cta" onClick={joinLobby}
          disabled={joinCode.length !== 5 || !name.trim()}>
          JOIN OPERATION →
        </button>
      </div>
    </div>
  );
}
