/**
 * i18n validation script.
 *
 * Checks all non-English locale files against the English (en) source of truth:
 *   1. Missing keys — en has but target language doesn't
 *   2. Extra keys — target language has but en doesn't (warns only)
 *   3. Placeholder consistency — {{variable}} mismatches
 *   4. JSON validity — parse errors
 *
 * CLDR plural forms (_few, _many) are allowed as extras when the base key
 * has _one/_other in English.
 *
 * Usage:
 *   node scripts/check-i18n.mjs          # check all languages
 *   node scripts/check-i18n.mjs ja de    # check specific languages only
 *
 * Exit codes:
 *   0 — all good (extra keys produce warnings but don't fail)
 *   1 — missing keys or placeholder mismatches found
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LOCALES_DIR = join(ROOT, 'packages/ui/src/locales')
const SOURCE_LANG = 'en'

// ── Helpers ─────────────────────────────────────────────────

/** Flatten nested JSON into dot-separated keys. */
function flattenKeys(obj, prefix = '') {
  const result = {}
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value, fullKey))
    } else {
      result[fullKey] = value
    }
  }
  return result
}

/** Extract {{placeholder}} names from a string, sorted. */
function extractPlaceholders(str) {
  if (typeof str !== 'string') return []
  const matches = str.match(/\{\{(\w+)\}\}/g) || []
  return matches.map((m) => m.slice(2, -2)).sort()
}

/**
 * Check if an extra key is a legitimate CLDR plural form.
 * e.g. "time.minsAgo_few" is OK if en has "time.minsAgo_one" or "time.minsAgo_other".
 */
function isLegitPluralExtra(key, sourceKeys) {
  const pluralSuffixes = ['_few', '_many']
  for (const suffix of pluralSuffixes) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length)
      if (sourceKeys.has(`${base}_one`) || sourceKeys.has(`${base}_other`)) {
        return true
      }
    }
  }
  return false
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  // Determine which languages to check
  const cliLangs = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const allLangs = (await readdir(LOCALES_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name !== SOURCE_LANG)
    .map((d) => d.name)
    .sort()

  const langsToCheck = cliLangs.length > 0 ? cliLangs : allLangs

  // Validate CLI args
  for (const lang of langsToCheck) {
    if (!allLangs.includes(lang)) {
      console.error(`\x1b[31mUnknown language: "${lang}". Available: ${allLangs.join(', ')}\x1b[0m`)
      process.exit(1)
    }
  }

  // Load English source namespaces
  const enDir = join(LOCALES_DIR, SOURCE_LANG)
  const nsFiles = (await readdir(enDir)).filter((f) => f.endsWith('.json')).sort()
  const enData = {}
  for (const file of nsFiles) {
    const raw = await readFile(join(enDir, file), 'utf-8')
    enData[file] = flattenKeys(JSON.parse(raw))
  }

  console.log(`Checking ${langsToCheck.length} language(s) against "${SOURCE_LANG}" (${nsFiles.length} namespaces)...\n`)

  let hasErrors = false
  let totalWarnings = 0

  for (const lang of langsToCheck) {
    const langDir = join(LOCALES_DIR, lang)
    const issues = [] // { type: 'missing'|'extra'|'placeholder'|'parse', ns, detail }

    for (const file of nsFiles) {
      const filePath = join(langDir, file)
      let targetFlat

      // Parse JSON
      try {
        const raw = await readFile(filePath, 'utf-8')
        targetFlat = flattenKeys(JSON.parse(raw))
      } catch (err) {
        if (err.code === 'ENOENT') {
          issues.push({ type: 'missing', ns: file, detail: `entire file missing` })
        } else {
          issues.push({ type: 'parse', ns: file, detail: `JSON parse error: ${err.message}` })
        }
        continue
      }

      const sourceFlat = enData[file]
      const sourceKeySet = new Set(Object.keys(sourceFlat))
      const targetKeySet = new Set(Object.keys(targetFlat))

      // Missing keys
      for (const key of sourceKeySet) {
        if (!targetKeySet.has(key)) {
          issues.push({ type: 'missing', ns: file, detail: `missing key "${key}"` })
        }
      }

      // Extra keys
      for (const key of targetKeySet) {
        if (!sourceKeySet.has(key) && !isLegitPluralExtra(key, sourceKeySet)) {
          issues.push({ type: 'extra', ns: file, detail: `extra key "${key}"` })
        }
      }

      // Placeholder consistency (only for keys that exist in both)
      for (const key of sourceKeySet) {
        if (!targetKeySet.has(key)) continue
        const srcPh = extractPlaceholders(sourceFlat[key])
        const tgtPh = extractPlaceholders(targetFlat[key])
        if (srcPh.join(',') !== tgtPh.join(',')) {
          issues.push({
            type: 'placeholder',
            ns: file,
            detail: `placeholder mismatch in "${key}" — expected {{${srcPh.join('}}, {{')}}} but found {{${tgtPh.join('}}, {{')}}}`,
          })
        }
      }
    }

    // Report
    const errors = issues.filter((i) => i.type !== 'extra')
    const warnings = issues.filter((i) => i.type === 'extra')

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`\x1b[32m[PASS]\x1b[0m ${lang} — ${nsFiles.length}/${nsFiles.length} namespaces OK`)
    } else if (errors.length === 0) {
      totalWarnings += warnings.length
      console.log(`\x1b[33m[WARN]\x1b[0m ${lang} — ${warnings.length} warning(s)`)
      for (const w of warnings) {
        console.log(`  ${w.ns}: ${w.detail}`)
      }
    } else {
      hasErrors = true
      totalWarnings += warnings.length
      const allIssues = [...errors, ...warnings]
      console.log(`\x1b[31m[FAIL]\x1b[0m ${lang} — ${errors.length} error(s), ${warnings.length} warning(s)`)
      for (const i of allIssues) {
        const prefix = i.type === 'extra' ? '\x1b[33m' : '\x1b[31m'
        console.log(`  ${prefix}${i.ns}: ${i.detail}\x1b[0m`)
      }
    }
  }

  // Summary
  console.log()
  if (hasErrors) {
    console.error('\x1b[31mi18n check FAILED — missing keys or placeholder mismatches found.\x1b[0m')
    process.exit(1)
  } else if (totalWarnings > 0) {
    console.log(`\x1b[33mi18n check passed with ${totalWarnings} warning(s) (extra keys only).\x1b[0m`)
  } else {
    console.log('\x1b[32mi18n check passed — all translations are consistent.\x1b[0m')
  }
}

main()
