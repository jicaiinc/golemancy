import type { PermissionMode } from '@golemancy/shared'

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

const VALID_MODES: PermissionMode[] = ['restricted', 'sandbox', 'unrestricted']

const STRING_ARRAY_FIELDS = [
  'allowWrite', 'denyRead', 'denyWrite',
  'allowedDomains', 'deniedDomains', 'deniedCommands',
] as const

// ── Permissions Config Validation ──────────────────────────

/**
 * Validate a PermissionsConfig object (the flat config inside a PermissionsConfigFile).
 * Returns an array of validation errors (empty if valid).
 */
export function validatePermissionsConfig(config: unknown, prefix = ''): ValidationError[] {
  const errors: ValidationError[] = []
  const p = prefix ? `${prefix}.` : ''

  if (!config || typeof config !== 'object') {
    return [{ field: `${p}config`, message: 'Must be an object' }]
  }

  const c = config as Record<string, unknown>

  // String array fields
  for (const key of STRING_ARRAY_FIELDS) {
    if (c[key] !== undefined) {
      if (!Array.isArray(c[key]) || !(c[key] as unknown[]).every(v => typeof v === 'string')) {
        errors.push({ field: `${p}${key}`, message: 'Must be an array of strings' })
      }
    }
  }

  // applyToMCP
  if (c.applyToMCP !== undefined && typeof c.applyToMCP !== 'boolean') {
    errors.push({ field: `${p}applyToMCP`, message: 'Must be a boolean' })
  }

  return errors
}

// ── Permissions Config File Validation ─────────────────────

/**
 * Validate a full PermissionsConfigFile payload (title, mode, config).
 */
export function validatePermissionsConfigFile(data: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: 'Must be an object' }] }
  }

  const d = data as Record<string, unknown>

  // title
  if (d.title !== undefined) {
    if (typeof d.title !== 'string' || d.title.length === 0) {
      errors.push({ field: 'title', message: 'Must be a non-empty string' })
    } else if (d.title.length > 100) {
      errors.push({ field: 'title', message: 'Must be 100 characters or fewer' })
    }
  }

  // mode
  if (d.mode !== undefined) {
    if (!VALID_MODES.includes(d.mode as PermissionMode)) {
      errors.push({ field: 'mode', message: `Must be one of: ${VALID_MODES.join(', ')}` })
    }
  }

  // config
  if (d.config !== undefined) {
    const configErrors = validatePermissionsConfig(d.config, 'config')
    errors.push(...configErrors)
  }

  return { valid: errors.length === 0, errors }
}
