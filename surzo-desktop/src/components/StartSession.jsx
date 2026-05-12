import { useState } from 'react';
import { CATEGORIES, CAT_ICON } from '../utils/categories.js';
import { Card } from './ui.jsx';

export default function StartSession({ onStart, onBack, targetScore: initialTarget }) {
  const [title,          setTitle]    = useState('');
  const [category,       setCategory] = useState('Programming');
  const [plannedMinutes, setPlanned]  = useState(25);
  const [trackPhone,     setPhone]    = useState(true);
  const [targetScore,    setTarget]   = useState(initialTarget ?? null);

  return (
    <div className="h-screen overflow-y-auto fadein" style={{ background: 'var(--bg-base)', color: 'var(--fg-base)' }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-8">
        <div className="pt-2 mb-6">
          <button onClick={onBack}
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: 'var(--text-sub)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2L4 6L8 10"/>
            </svg>
            Back
          </button>
        </div>

        <h2 className="font-black mb-5" style={{ fontSize: 22, letterSpacing: '-0.4px' }}>New Session</h2>

        <div className="space-y-2.5">
          {/* Title */}
          <Card className="px-4 py-3">
            <div className="sz-lbl mb-1.5">Title <span className="normal-case" style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. "${category} deep work"`}
              className="w-full bg-transparent text-base outline-none"
              style={{ color: 'var(--fg-base)', caretColor: 'var(--accent)' }}
            />
          </Card>

          {/* Category */}
          <Card className="p-4">
            <div className="sz-lbl mb-3">Category</div>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-left"
                  style={category === cat
                    ? { background: 'var(--accent)', color: '#06060a' }
                    : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-sub)', border: '1px solid rgba(255,255,255,0.06)' }
                  }
                >
                  <span style={{ fontSize: 14 }}>{CAT_ICON[cat]}</span>
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Duration */}
          <Card className="p-4">
            <div className="flex justify-between items-baseline mb-3">
              <div className="sz-lbl">Planned Duration</div>
              <div className="font-bold tabular-nums text-sm" style={{ color: 'var(--accent)' }}>{plannedMinutes} min</div>
            </div>
            <input
              type="range" min={5} max={120} step={5}
              value={plannedMinutes}
              onChange={e => setPlanned(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between mt-2" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              <span>5m</span><span>30m</span><span>1h</span><span>1.5h</span><span>2h</span>
            </div>
          </Card>

          {/* Phone tracking toggle */}
          <button
            onClick={() => setPhone(t => !t)}
            className="w-full sz-card px-4 py-3.5 flex items-center justify-between transition-opacity hover:opacity-80"
          >
            <div className="text-left">
              <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>Track Phone Distractions</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>Log each time you check your phone</div>
            </div>
            <div
              className="relative flex-shrink-0 ml-4 transition-colors"
              style={{
                width: 40, height: 22, borderRadius: 999,
                background: trackPhone ? 'var(--accent)' : 'var(--track-bg)',
              }}>
              <span
                className="absolute top-0.5 w-[18px] h-[18px] rounded-full transition-transform"
                style={{
                  background: trackPhone ? '#06060a' : 'var(--text-sub)',
                  transform: trackPhone ? 'translateX(20px)' : 'translateX(2px)',
                }}
              />
            </div>
          </button>

          {/* Target score */}
          <Card className="p-4">
            <div className="flex justify-between items-baseline mb-3">
              <div className="sz-lbl">Target Score</div>
              {targetScore != null ? (
                <button onClick={() => setTarget(null)}
                  className="text-xs font-semibold hover:opacity-70" style={{ color: 'var(--text-muted)' }}>off</button>
              ) : (
                <button onClick={() => setTarget(70)}
                  className="text-xs font-semibold hover:opacity-70" style={{ color: 'var(--accent)' }}>set</button>
              )}
            </div>
            {targetScore != null ? (
              <>
                <div className="text-center mb-3">
                  <span className="font-black tabular-nums" style={{ fontSize: 44, lineHeight: 1, color: 'var(--accent)' }}>{targetScore}</span>
                </div>
                <input type="range" min={40} max={95} step={1} value={targetScore}
                  onChange={e => setTarget(Number(e.target.value))} className="w-full" />
                <div className="flex justify-between mt-2" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>40</span><span>55</span><span>70</span><span>85</span><span>95</span>
                </div>
                <div className="text-xs mt-2.5" style={{ color: 'var(--text-sub)' }}>これを下回ったらアラート</div>
              </>
            ) : (
              <div className="text-sm" style={{ color: 'var(--text-muted)' }}>アラートなし</div>
            )}
          </Card>
        </div>

        <button
          onClick={() => onStart({ title: title.trim() || category, category, plannedMinutes, trackPhone, targetScore })}
          className="w-full sz-btn-primary mt-4"
          style={{ paddingTop: 15, paddingBottom: 15, fontSize: 15 }}
        >
          Start
        </button>
      </div>
    </div>
  );
}
