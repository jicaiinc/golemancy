import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import type {
  IPermissionsConfigService,
  PermissionsConfigFile,
  PermissionsConfigId,
  ProjectId,
} from '@golemancy/shared'
import { getDefaultPermissionsConfig } from '@golemancy/shared'
import { resolvePermissionsConfig } from './resolve-permissions'

// Mock runtime paths — deterministic values for template expansion tests
vi.mock('../runtime/paths', () => ({
  getProjectRuntimeDir: vi.fn().mockReturnValue('/data/projects/proj-1/runtime'),
  getGlobalRuntimeDir: vi.fn().mockReturnValue('/data/runtime'),
}))

const projId = 'proj-1' as ProjectId
const configId = 'perm-1' as PermissionsConfigId

function makeConfig(overrides: Partial<PermissionsConfigFile> = {}): PermissionsConfigFile {
  return {
    id: configId,
    title: 'Test Config',
    mode: 'sandbox',
    config: {
      allowWrite: ['{{workspaceDir}}', '{{projectRuntimeDir}}/**', '{{globalRuntimeDir}}/**'],
      denyRead: ['**/.env'],
      denyWrite: [],
      networkRestrictionsEnabled: false,
      allowedDomains: [],
      deniedDomains: [],
      deniedCommands: ['sudo'],
      applyToMCP: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeStorage(overrides: Partial<IPermissionsConfigService> = {}): IPermissionsConfigService {
  return {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    ...overrides,
  }
}

describe('resolvePermissionsConfig', () => {
  describe('config loading', () => {
    it('loads config by ID from storage', async () => {
      const config = makeConfig()
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      expect(storage.getById).toHaveBeenCalledWith(projId, configId)
      expect(result.mode).toBe('sandbox')
    })

    it('falls back to system default when configId is undefined', async () => {
      const storage = makeStorage()

      const result = await resolvePermissionsConfig(storage, projId, undefined, '/workspace', 'darwin')

      // Should query with 'default' ID
      expect(storage.getById).toHaveBeenCalledWith(projId, 'default')
      // Since mock returns null, it falls back to getDefaultPermissionsConfig
      expect(result.mode).toBe('sandbox')
    })

    it('falls back to system default when config not found', async () => {
      const storage = makeStorage()

      const result = await resolvePermissionsConfig(storage, projId, 'missing' as PermissionsConfigId, '/workspace', 'darwin')

      expect(result.mode).toBe('sandbox')
      // Verify default config deniedCommands are present
      expect(result.config.deniedCommands).toContain('sudo')
    })
  })

  describe('template expansion', () => {
    it('expands {{workspaceDir}} in allowWrite', async () => {
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['{{workspaceDir}}'],
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/my/workspace', 'darwin')

      expect(result.config.allowWrite).toEqual([path.resolve('/my/workspace')])
    })

    it('expands {{projectRuntimeDir}} in allowWrite', async () => {
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['{{projectRuntimeDir}}/**'],
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      expect(result.config.allowWrite[0]).toContain('runtime')
    })

    it('expands {{globalRuntimeDir}} in allowWrite', async () => {
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['{{globalRuntimeDir}}/**'],
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      expect(result.config.allowWrite[0]).toContain('runtime')
    })

    it('resolves non-template paths as absolute', async () => {
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['/absolute/path', 'relative/path'],
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      expect(path.isAbsolute(result.config.allowWrite[0])).toBe(true)
      expect(path.isAbsolute(result.config.allowWrite[1])).toBe(true)
    })

    it('rejects template paths that escape allowed directories', async () => {
      // A template that resolves to a path outside workspace, runtime dirs
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['{{workspaceDir}}/../../../etc'],
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      // Should fall back to workspaceDir instead of the escaped path
      expect(result.config.allowWrite[0]).toBe(path.resolve('/workspace'))
    })
  })

  describe('platform awareness', () => {
    it('strips sandbox config on win32 to deniedCommands only', async () => {
      const config = makeConfig({
        config: {
          ...makeConfig().config,
          allowWrite: ['{{workspaceDir}}'],
          denyRead: ['**/.env'],
          deniedCommands: ['format'],
          applyToMCP: true,
        },
      })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'win32')

      // Win32 strips everything except deniedCommands
      expect(result.mode).toBe('sandbox')
      expect(result.config.allowWrite).toEqual([])
      expect(result.config.denyRead).toEqual([])
      expect(result.config.deniedCommands).toEqual(['format'])
      expect(result.config.applyToMCP).toBe(false)
    })

    it('keeps full config on darwin', async () => {
      const config = makeConfig()
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'darwin')

      expect(result.config.allowWrite.length).toBeGreaterThan(0)
      expect(result.config.denyRead).toEqual(['**/.env'])
    })

    it('keeps full config on linux', async () => {
      const config = makeConfig()
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'linux')

      expect(result.config.allowWrite.length).toBeGreaterThan(0)
    })

    it('does not strip config for non-sandbox modes on win32', async () => {
      const config = makeConfig({ mode: 'unrestricted' })
      const storage = makeStorage({ getById: vi.fn().mockResolvedValue(config) })

      const result = await resolvePermissionsConfig(storage, projId, configId, '/workspace', 'win32')

      // Unrestricted mode is not affected by platform check
      expect(result.mode).toBe('unrestricted')
      expect(result.config.allowWrite.length).toBeGreaterThan(0)
    })
  })

  describe('default config', () => {
    it('uses platform-specific denyRead for darwin', async () => {
      const storage = makeStorage()

      const result = await resolvePermissionsConfig(storage, projId, undefined, '/workspace', 'darwin')

      const defaultConfig = getDefaultPermissionsConfig('darwin')
      // Should contain unix-specific paths
      expect(result.config.denyRead).toContain('~/.ssh')
      expect(result.config.deniedCommands).toContain('sudo')
    })

    it('uses platform-specific deniedCommands for win32', async () => {
      const storage = makeStorage()

      const result = await resolvePermissionsConfig(storage, projId, undefined, '/workspace', 'win32')

      // win32 sandbox mode → stripped to deniedCommands only
      // Win32 default deniedCommands include 'format'
      expect(result.config.deniedCommands).toContain('format')
    })
  })
})
