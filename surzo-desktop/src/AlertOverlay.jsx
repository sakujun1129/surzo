import { useState, useEffect, useRef } from 'react';
import './alert-overlay.css';

const PHRASES = [
  'Return.', 'Refocus.', 'Back to it.', 'Resume.', 'Recenter.',
  'Stay in.', 'Still in.', 'Keep going.', 'Come back.', 'Build on.',
  'Finish it.', 'One more.', 'Not yet.', 'Again.', 'Continue.',
];

export default function AlertOverlay() {
  const [phrase, setPhrase]   = useState('');
  const [state, setState]     = useState('idle'); // idle | in | out
  const canDismiss            = useRef(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onAlertData(() => {
      setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      setState('in');
      canDismiss.current = false;
      setTimeout(() => { canDismiss.current = true; }, 500);
    });
    return () => unsub?.();
  }, []);

  const dismiss = () => {
    if (!canDismiss.current) return;
    canDismiss.current = false;
    setState('out');
    setTimeout(() => window.electronAPI?.dismissAlert(), 420);
  };

  if (state === 'idle') return null;

  return (
    <div className={`ao ao-${state}`} onClick={dismiss}>
      <p className={`ao-phrase ao-phrase-${state}`}>{phrase}</p>
    </div>
  );
}
