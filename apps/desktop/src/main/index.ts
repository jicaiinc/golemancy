import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { fork, type ChildProcess } from 'child_process'
import { logger } from './logger'

const APP_VERSION = '0.1.0'

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null
let serverToken: string | null = null
let isQuitting = false

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // C5: Use correct path for dev vs production
    // app.getAppPath() → apps/desktop/ in dev, so ../../ reaches monorepo root.
    // GOLEMANCY_ROOT_DIR is set by E2E tests because app.getAppPath() returns
    // out/main/ when Playwright launches the built JS directly.
    const rootDir = process.env.GOLEMANCY_ROOT_DIR || join(app.getAppPath(), '../..')
    const serverEntry = app.isPackaged
      ? join(process.resourcesPath, 'server', 'index.js')
      : join(rootDir, 'packages/server/src/index.ts')
    const serverCwd = app.isPackaged
      ? join(process.resourcesPath, 'server')
      : join(rootDir, 'packages/server')
    const child = fork(serverEntry, [], {
      env: {
        ...process.env,
        PORT: '0',
        // Pass Electron resources path to server for bundled runtime resolution
        ...(app.isPackaged ? { GOLEMANCY_RESOURCES_PATH: process.resourcesPath } : {}),
      },
      // Dev: use system node (Electron's embedded Node has different ABI for native modules)
      // GOLEMANCY_FORK_EXEC_PATH allows E2E tests to pass an absolute node path
      // (GUI apps on macOS don't inherit shell PATH, so bare 'node' may fail).
      execPath: app.isPackaged ? process.execPath : (process.env.GOLEMANCY_FORK_EXEC_PATH || 'node'),
      execArgv: app.isPackaged ? [] : ['--import', 'tsx'],
      cwd: serverCwd,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverProcess = child

    const serverLog = logger.child({ component: 'server' })
    child.stderr?.on('data', (d: Buffer) => serverLog.error(d.toString().trimEnd()))
    child.stdout?.on('data', (d: Buffer) => serverLog.debug(d.toString().trimEnd()))

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

function getIconPath(): string {
  const rootDir = process.env.GOLEMANCY_ROOT_DIR || join(app.getAppPath(), '../..')
  return join(rootDir, 'apps/desktop/resources/build/icons/png/512x512.png')
}

function getAppIcon(): Electron.NativeImage {
  return nativeImage.createFromPath(getIconPath())
}

function showAbout(): void {
  const icon = getAppIcon()
  dialog.showMessageBox({
    type: 'none',
    icon: icon.isEmpty() ? undefined : icon,
    title: 'About Golemancy',
    message: 'Golemancy',
    detail: `Version ${APP_VERSION}\nAI Agent Orchestrator for Solo Creators`,
    buttons: ['OK'],
  })
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Golemancy',
      submenu: [
        { label: 'About Golemancy', click: showAbout },
        { type: 'separator' },
        { label: 'Hide Golemancy', role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Golemancy', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
      ],
    },
  ]

  // Add View menu in development mode only
  if (!app.isPackaged) {
    template.splice(2, 0, {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(options?: { projectId?: string }): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0B0E14',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      additionalArguments: [
        `--server-port=${serverPort}`,
        ...(serverToken ? [`--server-token=${serverToken}`] : []),
        ...(options?.projectId ? [`--project-id=${options.projectId}`] : []),
      ],
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.name = 'Golemancy'

app.whenReady().then(async () => {
  // Build custom menu (replaces default Electron menu, shows "Golemancy" in menu bar)
  buildAppMenu()

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    const icon = getAppIcon()
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  try {
    await startServer()
    logger.info({ port: serverPort }, 'agent server ready')
  } catch (err) {
    // W5: Show dialog on server startup failure
    logger.error({ err }, 'failed to start agent server')
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the agent server:\n${err instanceof Error ? err.message : String(err)}`,
    )
    app.quit()
    return
  }

  createWindow()

  ipcMain.handle('window:open', (_event, projectId?: string) => {
    createWindow(projectId ? { projectId } : undefined)
  })

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
