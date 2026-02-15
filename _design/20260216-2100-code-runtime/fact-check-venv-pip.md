# Fact Check: Python venv, pip, npm, and npx Behavior

Date: 2026-02-16
Status: Verified

## 1. Python venv: Symlinks vs Copies on macOS

### Verified Behavior

**`python -m venv` CLI** defaults depend on platform:
- **POSIX (macOS, Linux)**: `symlinks=True` — creates **symlinks** by default
- **Windows**: `symlinks=False` — creates **copies** by default

The determination is based on `os.name == 'nt'` (Windows check). On non-Windows, symlinks are used.

### macOS Framework Builds Exception

Historically, macOS **framework builds** had problems with symlinks (the python binary is a stub that launches the real binary, and symlinking the stub doesn't work). However:

- **python-build-standalone is NOT a framework build** ([issue #274](https://github.com/indygreg/python-build-standalone/issues/274))
- Framework builds have binaries at paths like `Python.framework/Versions/3.13/bin/python`
- python-build-standalone has simple `bin/python3.13` layout

### Conclusion for Our Use Case

**The requirements doc is CORRECT**: python-build-standalone on macOS will create venvs with **symlinks** to the bundled Python. This saves disk space as stated.

### Important Note on API vs CLI

There's a known inconsistency ([CPython #129382](https://github.com/python/cpython/issues/129382)):
- `python -m venv` → `symlinks=True` on POSIX ✅
- `venv.EnvBuilder()` / `venv.create()` API → `symlinks=False` by default ⚠️

**Recommendation**: Always use `python -m venv` CLI, not the Python API, to get correct platform defaults. Or explicitly pass `--symlinks` flag.

### Flags

| Flag | Description |
|------|-------------|
| `--symlinks` | Force symlinks (even when not platform default) |
| `--copies` | Force copies (even when symlinks are default) |

Source: [Python 3.13 venv docs](https://docs.python.org/3/library/venv.html)

---

## 2. pip Included in venv by Default

### Verified: YES

Since Python 3.4, `python -m venv` invokes `ensurepip` to bootstrap pip into the virtual environment **by default**.

- `--without-pip` flag skips pip installation
- `--upgrade-deps` flag upgrades pip (and setuptools if installed) to latest from PyPI

### Python 3.13 Changes to venv

- Creates `.gitignore` file automatically (for Git SCM)
- Added `--without-scm-ignore-files` to skip `.gitignore` creation

### venv Structure (POSIX)

```
python-env/
├── pyvenv.cfg              # Config (home = path to base python)
├── bin/
│   ├── python              # Symlink → bundled python3.13
│   ├── python3             # Symlink → bundled python3.13
│   ├── python3.13          # Symlink → bundled python3.13
│   ├── pip                 # Script with shebang → venv python
│   ├── pip3                # Script with shebang → venv python
│   ├── pip3.13             # Script with shebang → venv python
│   ├── activate            # bash activation script
│   ├── activate.fish       # fish activation script
│   ├── activate.csh        # csh activation script
│   └── Activate.ps1        # PowerShell activation script
├── lib/python3.13/
│   └── site-packages/      # Installed packages go here
├── include/                 # C headers (for building extensions)
└── .gitignore              # New in Python 3.13
```

Source: [Python 3.13 venv docs](https://docs.python.org/3/library/venv.html)

---

## 3. pip Cache Configuration

### Environment Variable: `PIP_CACHE_DIR`

**Verified**: `PIP_CACHE_DIR` is the correct env var to control pip's cache location.

pip follows a convention where any CLI flag `--flag-name` can be set via env var `PIP_FLAG_NAME`. So `--cache-dir` → `PIP_CACHE_DIR`.

### CLI Flag: `--cache-dir <path>`

This is a **general option** (not specific to `pip install`), meaning it works with any pip subcommand:

```bash
pip install --cache-dir /path/to/cache numpy
pip download --cache-dir /path/to/cache numpy
```

### Default Cache Locations

| Platform | Default Path |
|----------|-------------|
| **macOS** | `~/Library/Caches/pip` |
| **Linux** | `~/.cache/pip` (respects `XDG_CACHE_HOME`) |
| **Windows** | `%LocalAppData%\pip\Cache` |

### Other Cache Controls

| Env Var / Flag | Description |
|----------------|-------------|
| `PIP_CACHE_DIR` | Set cache directory |
| `PIP_NO_CACHE_DIR=1` | Disable caching entirely |
| `--no-cache-dir` | CLI flag to disable caching |
| `pip cache dir` | Query current cache directory |
| `pip cache purge` | Clear all cached files |

### Requirement Doc Verification

The requirement says to use `--cache-dir` flag when appending cache flags in command-rewriter. **This is CORRECT** but consider also setting `PIP_CACHE_DIR` env var for the subprocess. The env var approach is simpler and covers all pip commands automatically, avoiding the need to append `--cache-dir` to every pip command.

**Recommendation**: Use `PIP_CACHE_DIR` env var in subprocess environment instead of appending `--cache-dir` to commands. This is cleaner and handles edge cases like `python -m pip install`.

Source: [pip caching docs](https://pip.pypa.io/en/stable/topics/caching/)

---

## 4. npm Cache Configuration

### Environment Variable: `npm_config_cache`

**Verified**: npm reads config from env vars prefixed with `npm_config_`. Case-insensitive, so both `npm_config_cache` and `NPM_CONFIG_CACHE` work.

### CLI Flag: `--cache <path>`

```bash
npm install --cache /path/to/cache
```

**Warning**: Do NOT use `--no-cache` — it creates a folder named `"false"` due to a parsing bug. Use `--prefer-online` instead if you want to bypass cache.

### Default Cache Locations

| Platform | Default Path |
|----------|-------------|
| **macOS / Linux** | `~/.npm` |
| **Windows** | `%LocalAppData%/npm-cache` |

### npm Prefix (Global Install Location)

`NPM_CONFIG_PREFIX` controls where `npm install -g` and `npx` install global packages.

```bash
export NPM_CONFIG_PREFIX=~/.golemancy/runtime/npm-global
```

Global packages install to `{prefix}/lib/node_modules/`, and binaries are linked in `{prefix}/bin/`.

### Requirement Doc Verification

The requirement says to use `--cache` flag for npm in command-rewriter. **This works** but the env var approach (`npm_config_cache`) is cleaner.

**Recommendation**: Use env vars in subprocess environment:
- `npm_config_cache` → set to `~/.golemancy/runtime/cache/npm`
- `NPM_CONFIG_PREFIX` → set to `~/.golemancy/runtime/npm-global`

This covers npm, npx, and all subcommands automatically.

Sources: [npm cache docs](https://docs.npmjs.com/cli/v8/commands/npm-cache/), [npm config docs](https://docs.npmjs.com/cli/v8/using-npm/config/)

---

## 5. npx PATH Resolution

### How npx Finds Node

npx ships bundled with npm. It uses the same Node.js runtime that npm uses. When npm is installed alongside node, npx automatically finds the correct node binary.

### How npx Finds Commands

Resolution order:
1. Local `node_modules/.bin/` (project-level)
2. `$PATH` lookup
3. If not found, downloads and installs temporarily

### Controlling npx via PATH

**Verified**: Prepending the bundled node's bin directory to `PATH` will make npx:
- Use the bundled node binary
- Find bundled npm/npx
- Install global packages respecting `NPM_CONFIG_PREFIX` and `npm_config_cache`

```bash
export PATH=/path/to/bundled/node/bin:$PATH
export npm_config_cache=~/.golemancy/runtime/cache/npm
export NPM_CONFIG_PREFIX=~/.golemancy/runtime/npm-global
npx -y @some/tool  # Uses bundled node, caches to our location
```

### Requirement Doc Verification

The MCP integration section says to prepend bundled node bin dir to PATH. **This is CORRECT** and sufficient.

---

## 6. Command Rewriting Edge Cases

### Commands That Need Rewriting

| User Command | Rewrite To | Notes |
|-------------|-----------|-------|
| `python` | `{venv}/bin/python` | Main case |
| `python3` | `{venv}/bin/python3` | Common alias |
| `python3.13` | `{venv}/bin/python3.13` | Version-specific |
| `pip` | `{venv}/bin/pip` | Package manager |
| `pip3` | `{venv}/bin/pip3` | Version alias |
| `node` | `{bundled}/bin/node` | Node.js |
| `npm` | `{bundled}/bin/npm` | Package manager |
| `npx` | `{bundled}/bin/npx` | Package executor |

### Edge Case: `python -m pip`

When a user runs `python -m pip install numpy`:
- Rewrite `python` → `{venv}/bin/python`
- Result: `{venv}/bin/python -m pip install numpy`
- pip module is found via the venv's Python, which looks in venv's `site-packages`
- **No additional rewriting needed for pip in this case**

### Edge Case: Shebangs in Installed Scripts

When pip installs a package with CLI tools (e.g., `black`, `pytest`):
- pip rewrites the shebang to the absolute venv python path: `#!/path/to/venv/bin/python`
- These scripts are found in `{venv}/bin/`
- **No rewriting needed** — if venv bin is in PATH, scripts work automatically

**Recommendation**: Prepend `{venv}/bin` to PATH in the subprocess environment. This handles:
- `python`, `python3`, `python3.13` resolution
- `pip`, `pip3` resolution
- All pip-installed CLI tools (black, pytest, etc.)
- `python -m pip` (python resolves to venv python)

### Edge Case: `pip install` within venv

When running `pip install numpy` in a venv:
- pip installs to `{venv}/lib/python3.13/site-packages/`
- pip itself uses its own cache (controlled by `PIP_CACHE_DIR`)
- Downloaded wheels are cached for reuse across projects

### Edge Case: Shell Scripts with `#!/usr/bin/env python3`

- `#!/usr/bin/env python3` → `/usr/bin/env` searches PATH → finds `{venv}/bin/python3`
- This works correctly if venv bin is in PATH
- **No rewriting needed** for env-based shebangs

---

## 7. Summary of Recommendations

### Use Environment Variables Over CLI Flags

Instead of appending `--cache-dir` / `--cache` to commands in the rewriter, set these env vars in the subprocess environment:

```typescript
const env = {
  ...process.env,
  // Python
  PATH: `${venvBinDir}:${bundledNodeBinDir}:${process.env.PATH}`,
  PIP_CACHE_DIR: pipCachePath,
  VIRTUAL_ENV: venvPath,  // Optional but conventional

  // Node.js / npm
  npm_config_cache: npmCachePath,
  NPM_CONFIG_PREFIX: npmGlobalPath,
};
```

### Benefits of Env Var Approach

1. **Simpler command rewriting** — no need to parse and append flags
2. **Covers all subcommands** — `python -m pip`, `pip3`, etc. all inherit env
3. **Handles edge cases** — pip called from scripts, subprocess pip calls
4. **Works with shebangs** — `#!/usr/bin/env python3` finds venv python via PATH

### Potential Issue: Requirement Doc Says CLI Flags

The requirement doc specifies:
> Appends cache flags: `--cache-dir` for pip, `--cache` for npm

This approach works but is more fragile. Env vars are the cleaner solution. **Recommend updating the design to use env vars instead of CLI flag appending.**

---

## 8. Corrections to Requirements Doc

| Claim in Requirements | Status | Notes |
|----------------------|--------|-------|
| Python venv uses symlinks (not copies) | ✅ CORRECT | python-build-standalone is non-framework; `python -m venv` uses symlinks on POSIX |
| pip included in venv | ✅ CORRECT (implicit) | ensurepip bootstraps pip by default |
| PIP_CACHE_DIR env var | ✅ CORRECT | Exact name verified |
| NPM_CONFIG_CACHE env var | ⚠️ MINOR | Convention is lowercase `npm_config_cache`, but uppercase works too |
| NPM_CONFIG_PREFIX env var | ✅ CORRECT | Controls global install location |
| `--cache-dir` for pip | ✅ WORKS | But env var `PIP_CACHE_DIR` is preferred |
| `--cache` for npm | ✅ WORKS | But env var `npm_config_cache` is preferred |
| Default macOS pip cache: `~/Library/Caches/pip` | ✅ CORRECT | |
| Default macOS npm cache: `~/.npm` | ✅ CORRECT | |
| npx controlled via PATH | ✅ CORRECT | Prepend bundled node bin to PATH |
| Command rewriting for python/pip/node/npm/npx | ✅ CORRECT | But env var approach is simpler (see recommendations) |
