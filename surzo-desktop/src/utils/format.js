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

// Gradient: red → orange → yellow → green → cyan → blue (blue = deepest focus)
const COLOR_STOPS = [
  [0,   [244, 63,  94 ]],
  [20,  [251, 146, 60 ]],
  [38,  [251, 191, 36 ]],
  [55,  [52,  211, 153]],
  [75,  [34,  211, 238]],
  [100, [96,  165, 250]],
];
function lv(a, b, t) { return Math.round(a + (b - a) * t); }
export function scoreColor(score) {
  const s = Math.max(0, Math.min(100, score ?? 0));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [s0, c0] = COLOR_STOPS[i];
    const [s1, c1] = COLOR_STOPS[i + 1];
    if (s <= s1) {
      const t = (s - s0) / (s1 - s0);
      return `rgb(${lv(c0[0],c1[0],t)},${lv(c0[1],c1[1],t)},${lv(c0[2],c1[2],t)})`;
    }
  }
  return 'rgb(96,165,250)';
}

export function scoreTextColor(s) {
  if (s >= 75) return 'text-blue-400';
  if (s >= 55) return 'text-cyan-400';
  if (s >= 38) return 'text-yellow-400';
  if (s >= 20) return 'text-orange-400';
  return 'text-rose-400';
}

export function scoreBgColor(s) {
  if (s >= 75) return 'bg-blue-400';
  if (s >= 55) return 'bg-cyan-400';
  if (s >= 38) return 'bg-yellow-400';
  if (s >= 20) return 'bg-orange-400';
  return 'bg-rose-400';
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
