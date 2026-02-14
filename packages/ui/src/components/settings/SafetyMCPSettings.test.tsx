import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { GlobalMCPSafetyConfig } from '@golemancy/shared'
import { SafetyMCPSettings } from './SafetyMCPSettings'

// ── Test Helpers ─────────────────────────────────────────────

const DEFAULT_CONFIG: GlobalMCPSafetyConfig = {
  runInSandbox: false,
}

function renderSettings(
  config: GlobalMCPSafetyConfig = DEFAULT_CONFIG,
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  return { ...render(<SafetyMCPSettings config={config} onSave={onSave} />), onSave }
}

// ── Tests ────────────────────────────────────────────────────

describe('SafetyMCPSettings', () => {
  // ── Rendering ────────────────────────────────────────────

  describe('rendering', () => {
    it('renders MCP SERVER EXECUTION heading', () => {
      renderSettings()
      expect(screen.getByText('MCP SERVER EXECUTION')).toBeInTheDocument()
    })

    it('renders both MCP mode options', () => {
      renderSettings()
      expect(screen.getByText('Run inside sandbox')).toBeInTheDocument()
      expect(screen.getByText('Run outside sandbox')).toBeInTheDocument()
    })

    it('renders Recommended badge on "outside" option', () => {
      renderSettings()
      expect(screen.getByText('Recommended')).toBeInTheDocument()
    })

    it('renders descriptions for both options', () => {
      renderSettings()
      expect(screen.getByText(/MCP servers inherit sandbox restrictions/)).toBeInTheDocument()
      expect(screen.getByText(/MCP servers run in the main process/)).toBeInTheDocument()
    })

    it('renders info box', () => {
      renderSettings()
      expect(screen.getByText(/WHY RUN OUTSIDE SANDBOX/)).toBeInTheDocument()
      expect(screen.getByText(/user-installed trusted code/)).toBeInTheDocument()
    })

    it('renders Save Changes button', () => {
      renderSettings()
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })

  // ── Default selection ──────────────────────────────────

  describe('default selection', () => {
    it('selects "outside" by default (runInSandbox=false)', () => {
      renderSettings({ runInSandbox: false })
      const outsideRadio = screen.getByRole('radio', { name: /Run outside sandbox/ })
      expect(outsideRadio).toHaveAttribute('aria-checked', 'true')
    })

    it('selects "inside" when config has runInSandbox=true', () => {
      renderSettings({ runInSandbox: true })
      const insideRadio = screen.getByRole('radio', { name: /Run inside sandbox/ })
      expect(insideRadio).toHaveAttribute('aria-checked', 'true')
    })
  })

  // ── Mode switching ─────────────────────────────────────

  describe('mode switching', () => {
    it('switches to "inside" on click', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Run inside sandbox/ }))
      expect(screen.getByRole('radio', { name: /Run inside sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('switches to "outside" on click', () => {
      renderSettings({ runInSandbox: true })
      fireEvent.click(screen.getByRole('radio', { name: /Run outside sandbox/ }))
      expect(screen.getByRole('radio', { name: /Run outside sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })
  })

  // ── Save ─────────────────────────────────────────────

  describe('save', () => {
    it('calls onSave with runInSandbox=false (default)', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ runInSandbox: false })
      })
    })

    it('calls onSave with runInSandbox=true after switching', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Run inside sandbox/ }))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ runInSandbox: true })
      })
    })

    it('shows Saved! feedback after save', async () => {
      renderSettings()
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(screen.getByText('Saved!')).toBeInTheDocument()
      })
    })

    it('shows Saving... during save', async () => {
      const onSave = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)))
      renderSettings(DEFAULT_CONFIG, onSave)
      fireEvent.click(screen.getByText('Save Changes'))
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })
})
