import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { ProjectMCPSafetyConfig, GlobalMCPSafetyConfig } from '@golemancy/shared'
import { ProjectSafetyMCPSettings } from './ProjectSafetyMCPSettings'

// ── Test Helpers ─────────────────────────────────────────────

const DEFAULT_GLOBAL: GlobalMCPSafetyConfig = {
  runInSandbox: false,
}

function renderSettings(
  opts: {
    config?: ProjectMCPSafetyConfig
    globalConfig?: GlobalMCPSafetyConfig
  } = {},
  onSave = vi.fn().mockResolvedValue(undefined),
) {
  return {
    ...render(
      <ProjectSafetyMCPSettings
        config={opts.config}
        globalConfig={opts.globalConfig ?? DEFAULT_GLOBAL}
        onSave={onSave}
      />,
    ),
    onSave,
  }
}

// ── Tests ────────────────────────────────────────────────────

describe('ProjectSafetyMCPSettings', () => {
  // ── Rendering ────────────────────────────────────────────

  describe('rendering', () => {
    it('renders MCP EXECUTION ENVIRONMENT heading', () => {
      renderSettings()
      expect(screen.getByText('MCP EXECUTION ENVIRONMENT')).toBeInTheDocument()
    })

    it('renders inherit and custom options', () => {
      renderSettings()
      expect(screen.getByText('Inherit from App Settings')).toBeInTheDocument()
      expect(screen.getByText('Custom Configuration')).toBeInTheDocument()
    })

    it('renders Recommended badge on inherit option', () => {
      renderSettings()
      expect(screen.getByText('Recommended')).toBeInTheDocument()
    })

    it('renders global config summary showing "outside"', () => {
      renderSettings()
      expect(screen.getByText(/Current: Run outside sandbox/)).toBeInTheDocument()
    })

    it('renders global config summary showing "inside"', () => {
      renderSettings({ globalConfig: { runInSandbox: true } })
      expect(screen.getByText(/Current: Run inside sandbox/)).toBeInTheDocument()
    })

    it('renders Save Changes button', () => {
      renderSettings()
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })

  // ── Inherit mode (default) ───────────────────────────────

  describe('inherit mode', () => {
    it('has inherit selected by default', () => {
      renderSettings()
      const inheritRadio = screen.getByRole('radio', { name: /Inherit from App Settings/ })
      expect(inheritRadio).toHaveAttribute('aria-checked', 'true')
    })

    it('does NOT show MCP execution options when inheriting', () => {
      renderSettings()
      expect(screen.queryByText('MCP SERVER EXECUTION')).not.toBeInTheDocument()
    })
  })

  // ── Custom mode ─────────────────────────────────────────

  describe('custom mode', () => {
    it('shows MCP SERVER EXECUTION when custom is selected', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByText('MCP SERVER EXECUTION')).toBeInTheDocument()
    })

    it('shows inside and outside options', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      expect(screen.getByText('Run inside sandbox')).toBeInTheDocument()
      expect(screen.getByText('Run outside sandbox')).toBeInTheDocument()
    })

    it('switches between inside and outside', () => {
      renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Run inside sandbox/ }))
      expect(screen.getByRole('radio', { name: /Run inside sandbox/ })).toHaveAttribute('aria-checked', 'true')
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

    it('calls onSave with runInSandbox=false when custom + outside', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ inherit: false, runInSandbox: false })
      })
    })

    it('calls onSave with runInSandbox=true when custom + inside', async () => {
      const { onSave } = renderSettings()
      fireEvent.click(screen.getByRole('radio', { name: /Custom Configuration/ }))
      fireEvent.click(screen.getByRole('radio', { name: /Run inside sandbox/ }))
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ inherit: false, runInSandbox: true })
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
      renderSettings({ config: { inherit: false, runInSandbox: true } })
      expect(screen.getByRole('radio', { name: /Custom Configuration/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('shows "inside" selected when config has runInSandbox=true', () => {
      renderSettings({ config: { inherit: false, runInSandbox: true } })
      expect(screen.getByRole('radio', { name: /Run inside sandbox/ })).toHaveAttribute('aria-checked', 'true')
    })

    it('defaults to inherit when no config provided', () => {
      renderSettings()
      expect(screen.getByRole('radio', { name: /Inherit from App Settings/ })).toHaveAttribute('aria-checked', 'true')
    })
  })
})
