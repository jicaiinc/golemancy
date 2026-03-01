#!/usr/bin/env bash
set -euo pipefail

# ── Configuration (pinned versions for reproducible builds) ──

PYTHON_VERSION="3.13.12"
PYTHON_RELEASE="20260203"
NODE_VERSION="22.22.0"

# ── Output directory ──

RUNTIME_DIR="$(cd "$(dirname "$0")/../apps/desktop/resources/runtime" && pwd -P 2>/dev/null || echo "$(dirname "$0")/../apps/desktop/resources/runtime")"

# ── Platform detection ──

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="win32" ;;
    *) echo "ERROR: Unsupported OS: $(uname -s)"; exit 1 ;;
  esac

  # Allow --arch override for cross-compilation (e.g., building x64 on ARM runner)
  if [ -n "${OVERRIDE_ARCH:-}" ]; then
    arch="$OVERRIDE_ARCH"
  else
    case "$(uname -m)" in
      arm64|aarch64) arch="arm64" ;;
      x86_64|amd64)  arch="x64" ;;
      *) echo "ERROR: Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac
  fi

  echo "${os}-${arch}"
}

# ── SHA256 verification helper ──

verify_sha256() {
  local file="$1"
  local expected="$2"

  local actual
  if command -v sha256sum &>/dev/null; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  else
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  fi

  if [ "$actual" != "$expected" ]; then
    echo "ERROR: SHA256 mismatch!"
    echo "  Expected: ${expected}"
    echo "  Actual:   ${actual}"
    rm -f "$file"
    exit 1
  fi
  echo "  SHA256 verified ✓"
}

# ── Python download ──

download_python() {
  local platform="$1"
  local python_dir="${RUNTIME_DIR}/python"

  # Idempotent: skip if already downloaded (unless --force)
  # Windows: python.exe at root; Unix: bin/python3.13
  if [ "$FORCE_DOWNLOAD" = true ]; then
    echo "Force mode: removing existing Python runtime..."
    rm -rf "${python_dir}"
  elif [ -f "${python_dir}/python.exe" ] || [ -x "${python_dir}/bin/python3.13" ]; then
    echo "Python ${PYTHON_VERSION} already present, skipping (use --force to re-download)"
    return 0
  fi

  # Map platform to python-build-standalone triple
  local triple
  case "$platform" in
    darwin-arm64) triple="aarch64-apple-darwin" ;;
    darwin-x64)   triple="x86_64-apple-darwin" ;;
    linux-x64)    triple="x86_64-unknown-linux-gnu" ;;
    win32-x64)    triple="x86_64-pc-windows-msvc" ;;
    *) echo "ERROR: No Python binary for platform: $platform"; exit 1 ;;
  esac

  local filename="cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${triple}-install_only_stripped.tar.gz"
  local url="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${filename}"

  # SHA256 verification
  local expected_sha256
  case "$platform" in
    darwin-arm64) expected_sha256="146d011e9246790659d86c729a9bb37dc423545d0ed8e542ba1dfe93700aa0f2" ;;
    darwin-x64)   expected_sha256="5fb24d5a82f248e985bdc01f504f40d4150e321809b0bbeee7441cedd6dac227" ;;
    linux-x64)    expected_sha256="7f1340417839331260dd8ecc309a4f0d2acac1123f3fb7f76600cf52a53a4ef6" ;;
    win32-x64)    expected_sha256="95065b15468cc977a9000256b99e7408a6a9cb35ad2711873ba7b621ee37df19" ;;
  esac

  echo "Downloading Python ${PYTHON_VERSION} for ${platform}..."
  echo "  URL: ${url}"

  local tmpfile
  tmpfile="$(mktemp)"
  curl -fSL --progress-bar -o "$tmpfile" "$url"

  verify_sha256 "$tmpfile" "$expected_sha256"

  # Extract: tarball contains python/ top-level directory
  # Extract directly to runtime dir → results in runtime/python/
  echo "Extracting Python to ${python_dir}..."
  mkdir -p "${RUNTIME_DIR}"
  tar xzf "$tmpfile" -C "${RUNTIME_DIR}"
  rm -f "$tmpfile"

  # Verify
  if [ -f "${python_dir}/python.exe" ]; then
    echo "Python ${PYTHON_VERSION} installed successfully (Windows)"
    "${python_dir}/python.exe" --version
  elif [ -x "${python_dir}/bin/python3.13" ]; then
    echo "Python ${PYTHON_VERSION} installed successfully"
    "${python_dir}/bin/python3.13" --version
  else
    echo "ERROR: Python binary not found after extraction"
    exit 1
  fi
}

# ── Node.js download ──

