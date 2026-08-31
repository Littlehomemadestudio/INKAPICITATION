'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · MultiplayerApp
// Top-level component that renders different views based on phase.
// Mounted at /play?mode=multiplayer
// ─────────────────────────────────────────────────────────────

import { useMultiplayer, connectionQuality } from '@/game/net/client/useMultiplayer';
import { MultiplayerMenu } from './Menu';
import { QuickMatch } from './QuickMatch';
import { Lobby } from './Lobby';
import { Countdown } from './Countdown';
import { Loading } from './Loading';
import { Battlefield } from './Battlefield';
import { Results } from './Results';
import { NetworkIndicator } from './NetworkIndicator';
import Link from 'next/link';

export default function MultiplayerApp() {
  const { state, send } = useMultiplayer();
  const quality = connectionQuality(state.ping, state.status);

  const leaveLobby = () => send({ type: 'LEAVE_LOBBY' });

  return (
    <div className="mp-root">
      <div className="mp-bg-grid" />
      <div className="mp-shell">
        {/* Top bar */}
        <div className="mp-topbar">
          <div className="mp-topbar-left">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span className="mp-logo">PAPER STORM</span>
            </Link>
            <div className="mp-divider-v" />
            <span className="mp-section-label">MULTIPLAYER COMMAND</span>
          </div>
          <div className="mp-topbar-right" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {state.profile && (
              <span className="mp-section-label" style={{ color: 'var(--ps-txt)' }}>
                {state.profile.name ?? 'COMMANDER'}
              </span>
            )}
            <NetworkIndicator quality={quality} ping={state.ping} status={state.status} />
            {state.lobby && state.phase !== 'IN_MATCH' && state.phase !== 'RESULTS' && (
              <button className="mp-btn mp-btn-danger" style={{ width: 'auto', padding: '6px 12px' }}
                onClick={leaveLobby}>
                LEAVE
              </button>
            )}
            <Link href="/" style={{ textDecoration: 'none' }}>
              <button className="mp-btn" style={{ width: 'auto', padding: '6px 12px' }}>
                EXIT
              </button>
            </Link>
          </div>
        </div>

        {/* Content area */}
        <div className="mp-content">
          {state.reconnecting && (
            <div className="mp-card" style={{ textAlign: 'center' }}>
              <div className="mp-card-header">CONNECTION LOST</div>
              <h2 className="mp-title">RECONNECTING…</h2>
              <p className="mp-subtitle">ATTEMPTING TO RESTORE YOUR SESSION</p>
              <div className="mp-loading-bar" />
            </div>
          )}

          {!state.reconnecting && state.phase === 'SEARCHING' && !state.quickMatch && (
            <MultiplayerMenu />
          )}

          {!state.reconnecting && state.quickMatch && (
            <QuickMatch />
          )}

          {!state.reconnecting && (state.phase === 'LOBBY' || state.phase === 'STARTING') && state.lobby && (
            <Lobby />
          )}

          {!state.reconnecting && state.phase === 'LOADING' && (
            <Loading />
          )}

          {!state.reconnecting && state.phase === 'IN_MATCH' && state.latestSnapshot && (
            <Battlefield />
          )}

          {!state.reconnecting && state.phase === 'RESULTS' && (
            <Results />
          )}
        </div>

        {/* Countdown overlay */}
        {state.phase === 'STARTING' && state.countdownEndsAt && (
          <Countdown endsAt={state.countdownEndsAt} />
        )}
      </div>

      {/* Error toast */}
      {state.error && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
        }}>
          <div className="mp-error" style={{ margin: 0 }}>
            {state.error.message}
          </div>
        </div>
      )}

      {/* Info toast */}
      {state.info && !state.error && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
        }}>
          <div className="mp-info" style={{ margin: 0 }}>
            {state.info}
          </div>
        </div>
      )}
    </div>
  );
}
