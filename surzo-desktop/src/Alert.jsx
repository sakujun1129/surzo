import { useState, useEffect } from 'react';
import './alert.css';

const MESSAGES = ['back to it', 'refocus', 'come back', 'let\'s go', 'focus up'];

export default function Alert() {
  const [msg, setMsg] = useState(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    const unsub = window.electronAPI.onAlertData(() => {
      setMsg(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
      setLeaving(false);
    });
    return () => unsub?.();
  }, []);

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => window.electronAPI?.dismissAlert(), 200);
  };

  if (!msg) return null;

  return (
    <div className={`ar ${leaving ? 'ar-out' : ''}`} onClick={dismiss}>
      <div className="ap">
        <span className="at">{msg}</span>
        <span className="aa">↑</span>
      </div>
    </div>
  );
}
