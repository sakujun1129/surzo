import { useState } from 'react';
import { fmtMin, fmtScore, isToday, scoreColor } from '../utils/format.js';
import { CAT_ICON } from '../utils/categories.js';
import { Card, PermissionBanner } from './ui.jsx';

function fmtPts(n) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function MiniRing({ avg, total, color }) {
  const r    = 42;
  const sw   = 7;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(avg / 100, 1) * circ;
  const label = fmtPts(total);
  return (
    <svg viewBox="0 0 104 104" width="90" height="90">
      <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth={sw} strokeOpacity="0.13" />
      <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 52 52)" />
      <text x="52" y="48" textAnchor="middle" dominantBaseline="middle"
        fontSize="22" fontWeight="900" fill={color} fontFamily="inherit" letterSpacing="-0.5">
        {label}
      </text>
      <text x="52" y="66" textAnchor="middle" dominantBaseline="middle"
        fontSize="9.5" fontWeight="600" fill={color} fillOpacity="0.4" fontFamily="inherit" letterSpacing="0.5">
        avg {avg}
      </text>
    </svg>
  );
}

function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  return Math.round(avg * mins);
}

function TargetPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const draft = value ?? 70;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 sz-card hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-sub)' }}>
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>目標スコア</span>
        </div>
        <div className="flex items-center gap-2">
          {value != null
            ? <span className="text-sm font-black tabular-nums" style={{ color: 'var(--accent)' }}>{value}</span>
            : <span className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>なし</span>
          }
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-1.5 px-5 pt-4 pb-5 sz-card">
          <div className="sz-lbl text-center mb-5">これを下回ったらアラート</div>
          <div className="text-center mb-4">
            <span className="font-black tracking-tight tabular-nums" style={{ fontSize: 64, lineHeight: 1, color: value != null ? 'var(--accent)' : 'var(--text-muted)' }}>
              {value != null ? value : '—'}
            </span>
          </div>
          <input
            type="range" min={40} max={95} step={1}
            value={draft}
            onChange={e => onChange(Number(e.target.value))}
            className="w-full mb-1"
          />
          <div className="flex justify-between text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>
            <span>40</span><span>55</span><span>70</span><span>85</span><span>95</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="flex-1 py-2.5 sz-btn-secondary rounded-lg text-sm"
            >
              なし
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex-1 py-2.5 sz-btn-primary rounded-lg text-sm"
            >
              設定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SurzoLogo() {
  return (
    <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 1, color: 'var(--fg-base)', WebkitAppRegion: 'no-drag' }}>
      sur<span style={{ color: '#d4f57a' }}>z</span>o
    </span>
  );
}

