// ---------------------------------------------------------------------------
// Accessibility snapshot generation — shared between all drivers.
//
// Two key exports:
// 1. SNAPSHOT_SCRIPT — JavaScript to evaluate in the browser page context.
//    It walks the DOM, assigns `data-solocraft-ref` attributes to interactive
//    elements, and returns a structured tree.
// 2. formatSnapshotText() — Converts the tree into a compact text format
//    that LLMs can reason about efficiently.
// ---------------------------------------------------------------------------

import type { SnapshotElement, PageSnapshot } from './driver'

// Re-export for use by drivers
export type { SnapshotElement } from './driver'

// ---------------------------------------------------------------------------
// In-page script — runs inside the browser via page.evaluate() or
// content script injection. Must be self-contained (no external imports).
// ---------------------------------------------------------------------------

/**
 * JavaScript source to evaluate in the browser page context.
 * Returns a JSON-serializable tree of SnapshotElement[].
 *
 * The script:
 * 1. Removes old `data-solocraft-ref` attributes
 * 2. Walks the DOM tree
 * 3. Assigns refs (e0, e1, …) to interactive or landmark elements
 * 4. Returns the tree structure
 */
export const SNAPSHOT_SCRIPT = /* js */ `
(() => {
  // Clean up previous refs
  document.querySelectorAll('[data-solocraft-ref]').forEach(el => {
    el.removeAttribute('data-solocraft-ref');
  });

  let refCounter = 0;

  // Implicit ARIA role mapping for common HTML elements
  const ROLE_MAP = {
    A: 'link',
    BUTTON: 'button',
    INPUT: inputRole,
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
    IMG: 'img',
    H1: 'heading', H2: 'heading', H3: 'heading',
    H4: 'heading', H5: 'heading', H6: 'heading',
    NAV: 'navigation',
    MAIN: 'main',
    HEADER: 'banner',
    FOOTER: 'contentinfo',
    ASIDE: 'complementary',
    FORM: 'form',
    TABLE: 'table',
    DIALOG: 'dialog',
    DETAILS: 'group',
    SUMMARY: 'button',
    UL: 'list',
    OL: 'list',
    LI: 'listitem',
  };

  function inputRole(el) {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'range') return 'slider';
    if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
    if (t === 'search') return 'searchbox';
    return 'textbox';
  }

  function getRole(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const mapped = ROLE_MAP[el.tagName];
    if (typeof mapped === 'function') return mapped(el);
    return mapped || '';
  }

  function getAccessibleName(el) {
    // aria-label takes precedence
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\\s+/).map(id => {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ');
    }

    // <label for="...">
    if (el.id) {
      const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (label) return label.textContent.trim();
    }

    // alt for images
    if (el.tagName === 'IMG') return (el.getAttribute('alt') || '').trim();

    // placeholder for inputs
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return (el.getAttribute('placeholder') || el.getAttribute('title') || '').trim();
    }

    // title attribute
    const title = el.getAttribute('title');
    if (title) return title.trim();

    // Direct text content (for buttons, links, headings)
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' ||
        tag.match(/^H[1-6]$/) || el.getAttribute('role') === 'button') {
      const text = el.textContent || '';
      return text.trim().replace(/\\s+/g, ' ').slice(0, 200);
    }

    return '';
  }

  function isInteractive(el) {
    const tag = el.tagName;
    if (tag === 'A' && el.hasAttribute('href')) return true;
    if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA') return true;
    if (tag === 'SUMMARY') return true;
    if (tag === 'INPUT' && el.type !== 'hidden') return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' ||
        el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'menuitem' ||
        el.getAttribute('role') === 'option' || el.getAttribute('role') === 'switch') return true;
    if (el.contentEditable === 'true') return true;
    return false;
  }

  function isVisible(el) {
    try {
      if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (style.position !== 'fixed' && style.position !== 'sticky') return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function isLandmark(role) {
    return ['navigation', 'main', 'banner', 'contentinfo', 'complementary',
            'form', 'search', 'region', 'dialog'].includes(role);
  }

  function walkElement(el, depth) {
    try {
    if (!el || el.nodeType !== 1) return null;
    if (!isVisible(el)) return null;

    // Skip script/style/noscript
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG') return null;

    const role = getRole(el);
    const name = getAccessibleName(el);
    const interactive = isInteractive(el);
    const landmark = isLandmark(role);

    // Walk children
    const childResults = [];
    for (const child of el.children) {
      const result = walkElement(child, depth + 1);
      if (result) childResults.push(result);
    }

    // Skip non-interesting containers that have no role, no name, and only pass-through children
    if (!role && !name && !interactive && childResults.length <= 1 && depth > 0) {
      return childResults[0] || null;
    }

    // Build the node
    const node = {};
    if (role) node.role = role;
    if (name) node.name = name;

    // Assign ref to interactive elements
    if (interactive) {
      const ref = 'e' + (refCounter++);
      el.setAttribute('data-solocraft-ref', ref);
      node.ref = ref;
    }

    // Extra properties
    if (el.tagName.match(/^H[1-6]$/)) node.level = parseInt(el.tagName[1]);
    if (el.disabled) node.disabled = true;
    if (el.checked) node.checked = true;
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && el.value) {
      node.value = el.value.slice(0, 500);
    }

    if (childResults.length > 0) node.children = childResults;

    // If this is a non-interactive container with no role and only text, include text
    if (!interactive && !role && !childResults.length) {
      const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
      if (text && text.length > 0 && text.length < 500) {
        node.role = 'text';
        node.name = text;
      } else {
        return null;
      }
    }

    return node;
    } catch { return null; }
  }

  const tree = walkElement(document.body, 0);
  return tree ? (tree.children || [tree]) : [];
})()
`

