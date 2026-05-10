export function fmtTimer(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function fmtMin(min) {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function isToday(ts) {
  const d = new Date(ts), n = new Date();
  return d.getFullYear() === n.getFullYear() &&
         d.getMonth()    === n.getMonth()    &&
         d.getDate()     === n.getDate();
}

export function scoreTextColor(s) {
  if (s >= 100) return 'text-violet-400';
  if (s >= 80)  return 'text-lime-400';
  if (s >= 65)  return 'text-emerald-400';
  if (s >= 50)  return 'text-yellow-400';
  return 'text-orange-400';
}

export function scoreBgColor(s) {
  if (s >= 100) return 'bg-violet-400';
  if (s >= 80)  return 'bg-lime-400';
  if (s >= 65)  return 'bg-emerald-400';
  if (s >= 50)  return 'bg-yellow-400';
  return 'bg-orange-400';
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function fmtScore(n) {
  if (!n || n < 1) return '0';
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000)     return `${parseFloat((n / 1_000).toFixed(2))}k`;
  return String(Math.round(n));
}
