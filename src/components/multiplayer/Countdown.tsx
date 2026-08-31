'use client';

import { useEffect, useState } from 'react';

export function Countdown({ endsAt }: { endsAt: number }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));

  useEffect(() => {
    const i = setInterval(() => {
      const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s <= 0) clearInterval(i);
    }, 100);
    return () => clearInterval(i);
  }, [endsAt]);

  return (
    <div className="mp-countdown">
      <div className="mp-countdown-label">OPERATION COMMENCING</div>
      <div key={secondsLeft} className="mp-countdown-number">{secondsLeft || 'GO'}</div>
    </div>
  );
}
