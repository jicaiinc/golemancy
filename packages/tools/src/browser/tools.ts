// ---------------------------------------------------------------------------
// Browser tool definitions — 16 tools organized in two tiers:
//   Dedicated (15) — navigate, snapshot, diff_snapshot, screenshot, click,
//                     type, fill, select, check, hover, press, scroll, wait,
//                     tab_list, tab_switch
//   Universal (1)  — command (80+ operations via name+params)
//
// Each tool depends ONLY on the BrowserDriver interface.
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { BrowserDriver } from './driver'

/**
 * Define all browser tools against a BrowserDriver instance.
 * The driver handles lazy connection — tools call ensureConnected() before
 * every operation.
 */
export function defineBrowserTools(driver: BrowserDriver): ToolSet {
  /** Ensure the driver is connected before any operation */
  async function ensureConnected() {
    if (!driver.isConnected()) await driver.connect()
  }

  return {
    // =====================================================================
    // DEDICATED TOOLS
    // =====================================================================

    browser_navigate: tool({
      description:
        'Navigate the browser to a URL. Returns an accessibility snapshot of the loaded page.',
      inputSchema: z.object({
        url: z.string().describe('The URL to navigate to (must include protocol, e.g. https://)'),
      }),
      execute: async ({ url }) => {
        await ensureConnected()
        const snap = await driver.navigate(url)
        return snap.text
      },
    }),

    browser_snapshot: tool({
      description:
        'Capture an accessibility snapshot of the current page. This is the PRIMARY way to ' +
        'understand page content. Returns a text tree where interactive elements have ref IDs ' +
        '(e.g. [ref=e3]) that you can use with browser_click, browser_type, etc. ' +
        'Always call this first to understand the page before interacting. ' +
        'Use mode="interactive" to see only actionable elements, or mode="compact" to reduce noise.',
      inputSchema: z.object({
        mode: z.enum(['full', 'interactive', 'compact']).optional()
          .describe('Snapshot mode: "full" (complete tree), "interactive" (only actionable elements), "compact" (remove empty containers). Default: "full"'),
        selector: z.string().optional()
          .describe('CSS selector to scope the snapshot to a specific area (e.g. "#main", ".sidebar")'),
        maxDepth: z.number().optional()
          .describe('Maximum depth of the tree to capture'),
        cursor: z.boolean().optional()
          .describe('Include cursor-interactive elements (cursor:pointer, onclick) as refs'),
      }),
      execute: async ({ mode, selector, maxDepth, cursor }) => {
        await ensureConnected()
        const snap = await driver.snapshot({ mode, selector, maxDepth, cursor })
        const stats = snap.stats
        const statsLine = stats
          ? `\n\nStats: ${stats.refs} refs, ${stats.chars} chars, ~${stats.tokens} tokens`
          : ''
        return snap.text + statsLine
      },
    }),

    browser_diff_snapshot: tool({
      description:
        'Compare the current page state against the last captured snapshot and return the differences. ' +
        'Useful after performing an action to see exactly what changed on the page without reading the ' +
        'entire snapshot again. Returns a unified diff showing added (+) and removed (-) lines.',
      inputSchema: z.object({
        mode: z.enum(['full', 'interactive', 'compact']).optional()
          .describe('Snapshot mode for comparison. Default: "full"'),
        selector: z.string().optional()
          .describe('CSS selector to scope the diff to a specific area'),
        maxDepth: z.number().optional()
          .describe('Maximum depth of the tree to capture'),
        cursor: z.boolean().optional()
          .describe('Include cursor-interactive elements as refs'),
      }),
      execute: async ({ mode, selector, maxDepth, cursor }) => {
        await ensureConnected()
        const result = await driver.diffSnapshot({ mode, selector, maxDepth, cursor })
        if (!result.changed) return 'No changes detected.'
        return result.diff
      },
    }),

    browser_screenshot: tool({
      description:
        'Take a visual screenshot of the current page. Returns a base64-encoded PNG image. ' +
        'Use this as a supplement to browser_snapshot when you need to see visual layout, ' +
        'images, charts, or CSS styling. Prefer browser_snapshot for understanding page structure.',
      inputSchema: z.object({
        fullPage: z.boolean().optional().describe('Capture the entire scrollable page (default: false, viewport only)'),
      }),
      execute: async ({ fullPage }) => {
        await ensureConnected()
        const shot = await driver.screenshot(fullPage)
        return {
          type: 'image' as const,
          data: shot.base64,
          mimeType: 'image/png' as const,
          width: shot.width,
          height: shot.height,
        }
      },
    }),

    browser_click: tool({
      description:
        'Click on an element identified by its ref from the accessibility snapshot. ' +
        'You must call browser_snapshot first to get available refs. ' +
        'Returns an updated accessibility snapshot after clicking.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref from snapshot (e.g. "e3")'),
        description: z.string().optional().describe('Brief description of what you are clicking and why (for reasoning trace)'),
      }),
      execute: async ({ ref }) => {
        await ensureConnected()
        const snap = await driver.click(ref)
        return snap.text
      },
    }),

    browser_type: tool({
      description:
        'Type text into an input field identified by its ref, simulating real keystrokes. ' +
        'Clears existing content first. Set submit=true to press Enter after typing (e.g. for search forms). ' +
        'For filling fields without keystroke simulation, use browser_fill instead. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref of the input field (e.g. "e5")'),
        text: z.string().describe('Text to type into the field'),
        submit: z.boolean().optional().describe('Press Enter after typing (default: false)'),
      }),
      execute: async ({ ref, text, submit }) => {
        await ensureConnected()
        const snap = await driver.type(ref, text, submit)
        return snap.text
      },
    }),

    browser_fill: tool({
      description:
        'Set an input field value directly without keystroke simulation. Faster than browser_type ' +
        'and avoids triggering per-key event handlers. Use for bulk data entry or when keystroke ' +
        'simulation is not needed. Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref of the input field'),
        value: z.string().describe('Value to set on the field'),
      }),
      execute: async ({ ref, value }) => {
        await ensureConnected()
        const snap = await driver.fill(ref, value)
        return snap.text
      },
    }),

    browser_select: tool({
      description:
        'Select one or more options from a <select> dropdown identified by its ref. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref of the select dropdown'),
        values: z.array(z.string()).describe('Values to select (use the option value attribute)'),
      }),
      execute: async ({ ref, values }) => {
        await ensureConnected()
        const snap = await driver.selectOption(ref, values)
        return snap.text
      },
    }),

    browser_check: tool({
      description:
        'Toggle a checkbox or radio button identified by its ref. ' +
        'If checked is not specified, it will check the element (set to true). ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref of the checkbox or radio button'),
        checked: z.boolean().optional().describe('Desired state: true to check, false to uncheck (default: true)'),
      }),
      execute: async ({ ref, checked }) => {
        await ensureConnected()
        const snap = await driver.check(ref, checked)
        return snap.text
      },
    }),

    browser_hover: tool({
      description:
        'Hover over an element identified by its ref. Useful for triggering tooltips, ' +
        'dropdown menus, or hover states. Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref to hover over'),
      }),
      execute: async ({ ref }) => {
        await ensureConnected()
        const snap = await driver.hover(ref)
        return snap.text
      },
    }),

    browser_press: tool({
      description:
        'Press a keyboard key or key combination. Use standard key names: ' +
        'Enter, Tab, Escape, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Backspace, Delete, ' +
        'Home, End, PageUp, PageDown. For combinations use "+": Control+a, Control+c, Shift+Tab.',
      inputSchema: z.object({
        key: z.string().describe('Key or key combination (e.g. "Enter", "Control+a")'),
      }),
      execute: async ({ key }) => {
        await ensureConnected()
        await driver.pressKey(key)
        return 'Key pressed: ' + key
      },
    }),

    browser_scroll: tool({
      description:
        'Scroll the page up or down. Returns an updated accessibility snapshot ' +
        'showing the newly visible content.',
      inputSchema: z.object({
        direction: z.enum(['up', 'down']).describe('Scroll direction'),
        amount: z.number().optional().describe('Number of "pages" to scroll (default: 1)'),
      }),
      execute: async ({ direction, amount }) => {
        await ensureConnected()
        const snap = await driver.scroll(direction, amount)
        return snap.text
      },
    }),

    browser_wait: tool({
      description:
        'Wait for a specified number of seconds. Useful when a page is loading, ' +
        'performing an animation, or waiting for async content to appear. ' +
        'Default wait time is 2 seconds.',
      inputSchema: z.object({
        seconds: z.number().optional().describe('Seconds to wait (default: 2, max: 30)'),
      }),
      execute: async ({ seconds }) => {
        await ensureConnected()
        const actual = Math.min(seconds ?? 2, 30)
        await driver.wait(actual)
        return 'Waited ' + actual + ' seconds'
      },
    }),

    browser_tab_list: tool({
      description:
        'List all open browser tabs with their index, URL, and title. ' +
        'The active tab is marked with an arrow (→). Use the index with browser_tab_switch.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const tabs = await driver.getTabs()
        return tabs.map((t, i) =>
          `${t.active ? '→ ' : '  '}[${i}] ${t.title}\n    ${t.url}`,
        ).join('\n')
      },
    }),

    browser_tab_switch: tool({
      description:
        'Switch to a different browser tab by its index (from browser_tab_list). ' +
        'Returns an accessibility snapshot of the tab.',
      inputSchema: z.object({
        index: z.string().describe('Tab index to switch to (e.g. "0", "1", "2")'),
      }),
      execute: async ({ index }) => {
        await ensureConnected()
        const snap = await driver.switchTab(index)
        return snap.text
      },
    }),

    // =====================================================================
    // UNIVERSAL TOOL
    // =====================================================================

    browser_command: tool({
      description:
        'Execute any browser command not covered by dedicated tools. This is the universal ' +
        'escape hatch that exposes the full browser automation API. Supports 80+ commands including:\n' +
        '\n' +
        '**Navigation**: back, forward, reload\n' +
        '**Cookies**: cookies_get, cookies_set, cookies_clear, cookies_delete\n' +
        '**Storage**: storage_get, storage_set, storage_clear (localStorage/sessionStorage)\n' +
        '**Network**: route, unroute, requests, offline, request_continue, request_abort\n' +
        '**Frames**: frame, mainframe, frames_list\n' +
        '**Files**: upload, download, download_wait\n' +
        '**Page modification**: evaluate, setcontent, addscript, addstyle, expose_function\n' +
        '**Device emulation**: device, viewport, geolocation, permissions, emulatemedia, timezone, locale\n' +
        '**State management**: state_save, state_load, state_clear\n' +
        '**Recording**: recording_start, recording_stop\n' +
        '**Dialogs**: dialog_accept, dialog_dismiss\n' +
        '**Drag & drop**: drag\n' +
        '**Tab management**: close_tab, new_tab\n' +
        '**Console**: console_messages\n' +
        '**Viewport**: resize\n' +
        '\n' +
        'Pass the command name and an optional params object with command-specific arguments.',
      inputSchema: z.object({
        command: z.string().describe('Command name (e.g. "back", "evaluate", "cookies_get")'),
        params: z.record(z.unknown()).optional().describe('Command-specific parameters as key-value pairs'),
      }),
      execute: async ({ command, params }) => {
        await ensureConnected()
        const result = await driver.command(command, params)
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      },
    }),
  }
}
