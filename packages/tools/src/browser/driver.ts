// ---------------------------------------------------------------------------
// BrowserDriver — the abstraction contract between tool definitions and
// the underlying browser control mechanism (Playwright, Extension, Cloud…).
//
// Tool definitions (tools.ts) depend ONLY on this interface.
// Each driver (drivers/*.ts) implements it.
// ---------------------------------------------------------------------------

/** Single element captured in an accessibility snapshot */
export interface SnapshotElement {
  /** Unique reference id for interactive elements (e.g. "e0", "e1"). Only set for clickable/typeable elements. */
  ref?: string
  /** ARIA role (button, link, textbox, heading, img, …) */
  role: string
  /** Accessible name */
  name: string
  /** Current value (input fields, selects, …) */
  value?: string
  /** Whether the element is disabled */
  disabled?: boolean
  /** Heading level if role is heading */
  level?: number
  /** Whether a checkbox/toggle is checked */
  checked?: boolean
  /** Extra description */
  description?: string
  /** Nested children */
  children?: SnapshotElement[]
}

/** Full page accessibility snapshot */
export interface PageSnapshot {
  /** Current page URL */
  url: string
  /** Page title */
  title: string
  /** Accessibility element tree */
  elements: SnapshotElement[]
  /** Pre-formatted text representation for LLMs */
  text: string
}

/** Visual screenshot result */
export interface Screenshot {
  /** Base64-encoded PNG data */
  base64: string
  width: number
  height: number
}

/** Information about an open browser tab */
export interface TabInfo {
  id: string
  url: string
  title: string
  active: boolean
}

/** Captured console message */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug'
  text: string
  timestamp: number
}

/** Captured network request */
export interface NetworkRequest {
  url: string
  method: string
  status: number
  statusText: string
  resourceType: string
  timestamp: number
}

// ---------------------------------------------------------------------------
// Driver interface
// ---------------------------------------------------------------------------

export interface BrowserDriver {
  // === Lifecycle ===

  /** Initialize the browser connection (lazy — called on first tool use) */
  connect(): Promise<void>
  /** Shut down and release all resources */
  close(): Promise<void>
  /** Whether the driver is currently connected */
  isConnected(): boolean

  // === Navigation ===

  navigate(url: string): Promise<PageSnapshot>
  goBack(): Promise<PageSnapshot>
  goForward(): Promise<PageSnapshot>

  // === Page State ===

  snapshot(): Promise<PageSnapshot>
  screenshot(fullPage?: boolean): Promise<Screenshot>
  consoleMessages(): Promise<ConsoleMessage[]>
  networkRequests(): Promise<NetworkRequest[]>

  // === Element Interaction ===

  click(ref: string): Promise<PageSnapshot>
  type(ref: string, text: string, submit?: boolean): Promise<PageSnapshot>
  selectOption(ref: string, values: string[]): Promise<PageSnapshot>
  hover(ref: string): Promise<PageSnapshot>
  drag(sourceRef: string, targetRef: string): Promise<PageSnapshot>
  uploadFile(ref: string, filePaths: string[]): Promise<PageSnapshot>

  // === Input ===

  pressKey(key: string): Promise<void>
  scroll(direction: 'up' | 'down', amount?: number): Promise<PageSnapshot>

  // === Dialog ===

  handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void>

  // === Form ===

  fillForm(fields: Array<{ ref: string; value: string }>): Promise<PageSnapshot>

  // === Tabs ===

  getTabs(): Promise<TabInfo[]>
  switchTab(tabId: string): Promise<PageSnapshot>
  closeTab(tabId?: string): Promise<void>

  // === Viewport ===

  resize(width: number, height: number): Promise<PageSnapshot>

  // === Advanced ===

  evaluate(script: string): Promise<unknown>
  wait(seconds?: number): Promise<void>
}
