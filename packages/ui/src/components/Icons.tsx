import type { CSSProperties, ReactNode, SVGProps } from 'react';

type IconProps = {
  size?: number;
  stroke?: number;
  fill?: boolean;
} & Omit<SVGProps<SVGSVGElement>, 'fill' | 'stroke'>;

type Geometry = string | ReactNode;

const baseStyle: CSSProperties = { display: 'block', flexShrink: 0 };

function makeIcon(geometry: Geometry) {
  function Renderer({ size = 16, stroke = 1.5, fill = false, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={baseStyle}
        aria-hidden
        {...rest}
      >
        {typeof geometry === 'string' ? <path d={geometry} /> : geometry}
      </svg>
    );
  }
  return Renderer;
}

export const Icons = {
  NewChat: makeIcon(
    <>
      <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </>,
  ),
  Search: makeIcon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
  ),
  Skills: makeIcon(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>,
  ),
  Automation: makeIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>,
  ),
  Pin: makeIcon('M12 17v5M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5l-3 3v2H8v-2l-3-3z'),
  Folder: makeIcon('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'),
  Project: makeIcon(
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M9 13h6" />
    </>,
  ),
  ChatDot: makeIcon(
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </>,
  ),
  Settings: makeIcon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.16.66.42.87.74.21.32.32.69.32 1.07a2 2 0 0 1 .31 1.19 2 2 0 0 1-.31 1.19c0 .38-.11.75-.32 1.07-.21.32-.51.58-.87.74z" />
    </>,
  ),
  Plus: makeIcon('M12 5v14M5 12h14'),
  Mic: makeIcon(
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </>,
  ),
  ArrowUp: makeIcon('M12 19V5M5 12l7-7 7 7'),
  ChevDown: makeIcon('m6 9 6 6 6-6'),
  ChevRight: makeIcon('m9 6 6 6-6 6'),
  Filter: makeIcon('M3 5h18M6 12h12M10 19h4'),
  More: makeIcon(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
  Edit: makeIcon('M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'),
  Back: makeIcon('M19 12H5M12 19l-7-7 7-7'),
  Forward: makeIcon('M5 12h14M12 5l7 7-7 7'),
  Sun: makeIcon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>,
  ),
  Moon: makeIcon('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
  User: makeIcon(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>,
  ),
  Logout: makeIcon('M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M15 12H4'),
  Gauge: makeIcon(
    <>
      <path d="M12 14V8" />
      <circle cx="12" cy="12" r="9" />
    </>,
  ),
  Tool: makeIcon(
    'M14.7 6.3a4 4 0 0 0 5 5L17 14l3 3a2 2 0 1 1-3 3l-3-3-2.7 2.7a4 4 0 0 1-5-5L7 12 4 9a2 2 0 1 1 3-3l3 3 2.7-2.7z',
  ),
  Globe: makeIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>,
  ),
  Shield: makeIcon('M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z'),
  Layers: makeIcon('m12 2 10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5'),
  Hook: makeIcon('M9 17V8a4 4 0 1 1 8 0v9a4 4 0 0 1-8 0z'),
  Doc: makeIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 13h8M8 17h5'),
  Database: makeIcon(
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
    </>,
  ),
  Sparkle: makeIcon(
    'M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6 9 9M15 15l3.4 3.4M5.6 18.4 9 15M15 9l3.4-3.4',
  ),
  At: makeIcon(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
    </>,
  ),
  Check: makeIcon('m5 12 5 5L20 7'),
  X: makeIcon('M18 6 6 18M6 6l12 12'),
} as const;

export type IconName = keyof typeof Icons;