function MiniSparkline({ series }) {
  if (!series || series.length < 2) return null;
  const W = 72, H = 22;
  const maxT = series[series.length - 1].t || 1;
  const pts = series.map(({ t, s }) => ({ x: (t / maxT) * W, y: H - (s / 100) * H }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = series[series.length - 1].s;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 72, height: 22 }} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={scoreColor(last)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function Dashboard({ sessions, onQuickStart, onCustomStart, hasPermission, onCheckPermission, onSettings, onFriends, onRanking, onSessionDetail, theme, onToggleTheme, targetScore, onSetTarget }) {
  const today  = sessions.filter(s => isToday(s.startedAt));
  const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);

  const todayAvg   = today.length ? Math.round(today.reduce((s, x) => s + x.averageWorkScore, 0) / today.length) : 0;
  const todayMins  = today.reduce((s, x) => s + (x.durationMinutes || 0), 0);
  const todayScore = today.reduce((s, x) => s + calcTotal(x), 0);

  const iconBtn = 'w-8 h-8 flex items-center justify-center rounded-lg transition-colors sz-icon-btn';
  const iconStyle = { color: 'var(--text-sub)' };
  const iconHover = 'hover:bg-white/[0.06] hover:text-white';

  return (
    <div className="h-screen overflow-y-auto" style={{ background: 'var(--bg-base)', color: 'var(--fg-base)' }}>
      <div className="max-w-lg mx-auto px-5 pt-8 pb-8 fadein flex flex-col min-h-full">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-7 pt-2 window-drag">
          <SurzoLogo />
          <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' }}>
            <button onClick={onRanking} className={`${iconBtn} ${iconHover}`} style={iconStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/>
              </svg>
            </button>
            <button onClick={onFriends} className={`${iconBtn} ${iconHover}`} style={iconStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </button>
            <button onClick={onSettings} className={`${iconBtn} ${iconHover}`} style={iconStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        {!hasPermission && <PermissionBanner onCheck={onCheckPermission} />}

        {/* Hero — today's total */}
        <div className="sz-card mb-5 fadein" style={{ padding: '24px 24px 20px' }}>
          <div className="sz-lbl mb-3">TODAY</div>
          <div className="flex items-baseline gap-2 mb-5">
            <span className="font-black tabular-nums" style={{
              fontSize: 92, lineHeight: 0.85, letterSpacing: '-0.05em',
              color: today.length > 0 ? 'var(--accent)' : 'rgba(142,207,90,0.32)',
            }}>
              {today.length > 0 ? fmtScore(todayScore) : '0'}
            </span>
            <span className="font-bold tracking-widest" style={{ fontSize: 13, color: 'var(--text-muted)' }}>PTS</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex-1">
              <div className="font-black tabular-nums leading-none" style={{ fontSize: 22, color: todayAvg ? scoreColor(todayAvg) : 'var(--text-muted)' }}>
                {todayAvg || 0}
              </div>
              <div className="sz-lbl mt-1.5">平均</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--card-border)' }} />
            <div className="flex-1">
              <div className="font-black tabular-nums leading-none" style={{ fontSize: 22, color: todayMins > 0 ? 'var(--fg-base)' : 'var(--text-muted)' }}>
                {todayMins > 0 ? fmtMin(todayMins) : '0m'}
              </div>
              <div className="sz-lbl mt-1.5">時間</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'var(--card-border)' }} />
            <div className="flex-1">
              <div className="font-black tabular-nums leading-none" style={{ fontSize: 22, color: today.length > 0 ? 'var(--fg-base)' : 'var(--text-muted)' }}>
                {today.length}<span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2, color: 'var(--text-sub)' }}>回</span>
              </div>
              <div className="sz-lbl mt-1.5">セッション</div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-2 mb-7">
          <button onClick={onQuickStart} className="flex-1 sz-btn-primary" style={{ fontSize: 15, paddingTop: 15, paddingBottom: 15 }}>
            Start Session
          </button>
          <button onClick={onCustomStart} className="sz-btn-secondary px-5" title="Customize session" style={{ fontSize: 18, letterSpacing: 1 }}>
            ···
          </button>
        </div>

        {/* Session history */}
        {sorted.length > 0 ? (
          <>
            <div className="sz-lbl mb-3.5">記録</div>
            <div className="grid grid-cols-3 gap-2.5 flex-1 stagger">
              {sorted.map(s => {
                const accent = scoreColor(s.averageWorkScore);
                return (
                  <button key={s.id} onClick={() => onSessionDetail?.(s)} className="text-left">
                    <div className="sz-card overflow-hidden relative" style={{ aspectRatio: '3/4' }}>
                      {s.photoUri?.startsWith('https://') ? (
                        <>
                          <img src={s.photoUri} alt="" className="absolute inset-0 w-full h-full object-cover"/>
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.82) 100%)' }}/>
                          <div className="absolute bottom-0 left-0 right-0 px-2 pb-2.5">
                            <div className="font-black tabular-nums text-lg leading-none" style={{ color: accent }}>{fmtScore(calcTotal(s))}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: accent + '88' }}>avg {s.averageWorkScore}</div>
                            <div className="text-[9px] font-semibold mt-1.5 truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{s.title}</div>
                            <div className="text-[8px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                              {isToday(s.startedAt) ? '今日' : new Date(s.startedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} · {fmtMin(s.durationMinutes)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-between px-2 pb-3 pt-5 h-full">
                          <MiniRing avg={s.averageWorkScore} total={calcTotal(s)} color={accent} />
                          <div className="w-full text-center">
                            <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: 'var(--text-sub)' }}>{s.title}</div>
                            <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                              {isToday(s.startedAt) ? '今日' : new Date(s.startedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} · {fmtMin(s.durationMinutes)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center pb-8">
            <div className="w-10 h-10 flex items-center justify-center mb-4" style={{ background: 'rgba(142,207,90,0.08)', borderRadius: 10 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <polyline points="2,15 6,9 10,12 16,4" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="16" cy="4" r="2" fill="var(--accent)"/>
              </svg>
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-sub)' }}>Start your first session.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Surzo turns your PC work into a score.</p>
          </div>
        )}

      </div>
    </div>
  );
}
