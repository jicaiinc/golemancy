import type { ReactNode } from 'react';

export type PracticeArtKind = 'deck' | 'site' | 'doc' | 'flow' | 'video' | 'data';

export type PracticeEntry = {
  art: PracticeArtKind;
  tag: string;
  title: string;
  sub: string;
};

const ART: Record<PracticeArtKind, ReactNode> = {
  deck: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect x="8" y="10" width="60" height="44" rx="3" fill="var(--art-fill)" />
      <rect x="14" y="16" width="34" height="3" rx="1.5" fill="var(--art-line)" />
      <rect x="14" y="24" width="48" height="2" rx="1" fill="var(--art-line-soft)" />
      <rect x="14" y="29" width="44" height="2" rx="1" fill="var(--art-line-soft)" />
      <rect x="14" y="42" width="20" height="8" rx="1.5" fill="var(--brand)" />
      <rect
        x="76"
        y="22"
        width="36"
        height="36"
        rx="3"
        fill="none"
        stroke="var(--art-line)"
        strokeWidth="1"
      />
      <path d="M82 50 L90 40 L96 46 L106 32" stroke="var(--brand)" strokeWidth="1.5" fill="none" />
    </svg>
  ),
  site: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect x="8" y="8" width="104" height="56" rx="3" fill="none" stroke="var(--art-line)" />
      <rect x="8" y="8" width="104" height="10" rx="3" fill="var(--art-fill)" />
      <circle cx="14" cy="13" r="1.3" fill="var(--art-line)" />
      <circle cx="18" cy="13" r="1.3" fill="var(--art-line)" />
      <circle cx="22" cy="13" r="1.3" fill="var(--art-line)" />
      <rect x="16" y="26" width="50" height="4" rx="1" fill="var(--art-line)" />
      <rect x="16" y="34" width="70" height="2" rx="1" fill="var(--art-line-soft)" />
      <rect x="16" y="40" width="62" height="2" rx="1" fill="var(--art-line-soft)" />
      <rect x="16" y="48" width="22" height="8" rx="2" fill="var(--brand)" />
      <rect x="90" y="26" width="16" height="30" rx="2" fill="var(--art-fill)" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect x="22" y="6" width="76" height="60" rx="3" fill="var(--art-fill)" />
      <rect x="30" y="16" width="30" height="4" rx="1" fill="var(--art-line)" />
      {[26, 33, 40, 47, 54].map((y) => (
        <rect key={y} x="30" y={y} width="60" height="2" rx="1" fill="var(--art-line-soft)" />
      ))}
      <rect x="30" y="58" width="20" height="3" rx="1" fill="var(--brand)" />
    </svg>
  ),
  flow: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      {(
        [
          [14, 20],
          [54, 20],
          [94, 20],
          [14, 52],
          [54, 52],
          [94, 52],
        ] as const
      ).map(([x, y], i) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="20"
          height="14"
          rx="2"
          fill={i === 1 || i === 4 ? 'var(--brand)' : 'var(--art-fill)'}
        />
      ))}
      <path
        d="M34 27 H 54 M74 27 H 94 M24 34 V 52 M64 34 V 52 M104 34 V 52 M34 59 H 54 M74 59 H 94"
        stroke="var(--art-line)"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      <rect x="8" y="8" width="104" height="42" rx="3" fill="var(--art-fill)" />
      <polygon points="54,22 54,38 68,30" fill="var(--brand)" />
      <rect x="8" y="54" width="104" height="2" rx="1" fill="var(--art-line-soft)" />
      <rect x="8" y="60" width="40" height="6" rx="1" fill="var(--art-fill)" />
      <rect x="52" y="60" width="28" height="6" rx="1" fill="var(--art-fill)" />
      <rect x="84" y="60" width="28" height="6" rx="1" fill="var(--art-fill)" />
    </svg>
  ),
  data: (
    <svg viewBox="0 0 120 72" style={{ width: '100%', height: '100%', display: 'block' }}>
      <ellipse cx="60" cy="18" rx="34" ry="8" fill="var(--art-fill)" stroke="var(--art-line)" />
      <path d="M26 18 V40 a34 8 0 0 0 68 0 V18" fill="var(--art-fill)" stroke="var(--art-line)" />
      <path d="M26 32 a34 8 0 0 0 68 0" fill="none" stroke="var(--art-line)" />
      <rect x="48" y="50" width="24" height="14" rx="2" fill="var(--brand)" />
      <path d="M40 57 H 48 M72 57 H 80" stroke="var(--art-line)" />
    </svg>
  ),
};

export function PracticeCard({ entry }: { entry: PracticeEntry }) {
  return (
    <button type="button" className="practice">
      <div className="practice__art">{ART[entry.art]}</div>
      <div className="practice__body">
        <span className="practice__tag">{entry.tag}</span>
        <h4 className="practice__title">{entry.title}</h4>
        <p className="practice__sub">{entry.sub}</p>
      </div>
    </button>
  );
}
