'use client';

import { useMultiplayer } from '@/game/net/client/useMultiplayer';

export function Results() {
  const { state, send } = useMultiplayer();
  const results = state.results;
  const lobby = state.lobby;
  const isHost = state.profile?.playerId === lobby?.hostId;

  if (!results) {
    return (
      <div className="mp-card">
        <div className="mp-card-header">RESULTS UNAVAILABLE</div>
        <h1 className="mp-title">OPERATION CONCLUDED</h1>
        <p className="mp-subtitle">NO RESULT DATA RECEIVED</p>
      </div>
    );
  }

  const myTeam = lobby?.players.find(p => p.playerId === state.profile?.playerId)?.team;
  const weWon = results.winningTeam && results.winningTeam === myTeam;

  return (
    <div className="mp-card mp-results">
      <div className="mp-card-header">OPERATION COMPLETE</div>
      <h1 className="mp-results-title">
        {results.result === 'BLACK_VICTORY' ? 'BLACK FORCES' :
         results.result === 'GRAY_VICTORY' ? 'GRAY FORCES' :
         results.result === 'DRAW' ? 'STALEMATE' : 'OPERATION ABORTED'}
        {' '}
        {results.result !== 'DRAW' && results.result !== 'ABORTED' && 'VICTORY'}
      </h1>
      <div className="mp-results-subtitle">
        {weWon ? 'YOUR FORCES PREVAILED' :
         results.result === 'DRAW' ? 'NEITHER FORCE COULD PREVAIL' :
         results.result === 'ABORTED' ? 'OPERATION TERMINATED' :
         'YOUR FORCES WERE DEFEATED'}
        {' · '}
        {Math.floor(results.durationSec / 60)}:
        {String(Math.floor(results.durationSec % 60)).padStart(2, '0')} DURATION
      </div>

      {/* My stats */}
      {myTeam && (() => {
        const myStats = results.stats.find(s => s.playerId === state.profile?.playerId);
        if (!myStats) return null;
        return (
          <div className="mp-results-stats">
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">UNITS DESTROYED</div>
              <div className="mp-results-stat-value">{myStats.unitsDestroyed}</div>
            </div>
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">UNITS LOST</div>
              <div className="mp-results-stat-value">{myStats.unitsLost}</div>
            </div>
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">INK GENERATED</div>
              <div className="mp-results-stat-value">{myStats.inkGenerated}</div>
            </div>
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">INK SPENT</div>
              <div className="mp-results-stat-value">{myStats.inkSpent}</div>
            </div>
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">TERRITORY HELD</div>
              <div className="mp-results-stat-value">{myStats.territoryPercent}%</div>
            </div>
            <div className="mp-results-stat">
              <div className="mp-results-stat-label">TEAM</div>
              <div className="mp-results-stat-value">{myStats.team}</div>
            </div>
          </div>
        );
      })()}

      {/* Full roster */}
      <div className="mp-results-roster">
        <div className="mp-results-roster-row mp-results-roster-header">
          <div>COMMANDER</div>
          <div>TEAM</div>
          <div>KILLS</div>
          <div>LOSSES</div>
          <div>INK</div>
        </div>
        {results.stats
          .sort((a, b) => b.unitsDestroyed - a.unitsDestroyed)
          .map(s => (
            <div key={s.playerId} className="mp-results-roster-row">
              <div style={{ color: 'var(--ps-paper)' }}>
                {lobby?.players.find(p => p.playerId === s.playerId)?.name ?? 'UNKNOWN'}
                {s.isAI && <span style={{ fontSize: 8, marginLeft: 6, color: 'var(--ps-faint)' }}>AI</span>}
              </div>
              <div><span className="mp-team-tag" data-t={s.team}>{s.team}</span></div>
              <div style={{ color: '#b8d4a0' }}>{s.unitsDestroyed}</div>
              <div style={{ color: '#e0a098' }}>{s.unitsLost}</div>
              <div style={{ color: 'var(--ps-paper)' }}>{s.inkGenerated}</div>
            </div>
          ))}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button className="mp-btn" style={{ flex: 1 }}
          onClick={() => send({ type: 'LEAVE_LOBBY' })}>
          RETURN TO COMMAND
        </button>
        {isHost && (
          <button className="mp-btn mp-btn-cta" style={{ flex: 1 }}
            onClick={() => send({ type: 'RETURN_TO_LOBBY' })}>
            NEW OPERATION →
          </button>
        )}
      </div>
    </div>
  );
}
