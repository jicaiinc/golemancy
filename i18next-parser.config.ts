import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'i18next-parser';

// Anchor input/output to this config file's directory so the parser works
// regardless of which package cwd the runner is launched from (pnpm --filter
// switches cwd to the target package).
const here = dirname(fileURLToPath(import.meta.url));

const config: UserConfig = {
  locales: ['zh-CN', 'en'],
  defaultNamespace: 'ui',
  namespaceSeparator: ':',
  keySeparator: '.',
  output: resolve(here, 'packages/i18n/src/locales/$LOCALE/$NAMESPACE.json'),
  input: [
    resolve(here, 'packages/ui/src/**/*.{ts,tsx}'),
    resolve(here, 'apps/desktop/src/**/*.{ts,tsx}'),
  ],
  sort: true,
  createOldCatalogs: false,
  failOnWarnings: false,
  useKeysAsDefaultValue: false,
  // Some keys are accessed via dynamic lookup (e.g. `t(s.labelKey, s.fallback)`
  // for the settings nav array). The extractor can't see those, so without
  // this it would delete them on every run. Audit the catalog periodically
  // to remove truly stale keys.
  keepRemoved: true,
  defaultValue: (locale, _namespace, _key, value) => (locale === 'en' ? (value ?? '') : ''),
  lexers: {
    ts: [{ lexer: 'JavascriptLexer', functions: ['t'] }],
    tsx: [{ lexer: 'JsxLexer', functions: ['t'] }],
  },
};

export default config;
