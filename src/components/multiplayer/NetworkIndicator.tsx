'use client';

import { useMultiplayer, connectionQuality } from '@/game/net/client/useMultiplayer';

export function NetworkIndicator({ quality, ping, status }: {
  quality: 'GOOD' | 'DEGRADED' | 'DISCONNECTED';
  ping: number;
  status: string;
}) {
  const label =
    status === 'CONNECTING' ? 'CONNECTING' :
    status === 'RECONNECTING' ? 'RECONNECTING' :
    status === 'DISCONNECTED' ? 'OFFLINE' :
    quality === 'GOOD' ? 'ONLINE' :
    quality === 'DEGRADED' ? 'DEGRADED' : 'OFFLINE';

  return (
    <span className="mp-status-pill" data-q={quality}>
      <span className="mp-status-dot" data-q={quality} />
      {label}
      {ping > 0 && status === 'CONNECTED' && (
        <span style={{ marginLeft: 4, color: 'var(--ps-faint)' }}>
          {ping} MS
        </span>
      )}
    </span>
  );
}
