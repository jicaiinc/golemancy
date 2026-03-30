import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, systemPreferences } from 'electron'
import { join, resolve, sep } from 'path'
import { homedir } from 'os'
import { fork, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { logger } from './logger'
import { needsResourceExtraction, extractResources, createSetupWindow } from './setup'
import { initAutoUpdater, getUpdateState, checkForUpdatesNow, quitAndInstall, openReleaseUrl } from './updater'
import { initSentry, setTelemetryEnabled, getSentryEnvForServer, serverBreadcrumb, flushSentry, setServerStartupContext } from './sentry'
import * as Sentry from '@sentry/electron/main'

initSentry()

// Monitor-only: logs without suppressing default crash-and-exit behavior
// try/catch guards prevent snowball when pino's worker thread is dead (GOLEMANCY-8)
process.on('uncaughtExceptionMonitor', (error) => {
  try { logger.fatal({ err: error }, 'uncaught exception in main process') } catch {}
  try { logger.flush() } catch {}
})

// Intentionally intercepts to keep the Electron window alive for the user.
// Unlike uncaughtExceptionMonitor, there is no "monitor" variant for rejections.
process.on('unhandledRejection', (reason) => {
  try { logger.fatal({ err: reason }, 'unhandled rejection in main process') } catch {}
  try { logger.flush() } catch {}
})

const APP_VERSION: string = JSON.parse(
  readFileSync(
    app.isPackaged
      ? join(app.getAppPath(), 'package.json')
      : join(process.env.GOLEMANCY_ROOT_DIR || join(app.getAppPath(), '../..'), 'apps/desktop/package.json'),
    'utf-8',
  ),
).version

let serverProcess: ChildProcess | null = null
let serverPort: number | null = null
let serverToken: string | null = null
let isQuitting = false

// Circular buffer for server child process stderr (last 4KB)
let serverStderr = ''
const STDERR_MAX = 4096
function appendStderr(chunk: string): void {
  serverStderr += chunk
  if (serverStderr.length > STDERR_MAX) serverStderr = serverStderr.slice(-STDERR_MAX)
}

function detectDevResourcesPath(rootDir: string): Record<string, string> {
  const resourcesDir = join(rootDir, 'apps/desktop/resources')
  const runtimeDir = join(resourcesDir, 'runtime')
  try {
    if (existsSync(runtimeDir)) {
      return { GOLEMANCY_RESOURCES_PATH: resourcesDir }
    }
  } catch {}
  return {}
}

function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    // C5: Use correct path for dev vs production
    // app.getAppPath() → apps/desktop/ in dev, so ../../ reaches monorepo root.
    // GOLEMANCY_ROOT_DIR is set by E2E tests because app.getAppPath() returns
    // out/main/ when Playwright launches the built JS directly.
    const rootDir = process.env.GOLEMANCY_ROOT_DIR || join(app.getAppPath(), '../..')
    const serverEntry = app.isPackaged
      ? join(process.resourcesPath, 'server', 'deps', 'index.js')
      : join(rootDir, 'packages/server/src/index.ts')
    const serverCwd = app.isPackaged
      ? join(process.resourcesPath, 'server')
      : join(rootDir, 'packages/server')
    // Dev: use system node (Electron's embedded Node has different ABI for native modules)
    // GOLEMANCY_FORK_EXEC_PATH allows E2E tests to pass an absolute node path
    // (GUI apps on macOS don't inherit shell PATH, so bare 'node' may fail).
    const execPathResolved = app.isPackaged
      ? join(process.resourcesPath, 'runtime', 'node',
          ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node']))
      : (process.env.GOLEMANCY_FORK_EXEC_PATH || 'node')

    // Pre-flight: record all resolved paths and their existence
    serverBreadcrumb('pre-flight', {
      serverEntryExists: existsSync(serverEntry),
      serverCwdExists: existsSync(serverCwd),
      execPathExists: execPathResolved === 'node' ? 'system' : existsSync(execPathResolved),
      serverEntryTail: serverEntry.split(sep).slice(-3).join(sep),
      execPathTail: execPathResolved === 'node' ? 'node' : execPathResolved.split(sep).slice(-3).join(sep),
      isPackaged: app.isPackaged,
      platform: process.platform,
    })

    const child = fork(serverEntry, [], {
      env: {
        ...process.env,
        PORT: '0',
        // Pass Electron resources path to server for bundled runtime resolution.
        // NODE_ENV=production disables pino-pretty (dev-only transport) to prevent crash.
        ...(app.isPackaged ? {
          GOLEMANCY_RESOURCES_PATH: process.resourcesPath,
          NODE_ENV: 'production',
        } : {
          ...detectDevResourcesPath(rootDir),
        }),
        // Pass Sentry config to server process
        ...getSentryEnvForServer(),
      },
      execPath: execPathResolved,
      execArgv: app.isPackaged ? [] : ['--import', 'tsx'],
      cwd: serverCwd,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    serverProcess = child
    serverStderr = ''

    const serverLog = logger.child({ component: 'server' })
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString().trimEnd()
      serverLog.error(text)
      appendStderr(text)
    })
    child.stdout?.on('data', (d: Buffer) => serverLog.debug(d.toString().trimEnd()))

    child.on('spawn', () => {
      serverBreadcrumb('spawned', { pid: child.pid })
    })

    child.on('message', (msg: any) => {
      if (msg?.type === 'ready' && msg.port) {
        serverBreadcrumb('ready', { port: msg.port, pid: child.pid })
        serverPort = msg.port
        serverToken = msg.token ?? null
        resolve(msg.port)
      } else if (msg?.type === 'startup-progress') {
        serverBreadcrumb(`progress: ${msg.phase}`, { phase: msg.phase, elapsedMs: msg.elapsedMs })
      } else if (msg?.type === 'startup-error') {
        serverBreadcrumb('startup-error IPC', {
          message: msg.message,
          stack: typeof msg.stack === 'string' ? msg.stack.slice(0, 512) : undefined,
        }, 'error')
      } else if (msg?.type === 'open-path' && msg.path && msg.requestId) {
        handleOpenPathIPC(child, msg.path, msg.requestId)
      }
    })

    child.on('error', (err) => {
      const e = err as NodeJS.ErrnoException
      serverBreadcrumb('error', {
        message: e.message, code: e.code, errno: e.errno, syscall: e.syscall, path: e.path,
      }, 'error')
      reject(err)
    })

    child.on('disconnect', () => {
      serverBreadcrumb('IPC disconnected', undefined, 'warning')
    })

    child.on('close', (code, signal) => {
      serverBreadcrumb('close', { code, signal }, code === 0 ? 'info' : 'error')
    })

    child.on('exit', (code, signal) => {
      serverBreadcrumb('exit', {
        code, signal, stderrTail: serverStderr.slice(-1024) || '(empty)',
      }, code === 0 ? 'info' : 'error')

      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`))
      } else if (code === null && signal) {
        reject(new Error(`Server killed by signal ${signal}`))
      }
    })

    setTimeout(() => {
      serverBreadcrumb('timeout', {
        pid: child.pid, killed: child.killed, exitCode: child.exitCode,
        signalCode: child.signalCode, connected: child.connected,
        stderrTail: serverStderr.slice(-1024) || '(empty)',
      }, 'error')
      reject(new Error('Server startup timeout'))
    }, 60000)
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

function handleOpenPathIPC(child: ChildProcess, filePath: string, requestId: string): void {
  const resolved = resolve(filePath)
  shell.openPath(resolved).then(error => {
    child.send?.({ type: 'open-path-result', requestId, error })
  }).catch(err => {
    child.send?.({ type: 'open-path-result', requestId, error: err instanceof Error ? err.message : String(err) })
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
    detail: `Version ${APP_VERSION}\nSummon an AI Team to Work for You`,
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
        {
          label: 'Settings…',
          accelerator: 'CommandOrControl+,',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu:open-settings')
          },
        },
        { type: 'separator' },
        { label: 'Hide Golemancy', role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Golemancy', role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CommandOrControl+N',
          click: () => createWindow({ action: 'create' }),
        },
        {
          label: 'New Window',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => createWindow(),
        },
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

  // View menu: fullscreen always available; dev tools only in development
  const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
    { role: 'togglefullscreen' },
  ]
  if (!app.isPackaged) {
    viewSubmenu.unshift(
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    )
  }
  template.splice(2, 0, { label: 'View', submenu: viewSubmenu })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function queryActiveChatCount(): Promise<number> {
  if (!serverPort || !serverToken) return 0
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/active-chats/count`, {
      headers: { Authorization: `Bearer ${serverToken}` },
    })
    if (!res.ok) return 0
    const data = await res.json() as { count: number }
    return data.count
  } catch {
    return 0
  }
}

function createWindow(options?: { projectId?: string; action?: 'create' }): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 640,
    backgroundColor: '#0B0E14',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      additionalArguments: [
        `--server-port=${serverPort}`,
        ...(serverToken ? [`--server-token=${serverToken}`] : []),
        `--app-version=${APP_VERSION}`,
      ],
    },
  })

  // SEC: Inject Bearer token for <img src> requests to upload endpoints.
  // Browser <img> tags cannot set Authorization headers, so we intercept
  // matching requests in the Electron session and add the header automatically.
  // Match both localhost and 127.0.0.1 since the client may use either hostname.
  if (serverToken && serverPort) {
    win.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: [
        `http://127.0.0.1:${serverPort}/api/projects/*/uploads/*`,
        `http://localhost:${serverPort}/api/projects/*/uploads/*`,
        `http://127.0.0.1:${serverPort}/api/speech/audio/*`,
        `http://localhost:${serverPort}/api/speech/audio/*`,
      ] },
      (details, callback) => {
        details.requestHeaders['Authorization'] = `Bearer ${serverToken}`
        callback({ requestHeaders: details.requestHeaders })
      },
    )
  }

  // Redirect all target="_blank" navigations to system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const hash = options?.projectId
    ? `/projects/${options.projectId}`
    : options?.action === 'create'
      ? '/?create=true'
      : undefined

  if (process.env['ELECTRON_RENDERER_URL']) {
    const url = hash
      ? `${process.env['ELECTRON_RENDERER_URL']}#${hash}`
      : process.env['ELECTRON_RENDERER_URL']
    win.loadURL(url)
  } else {
    win.loadFile(
      join(__dirname, '../renderer/index.html'),
      hash ? { hash } : undefined,
    )
  }

  // Send cached update state to new windows after page loads
  win.webContents.once('did-finish-load', () => {
    const updateState = getUpdateState()
    if (updateState.status !== 'idle') {
      win.webContents.send('update:state', updateState)
    }
  })
}

