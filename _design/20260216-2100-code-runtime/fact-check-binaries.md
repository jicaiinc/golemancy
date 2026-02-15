# Fact Check: Runtime Binaries & Distribution

Date: 2026-02-16 | Fact Checker

---

## 1. python-build-standalone (CPython 3.13.12)

### Version Verification

- **Python 3.13.12** released: **2026-02-03** (confirmed via [python.org](https://www.python.org/downloads/release/python-31312/))
- This IS the latest 3.13.x maintenance release (~240 bugfixes since 3.13.11)
- python-build-standalone release **20260203** includes CPython 3.13.12 (confirmed via [GitHub releases](https://github.com/astral-sh/python-build-standalone/releases/tag/20260203))
- The requirement doc claims "latest stable: 3.13.12" — **CORRECT**

### Recommended Variant: `install_only_stripped`

The requirement doc doesn't specify which variant. We should use **`install_only_stripped`**:

| Variant | Debug Symbols | Typical Size (Linux x64) | Use Case |
|---------|---------------|--------------------------|----------|
| Full archive (`.tar.zst`) | Yes + build artifacts | ~500+ MB | Building extensions |
| `install_only` | Yes | ~251 MB | Debugging |
| `install_only_stripped` | **No** | **~81 MB** | **Production embedding** |

Source: [GitHub issue #277](https://github.com/astral-sh/python-build-standalone/issues/277)

**Rationale**: `install_only_stripped` is ~68% smaller, used by default in tools like mise. No need for debug symbols in our Electron bundle.

### Download URL Format

```
https://github.com/astral-sh/python-build-standalone/releases/download/{RELEASE_TAG}/cpython-{VERSION}+{RELEASE_TAG}-{ARCH}-{PLATFORM}-install_only_stripped.tar.gz
```

### Exact Filenames (release 20260203, CPython 3.13.12)

| Platform | Filename | Compression |
|----------|----------|-------------|
| macOS arm64 | `cpython-3.13.12+20260203-aarch64-apple-darwin-install_only_stripped.tar.gz` | gzip |
| macOS x86_64 | `cpython-3.13.12+20260203-x86_64-apple-darwin-install_only_stripped.tar.gz` | gzip |
| Linux x86_64 | `cpython-3.13.12+20260203-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz` | gzip |

**Note on compression**: Both `.tar.gz` and `.tar.zst` (zstandard) formats are available. Recommend `.tar.gz` for the download script since it doesn't require extra tools (macOS/Linux have `tar` + gzip natively; zstd may not be installed).

### Platform Triples

| Target | Architecture | Platform Triple |
|--------|-------------|-----------------|
| macOS Apple Silicon | aarch64 | `aarch64-apple-darwin` |
| macOS Intel | x86_64 | `x86_64-apple-darwin` |
| Linux x64 | x86_64 | `x86_64-unknown-linux-gnu` |

### Directory Structure After Extraction

After extracting the `install_only` / `install_only_stripped` archive, you get:

```
python/                           ← Top-level directory in tarball
├── bin/
│   ├── python3.13               ← Main executable
│   ├── python3 → python3.13    ← Symlink
│   ├── python → python3.13     ← Symlink  (may not exist in all builds)
│   ├── pip3.13                  ← pip executable
│   ├── pip3 → pip3.13          ← Symlink
│   └── pip → pip3.13           ← Symlink
├── include/
│   └── python3.13/             ← Header files (for building C extensions)
├── lib/
│   ├── python3.13/             ← Standard library
│   │   ├── site-packages/      ← pip + setuptools(3.11-) / pip only(3.12+)
│   │   ├── ensurepip/          ← pip bootstrapper
│   │   └── ...                 ← All stdlib modules
│   └── libpython3.13.so        ← Shared library (Linux) / .dylib (macOS)
└── share/
    └── man/                    ← Man pages
```

**Key facts**:
- The `install_only` archive rewrites `python/install/*` to `python/*` (i.e., the top-level is `python/`)
- **pip IS included** by default (pre-installed via ensurepip)
- The entire standard library is bundled
- On Linux, `bin/python3.13` has `DT_RPATH` pointing to `../lib/` — no need to set `LD_LIBRARY_PATH`

### Requirement Doc Path Structure — NEEDS ADJUSTMENT

The requirement doc shows:
```
resources/runtime/python/cpython-3.13/
├── bin/python3.13
├── bin/pip3
└── lib/python3.13/...
```

The actual extracted path is `python/bin/python3.13` (top-level is `python/`, not `cpython-3.13/`). Two options:
1. **Rename during extraction**: `tar ... --strip-components=1 -C resources/runtime/python/` → places contents directly in `python/`
2. **Use as-is**: Extract to `resources/runtime/` → ends up as `resources/runtime/python/`

**Recommendation**: Option 2 (use as-is) is simplest. The extracted `python/` directory already matches the requirement's path structure of `resources/runtime/python/`.

### File Sizes (Approximate)

Exact sizes for 3.13.12 `install_only_stripped` aren't available via API (GitHub asset loading issues). Based on known data:

| Platform | Compressed (`.tar.gz`) | Extracted |
|----------|----------------------|-----------|
| Linux x86_64 | ~30-40 MB | ~80-90 MB |
| macOS arm64 | ~30-40 MB | ~80-90 MB |
| macOS x86_64 | ~30-40 MB | ~80-90 MB |

(Full `install_only` without stripping: ~90 MB compressed, ~250 MB extracted on Linux)

---

## 2. Node.js 22 LTS

### Version Verification

- **Node.js 22.22.0** 'Jod' (LTS) released: **2026-01-13** (confirmed via [nodejs.org](https://nodejs.org/en/blog/release/v22.22.0))
- This IS the latest 22.x LTS release (security release)
- LTS support until: **2027-04-30**

### Download URLs

Base URL: `https://nodejs.org/dist/v22.22.0/`

| Platform | Filename | Size |
|----------|----------|------|
| macOS arm64 | `node-v22.22.0-darwin-arm64.tar.gz` | **50 MB** |
| macOS x86_64 | `node-v22.22.0-darwin-x64.tar.gz` | **51 MB** |
| Linux x86_64 | `node-v22.22.0-linux-x64.tar.gz` | **57 MB** |

Also available as `.tar.xz` (smaller: 26-31 MB), but `.tar.gz` is more portable.

### SHA256 Checksums

```
5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640  node-v22.22.0-darwin-arm64.tar.gz
5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce  node-v22.22.0-darwin-x64.tar.gz
c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744  node-v22.22.0-linux-x64.tar.gz
```

Source: [Node.js SHASUMS256.txt](https://nodejs.org/dist/v22.22.0/SHASUMS256.txt)

### Directory Structure After Extraction

```
node-v22.22.0-{platform}-{arch}/    ← Top-level directory in tarball
├── bin/
│   ├── node                        ← Node.js executable
│   ├── npm → ../lib/node_modules/npm/bin/npm-cli.js    ← Symlink
│   ├── npx → ../lib/node_modules/npm/bin/npx-cli.js    ← Symlink
│   └── corepack                    ← Package manager manager
├── include/
│   └── node/                       ← Header files for native addons
├── lib/
│   └── node_modules/
│       ├── npm/                    ← Full npm installation
│       └── corepack/               ← Corepack
├── share/
│   ├── doc/
│   ├── man/
│   └── systemtap/
├── CHANGELOG.md
├── LICENSE
└── README.md
```

**Key facts**:
- **npm IS included** (full installation in `lib/node_modules/npm/`)
- **npx IS included** (symlink in `bin/`)
- **corepack IS included** (for yarn/pnpm management, not needed for us)
- Top-level directory is `node-v22.22.0-{platform}-{arch}/` — need `--strip-components=1` during extraction

### Requirement Doc Path Structure — NEEDS ADJUSTMENT

The requirement doc shows:
```
resources/runtime/node/
├── bin/node
├── bin/npm
└── bin/npx
```

This needs `--strip-components=1` during tar extraction to remove the version-prefixed top-level directory:
```bash
tar xzf node-v22.22.0-darwin-arm64.tar.gz --strip-components=1 -C resources/runtime/node/
```

---

## 3. electron-builder `extraResources`

### Current Project State

The project currently uses **electron-vite** for dev but does NOT yet have an electron-builder config for production builds. No `electron-builder.yml`, `electron-builder.json`, or `build` key in `package.json`.

### Configuration Format

Platform-specific extraResources can be configured per-platform:

```yaml
# electron-builder.yml (recommended format)
extraResources:
  - from: "resources/shared"
    to: "shared"

mac:
  extraResources:
    - from: "resources/runtime"
      to: "runtime"

linux:
  extraResources:
    - from: "resources/runtime"
      to: "runtime"

win:
  extraResources:
    - from: "resources/runtime"
      to: "runtime"
```

Each entry supports `{ from, to, filter }` as a FileSet object.

### Resource Path at Runtime

| Context | Path Resolution |
|---------|----------------|
| **Packaged macOS** | `process.resourcesPath` → `YourApp.app/Contents/Resources/` |
| **Packaged Linux** | `process.resourcesPath` → `resources/` (next to executable) |
| **Packaged Windows** | `process.resourcesPath` → `resources/` (next to executable) |
| **Dev mode** | `process.resourcesPath` points to Electron's own resources, NOT the project |

### Dev vs. Production Path Strategy

For bundled runtimes, the approach should be:

```typescript
function getRuntimeDir(): string {
  if (process.env.GOLEMANCY_PYTHON_PATH) {
    // Dev mode: use env var override
    return path.dirname(process.env.GOLEMANCY_PYTHON_PATH)
  }
  // Packaged: use process.resourcesPath
  return path.join(process.resourcesPath, 'runtime')
}
```

This matches the existing project pattern with `GOLEMANCY_ROOT_DIR` and `GOLEMANCY_FORK_EXEC_PATH` env vars for dev/test overrides.

### Platform-Specific Build Strategy

Since each platform gets different binaries, the download script must:
1. Detect current platform (`uname -s` + `uname -m`)
2. Download ONLY that platform's binaries
3. Place in `apps/desktop/resources/runtime/`
4. electron-builder bundles whatever is in `resources/runtime/` via extraResources

No need for platform-specific electron-builder extraResources config — just always include `resources/runtime/` and the download script ensures correct content.

---

## Issues & Flags

### Issue 1: Version Pinning Strategy
The download script should pin exact versions (Python 3.13.12 + release 20260203, Node 22.22.0) rather than "latest". This ensures reproducible builds.

### Issue 2: Total Bundle Size Impact
Estimated additional size per platform:
- Python (stripped): ~80-90 MB extracted
- Node.js: ~50 MB compressed / ~170 MB extracted (includes npm)
- **Total: ~250-260 MB additional per platform**

This is significant for an Electron app. May want to document this tradeoff.

### Issue 3: macOS x86_64 Relevance
Apple has been on Apple Silicon since 2020. Consider whether macOS x86_64 support is needed, or if arm64-only is sufficient. This halves the testing matrix.

### Issue 4: Compression Format for Download Script
Recommend `.tar.gz` over `.tar.zst` for the download script:
- `.tar.gz`: Works everywhere natively
- `.tar.zst`: Smaller but requires `zstd` to be installed (not default on macOS)

### Issue 5: No Windows in Scope
The requirement doc lists Windows x86_64 in the download script scope but also says "Windows sandbox support (existing limitation)" is out of scope. The download script should still support Windows for future-proofing, but sandbox integration is macOS/Linux only.
