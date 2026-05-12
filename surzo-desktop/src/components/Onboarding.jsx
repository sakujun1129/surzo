import { useState } from 'react';

const LIME = '#d4f57a';
const DIM = '#3f3f46';

// ── Illustrations (custom SVG, no emoji) ────────────────────────────────────

function IllSurzo() {
  return (
    <svg viewBox="0 0 200 200" width="160" height="160">
      <defs>
        <radialGradient id="glowS" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={LIME} stopOpacity="0.20" />
          <stop offset="100%" stopColor={LIME} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="95" fill="url(#glowS)" />
      <circle cx="100" cy="100" r="78" fill="none" stroke={LIME} strokeOpacity="0.18" strokeWidth="2" />
      <circle cx="100" cy="100" r="78" fill="none" stroke={LIME} strokeWidth="6"
        strokeLinecap="round" strokeDasharray="370 490" transform="rotate(-90 100 100)" />
      {/* upward chart line */}
      <polyline points="58,128 84,108 110,118 142,72" fill="none"
        stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="142" cy="72" r="6" fill={LIME} />
    </svg>
  );
}

function IllScore() {
  return (
    <svg viewBox="0 0 200 200" width="160" height="160">
      <defs>
        <linearGradient id="ringS" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="40%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="74" fill="none" stroke="#27272a" strokeWidth="14" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="url(#ringS)" strokeWidth="14"
        strokeLinecap="round" strokeDasharray="380 465" transform="rotate(-90 100 100)" />
      <text x="100" y="96" textAnchor="middle" fill="#fff" fontSize="48" fontWeight="900"
        fontFamily="Inter, system-ui" letterSpacing="-2">87</text>
      <text x="100" y="124" textAnchor="middle" fill={LIME} fillOpacity="0.55"
        fontSize="11" fontWeight="700" fontFamily="Inter, system-ui" letterSpacing="3">DEEP FOCUS</text>
    </svg>
  );
}

function IllPhone() {
  return (
    <svg viewBox="0 0 200 200" width="160" height="160">
      <defs>
        <radialGradient id="glowP" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={LIME} stopOpacity="0.15" />
          <stop offset="100%" stopColor={LIME} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="90" fill="url(#glowP)" />
      {/* phone outline */}
      <rect x="68" y="36" width="64" height="112" rx="11" fill="none" stroke="#fff" strokeWidth="3.5" />
      <line x1="92" y1="48" x2="108" y2="48" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="100" cy="138" r="3.5" fill="#fff" />
      {/* focus rays */}
      <line x1="44" y1="92" x2="56" y2="92" stroke={LIME} strokeWidth="3" strokeLinecap="round" />
      <line x1="44" y1="76" x2="60" y2="84" stroke={LIME} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="44" y1="108" x2="60" y2="100" stroke={LIME} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="156" y1="92" x2="144" y2="92" stroke={LIME} strokeWidth="3" strokeLinecap="round" />
      <line x1="156" y1="76" x2="140" y2="84" stroke={LIME} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="156" y1="108" x2="140" y2="100" stroke={LIME} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      {/* status dot inside */}
      <circle cx="100" cy="92" r="14" fill={LIME} fillOpacity="0.15" />
      <circle cx="100" cy="92" r="6" fill={LIME} />
    </svg>
  );
}

function IllRecord() {
  return (
    <svg viewBox="0 0 200 200" width="160" height="160">
      {/* stacked record cards */}
      <rect x="50" y="58" width="100" height="120" rx="13" fill="#18181b" stroke={DIM} strokeWidth="1.5"
        transform="rotate(-6 100 118)" />
      <rect x="50" y="50" width="100" height="120" rx="13" fill="#1c1c1f" stroke={DIM} strokeWidth="1.5"
        transform="rotate(2 100 110)" />
      <rect x="50" y="42" width="100" height="120" rx="13" fill="#27272a" stroke="#3f3f46" strokeWidth="1.5" />
      {/* front card content */}
      <text x="100" y="92" textAnchor="middle" fill={LIME} fontSize="44" fontWeight="900"
        fontFamily="Inter, system-ui" letterSpacing="-2">91</text>
      <text x="100" y="115" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontWeight="600"
        fontFamily="Inter, system-ui">25 min</text>
      <line x1="74" y1="130" x2="126" y2="130" stroke={DIM} strokeWidth="1" />
      <line x1="74" y1="140" x2="116" y2="140" stroke={DIM} strokeWidth="1" />
      <line x1="74" y1="150" x2="100" y2="150" stroke={DIM} strokeWidth="1" />
    </svg>
  );
}

