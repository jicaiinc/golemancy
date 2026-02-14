import type { BashExecutionMode, SandboxPreset } from '@golemancy/shared'

// ── Validation Types ───────────────────────────────────────

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// ── Constants ──────────────────────────────────────────────

const VALID_MODES: BashExecutionMode[] = ['restricted', 'sandbox', 'unrestricted']
const VALID_PRESETS: SandboxPreset[] = ['balanced', 'strict', 'permissive', 'development', 'custom']

// ── Global Config Validation ───────────────────────────────

export function validateGlobalBashConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ field: 'bashTool', message: 'Must be an object' }] }
  }

  const c = config as Record<string, unknown>

  // defaultMode
  if (c.defaultMode !== undefined) {
    if (!VALID_MODES.includes(c.defaultMode as BashExecutionMode)) {
      errors.push({
        field: 'defaultMode',
        message: `Must be one of: ${VALID_MODES.join(', ')}`,
      })
    }
  }

  // sandboxPreset
  if (c.sandboxPreset !== undefined) {
    if (!VALID_PRESETS.includes(c.sandboxPreset as SandboxPreset)) {
      errors.push({
        field: 'sandboxPreset',
        message: `Must be one of: ${VALID_PRESETS.join(', ')}`,
      })
    }
  }

  // customConfig
  if (c.customConfig !== undefined) {
    const customErrors = validateSandboxConfig(c.customConfig, 'customConfig')
    errors.push(...customErrors)
  }

  return { valid: errors.length === 0, errors }
}

// ── Sandbox Config Validation ──────────────────────────────

export function validateSandboxConfig(config: unknown, prefix = ''): ValidationError[] {
  const errors: ValidationError[] = []
  const p = prefix ? `${prefix}.` : ''

  if (!config || typeof config !== 'object') {
    return [{ field: `${p}sandboxConfig`, message: 'Must be an object' }]
  }

  const c = config as Record<string, unknown>

  // filesystem
  if (c.filesystem !== undefined) {
    if (typeof c.filesystem !== 'object' || c.filesystem === null) {
      errors.push({ field: `${p}filesystem`, message: 'Must be an object' })
    } else {
      const fs = c.filesystem as Record<string, unknown>
      for (const key of ['allowWrite', 'denyRead', 'denyWrite'] as const) {
        if (fs[key] !== undefined) {
          if (!Array.isArray(fs[key]) || !(fs[key] as unknown[]).every(v => typeof v === 'string')) {
            errors.push({ field: `${p}filesystem.${key}`, message: 'Must be an array of strings' })
          }
        }
      }
      if (fs.allowGitConfig !== undefined && typeof fs.allowGitConfig !== 'boolean') {
        errors.push({ field: `${p}filesystem.allowGitConfig`, message: 'Must be a boolean' })
      }
    }
  }

  // network
  if (c.network !== undefined) {
    if (typeof c.network !== 'object' || c.network === null) {
      errors.push({ field: `${p}network`, message: 'Must be an object' })
    } else {
      const net = c.network as Record<string, unknown>
      if (net.allowedDomains !== undefined) {
        if (!Array.isArray(net.allowedDomains) || !(net.allowedDomains as unknown[]).every(v => typeof v === 'string')) {
          errors.push({ field: `${p}network.allowedDomains`, message: 'Must be an array of strings' })
        }
      }
    }
  }

  // enablePython
  if (c.enablePython !== undefined && typeof c.enablePython !== 'boolean') {
    errors.push({ field: `${p}enablePython`, message: 'Must be a boolean' })
  }

  // deniedCommands
  if (c.deniedCommands !== undefined) {
    if (!Array.isArray(c.deniedCommands) || !(c.deniedCommands as unknown[]).every(v => typeof v === 'string')) {
      errors.push({ field: `${p}deniedCommands`, message: 'Must be an array of strings' })
    }
  }

  return errors
}

// ── Project Config Validation ──────────────────────────────

export function validateProjectBashConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ field: 'bashTool', message: 'Must be an object' }] }
  }

  const c = config as Record<string, unknown>

  // mode (optional)
  if (c.mode !== undefined && !VALID_MODES.includes(c.mode as BashExecutionMode)) {
    errors.push({ field: 'mode', message: `Must be one of: ${VALID_MODES.join(', ')}` })
  }

  // inherit
  if (c.inherit !== undefined && typeof c.inherit !== 'boolean') {
    errors.push({ field: 'inherit', message: 'Must be a boolean' })
  }

  // customConfig — only validated when inherit=false
  if (c.inherit === false && c.customConfig !== undefined) {
    const customErrors = validateSandboxConfig(c.customConfig, 'customConfig')
    errors.push(...customErrors)
  }

  return { valid: errors.length === 0, errors }
}