// ---------------------------------------------------------------------------
// Text formatting — converts tree to compact LLM-friendly text
// ---------------------------------------------------------------------------

/**
 * Format a snapshot element tree into indented text.
 *
 * Example output:
 * ```
 * navigation "Main":
 *   link "Home" [ref=e0]
 *   link "About" [ref=e1]
 * main:
 *   heading "Welcome" [level=1]
 *   textbox "Email" [ref=e2] value="user@example.com"
 *   button "Submit" [ref=e3]
 * ```
 */
export function formatSnapshotText(elements: SnapshotElement[], indent: number = 0): string {
  const lines: string[] = []
  const pad = '  '.repeat(indent)

  for (const el of elements) {
    let line = pad

    // Role + name
    if (el.role) {
      line += el.role
      if (el.name) line += ` "${el.name}"`
    } else if (el.name) {
      line += `"${el.name}"`
    }

    // Annotations
    const annotations: string[] = []
    if (el.ref) annotations.push(`ref=${el.ref}`)
    if (el.level != null) annotations.push(`level=${el.level}`)
    if (el.disabled) annotations.push('disabled')
    if (el.checked) annotations.push('checked')
    if (annotations.length) line += ` [${annotations.join(', ')}]`

    // Value (for form fields)
    if (el.value) {
      const displayValue = el.value.length > 100 ? el.value.slice(0, 100) + '…' : el.value
      line += ` value="${displayValue}"`
    }

    // Children
    if (el.children?.length) {
      line += ':'
      lines.push(line)
      lines.push(formatSnapshotText(el.children, indent + 1))
    } else {
      lines.push(line)
    }
  }

  return lines.join('\n')
}

/**
 * Build a complete PageSnapshot from raw tree data + page metadata.
 */
export function buildPageSnapshot(
  url: string,
  title: string,
  elements: SnapshotElement[],
): PageSnapshot {
  const header = `Page: ${title}\nURL: ${url}\n\n`
  const text = header + formatSnapshotText(elements)
  return { url, title, elements, text }
}