function IllSync() {
  return (
    <svg viewBox="0 0 200 200" width="160" height="160">
      {/* mac */}
      <rect x="14" y="62" width="80" height="56" rx="6" fill="none" stroke="#fff" strokeWidth="3" />
      <rect x="20" y="68" width="68" height="44" rx="2" fill="#18181b" />
      <line x1="36" y1="124" x2="72" y2="124" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <line x1="46" y1="120" x2="62" y2="120" stroke="#52525b" strokeWidth="2" />
      <circle cx="40" cy="90" r="4" fill={LIME} />
      <line x1="48" y1="88" x2="78" y2="88" stroke="#52525b" strokeWidth="2" />
      <line x1="48" y1="96" x2="68" y2="96" stroke="#52525b" strokeWidth="2" />
      {/* iphone */}
      <rect x="138" y="58" width="44" height="80" rx="8" fill="none" stroke="#fff" strokeWidth="3" />
      <line x1="152" y1="68" x2="168" y2="68" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />
      <circle cx="160" cy="130" r="2.5" fill="#52525b" />
      <circle cx="160" cy="92" r="9" fill={LIME} fillOpacity="0.18" />
      <circle cx="160" cy="92" r="4" fill={LIME} />
      {/* connecting wave */}
      <path d="M 94 92 Q 116 70, 138 92" fill="none" stroke={LIME} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 4" />
      <circle cx="116" cy="80" r="3.5" fill={LIME} />
    </svg>
  );
}

const SLIDES = [
  {
    illustration: <IllSurzo />,
    eyebrow: 'WELCOME',
    title: 'Surzoへようこそ',
    body: 'MacとiPhoneを連携させて、毎日の作業を「集中スコア」として可視化するアプリです。',
  },
  {
    illustration: <IllScore />,
    eyebrow: 'WORK SCORE',
    title: '集中度を数値化',
    body: '使っているアプリ・タイピング・カーソルの動きから0〜100のスコアを算出。6段階のゾーンで現在の集中状態を把握できます。',
  },
  {
    illustration: <IllPhone />,
    eyebrow: 'PHONE TRACKING',
    title: 'スマホの誘惑を可視化',
    body: 'スマホを触った回数と時間を自動で記録。スコアにマイナスとして反映され、自分の集中の癖が見えてきます。',
  },
  {
    illustration: <IllRecord />,
    eyebrow: 'RECORDS',
    title: 'すべて記録に残る',
    body: '完了したセッションは自動で保存。写真の添付、フィード共有、フレンドのセッションを見ることもできます。',
  },
  {
    illustration: <IllSync />,
    eyebrow: 'SYNC',
    title: 'Mac × iPhone',
    body: '同じアカウントでログインするだけで自動連携。スマホからMacのセッションを開始・停止できます。',
  },
];

export default function Onboarding({ onClose }) {
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const isLast = idx === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#06060a' }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 520, height: 520, borderRadius: '50%',
        background: `radial-gradient(circle, ${LIME}18 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />

      {/* Top bar */}
      <div className="flex items-center justify-between px-7 pt-7 relative window-drag">
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.06em', color: '#fff', WebkitAppRegion: 'no-drag' }}>
          sur<span style={{ color: LIME }}>z</span>o
        </span>
        <button onClick={onClose}
          className="text-xs font-semibold transition-colors"
          style={{ color: '#52525b', WebkitAppRegion: 'no-drag' }}>
          スキップ
        </button>
      </div>

      {/* Slide content — centered */}
      <div className="flex-1 flex items-center justify-center px-8 relative">
        <div className="w-full max-w-md text-center fadein" key={idx}>
          <div className="flex justify-center mb-10">{slide.illustration}</div>
          <div className="text-[10px] font-extrabold tracking-[3.5px] mb-3" style={{ color: LIME }}>
            {slide.eyebrow}
          </div>
          <h2 className="font-black text-white mb-4" style={{ fontSize: 30, letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            {slide.title}
          </h2>
          <p className="leading-relaxed mx-auto" style={{ color: '#a1a1aa', fontSize: 15, maxWidth: 380 }}>
            {slide.body}
          </p>
        </div>
      </div>

      {/* Progress + nav */}
      <div className="px-8 pb-9 relative">
        <div className="flex justify-center gap-2 mb-7">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className="rounded-full transition-all"
              style={{
                height: 4, width: i === idx ? 28 : 6,
                background: i === idx ? LIME : '#27272a',
                transition: 'width 0.3s, background 0.3s',
              }} />
          ))}
        </div>
        <div className="flex gap-3 max-w-md mx-auto">
          {idx > 0 && (
            <button onClick={() => setIdx(i => i - 1)}
              className="flex-1 py-4 rounded-2xl font-bold text-sm transition-colors active:scale-[.98]"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#a1a1aa' }}>
              戻る
            </button>
          )}
          <button onClick={isLast ? onClose : () => setIdx(i => i + 1)}
            className="flex-1 py-4 rounded-2xl font-black text-sm transition-all active:scale-[.98] flex items-center justify-center gap-1.5"
            style={{ background: LIME, color: '#000' }}>
            {isLast ? 'はじめる' : '次へ'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
