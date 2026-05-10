import { useState, useMemo } from 'react';

const PERIODS = ['1h', '1日', '1週', '1月', '1年'];
const SCOPES  = ['世界', '国別', 'フレンド'];

// "Quantity" leaders – many sessions, solid avg → dominate total ranking
// "Quality" players – high avg, fewer sessions → dominate avg ranking
// This creates clear divergence between total and avg orderings
const MOCK_BASE = [
  { id:'1',  name:'Park Jimin',   flag:'🇰🇷', country:'Korea',    total:10800, avg:84, sessions:128 },
  { id:'2',  name:'Lin Wei',      flag:'🇨🇳', country:'China',    total:9936,  avg:72, sessions:138 },
  { id:'3',  name:'Mateo García', flag:'🇪🇸', country:'Spain',    total:9164,  avg:79, sessions:116 },
  { id:'4',  name:'山本 葵',      flag:'🇯🇵', country:'Japan',    total:8470,  avg:77, sessions:110 },
  { id:'5',  name:'Léa Martin',   flag:'🇫🇷', country:'France',   total:7800,  avg:75, sessions:104 },
  { id:'6',  name:'Omar Hassan',  flag:'🇪🇬', country:'Egypt',    total:6900,  avg:69, sessions:100 },
  { id:'me', name:'You',          flag:'🇯🇵', country:'Japan',    total:6384,  avg:76, sessions:84, isMe:true },
  { id:'8',  name:'Carlos Lima',  flag:'🇧🇷', country:'Brazil',   total:4800,  avg:60, sessions:80 },
  { id:'9',  name:'Alex Kim',     flag:'🇺🇸', country:'USA',      total:5848,  avg:68, sessions:86 },
  { id:'10', name:'鈴木 海斗',    flag:'🇯🇵', country:'Japan',    total:5590,  avg:65, sessions:86 },
  { id:'11', name:'田中 蓮',      flag:'🇯🇵', country:'Japan',    total:4700,  avg:94, sessions:50 },
  { id:'12', name:'Emma Weber',   flag:'🇩🇪', country:'Germany',  total:4095,  avg:91, sessions:45 },
  { id:'13', name:'Sofia Rossi',  flag:'🇮🇹', country:'Italy',    total:3784,  avg:88, sessions:43 },
  { id:'14', name:'Hana Novak',   flag:'🇨🇿', country:'Czech',    total:5166,  avg:63, sessions:82 },
  { id:'15', name:'Yui Tanaka',   flag:'🇯🇵', country:'Japan',    total:4350,  avg:58, sessions:75 },
  { id:'16', name:'Tom Baker',    flag:'🇬🇧', country:'UK',       total:3960,  avg:55, sessions:72 },
  { id:'17', name:'Nadia Petrov', flag:'🇷🇺', country:'Russia',   total:3588,  avg:52, sessions:69 },
  { id:'18', name:'David Chen',   flag:'🇹🇼', country:'Taiwan',   total:3200,  avg:50, sessions:64 },
  { id:'19', name:'Aisha Osei',   flag:'🇬🇭', country:'Ghana',    total:2784,  avg:48, sessions:58 },
  { id:'20', name:'Ivan Petrov',  flag:'🇧🇬', country:'Bulgaria', total:2385,  avg:45, sessions:53 },
];

const FRIENDS_DATA = [
  { id:'f1', name:'前田 颯太',   flag:'🇯🇵', country:'Japan', total:8100, avg:83, sessions:97 },
  { id:'me', name:'You',         flag:'🇯🇵', country:'Japan', total:6384, avg:76, sessions:84, isMe:true },
  { id:'f2', name:'Kenji Mori',  flag:'🇯🇵', country:'Japan', total:5200, avg:71, sessions:73 },
  { id:'f3', name:'Sara Wells',  flag:'🇺🇸', country:'USA',   total:3900, avg:88, sessions:44 },
  { id:'f4', name:'中村 結衣',   flag:'🇯🇵', country:'Japan', total:3200, avg:59, sessions:54 },
];

