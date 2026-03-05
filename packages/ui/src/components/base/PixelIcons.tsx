/** Pixel-art SVG: sidebar panel with left divider + stripes */
export function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none" className={className}>
      <rect x="1" y="1" width="16" height="14" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="1" x2="7" y2="15" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="5" x2="6" y2="5" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="9" x2="6" y2="9" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: open in new window (box with arrow pointing out top-right) */
export function OpenExternalIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M5 1H1v12h12V9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 1h5v5" stroke="currentColor" strokeWidth="2" />
      <line x1="13" y1="1" x2="6" y2="8" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: image icon (landscape frame with mountain + sun) */
export function ImageAttachIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" fill="none" className={className}>
      <rect x="1" y="1" width="14" height="12" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="3" width="2" height="2" fill="currentColor" />
      <path d="M1 11 5 6 8 9 10 7 15 11" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

/** Pixel-art SVG: small close/X icon */
export function CloseSmallIcon({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={className}>
      <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: copy icon (overlapping rectangles) */
export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="4" y="4" width="9" height="9" stroke="currentColor" strokeWidth="2" />
      <path d="M10 4V1H1v9h3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: checkmark icon */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M2 7 5 10 12 3" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: microphone icon */
export function MicIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="none" className={className}>
      <rect x="4" y="1" width="6" height="9" rx="0" stroke="currentColor" strokeWidth="2" />
      <path d="M2 8v1c0 2.5 2 4 5 4s5-1.5 5-4V8" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="13" x2="7" y2="15" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="15" x2="10" y2="15" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: stop/square icon */
export function StopSquareIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="2" y="2" width="10" height="10" fill="currentColor" />
    </svg>
  )
}

// ── Navigation icons ──────────────────────────────────────────

/** Pixel-art SVG: 2×2 tile grid (dashboard) */
export function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="1" y="1" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="1" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="1" y="8" width="5" height="5" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="8" width="5" height="5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: speech bubble with step tail + text lines (chats) */
export function ChatIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M1 1 H13 V10 H5 V13 H3 V10 H1 Z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter" />
      <line x1="4" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: square clock face (automations/cron) */
export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="1" y="1" width="12" height="12" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="7" x2="10" y2="7" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: golem head with two horns and glowing eyes (agents) */
export function GolemIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="3" y="1" width="2" height="2" fill="currentColor" />
      <rect x="9" y="1" width="2" height="2" fill="currentColor" />
      <rect x="2" y="3" width="10" height="10" stroke="currentColor" strokeWidth="2" />
      <rect x="4" y="6" width="2" height="2" fill="currentColor" />
      <rect x="8" y="6" width="2" height="2" fill="currentColor" />
    </svg>
  )
}

/** Pixel-art SVG: three-node tree diagram (teams) */
export function TreeIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="6" y="1" width="2" height="2" fill="currentColor" />
      <line x1="7" y1="3" x2="7" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="3" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="3" y1="7" x2="3" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="11" y1="7" x2="11" y2="11" stroke="currentColor" strokeWidth="2" />
      <rect x="2" y="11" width="2" height="2" fill="currentColor" />
      <rect x="10" y="11" width="2" height="2" fill="currentColor" />
    </svg>
  )
}

/** Pixel-art SVG: magic scroll with rollers and diamond sparkle (skills) */
export function ScrollIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <rect x="2" y="1" width="10" height="2" fill="currentColor" />
      <rect x="2" y="11" width="10" height="2" fill="currentColor" />
      <line x1="4" y1="3" x2="4" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="10" y1="3" x2="10" y2="11" stroke="currentColor" strokeWidth="2" />
      <path d="M7 5 L9 7 L7 9 L5 7 Z" fill="currentColor" />
    </svg>
  )
}

/** Pixel-art SVG: plug with prongs and cable (MCP servers) */
export function PlugIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <line x1="5" y1="1" x2="5" y2="4" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="1" x2="9" y2="4" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="4" width="8" height="5" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="9" x2="7" y2="13" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Pixel-art SVG: document with folded corner (artifacts) */
export function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <path d="M2 1 L2 13 L12 13 L12 5 L8 1 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
      <path d="M8 1 L8 5 L12 5" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" />
    </svg>
  )
}

/** Pixel-art SVG: three sliders with knobs at different positions (settings) */
export function GearIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={className}>
      <line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="1" x2="4" y2="5" stroke="currentColor" strokeWidth="2" />
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" />
      <line x1="10" y1="5" x2="10" y2="9" stroke="currentColor" strokeWidth="2" />
      <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="2" />
      <line x1="7" y1="9" x2="7" y2="13" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
