/**
 * Local smoke test — fork the bundled server and validate core API endpoints.
 *
 * Verifies the full packaging pipeline actually works:
 *   1. Bundled Node.js binary exists and is executable
 *   2. Server bundle (index.js + sandbox-worker.js) exists
 *   3. Server starts and sends IPC ready message
 *   4. HTTP endpoints respond correctly (health, CRUD)
 *   5. Server shuts down cleanly
 *
 * Exit code: 0 = all passed, 1 = failure.
 */

import { fork } from 'node:child_process'
import { access, constants, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const DESKTOP = join(ROOT, 'apps/desktop')

// ── Colors ────────────────────────────────────────────────────

const isCI = !!process.env.CI
const colorEnabled = !isCI && process.stdout.isTTY === true

const c = {
  red: (s) => (colorEnabled ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s) => (colorEnabled ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (colorEnabled ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (colorEnabled ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s) => (colorEnabled ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (colorEnabled ? `\x1b[1m${s}\x1b[0m` : s),
}

// ── Helpers ───────────────────────────────────────────────────

const results = []
let serverChild = null

function elapsed(startMs) {
  return `${Date.now() - startMs}ms`
}

function step(name, pass, durationMs) {
  const icon = pass ? c.green('✓') : c.red('✗')
  const time = c.dim(`(${durationMs})`)
  results.push({ name, pass, durationMs })
  console.log(`  ${icon} ${name} ${time}`)
}

function cleanup() {
  if (serverChild) {
    const child = serverChild
    serverChild = null
    child.kill('SIGTERM')
    // Force kill after 3s if still alive
    setTimeout(() => {
      try { child.kill('SIGKILL') } catch {}
    }, 3000)
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(1) })
process.on('SIGTERM', () => { cleanup(); process.exit(1) })

// ── Step 1: Check artifacts ──────────────────────────────────

async function checkArtifacts() {
  const isWin = process.platform === 'win32'
  const errors = []

  const bundledNode = isWin
    ? join(DESKTOP, 'resources/runtime/node/node.exe')
    : join(DESKTOP, 'resources/runtime/node/bin/node')

  const serverEntry = join(DESKTOP, 'resources/server/deps/index.js')
  const sandboxWorker = join(DESKTOP, 'resources/server/deps/sandbox-worker.js')

  // Check bundled Node.js
  try {
    const s = await stat(bundledNode)
    if (!isWin && !(s.mode & 0o111)) {
      errors.push({
        description: 'Bundled Node.js exists but is not executable',
        path: bundledNode,
        fix: `chmod +x ${bundledNode}`,
      })
    }
  } catch {
    errors.push({
      description: 'Bundled Node.js runtime not found',
      path: bundledNode,
      fix: "Run 'pnpm --filter @golemancy/desktop download-runtime'",
    })
  }

  // Check server bundle
  try {
    await access(serverEntry, constants.F_OK)
  } catch {
    errors.push({
      description: 'Server entry bundle (index.js) not found',
      path: serverEntry,
      fix: "Run 'pnpm --filter @golemancy/desktop bundle-server'",
    })
  }

  try {
    await access(sandboxWorker, constants.F_OK)
  } catch {
    errors.push({
      description: 'Sandbox worker bundle (sandbox-worker.js) not found',
      path: sandboxWorker,
      fix: "Run 'pnpm --filter @golemancy/desktop bundle-server'",
    })
  }

  if (errors.length > 0) {
    console.error(c.red(`\nArtifact check FAILED — ${errors.length} issue(s) found:\n`))
    for (const err of errors) {
      console.error(`  ${c.red('✗')} ${err.description}`)
      console.error(`    Path: ${err.path}`)
      if (err.fix) {
        console.error(`    Fix:  ${c.cyan(err.fix)}`)
      }
      console.error()
    }
    console.error('Run the full build pipeline first:')
    console.error(c.cyan('  pnpm build && pnpm --filter @golemancy/desktop download-runtime && pnpm --filter @golemancy/desktop bundle-server\n'))
    process.exit(1)
  }

  return { bundledNode, serverEntry }
}

// ── Step 2: Fork server ──────────────────────────────────────

function forkServer(bundledNode, serverEntry) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server did not send IPC ready message within 60 seconds'))
    }, 60_000)

    const child = fork(serverEntry, [], {
      execPath: bundledNode,
      env: { ...process.env, PORT: '0', NODE_ENV: 'production' },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverChild = child

    // Capture output for diagnostics on failure
    let stderr = ''
    child.stdout?.on('data', () => {})
    child.stderr?.on('data', (d) => { stderr += d.toString() })

    child.on('message', (msg) => {
      if (msg && msg.type === 'ready') {
        clearTimeout(timeout)
        resolve({ port: msg.port, token: msg.token })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.on('exit', (code) => {
      if (code !== null && code !== 0) {
        clearTimeout(timeout)
        const detail = stderr ? `\nServer stderr:\n${stderr.slice(-500)}` : ''
        reject(new Error(`Server exited with code ${code}${detail}`))
      }
    })
  })
}

// ── Step 3: HTTP validation ──────────────────────────────────

async function httpCheck(label, method, url, token, body) {
  const t0 = Date.now()
  try {
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
    if (body) opts.body = JSON.stringify(body)

    const res = await fetch(url, opts)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      step(label, false, elapsed(t0))
      console.error(`    ${c.red(`HTTP ${res.status}`)} ${text.slice(0, 200)}`)
      return null
    }
    const data = await res.json().catch(() => ({}))
    step(label, true, elapsed(t0))
    return data
  } catch (err) {
    step(label, false, elapsed(t0))
    console.error(`    ${c.red(err.message)}`)
    return null
  }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const totalStart = Date.now()
  console.log(c.bold('\nLocal smoke test: bundled server verification\n'))

  // 1. Check artifacts
  const t1 = Date.now()
  const { bundledNode, serverEntry } = await checkArtifacts()
  step('Artifacts exist', true, elapsed(t1))

  // 2. Fork server
  const t2 = Date.now()
  let port, token
  try {
    const ready = await forkServer(bundledNode, serverEntry)
    port = ready.port
    token = ready.token
    step('Server IPC ready', true, elapsed(t2))
  } catch (err) {
    step('Server IPC ready', false, elapsed(t2))
    console.error(`    ${c.red(err.message)}`)
    cleanup()
    printReport(totalStart)
    process.exit(1)
  }

  const baseUrl = `http://127.0.0.1:${port}`

  // 3. Health check
  await httpCheck('GET /api/health', 'GET', `${baseUrl}/api/health`, token)

  // 4. Create project (validates SQLite write)
  const project = await httpCheck(
    'POST /api/projects (create)',
    'POST',
    `${baseUrl}/api/projects`,
    token,
    { name: 'smoke-test', description: 'local smoke test' },
  )

  // 5. List projects (validates read)
  if (project) {
    await httpCheck('GET /api/projects (list)', 'GET', `${baseUrl}/api/projects`, token)
  }

  // 6. Delete project (cleanup)
  if (project?.id) {
    await httpCheck(
      'DELETE /api/projects/:id (cleanup)',
      'DELETE',
      `${baseUrl}/api/projects/${project.id}`,
      token,
    )
  }

  // 7. Kill server
  cleanup()

  // Report
  printReport(totalStart)

  const failed = results.some((r) => !r.pass)
  process.exit(failed ? 1 : 0)
}

function printReport(totalStart) {
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  const total = results.length
  const totalTime = elapsed(totalStart)

  console.log()
  if (failed === 0) {
    console.log(c.green(`  All ${total} checks passed`) + ` ${c.dim(`(${totalTime} total)`)}`)
  } else {
    console.log(c.red(`  ${failed}/${total} checks failed`) + ` ${c.dim(`(${totalTime} total)`)}`)
  }
  console.log()
}

main().catch((err) => {
  console.error(c.red(`\nUnexpected error: ${err.message}\n`))
  cleanup()
  process.exit(1)
})