const COUNTRY_DATA = MOCK_BASE.filter(u => u.country === 'Japan');

function getRows(scope, period, metric) {
  let base = scope === 'フレンド' ? FRIENDS_DATA
           : scope === '国別'    ? COUNTRY_DATA
           : MOCK_BASE;
  const mult = { '1h':0.02, '1日':0.12, '1週':0.6, '1月':1, '1年':5 }[period] ?? 1;
  base = base.map(u => ({
    ...u,
    displayScore: metric === '合計' ? Math.round(u.total * mult) : u.avg,
    displaySessions: Math.max(1, Math.round(u.sessions * mult)),
  }));
  return [...base].sort((a, b) => b.displayScore - a.displayScore);
}

function fmtScore(n, metric) {
  if (metric === '合計') return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return String(n);
}

function scoreColor(s) {
  return s >= 70 ? '#22c55e' : s >= 40 ? '#eab308' : '#ef4444';
}

function medal(r) {
  return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null;
}

export default function Ranking({ onBack }) {
  const [period, setPeriod] = useState('1月');
  const [scope,  setScope]  = useState('世界');
  const [metric, setMetric] = useState('合計');

  const rows = useMemo(() => getRows(scope, period, metric), [scope, period, metric]);

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 pt-10 pb-8 fadein">
        {/* Back */}
        <div className="pt-2 mb-5">
          <button onClick={onBack}
            className="text-stone-400 dark:text-zinc-600 hover:text-stone-700 dark:hover:text-zinc-300 flex items-center gap-1 text-sm transition-colors">
            ← Back
          </button>
        </div>

        <h2 className="text-2xl font-black mb-5 tracking-tight">Ranking</h2>

        {/* Period pills */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors
                ${period === p
                  ? 'bg-lime-300 text-black'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300'}`}>
              {p}
            </button>
          ))}
        </div>

        {/* Scope tabs */}
        <div className="flex bg-stone-100 dark:bg-zinc-800 rounded-xl p-1 mb-4">
          {SCOPES.map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors
                ${scope === s
                  ? 'bg-white dark:bg-zinc-700 text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Metric toggle */}
        <div className="flex gap-2 mb-5">
          {['合計', '平均'].map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors
                ${metric === m
                  ? 'bg-stone-200 dark:bg-zinc-700 text-stone-900 dark:text-white'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300'}`}>
              {m === '合計' ? '合計 Work Score' : '平均 Work Score'}
            </button>
          ))}
        </div>

        {/* Column header */}
        <div className="flex px-1 mb-2 text-xs font-semibold text-stone-300 dark:text-zinc-700 tracking-wider uppercase">
          <span>Rank</span>
          <span className="flex-1" />
          <span>{metric === '合計' ? 'Total' : 'Avg'}</span>
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-2">
          {rows.map((item, idx) => {
            const rank = idx + 1;
            const m = medal(rank);
            const color = scoreColor(item.displayScore);
            return (
              <div key={item.id}
                className={`flex items-center bg-stone-100 dark:bg-zinc-900 rounded-2xl px-4 py-3
                  ${item.isMe ? 'ring-1 ring-lime-400/30 bg-lime-50 dark:bg-lime-950/20' : ''}`}>
                {/* Rank */}
                <div className="w-8 flex items-center justify-center">
                  {m
                    ? <span className="text-xl">{m}</span>
                    : <span className={`text-sm font-black ${rank <= 10 ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-300 dark:text-zinc-600'}`}>{rank}</span>}
                </div>
                {/* Flag */}
                <span className="text-xl mx-2.5">{item.flag}</span>
                {/* Name + sessions */}
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm truncate ${item.isMe ? 'text-lime-600 dark:text-lime-400' : 'text-stone-900 dark:text-white'}`}>
                    {item.name}
                  </div>
                  <div className="text-xs text-stone-400 dark:text-zinc-600 mt-0.5">
                    {item.displaySessions} sessions
                  </div>
                </div>
                {/* Score */}
                <span className="text-2xl font-black tracking-tight" style={{ color }}>
                  {fmtScore(item.displayScore, metric)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
