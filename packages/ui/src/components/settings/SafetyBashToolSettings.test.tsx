import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GlobalBashToolConfig } from '@golemancy/shared'
import { SafetyBashToolSettings } from './SafetyBashToolSettings'

// ── Test Helpers ─────────────────────────────────────────────

const DEFAULT_CONFIG: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'balanced',
}

function renderSettings(
  config: GlobalBashToolConfig = DEFAULT_CONFIG,
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  return { ...render(<SafetyBashToolSettings config={config} onSave={onSave} />), onSave }
}

// ── Tests ────────────────────────────────────────────────────

describe('SafetyBashToolSettings', () => {
  // ── Rendering ────────────────────────────────────────────

  describe('rendering', () => {
    it('renders EXECUTION MODE heading', () => {
      renderSettings()
      expect(screen.getByText('EXECUTION MODE')).toBeInTheDocument()
    })

    it('renders all three execution modes', () => {
      renderSettings()
      expect(screen.getByText('Restricted')).toBeInTheDocument()
      expect(screen.getByText('Sandbox')).toBeInTheDocument()
      expect(screen.getByText('Unrestricted')).toBeInTheDocument()
    })

    it('renders mode descriptions', () => {
      renderSettings()
      expect(screen.getByText(/Virtual filesystem, 70\+ built-in commands/)).toBeInTheDocument()
      expect(screen.getByText(/Powered by Anthropic Sandbox Runtime/)).toBeInTheDocument()
      expect(screen.getByText(/For local development and trusted environments/)).toBeInTheDocument()
    })

    it('renders badge labels', () => {
      renderSettings()
      expect(screen.getByText('Safe')).toBeInTheDocument()
      // "Recommended" appears in both mode badge and preset subtitle
      expect(screen.getAllByText('Recommended').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Danger')).toBeInTheDocument()
    })

    it('renders Save Changes button', () => {
      renderSettings()
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })

    it('renders SANDBOX PRESET when mode is sandbox', () => {
      renderSettings()
      expect(screen.getByText('SANDBOX PRESET')).toBeInTheDocument()
    })

    it('renders preset cards when mode is sandbox', () => {
      renderSettings()
      expect(screen.getByText('Balanced')).toBeInTheDocument()
      expect(screen.getByText('Strict')).toBeInTheDocument()
      expect(screen.getByText('Permissive')).toBeInTheDocument()
      expect(screen.getByText('Custom')).toBeInTheDocument()
    })

    it('renders ADVANCED CONFIGURATION button when sandbox mode', () => {
      renderSettings()
      expect(screen.getByText('ADVANCED CONFIGURATION')).toBeInTheDocument()
    })
  })

  // ── Sandbox mode as default ──────────────────────────────

  describe('sandbox mode default selection', () => {
    it('has sandbox mode selected by default', () => {
      renderSettings()
      const sandboxRadio = screen.getByRole('radio', { name: /Sandbox/ })
      expect(sandboxRadio).toHaveAttribute('aria-checked', 'true')
    })

    it('has restricted mode unselected', () => {
      renderSettings()
      const restrictedRadio = screen.getByRole('radio', { name: /Restricted/ })
      expect(restrictedRadio).toHaveAttribute('aria-checked', 'false')
    })

    it('has unrestricted mode unselected', () => {
      renderSettings()
      const unrestrictedRadio = screen.getByRole('radio', { name: /Unrestricted/ })
      expect(unrestrictedRadio).toHaveAttribute('aria-checked', 'false')
    })
  })

  // ── Mode switching ─────────────────────────────────────────

  describe('mode switching', () => {
    it('switches to restricted mode on click', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      expect(screen.getByRole('radio', { name: /Restricted/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('hides preset selector when switching to restricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      expect(screen.queryByText('SANDBOX PRESET')).not.toBeInTheDocument()
    })

    it('hides advanced config when switching to restricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      expect(screen.queryByText('ADVANCED CONFIGURATION')).not.toBeInTheDocument()
    })

    it('shows confirmation modal when clicking unrestricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      expect(screen.getByText('Enable Unrestricted Mode?')).toBeInTheDocument()
    })

    it('shows warning text in confirmation modal', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      expect(screen.getByText(/removes all sandbox protection/)).toBeInTheDocument()
      expect(screen.getByText(/Read\/write any file on your computer/)).toBeInTheDocument()
    })

    it('cancels unrestricted mode when clicking Cancel', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      fireEvent.click(screen.getByText('Cancel'))
      // Should stay on sandbox mode
      expect(screen.getByRole('radio', { name: /Sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('confirms unrestricted mode when clicking "I Understand, Enable"', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      fireEvent.click(screen.getByText('I Understand, Enable'))
      expect(screen.getByRole('radio', { name: /Unrestricted/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('hides preset and advanced when unrestricted is confirmed', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      fireEvent.click(screen.getByText('I Understand, Enable'))
      expect(screen.queryByText('SANDBOX PRESET')).not.toBeInTheDocument()
      expect(screen.queryByText('ADVANCED CONFIGURATION')).not.toBeInTheDocument()
    })
  })

  // ── Advanced configuration ─────────────────────────────────

  describe('advanced configuration', () => {
    it('advanced config is collapsed by default', () => {
      renderSettings()
      expect(screen.queryByText('FILE SYSTEM PERMISSIONS')).not.toBeInTheDocument()
    })

    it('expands advanced config on click', () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('FILE SYSTEM PERMISSIONS')).toBeInTheDocument()
    })

    it('shows all permission editors when expanded', () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('ALLOW WRITE')).toBeInTheDocument()
      expect(screen.getByText('DENY READ')).toBeInTheDocument()
      expect(screen.getByText('DENY WRITE')).toBeInTheDocument()
      expect(screen.getByText('NETWORK PERMISSIONS')).toBeInTheDocument()
      expect(screen.getByText('ALLOWED DOMAINS')).toBeInTheDocument()
    })

    it('shows toggles when expanded', () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('Enable Python')).toBeInTheDocument()
      expect(screen.getByText('Allow Git Config')).toBeInTheDocument()
    })

    it('shows denied commands editor when expanded', () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('DENIED COMMANDS')).toBeInTheDocument()
    })

    it('shows read-only label when preset is not custom', () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('(read-only)')).toBeInTheDocument()
    })

    it('collapses advanced config on second click', async () => {
      renderSettings()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      expect(screen.getByText('FILE SYSTEM PERMISSIONS')).toBeInTheDocument()
      fireEvent.click(screen.getByText('ADVANCED CONFIGURATION'))
      // aria-expanded should toggle to false
      const btn = screen.getByText('ADVANCED CONFIGURATION').closest('button')
      expect(btn).toHaveAttribute('aria-expanded', 'false')
    })
  })

  // ── Preset selection ─────────────────────────────────────

  describe('preset selection', () => {
    it('shows "Active" on balanced preset by default', () => {
      renderSettings()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })

    it('auto-expands advanced config when Custom preset is selected', async () => {
      renderSettings()
      fireEvent.click(screen.getByText('Custom'))
      await waitFor(() => {
        expect(screen.getByText('FILE SYSTEM PERMISSIONS')).toBeInTheDocument()
      })
    })

    it('hides read-only label when Custom is selected', async () => {
      renderSettings()
      fireEvent.click(screen.getByText('Custom'))
      await waitFor(() => {
        expect(screen.queryByText('(read-only)')).not.toBeInTheDocument()
      })
    })
  })

  // ── Save ────────────────────────────────────────────────

  describe('save', () => {
    it('calls onSave with sandbox + balanced config', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          defaultMode: 'sandbox',
          sandboxPreset: 'balanced',
        })
      })
    })

    it('calls onSave with restricted mode', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ defaultMode: 'restricted' }),
        )
      })
    })

    it('shows Saved! feedback after save', async () => {
      const { onSave } = renderSettings()
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

    it('includes customConfig when preset is custom', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByText('Custom'))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            sandboxPreset: 'custom',
            customConfig: expect.objectContaining({
              filesystem: expect.any(Object),
              network: expect.any(Object),
            }),
          }),
        )
      })
    })

    it('does NOT include customConfig for named presets', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        const call = onSave.mock.calls[0][0]
        expect(call.customConfig).toBeUndefined()
      })
    })
  })

  // ── Config initialization ──────────────────────────────

  describe('config initialization', () => {
    it('initializes with provided config', () => {
      renderSettings({ defaultMode: 'restricted', sandboxPreset: 'strict' })
      expect(screen.getByRole('radio', { name: /Restricted/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('defaults to sandbox + balanced when config is empty', () => {
      renderSettings({} as GlobalBashToolConfig)
      expect(screen.getByRole('radio', { name: /Sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })
  })
})
