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
