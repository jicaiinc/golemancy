import type { Page, ConsoleMessage } from '@playwright/test'

export interface LogEntry {
  timestamp: number
  source: 'browser' | 'electron' | 'test'
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
}

export class ConsoleLogger {
  private entries: LogEntry[] = []

  /** Attach to a Playwright page's console events */
  attach(page: Page): void {
    page.on('console', (msg: ConsoleMessage) => {
      this.entries.push({
        timestamp: Date.now(),
        source: 'browser',
        level: this.mapLevel(msg.type()),
        text: msg.text(),
      })
    })

    page.on('pageerror', (error: Error) => {
      this.entries.push({
        timestamp: Date.now(),
        source: 'browser',
        level: 'error',
        text: `[PageError] ${error.message}\n${error.stack ?? ''}`,
      })
    })
  }

  /** Add a custom log entry from test code */
  log(level: LogEntry['level'], text: string, source: LogEntry['source'] = 'test'): void {
    this.entries.push({ timestamp: Date.now(), source, level, text })
  }

  /** Get all collected log entries */
  getAll(): LogEntry[] {
    return [...this.entries]
  }

  /** Get only error-level entries */
  getErrors(): LogEntry[] {
    return this.entries.filter(e => e.level === 'error')
  }

  /** Filter entries by predicate */
  filter(predicate: (entry: LogEntry) => boolean): LogEntry[] {
    return this.entries.filter(predicate)
  }

  /** Clear all collected entries */
  clear(): void {
    this.entries = []
  }

  /** Dump all entries to console (useful for debugging) */
  dump(): void {
    for (const entry of this.entries) {
      const ts = new Date(entry.timestamp).toISOString()
      console.log(`[${ts}] [${entry.source}] [${entry.level}] ${entry.text}`)
    }
  }

  private mapLevel(type: string): LogEntry['level'] {
    switch (type) {
      case 'error': return 'error'
      case 'warning': return 'warn'
      case 'info': return 'info'
      case 'debug': return 'debug'
      default: return 'log'
    }
  }
}
