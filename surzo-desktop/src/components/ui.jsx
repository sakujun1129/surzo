import { scoreTextColor, scoreBgColor } from '../utils/format.js';

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-zinc-900/80 border border-stone-200 dark:border-white/[0.06] rounded-3xl ${className}`}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, sub, color }) {
  return (
    <Card className="p-4">
      <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${color || 'text-stone-900 dark:text-white'}`}>{value}</div>
      {sub && <div className="text-stone-400 dark:text-zinc-600 text-xs mt-0.5">{sub}</div>}
    </Card>
  );
}

export function ScoreBar({ value, max = 100, negative = false }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${negative ? 'bg-orange-500/70' : scoreBgColor(value)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function PermissionBanner({ onCheck }) {
  return (
    <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-2xl px-4 py-3 mb-4 flex items-start gap-3">
      <span className="text-yellow-500 dark:text-yellow-400 text-lg mt-0.5">⚠️</span>
      <div className="flex-1">
        <div className="text-yellow-700 dark:text-yellow-300 text-sm font-semibold">Accessibility Permission Required</div>
        <div className="text-yellow-600/80 dark:text-yellow-500/80 text-xs mt-0.5">
          System Settings → Privacy &amp; Security → Accessibility → Enable Surzo
        </div>
      </div>
      <button onClick={onCheck} className="text-yellow-600 dark:text-yellow-400 text-xs underline flex-shrink-0 mt-0.5">
        Check again
      </button>
    </div>
  );
}
