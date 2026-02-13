// ---------------------------------------------------------------------------
// Browser tool definitions — all 22 tools across Core, Extension, and
// Management layers. Each tool depends ONLY on the BrowserDriver interface.
//
// Tools are organized in three tiers:
//   Core (8)       — navigate, snapshot, screenshot, click, type, press_key, scroll, wait
//   Extended (9)   — go_back, go_forward, select_option, hover, drag, fill_form,
//                     evaluate, file_upload, handle_dialog
//   Management (5) — tabs, switch_tab, close_tab, resize, console_messages, network_requests
// ---------------------------------------------------------------------------

import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { BrowserDriver } from './driver'

/**
 * Define all browser tools against a BrowserDriver instance.
 * The driver handles lazy connection — tools call driver.ensureConnected()
 * pattern via the helper below.
 */
export function defineBrowserTools(driver: BrowserDriver): ToolSet {
  /** Ensure the driver is connected before any operation */
  async function ensureConnected() {
    if (!driver.isConnected()) await driver.connect()
  }

  return {
    // =====================================================================
    // CORE LAYER
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
        'Always call this first to understand the page before interacting.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const snap = await driver.snapshot()
        return snap.text
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
        description: z.string().describe('Brief description of what you are clicking and why'),
      }),
      execute: async ({ ref }) => {
        await ensureConnected()
        const snap = await driver.click(ref)
        return snap.text
      },
    }),

    browser_type: tool({
      description:
        'Type text into an input field identified by its ref. Clears existing content first. ' +
        'Set submit=true to press Enter after typing (e.g. for search forms). ' +
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

    browser_press_key: tool({
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
        'Wait for a specified number of seconds. Useful when a page is loading or ' +
        'performing an animation. Default wait time is 2 seconds.',
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

    // =====================================================================
    // EXTENDED LAYER
    // =====================================================================

    browser_go_back: tool({
      description: 'Navigate back in browser history. Returns snapshot of the previous page.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const snap = await driver.goBack()
        return snap.text
      },
    }),

    browser_go_forward: tool({
      description: 'Navigate forward in browser history. Returns snapshot of the next page.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const snap = await driver.goForward()
        return snap.text
      },
    }),

    browser_select_option: tool({
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

    browser_drag: tool({
      description:
        'Drag an element from source to target. Both identified by refs. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        sourceRef: z.string().describe('Ref of the element to drag'),
        targetRef: z.string().describe('Ref of the element to drop onto'),
      }),
      execute: async ({ sourceRef, targetRef }) => {
        await ensureConnected()
        const snap = await driver.drag(sourceRef, targetRef)
        return snap.text
      },
    }),

    browser_fill_form: tool({
      description:
        'Fill multiple form fields at once. Each field is identified by its ref and ' +
        'the value to enter. More efficient than calling browser_type for each field. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        fields: z.array(z.object({
          ref: z.string().describe('Element ref of the form field'),
          value: z.string().describe('Value to set'),
        })).describe('Array of { ref, value } pairs'),
      }),
      execute: async ({ fields }) => {
        await ensureConnected()
        const snap = await driver.fillForm(fields)
        return snap.text
      },
    }),

    browser_evaluate: tool({
      description:
        'Execute JavaScript code in the browser page context. Returns the result as JSON. ' +
        'Use for extracting data, checking state, or performing actions not available via ' +
        'other tools. The script runs in the page context with access to document, window, etc.',
      inputSchema: z.object({
        script: z.string().describe('JavaScript code to execute in the page (expression or IIFE)'),
      }),
      execute: async ({ script }) => {
        await ensureConnected()
        const result = await driver.evaluate(script)
        return JSON.stringify(result, null, 2)
      },
    }),

    browser_file_upload: tool({
      description:
        'Upload files to a file input element identified by its ref. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        ref: z.string().describe('Element ref of the file input'),
        filePaths: z.array(z.string()).describe('Absolute paths to files to upload'),
      }),
      execute: async ({ ref, filePaths }) => {
        await ensureConnected()
        const snap = await driver.uploadFile(ref, filePaths)
        return snap.text
      },
    }),

    browser_handle_dialog: tool({
      description:
        'Handle a browser dialog (alert, confirm, prompt, beforeunload). ' +
        'Accept or dismiss the dialog, optionally providing text for prompt dialogs.',
      inputSchema: z.object({
        action: z.enum(['accept', 'dismiss']).describe('Accept or dismiss the dialog'),
        promptText: z.string().optional().describe('Text to enter in a prompt dialog'),
      }),
      execute: async ({ action, promptText }) => {
        await ensureConnected()
        await driver.handleDialog(action, promptText)
        return 'Dialog ' + action + 'ed'
      },
    }),

    // =====================================================================
    // MANAGEMENT LAYER
    // =====================================================================

    browser_tabs: tool({
      description: 'List all open browser tabs with their URLs and titles.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const tabs = await driver.getTabs()
        return tabs.map((t, i) =>
          `${t.active ? '→ ' : '  '}[${i}] ${t.title}\n    ${t.url}`,
        ).join('\n')
      },
    }),

    browser_switch_tab: tool({
      description:
        'Switch to a different browser tab by its ID (from browser_tabs). ' +
        'Returns an accessibility snapshot of the tab.',
      inputSchema: z.object({
        tabId: z.string().describe('Tab ID to switch to'),
      }),
      execute: async ({ tabId }) => {
        await ensureConnected()
        const snap = await driver.switchTab(tabId)
        return snap.text
      },
    }),

    browser_close_tab: tool({
      description: 'Close a browser tab. If no tabId given, closes the current tab.',
      inputSchema: z.object({
        tabId: z.string().optional().describe('Tab ID to close (default: current tab)'),
      }),
      execute: async ({ tabId }) => {
        await ensureConnected()
        await driver.closeTab(tabId)
        return 'Tab closed'
      },
    }),

    browser_resize: tool({
      description:
        'Resize the browser viewport to the specified dimensions. ' +
        'Returns an updated accessibility snapshot.',
      inputSchema: z.object({
        width: z.number().describe('Viewport width in pixels'),
        height: z.number().describe('Viewport height in pixels'),
      }),
      execute: async ({ width, height }) => {
        await ensureConnected()
        const snap = await driver.resize(width, height)
        return snap.text
      },
    }),

    browser_console_messages: tool({
      description:
        'Get recent browser console messages (log, warn, error). ' +
        'Useful for debugging JavaScript errors on the page.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const messages = await driver.consoleMessages()
        if (messages.length === 0) return 'No console messages.'
        return messages.map(m =>
          `[${m.type.toUpperCase()}] ${m.text}`,
        ).join('\n')
      },
    }),

    browser_network_requests: tool({
      description:
        'Get recent network requests made by the page. Shows URL, method, status. ' +
        'Useful for debugging API calls or understanding page behavior.',
      inputSchema: z.object({}),
      execute: async () => {
        await ensureConnected()
        const requests = await driver.networkRequests()
        if (requests.length === 0) return 'No network requests captured.'
        return requests.map(r =>
          `${r.method} ${r.status} ${r.url} [${r.resourceType}]`,
        ).join('\n')
      },
    }),
  }
}
