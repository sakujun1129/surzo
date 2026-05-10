import { useState, useEffect, useRef } from 'react';
import { fmtTimer } from './utils/format.js';
import './widget.css';

const PHRASES = [
  'Return.', 'Refocus.', 'Back to it.', 'Resume.', 'Recenter.',
  'Stay in.', 'Still in.', 'Keep going.', 'Come back.', 'Build on.',
  'Finish it.', 'One more.', 'Not yet.', 'Again.', 'Continue.',
];

function getZone(score) {
  if (score >= 85) return { emoji: '🤩', color: '#bef264' };
  if (score >= 70) return { emoji: '😊', color: '#6ee7b7' };
  if (score >= 55) return { emoji: '🙂', color: '#7dd3fc' };
  if (score >= 38) return { emoji: '😑', color: '#fde047' };
  if (score >= 20) return { emoji: '😟', color: '#fb923c' };
  return               { emoji: '😵', color: '#f87171' };
}

export default function Widget() {
  const [update, setUpdate]   = useState({ elapsed: 0, liveScore: 50 });
  const [prevScore, setPrev]  = useState(null);
  const [alertMsg, setAlertMsg] = useState(null);
  const histRef  = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    const u1 = window.electronAPI.onSessionUpdate(data => {
      setUpdate(prev => { setPrev(prev.liveScore); return data; });
      histRef.current.push(data.liveScore);
      if (histRef.current.length > 24) histRef.current.shift();
    });
    const u2 = window.electronAPI.onAlertData(() => {
      setAlertMsg(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAlertMsg(null), 5000);
    });
    const u3 = window.electronAPI.onAlertClear?.(() => {
      setAlertMsg(null);
      clearTimeout(timerRef.current);
    });
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  const dismiss = () => { clearTimeout(timerRef.current); setAlertMsg(null); };

  const score = update.liveScore ?? 50;
  const zone  = getZone(score);
  const trend = prevScore !== null ? score - prevScore : 0;
  const hist  = histRef.current;

  const sparkPath = hist.length > 1 ? hist.map((v, i) => {
    const x = (i / (hist.length - 1)) * 52;
    const y = 12 - (v / 100) * 10;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') : '';

  return (
    <div className="wr">
      <div className={`wp${alertMsg ? ' wp-open' : ''}`}>

        {/* Main pill row */}
        <div className="wrow">
          <span className="we">{zone.emoji}</span>
          <span className="ws" style={{ color: zone.color }}>{score}</span>
          {trend !== 0 && (
            <span className="wt" style={{ color: trend > 0 ? '#bef264' : '#f87171' }}>
              {trend > 0 ? '↑' : '↓'}
            </span>
          )}
          {sparkPath && (
            <svg className="wg" viewBox="0 0 52 12" preserveAspectRatio="none">
              <path d={sparkPath} fill="none" stroke={zone.color}
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.65" />
            </svg>
          )}
          <span className="wm">{fmtTimer(update.elapsed)}</span>
        </div>

        {/* Alert text — expands downward */}
        <div className={`wa${alertMsg ? ' wa-show' : ''}`} onClick={dismiss}>
          {alertMsg && <span className="wat">{alertMsg}</span>}
        </div>

      </div>
    </div>
  );
}
