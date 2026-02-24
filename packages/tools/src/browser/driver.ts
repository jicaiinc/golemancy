// ---------------------------------------------------------------------------
// BrowserDriver — the abstraction contract between tool definitions and
// the underlying browser control mechanism (Playwright, Extension, Cloud…).
//
// Tool definitions (tools.ts) depend ONLY on this interface.
// Each driver (drivers/*.ts) implements it.
//
// NOTE: After the agent-browser refactor, method signatures changed from
// returning PageSnapshot to SnapshotResult. ExtensionDriver will need to be
// updated to match — until then it will have compile errors.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Legacy types — kept for ExtensionDriver compatibility
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

/** Full page accessibility snapshot (legacy — used by ExtensionDriver) */
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
// New types — used by the refactored PlaywrightDriver (agent-browser)
// ---------------------------------------------------------------------------

/** Options for snapshot capture */
export interface SnapshotOptions {
  /** Snapshot mode: 'full' (complete tree), 'interactive' (only interactive elements), 'compact' (remove empty containers) */
  mode?: 'full' | 'interactive' | 'compact'
  /** CSS selector to scope the snapshot to a specific area */
  selector?: string
  /** Maximum depth of the tree to capture */
  maxDepth?: number
  /** Include cursor-interactive elements (cursor:pointer, onclick) */
  cursor?: boolean
}

/** Result from a snapshot capture */
export interface SnapshotResult {
  /** Formatted text representation of the accessibility tree */
  text: string
  /** Reference map: ref → { selector, role, name?, nth? } */
  refs?: Record<string, { selector: string; role: string; name?: string; nth?: number }>
  /** Snapshot statistics */
  stats?: { lines: number; chars: number; tokens: number; refs: number; interactive: number }
}

/** Result from a diff snapshot */
export interface DiffResult {
  /** Unified diff text ("+ " added, "- " removed, "  " unchanged) */
  diff: string
  /** Whether anything changed */
  changed: boolean
  /** Number of added lines */
  additions: number
  /** Number of removed lines */
  removals: number
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

  navigate(url: string): Promise<SnapshotResult>
  goBack(): Promise<SnapshotResult>
  goForward(): Promise<SnapshotResult>

  // === Page State ===

  snapshot(options?: SnapshotOptions): Promise<SnapshotResult>
  /** Compare current page state against the last snapshot */
  diffSnapshot(options?: SnapshotOptions): Promise<DiffResult>
  screenshot(fullPage?: boolean): Promise<Screenshot>
  consoleMessages(): Promise<ConsoleMessage[]>
  networkRequests(): Promise<NetworkRequest[]>

  // === Element Interaction ===

  click(ref: string): Promise<SnapshotResult>
  type(ref: string, text: string, submit?: boolean): Promise<SnapshotResult>
  /** Fill a field by ref (clears existing value, then types) */
  fill(ref: string, value: string): Promise<SnapshotResult>
  selectOption(ref: string, values: string[]): Promise<SnapshotResult>
  /** Toggle a checkbox or radio button */
  check(ref: string, checked?: boolean): Promise<SnapshotResult>
  hover(ref: string): Promise<SnapshotResult>
  drag(sourceRef: string, targetRef: string): Promise<SnapshotResult>
  uploadFile(ref: string, filePaths: string[]): Promise<SnapshotResult>

  // === Input ===

  pressKey(key: string): Promise<void>
  scroll(direction: 'up' | 'down', amount?: number): Promise<SnapshotResult>

  // === Dialog ===

  handleDialog(action: 'accept' | 'dismiss', promptText?: string): Promise<void>

  // === Form ===

  fillForm(fields: Array<{ ref: string; value: string }>): Promise<SnapshotResult>

  // === Tabs ===

  getTabs(): Promise<TabInfo[]>
  switchTab(tabId: string): Promise<SnapshotResult>
  closeTab(tabId?: string): Promise<void>

  // === Viewport ===

  resize(width: number, height: number): Promise<SnapshotResult>

  // === Advanced ===

  /** Execute an arbitrary agent-browser command by name */
  command(name: string, params?: Record<string, unknown>): Promise<unknown>
  evaluate(script: string): Promise<unknown>
  wait(seconds?: number): Promise<void>
}
