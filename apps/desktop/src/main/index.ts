import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { fork, type ChildProcess } from 'child_process'

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null
let serverToken: string | null = null
let isQuitting = false

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // C5: Use correct path for dev vs production
    // app.getAppPath() → apps/desktop/ in dev, so ../../ reaches monorepo root
    const serverEntry = app.isPackaged
      ? join(process.resourcesPath, 'server', 'index.js')
      : join(app.getAppPath(), '../../packages/server/src/index.ts')
    const serverCwd = app.isPackaged
      ? join(process.resourcesPath, 'server')
      : join(app.getAppPath(), '../../packages/server')
    const child = fork(serverEntry, [], {
      env: { ...process.env, PORT: '0' },
      // Dev: use system node (Electron's embedded Node has different ABI for native modules)
      execPath: app.isPackaged ? process.execPath : 'node',
      execArgv: app.isPackaged ? [] : ['--import', 'tsx'],
      cwd: serverCwd,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverProcess = child

    child.stderr?.on('data', (d: Buffer) => console.error('[server]', d.toString()))
    child.stdout?.on('data', (d: Buffer) => console.log('[server]', d.toString()))

    child.on('message', (msg: any) => {
      if (msg?.type === 'ready' && msg.port) {
        serverPort = msg.port
        serverToken = msg.token ?? null
        resolve(msg.port)
      }
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`))
      }
    })

    setTimeout(() => reject(new Error('Server startup timeout')), 15000)
  })
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverProcess) { resolve(); return }

    serverProcess.once('exit', () => {
      serverProcess = null
      resolve()
    })

    serverProcess.kill('SIGTERM')
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL')
        serverProcess = null
        resolve()
      }
    }, 5000)
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0B0E14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      additionalArguments: [
        `--server-port=${serverPort}`,
        ...(serverToken ? [`--server-token=${serverToken}`] : []),
      ],
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    await startServer()
    console.log(`Agent server ready on port ${serverPort}`)
  } catch (err) {
    // W5: Show dialog on server startup failure
    console.error('Failed to start agent server:', err)
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the agent server:\n${err instanceof Error ? err.message : String(err)}`,
    )
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// W6: Fix async before-quit — prevent default, await cleanup, then quit
app.on('before-quit', (e) => {
  if (isQuitting) return
  isQuitting = true
  e.preventDefault()
  stopServer().then(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
