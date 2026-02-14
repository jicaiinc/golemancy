import type { SandboxConfig, SandboxPreset } from './bash-tool-config'

// ── Preset Configurations ──────────────────────────────────

/** Balanced (Default) — Safe defaults for most development */
export const PRESET_BALANCED: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
    ],
    denyRead: [
      '~/.ssh',
      '~/.aws',
      '/etc/passwd',
      '/etc/shadow',
      '**/.env',
      '**/secrets/**',
    ],
    denyWrite: [
      '**/.git/hooks/**',
    ],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: [
      'github.com',
      '*.github.com',
      'api.github.com',
      'raw.githubusercontent.com',
      'registry.npmjs.org',
      '*.npmjs.org',
      'registry.yarnpkg.com',
      'registry.npmmirror.com',
      'pypi.org',
      'files.pythonhosted.org',
      'hub.docker.com',
      'registry.hub.docker.com',
      '*.cloudflare.com',
      '*.jsdelivr.net',
      '*.unpkg.com',
    ],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'osascript *',
    'security *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'chmod 777 *',
    'rm -rf /',
  ],
}

/** Strict — Maximum restrictions, no network, no Python */
export const PRESET_STRICT: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
    ],
    denyRead: [
      '~/.ssh',
      '~/.aws',
      '~/.gnupg',
      '~/.config',
      '~/.local',
      '/etc/passwd',
      '/etc/shadow',
      '/etc/hosts',
      '**/.env',
      '**/.env.*',
      '**/secrets/**',
      '**/*.pem',
      '**/*.key',
      '**/*.p12',
      '**/credentials*',
    ],
    denyWrite: [
      '**/.git/hooks/**',
      '**/.git/config',
      '**/node_modules/**',
    ],
    allowGitConfig: false,
  },
  network: {
    allowedDomains: [],
  },
  enablePython: false,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'osascript *',
    'security *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'chmod 777 *',
    'rm -rf /',
    'curl *',
    'wget *',
    'nc *',
    'ncat *',
    'ssh *',
    'scp *',
    'rsync *',
    'docker *',
    'kubectl *',
    'open *',
  ],
}

/** Permissive — Broader access for trusted projects */
export const PRESET_PERMISSIVE: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
      '~/.config',
      '~/.local',
      '~/Downloads',
    ],
    denyRead: [
      '~/.ssh/id_*',
      '~/.ssh/*_key',
      '~/.aws/credentials',
      '/etc/shadow',
      '**/*.pem',
      '**/*.key',
    ],
    denyWrite: [
      '**/.git/hooks/**',
    ],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: [
      'github.com',
      '*.github.com',
      'api.github.com',
      'raw.githubusercontent.com',
      'registry.npmjs.org',
      '*.npmjs.org',
      'registry.yarnpkg.com',
      'registry.npmmirror.com',
      'pypi.org',
      'files.pythonhosted.org',
      'hub.docker.com',
      'registry.hub.docker.com',
      '*.cloudflare.com',
      '*.jsdelivr.net',
      '*.unpkg.com',
      '*.googleapis.com',
      '*.docker.io',
      '*.docker.com',
      'crates.io',
      '*.crates.io',
      'rubygems.org',
      'api.nuget.org',
      'go.dev',
      'proxy.golang.org',
      'sum.golang.org',
    ],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'rm -rf /',
  ],
}

/** Development — Full access except hard-banned operations */
export const PRESET_DEVELOPMENT: SandboxConfig = {
  filesystem: {
    allowWrite: [
      '/workspace',
      '/tmp',
      '~/.npm',
      '~/.cache',
      '~/.config',
      '~/.local',
      '~/Downloads',
      '~/Desktop',
      '~/Documents',
    ],
    denyRead: [
      '~/.ssh/id_*',
      '~/.ssh/*_key',
      '/etc/shadow',
    ],
    denyWrite: [],
    allowGitConfig: true,
  },
  network: {
    allowedDomains: ['*'],
  },
  enablePython: true,
  deniedCommands: [
    'sudo *',
    'su *',
    'doas *',
    'mkfs *',
    'dd if=* of=/dev/*',
    'rm -rf /',
  ],
}

// ── Preset Lookup ──────────────────────────────────────────

export const SANDBOX_PRESETS: Record<Exclude<SandboxPreset, 'custom'>, SandboxConfig> = {
  balanced: PRESET_BALANCED,
  strict: PRESET_STRICT,
  permissive: PRESET_PERMISSIVE,
  development: PRESET_DEVELOPMENT,
}

/**
 * Get the SandboxConfig for a given preset name.
 * For "custom", merges customConfig on top of balanced defaults.
 */
export function getPresetConfig(preset: SandboxPreset, customConfig?: Partial<SandboxConfig>): SandboxConfig {
  if (preset === 'custom') {
    return mergeWithDefaults(PRESET_BALANCED, customConfig ?? {})
  }
  return SANDBOX_PRESETS[preset]
}

// ── Preset Metadata (for UI) ───────────────────────────────

export interface PresetMetadata {
  id: SandboxPreset
  name: string
  subtitle: string
  description: string
  icon: string
}

export const PRESET_METADATA: PresetMetadata[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    subtitle: 'Recommended',
    description: 'OS-level isolation. Real commands allowed within safe defaults. Blocks sensitive files and dangerous commands.',
    icon: 'shield-check',
  },
  {
    id: 'strict',
    name: 'Strict',
    subtitle: 'Maximum safety',
    description: 'No network access, no Python, tight filesystem. Only workspace and /tmp writable. Blocks most external tools.',
    icon: 'shield-lock',
  },
  {
    id: 'permissive',
    name: 'Permissive',
    subtitle: 'For trusted projects',
    description: 'Broader network access (package registries, Docker, Go). More writable directories. Fewer command restrictions.',
    icon: 'shield-half',
  },
  {
    id: 'development',
    name: 'Development',
    subtitle: 'Local dev only',
    description: 'Full network access, broad filesystem permissions. Only hard-banned operations (sudo, mkfs) are blocked.',
    icon: 'shield-off',
  },
  {
    id: 'custom',
    name: 'Custom',
    subtitle: 'Manual configuration',
    description: 'Manually configure filesystem, network, and command restrictions.',
    icon: 'settings',
  },
]

// ── Internal Helpers ───────────────────────────────────────

function mergeWithDefaults(base: SandboxConfig, override: Partial<SandboxConfig>): SandboxConfig {
  return {
    filesystem: {
      allowWrite: override.filesystem?.allowWrite ?? base.filesystem.allowWrite,
      denyRead: override.filesystem?.denyRead ?? base.filesystem.denyRead,
      denyWrite: override.filesystem?.denyWrite ?? base.filesystem.denyWrite,
      allowGitConfig: override.filesystem?.allowGitConfig ?? base.filesystem.allowGitConfig,
    },
    network: {
      allowedDomains: override.network?.allowedDomains ?? base.network.allowedDomains,
    },
    enablePython: override.enablePython ?? base.enablePython,
    deniedCommands: override.deniedCommands ?? base.deniedCommands,
  }
}
