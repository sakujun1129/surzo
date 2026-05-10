import { fmtMin, fmtScore, isToday, scoreTextColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card, PermissionBanner } from './ui.jsx';

function scoreColor(s) {
  return s >= 70 ? '#d4f57a' : s >= 40 ? '#ffd60a' : '#ff453a';
}

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  const raw  = s.totalWorkScore;
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}

function SurzoLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-2xl bg-lime-300 flex items-center justify-center flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <polyline points="2,15 6,9 10,12 16,4" stroke="#0a0a0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="16" cy="4" r="2" fill="#0a0a0b" />
        </svg>
      </div>
      <div>
        <div className="text-[22px] font-black tracking-tight leading-none text-stone-900 dark:text-white">surzo</div>
        <div className="text-[11px] text-stone-400 dark:text-zinc-400 leading-none mt-0.5 tracking-wide uppercase">Your focus, measured.</div>
      </div>
    </div>
  );
}

function MiniSparkline({ series }) {
  if (!series || series.length < 2) return null;
  const W = 72, H = 22;
  const maxT = series[series.length - 1].t || 1;
  const pts = series.map(({ t, s }) => ({
    x: (t / maxT) * W,
    y: H - (s / 100) * H,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = series[series.length - 1].s;
  const color = scoreColor(last);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 72, height: 22 }} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Dashboard({ sessions, onQuickStart, onCustomStart, hasPermission, onCheckPermission, onSettings, onFriends, onRanking, onSessionDetail, theme, onToggleTheme }) {
  const today  = sessions.filter(s => isToday(s.startedAt));
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);

  const todayAvg   = today.length ? Math.round(today.reduce((s, x) => s + x.averageWorkScore, 0) / today.length) : null;
  const todayMins  = today.reduce((s, x) => s + (x.durationMinutes || 0), 0);
  const todayScore = today.reduce((s, x) => s + calcTotal(x), 0);

  return (
    <div className="h-screen bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-white overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 pt-8 pb-8 fadein flex flex-col min-h-full">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-8 pt-2 window-drag">
          <div />
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
            <button onClick={onToggleTheme} title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors">
              {theme === 'dark'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
            </button>
            <button onClick={onRanking} title="Ranking"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/>
              </svg>
            </button>
            <button onClick={onFriends} title="Friends"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </button>
            <button onClick={onSettings} title="Settings"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-stone-400 dark:text-zinc-400 hover:bg-stone-100 dark:hover:bg-zinc-800 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        {!hasPermission && <PermissionBanner onCheck={onCheckPermission} />}

        <div className="mb-8">
          <SurzoLogo />
        </div>

        {/* Today stats */}
        {today.length > 0 && (
          <div className="flex gap-3 mb-6">
            <div className="flex-1 bg-stone-100 dark:bg-[#111] rounded-[22px] py-5 text-center">
              <div className="text-3xl font-black tracking-tight leading-none">
                {today.length}<span className="text-sm font-semibold text-stone-400 dark:text-zinc-400 ml-0.5">回</span>
              </div>
              <div className="text-[11px] font-bold text-stone-400 dark:text-zinc-400 mt-2 tracking-widest uppercase">今日</div>
            </div>
            <div className="flex-1 bg-stone-100 dark:bg-[#111] rounded-[22px] py-5 text-center">
              <div className={`text-3xl font-black tracking-tight leading-none ${scoreTextColor(todayAvg)}`}>{todayAvg}</div>
              <div className="text-[11px] font-bold text-stone-400 dark:text-zinc-400 mt-2 tracking-widest uppercase">平均</div>
            </div>
            <div className="flex-1 bg-stone-100 dark:bg-[#111] rounded-[22px] py-5 text-center">
              <div className="text-3xl font-black tracking-tight leading-none tabular-nums text-lime-500 dark:text-lime-300">{fmtScore(todayScore)}</div>
              <div className="text-[11px] font-bold text-stone-400 dark:text-zinc-400 mt-2 tracking-widest uppercase">合計</div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="flex gap-2 mb-8">
          <button onClick={onQuickStart}
            className="flex-1 bg-lime-300 hover:bg-lime-200 active:scale-[.98] text-zinc-950 font-black text-base py-4 rounded-3xl transition-all">
            Start Session
          </button>
          <button onClick={onCustomStart}
            className="bg-stone-200 hover:bg-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-500 dark:text-zinc-300 font-semibold text-sm px-5 rounded-3xl transition-colors"
            title="Customize session">
            ···
          </button>
        </div>

        {/* Session history */}
        {sorted.length > 0 ? (
          <>
            <div className="text-stone-400 dark:text-zinc-500 text-xs uppercase tracking-widest mb-3">記録</div>
            <div className="grid grid-cols-3 gap-2 flex-1">
              {sorted.map(s => {
                const accent = s.averageWorkScore >= 70 ? '#d4f57a' : s.averageWorkScore >= 40 ? '#ffd60a' : '#ff453a';
                return (
                <button key={s.id} onClick={() => onSessionDetail?.(s)} className="text-left group">
                  <div className="rounded-2xl overflow-hidden bg-stone-100 dark:bg-[#111] group-hover:scale-[1.02] transition-transform relative" style={{ aspectRatio: '3/4' }}>
                    {s.photoUri?.startsWith('https://') ? (
                      <>
                        <img src={s.photoUri} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.8) 100%)' }} />
                        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2.5">
                          <div className="font-black tabular-nums text-lg leading-none" style={{ color: accent }}>{fmtScore(calcTotal(s))}</div>
                          <div className="text-[9px] mt-0.5" style={{ color: accent + '88' }}>avg {s.averageWorkScore}</div>
                          <div className="text-[9px] font-semibold text-white/70 mt-1.5 truncate">{s.title}</div>
                          <div className="text-[8px] text-white/40 mt-0.5">
                            {isToday(s.startedAt) ? '今日' : new Date(s.startedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} · {fmtMin(s.durationMinutes)}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ height: 3, backgroundColor: accent }} />
                        <div className="flex flex-col items-center justify-between px-2 pb-3 pt-3" style={{ height: 'calc(100% - 3px)' }}>
                          <span className="text-2xl">{CAT_ICON[s.category]}</span>
                          <div className="w-full text-center">
                            <div className="font-black tabular-nums leading-none text-2xl" style={{ color: accent }}>{fmtScore(calcTotal(s))}</div>
                            <div className="text-[10px] font-semibold mt-0.5" style={{ color: accent + '99' }}>avg {s.averageWorkScore}</div>
                            <div className="w-full h-0.5 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden mt-1.5">
                              <div className="h-full rounded-full" style={{ width: `${s.averageWorkScore}%`, backgroundColor: accent }} />
                            </div>
                          </div>
                          <div className="w-full text-center">
                            <div className="text-[11px] font-bold text-stone-500 dark:text-zinc-500 leading-tight truncate">{s.title}</div>
                            <div className="text-[10px] text-stone-400 dark:text-zinc-500 mt-0.5">
                              {isToday(s.startedAt) ? '今日' : new Date(s.startedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} · {fmtMin(s.durationMinutes)}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center pb-8">
            <div className="w-12 h-12 rounded-2xl bg-lime-300/20 flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <polyline points="2,15 6,9 10,12 16,4" stroke="#bef264" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="16" cy="4" r="2" fill="#bef264" />
              </svg>
            </div>
            <p className="text-stone-500 dark:text-zinc-400 text-sm font-semibold">Start your first session.</p>
            <p className="text-stone-400 dark:text-zinc-500 text-xs mt-1">Surzo turns your PC work into a score.</p>
          </div>
        )}

      </div>
    </div>
  );
}
