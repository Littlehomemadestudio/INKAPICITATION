'use client';

import { useMultiplayer } from '@/game/net/client/useMultiplayer';
import { useEffect, useState } from 'react';

export function QuickMatch() {
  const { state, send } = useMultiplayer();
  const qm = state.quickMatch;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!qm) return;
    const i = setInterval(() => {
      setElapsed(qm.elapsedSec + Math.floor((Date.now() - (qm as any).startedAt ?? Date.now()) / 1000));
    }, 1000);
    return () => clearInterval(i);
  }, [qm?.searchId, qm?.elapsedSec]);

  if (!qm) return null;

  const cancel = () => send({ type: 'CANCEL_QUICK_MATCH' });

  const pct = Math.min(100, (qm.playersFound / qm.playersNeeded) * 100);

  return (
    <div className="mp-card mp-searching">
      <div className="mp-searching-spinner" />
      <h2 className="mp-searching-title">SEARCHING FOR OPERATION</h2>
      <div className="mp-searching-status">CONTACTING COMMAND AUTHORITY</div>
      <div className="mp-searching-time">
        {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
        {String(elapsed % 60).padStart(2, '0')}
      </div>
      <div className="mp-searching-progress">
        PLAYERS FOUND · {qm.playersFound} / {qm.playersNeeded}
        <div className="mp-searching-progress-bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button className="mp-btn mp-btn-danger" style={{ width: 'auto', margin: '0 auto', padding: '10px 24px' }}
        onClick={cancel}>
        CANCEL SEARCH
      </button>
    </div>
  );
}
