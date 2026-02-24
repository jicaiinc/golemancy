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
