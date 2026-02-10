import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { fork, type ChildProcess } from 'child_process'

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serverEntry = join(__dirname, '../../packages/server/src/index.ts')
    const child = fork(serverEntry, [], {
      env: { ...process.env, PORT: '0' },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverProcess = child

    child.on('message', (msg: any) => {
      if (msg?.type === 'ready' && msg.port) {
        serverPort = msg.port
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
      additionalArguments: [`--server-port=${serverPort}`],
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
    console.error('Failed to start agent server:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', async () => {
  await stopServer()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
