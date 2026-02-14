import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ProjectBashToolConfig, GlobalBashToolConfig } from '@golemancy/shared'
import { ProjectSafetyBashToolSettings } from './ProjectSafetyBashToolSettings'

// ── Test Helpers ─────────────────────────────────────────────

const DEFAULT_GLOBAL: GlobalBashToolConfig = {
  defaultMode: 'sandbox',
  sandboxPreset: 'balanced',
}

function renderSettings(
  opts: {
    config?: ProjectBashToolConfig
    globalConfig?: GlobalBashToolConfig
  } = {},
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  return {
    ...render(
      <ProjectSafetyBashToolSettings
        config={opts.config}
        globalConfig={opts.globalConfig ?? DEFAULT_GLOBAL}
        onSave={onSave}
      />,
    ),
    onSave,
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('ProjectSafetyBashToolSettings', () => {
  // ── Rendering ────────────────────────────────────────────

  describe('rendering', () => {
    it('renders EXECUTION MODE heading', () => {
      renderSettings()
      expect(screen.getByText('EXECUTION MODE')).toBeInTheDocument()
    })

    it('renders inherit and custom options', () => {
      renderSettings()
      expect(screen.getByText('Inherit from App Settings')).toBeInTheDocument()
      expect(screen.getByText('Custom Configuration')).toBeInTheDocument()
    })

    it('renders global config summary when inheriting', () => {
      renderSettings()
      expect(screen.getByText(/Current: Sandbox \(Balanced\)/)).toBeInTheDocument()
    })

    it('renders Recommended badge on inherit option', () => {
      renderSettings()
      expect(screen.getByText('Recommended')).toBeInTheDocument()
    })

    it('renders Save Changes button', () => {
      renderSettings()
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })

  // ── Inherit mode (default) ───────────────────────────────

  describe('inherit mode (default)', () => {
    it('has inherit selected by default', () => {
      renderSettings()
      const inheritRadio = screen.getByRole('radio', { name: /Inherit from App Settings/ })
      expect(inheritRadio).toHaveAttribute('aria-checked', 'true')
    })

    it('does NOT show mode selector when inheriting', () => {
      renderSettings()
      expect(screen.queryByText('Restricted')).not.toBeInTheDocument()
      expect(screen.queryByText('Unrestricted')).not.toBeInTheDocument()
    })

    it('shows INHERITED CONFIGURATION button when global mode is sandbox', () => {
      renderSettings()
      expect(screen.getByText('INHERITED CONFIGURATION')).toBeInTheDocument()
    })

    it('does NOT show inherited config button when global mode is restricted', () => {
      renderSettings({ globalConfig: { defaultMode: 'restricted', sandboxPreset: 'balanced' } })
      expect(screen.queryByText('INHERITED CONFIGURATION')).not.toBeInTheDocument()
    })

    it('shows current global mode summary for restricted', () => {
      renderSettings({ globalConfig: { defaultMode: 'restricted', sandboxPreset: 'balanced' } })
      expect(screen.getByText(/Current: Restricted/)).toBeInTheDocument()
    })

    it('shows current global mode summary for unrestricted', () => {
      renderSettings({ globalConfig: { defaultMode: 'unrestricted', sandboxPreset: 'balanced' } })
      expect(screen.getByText(/Current: Unrestricted/)).toBeInTheDocument()
    })

    it('expands inherited config to show read-only details', () => {
      renderSettings()
      fireEvent.click(screen.getByText('INHERITED CONFIGURATION'))
      expect(screen.getByText(/Mode:/)).toBeInTheDocument()
      expect(screen.getByText(/Preset:/)).toBeInTheDocument()
    })

    it('shows (read-only) label for inherited config', () => {
      renderSettings()
      expect(screen.getByText('(read-only)')).toBeInTheDocument()
    })
  })

  // ── Custom mode ─────────────────────────────────────────

  describe('custom mode', () => {
    it('switches to custom configuration on click', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByRole('radio', { name: /Custom Configuration/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('shows mode selector when custom is selected', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByText('Restricted')).toBeInTheDocument()
      expect(screen.getByText('Sandbox')).toBeInTheDocument()
      expect(screen.getByText('Unrestricted')).toBeInTheDocument()
    })

    it('shows SANDBOX PRESET when mode is sandbox', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByText('SANDBOX PRESET')).toBeInTheDocument()
    })

    it('shows ADVANCED CONFIGURATION button when mode is sandbox', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByText('ADVANCED CONFIGURATION')).toBeInTheDocument()
    })

    it('hides SANDBOX PRESET when mode is restricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      expect(screen.queryByText('SANDBOX PRESET')).not.toBeInTheDocument()
    })

    it('hides ADVANCED CONFIGURATION when mode is restricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      expect(screen.queryByText('ADVANCED CONFIGURATION')).not.toBeInTheDocument()
    })
  })

  // ── Unrestricted confirmation modal ──────────────────────

  describe('unrestricted modal', () => {
    it('shows confirmation modal when clicking unrestricted', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      expect(screen.getByText('Enable Unrestricted Mode?')).toBeInTheDocument()
    })

    it('shows warning about removing sandbox protection', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      expect(screen.getByText(/removes all sandbox protection for this project/)).toBeInTheDocument()
    })

    it('cancels unrestricted mode when clicking Cancel', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      fireEvent.click(screen.getByText('Cancel'))
      // Should stay on sandbox mode
      expect(screen.getByRole('radio', { name: /Sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('confirms unrestricted mode when clicking "I Understand, Enable"', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Unrestricted/ }))
      fireEvent.click(screen.getByText('I Understand, Enable'))
      expect(screen.getByRole('radio', { name: /Unrestricted/ })).toHaveAttribute('aria-checked', 'true')
    })
  })

  // ── Save ────────────────────────────────────────────────

  describe('save', () => {
    it('calls onSave with inherit=true by default', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ inherit: true })
      })
    })

    it('calls onSave with inherit=false and mode when custom', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Restricted/ }))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ inherit: false, mode: 'restricted' }),
        )
      })
    })

    it('includes customConfig when preset is custom', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByText('Custom'))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            inherit: false,
            mode: 'sandbox',
            customConfig: expect.objectContaining({
              filesystem: expect.any(Object),
              network: expect.any(Object),
            }),
          }),
        )
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
      renderSettings({}, onSave)
      fireEvent.click(screen.getByText('Save Changes'))
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })
  })

  // ── Config initialization ──────────────────────────────

  describe('config initialization', () => {
    it('starts in custom mode when config has inherit=false', () => {
      renderSettings({ config: { inherit: false, mode: 'restricted' } })
      expect(screen.getByRole('radio', { name: /Custom Configuration/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('shows correct mode when config specifies mode', () => {
      renderSettings({ config: { inherit: false, mode: 'restricted' } })
      expect(screen.getByRole('radio', { name: /Restricted/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('defaults to inherit when no config provided', () => {
      renderSettings()
      expect(screen.getByRole('radio', { name: /Inherit from App Settings/ })).toHaveAttribute('aria-checked', 'true')
    })
  })
})
