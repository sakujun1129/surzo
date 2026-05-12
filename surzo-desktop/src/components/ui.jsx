export function Card({ children, className = '', style = {} }) {
  return (
    <div className={`sz-card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub, color }) {
  return (
    <Card className="p-4">
      <div className="sz-lbl mb-1.5">{label}</div>
      <div className="text-2xl font-black tabular-nums" style={{ color: color || 'var(--fg-base)' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </Card>
  );
}

export function ScoreBar({ value, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 70 ? 'var(--score-a)' : value >= 55 ? 'var(--score-b)' : value >= 38 ? 'var(--score-d)' : 'var(--score-f)';
  return (
    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function PermissionBanner({ onCheck }) {
  return (
    <div className="sz-card px-4 py-3 mb-4 flex items-start gap-3" style={{ borderColor: 'rgba(201,160,48,0.25)', borderTopColor: 'rgba(201,160,48,0.35)' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--score-d)', marginTop: 1, flexShrink: 0 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <div className="flex-1">
        <div className="text-sm font-semibold" style={{ color: 'var(--score-d)' }}>Accessibility Permission Required</div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
          System Settings → Privacy &amp; Security → Accessibility → Enable Surzo
        </div>
      </div>
      <button onClick={onCheck} className="text-xs underline flex-shrink-0 mt-0.5" style={{ color: 'var(--text-sub)' }}>
        Check again
      </button>
    </div>
  );
}
