'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import GameShell from "@/components/game/GameShell";

const MultiplayerApp = dynamic(() => import('@/components/multiplayer/MultiplayerApp'), {
  ssr: false,
  loading: () => (
    <div style={{
      position: 'fixed', inset: 0, background: '#12110e', color: '#d9d6cc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em',
    }}>
      INITIALIZING COMMAND DECK…
    </div>
  ),
});

function PlayInner() {
  const params = useSearchParams();
  const mode = params.get('mode');
  if (mode === 'multiplayer') return <MultiplayerApp />;
  return <GameShell />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div style={{
        position: 'fixed', inset: 0, background: '#12110e', color: '#d9d6cc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em',
      }}>
        LOADING…
      </div>
    }>
      <PlayInner />
    </Suspense>
  );
}