app.name = 'Golemancy'

app.whenReady().then(async () => {
  logger.info({
    version: APP_VERSION,
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
  }, 'Golemancy starting')

  // Build custom menu (replaces default Electron menu, shows "Golemancy" in menu bar)
  buildAppMenu()

  // Set dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    const icon = getAppIcon()
    if (!icon.isEmpty()) app.dock.setIcon(icon)
  }

  // Windows archive mode: extract runtime/ + server/ on first launch or update.
  // The setup window stays open through the entire first-launch flow (extraction +
  // server startup) so the user always sees progress — closing it only once the
  // main window is about to appear.
  let needsSetup = false
  try {
    needsSetup = await needsResourceExtraction()
  } catch (err) {
    logger.error({ err }, 'Failed to check resource extraction status')
  }
  let setupWin: BrowserWindow | null = null

  if (needsSetup) {
    logger.info('First launch detected — extracting resources archive')
    setupWin = createSetupWindow()

    // Phase 1: Extracting resources (0–90%)
    setupWin.webContents.send('setup:status', { text: 'Extracting resources...' })
    try {
      await extractResources((progress) => {
        const ESTIMATED_FILES = 20000
        const total = progress.total > 0 ? progress.total : ESTIMATED_FILES
        const percent = Math.min(90, Math.round((progress.current / total) * 90))
        setupWin!.webContents.send('setup:progress', { percent })
      })
      logger.info('Resources extracted, starting server')
    } catch (err) {
      if (setupWin) setupWin.close()
      setupWin = null
      logger.error({ err }, 'Failed to extract resources archive')
      Sentry.captureException(err, { extra: { phase: 'resource-extraction' } })
      await flushSentry()
      dialog.showErrorBox(
        'Extraction Error',
        `Failed to extract application resources:\n${err instanceof Error ? err.message : String(err)}`,
      )
      app.quit()
      return
    }

    // Phase 2: Starting server (90–95%)
    setupWin.webContents.send('setup:progress', { percent: 90 })
    setupWin.webContents.send('setup:status', { text: 'Starting server...' })
  }

  try {
    // Start a slow progress animation during server startup (90→99%)
    let serverProgressTimer: ReturnType<typeof setInterval> | null = null
    if (setupWin) {
      let serverPercent = 90
      serverProgressTimer = setInterval(() => {
        if (serverPercent < 99) {
          serverPercent++
          setupWin!.webContents.send('setup:progress', { percent: serverPercent })
        }
      }, 2000)
    }

    await startServer()
    logger.info({ port: serverPort }, 'agent server ready')

    // Monitor server process after successful startup
    if (serverProcess) {
      serverProcess.on('exit', (code, signal) => {
        if (!isQuitting) {
          logger.error({ code, signal }, 'server process exited unexpectedly')
          setServerStartupContext({
            code, signal,
            stderrTail: serverStderr.slice(-2048) || '(empty)',
            serverPid: serverProcess?.pid ?? null,
          })
          Sentry.captureMessage('Server process exited unexpectedly', {
            level: 'fatal',
            extra: { code, signal, stderrTail: serverStderr.slice(-1024) },
          })
          flushSentry().catch(() => {})
        }
        serverProcess = null
      })
    }

    if (serverProgressTimer) clearInterval(serverProgressTimer)
  } catch (err) {
    if (setupWin) setupWin.close()
    logger.error({ err }, 'failed to start agent server')
    setServerStartupContext({
      platform: process.platform, arch: process.arch, isPackaged: app.isPackaged,
      nodeVersion: process.versions.node, electronVersion: process.versions.electron,
      stderrTail: serverStderr.slice(-2048) || '(empty)',
      serverPid: serverProcess?.pid ?? null, serverExitCode: serverProcess?.exitCode ?? null,
      serverSignalCode: serverProcess?.signalCode ?? null,
      serverConnected: serverProcess?.connected ?? null, serverKilled: serverProcess?.killed ?? null,
    })
    Sentry.captureException(err, { extra: { phase: 'server-startup' } })
    await flushSentry()
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the agent server:\n${err instanceof Error ? err.message : String(err)}`,
    )
    app.quit()
    return
  }

  // Phase 3: Done — close setup window, show main window
  if (setupWin) {
    setupWin.webContents.send('setup:progress', { percent: 100 })
    setupWin.webContents.send('setup:status', { text: 'Almost ready...' })
    // Brief pause so the user sees 100% before the window switches
    await new Promise((r) => setTimeout(r, 500))
    setupWin.close()
  }

  createWindow()

  // Auto-updater (packaged builds, or dev mock with GOLEMANCY_DEV_UPDATE_CHECK=1)
  initAutoUpdater()

  ipcMain.handle('update:open-release', (_event, version: string) => {
    openReleaseUrl(version)
  })
  ipcMain.handle('update:check-now', () => {
    checkForUpdatesNow()
  })
  ipcMain.handle('update:restart-and-install', async () => {
    const count = await queryActiveChatCount()
    if (count > 0) return { blocked: true, activeChatCount: count }
    quitAndInstall()
    return { blocked: false, activeChatCount: 0 }
  })
  ipcMain.handle('update:force-restart', () => {
    quitAndInstall()
  })

  ipcMain.handle('window:open', (_event, projectId?: string) => {
    createWindow(projectId ? { projectId } : undefined)
  })

  ipcMain.handle('media:requestMicrophoneAccess', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status === 'granted') return 'granted'
      if (status === 'denied') return 'denied'
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return granted ? 'granted' : 'denied'
    }
    return 'granted'
  })

  ipcMain.handle('shell:openPath', async (_event, fullPath: string) => {
    // Security: only allow opening files under the golemancy data directory
    const dataDir = join(homedir(), '.golemancy')
    const resolved = resolve(fullPath)
    if (!resolved.startsWith(dataDir + sep) && resolved !== dataDir) {
      throw new Error('Cannot open paths outside data directory')
    }
    return shell.openPath(resolved)
  })

  ipcMain.on('renderer:error', (_event, payload) => {
    logger.error({ rendererError: payload }, 'renderer error')
  })

  ipcMain.on('telemetry:set', (_event, enabled: boolean) => {
    setTelemetryEnabled(enabled)
    // Forward to server process so its Sentry respects the toggle too
    serverProcess?.send?.({ type: 'telemetry-toggle', enabled })
  })

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    // Security: only allow https URLs (OAuth endpoints, etc.)
    if (!url.startsWith('https://')) {
      throw new Error('Only HTTPS URLs are allowed')
    }
    await shell.openExternal(url)
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
  stopServer().then(() => {
    logger.flush()
    app.quit()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('render-process-gone', (_event, _webContents, details) => {
  logger.error({ reason: details.reason, exitCode: details.exitCode }, 'renderer process gone')
  if (!isQuitting && details.reason !== 'clean-exit') {
    Sentry.captureMessage('Renderer process gone', {
      level: 'error',
      extra: { reason: details.reason, exitCode: details.exitCode },
    })
  }
})

app.on('child-process-gone', (_event, details) => {
  logger.error({ type: details.type, reason: details.reason, exitCode: details.exitCode }, 'child process gone')
  if (!isQuitting && details.reason !== 'clean-exit') {
    Sentry.captureMessage('Child process gone', {
      level: 'error',
      extra: { type: details.type, reason: details.reason, exitCode: details.exitCode },
    })
  }
})