download_node() {
  local platform="$1"
  local node_dir="${RUNTIME_DIR}/node"

  # Idempotent: skip if already downloaded (unless --force)
  # Windows: node.exe at root; Unix: bin/node
  if [ "$FORCE_DOWNLOAD" = true ]; then
    echo "Force mode: removing existing Node.js runtime..."
    rm -rf "${node_dir}"
  elif [ -f "${node_dir}/node.exe" ] || [ -x "${node_dir}/bin/node" ]; then
    echo "Node.js ${NODE_VERSION} already present, skipping (use --force to re-download)"
    return 0
  fi

  # Map platform to Node.js naming convention
  local node_os node_arch
  case "$platform" in
    darwin-arm64) node_os="darwin"; node_arch="arm64" ;;
    darwin-x64)   node_os="darwin"; node_arch="x64" ;;
    linux-x64)    node_os="linux";  node_arch="x64" ;;
    win32-x64)    node_os="win";    node_arch="x64" ;;
    *) echo "ERROR: No Node.js binary for platform: $platform"; exit 1 ;;
  esac

  # SHA256 verification
  local expected_sha256
  case "$platform" in
    darwin-arm64) expected_sha256="5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640" ;;
    darwin-x64)   expected_sha256="5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce" ;;
    linux-x64)    expected_sha256="c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744" ;;
    win32-x64)    expected_sha256="c97fa376d2becdc8863fcd3ca2dd9a83a9f3468ee7ccf7a6d076ec66a645c77a" ;;
  esac

  echo "Downloading Node.js ${NODE_VERSION} for ${platform}..."

  local tmpfile
  mkdir -p "${node_dir}"

  if [ "$node_os" = "win" ]; then
    # Windows: .zip format
    local filename="node-v${NODE_VERSION}-${node_os}-${node_arch}.zip"
    local url="https://nodejs.org/dist/v${NODE_VERSION}/${filename}"
    echo "  URL: ${url}"

    tmpfile="$(mktemp)"
    curl -fSL --progress-bar -o "$tmpfile" "$url"

    verify_sha256 "$tmpfile" "$expected_sha256"

    # Extract with flat structure (strip top-level directory)
    echo "Extracting Node.js to ${node_dir}..."
    local tmpextract
    tmpextract="$(mktemp -d)"
    unzip -q "$tmpfile" -d "$tmpextract"
    # Move contents of node-v22.22.0-win-x64/ to node_dir
    mv "$tmpextract"/node-v*/* "$node_dir"/
    rm -rf "$tmpextract" "$tmpfile"
  else
    # Unix: .tar.gz format
    local filename="node-v${NODE_VERSION}-${node_os}-${node_arch}.tar.gz"
    local url="https://nodejs.org/dist/v${NODE_VERSION}/${filename}"
    echo "  URL: ${url}"

    tmpfile="$(mktemp)"
    curl -fSL --progress-bar -o "$tmpfile" "$url"

    verify_sha256 "$tmpfile" "$expected_sha256"

    # Extract with --strip-components=1 (removes node-v22.22.0-{os}-{arch}/ prefix)
    echo "Extracting Node.js to ${node_dir}..."
    tar xzf "$tmpfile" --strip-components=1 -C "${node_dir}"
    rm -f "$tmpfile"
  fi

  # Verify
  if [ -f "${node_dir}/node.exe" ]; then
    echo "Node.js ${NODE_VERSION} installed successfully (Windows)"
    "${node_dir}/node.exe" --version
  elif [ -x "${node_dir}/bin/node" ]; then
    echo "Node.js ${NODE_VERSION} installed successfully"
    "${node_dir}/bin/node" --version
  else
    echo "ERROR: Node binary not found after extraction"
    exit 1
  fi
}

# ── Argument parsing ──

OVERRIDE_ARCH=""
FORCE_DOWNLOAD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      OVERRIDE_ARCH="$2"
      shift 2
      ;;
    --force)
      FORCE_DOWNLOAD=true
      shift
      ;;
    *)
      echo "Usage: $0 [--arch arm64|x64] [--force]"
      exit 1
      ;;
  esac
done

# Validate --arch value
if [ -n "$OVERRIDE_ARCH" ]; then
  case "$OVERRIDE_ARCH" in
    arm64|x64) ;;
    *)
      echo "ERROR: Invalid --arch value: '${OVERRIDE_ARCH}'. Must be 'arm64' or 'x64'."
      exit 1
      ;;
  esac
fi

# ── Main ──

main() {
  local platform
  platform="$(detect_platform)"
  echo "Detected platform: ${platform}"
  if [ -n "$OVERRIDE_ARCH" ]; then
    echo "Architecture override: ${OVERRIDE_ARCH}"
  fi
  echo "Runtime directory: ${RUNTIME_DIR}"
  echo ""

  mkdir -p "${RUNTIME_DIR}"

  download_python "$platform"
  echo ""
  download_node "$platform"

  echo ""
  echo "All runtimes downloaded successfully."
  echo "Total size: $(du -sh "${RUNTIME_DIR}" | awk '{print $1}')"
}

main
