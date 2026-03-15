/**
 * Windows first-launch resource extraction.
 *
 * On Windows, runtime/ and server/ are shipped as a single .tar.gz archive
 * to avoid NSIS extracting ~20,000 files (Windows Defender scans each one).
 * This module detects the archive on first launch (or after update) and
 * extracts it with a progress UI.
 */

import { app, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger'

const ARCHIVE_NAME = 'resources-archive.tar.gz'
const META_NAME = 'resources-archive.json'
const VERSION_FILE = 'resources-extracted-version.txt'

function getResourcesPath(): string {
  return process.resourcesPath
}

/** Check if we need to extract resources (Windows archive mode only). */
export async function needsResourceExtraction(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  if (!app.isPackaged) return false

  const resPath = getResourcesPath()
  const archivePath = join(resPath, ARCHIVE_NAME)

  // No archive → standard build (not archive mode), skip
  try {
    await access(archivePath)
  } catch {
    return false
  }

  // Archive exists — check if already extracted for this version
  const versionPath = join(resPath, VERSION_FILE)
  try {
    const extracted = await readFile(versionPath, 'utf8')
    if (extracted.trim() === app.getVersion()) return false
  } catch {
    // Version file missing → first install
  }

  return true
}

interface ExtractProgress {
  current: number
  total: number
}

/** Extract the resources archive using Windows built-in tar.exe. */
export async function extractResources(
  onProgress?: (progress: ExtractProgress) => void,
): Promise<void> {
  const resPath = getResourcesPath()
  const archivePath = join(resPath, ARCHIVE_NAME)
  const metaPath = join(resPath, META_NAME)

  // Read metadata for progress tracking
  let totalFiles = 0
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    totalFiles = meta.totalFiles || 0
  } catch {
    logger.warn('Could not read archive metadata, progress will be estimated')
  }

  // Clean up previous extraction (update scenario)
  for (const dir of ['runtime', 'server']) {
    const dirPath = join(resPath, dir)
    try {
      await access(dirPath)
      logger.info(`Removing old ${dir}/ for re-extraction`)
      await rm(dirPath, { recursive: true, force: true })
    } catch {
      // Doesn't exist, fine
    }
  }

  // Extract using Windows built-in tar.exe (available since Windows 10 1803)
  logger.info('Extracting resources archive...')
  await new Promise<void>((resolve, reject) => {
    const proc = execFile(
      'tar',
      ['xzf', archivePath, '-C', resPath, '-v'],
      { maxBuffer: 50 * 1024 * 1024 },
      (error) => {
        if (error) reject(error)
        else resolve()
      },
    )

    // Parse verbose output for progress
    let current = 0
    let buffer = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      current += lines.length
      onProgress?.({ current, total: totalFiles })
    })
  })

  // Write version marker
  await writeFile(join(resPath, VERSION_FILE), app.getVersion())

  logger.info('Resource extraction complete')
}

// 48x48 app icon as base64 PNG
const ICON_BASE64 =
  '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'

const SETUP_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Golemancy</title></head>
<body style="margin:0; background:#0B0E14; color:#A0AEC0; font-family:'Courier New',monospace;
             display:flex; flex-direction:column; justify-content:center; align-items:center;
             height:100vh; user-select:none; -webkit-app-region:drag">
  <img src="data:image/png;base64,${ICON_BASE64}" width="48" height="48"
       style="margin-bottom:12px; image-rendering:pixelated" />
  <div style="font-size:18px; margin-bottom:20px; color:#E2E8F0; letter-spacing:2px">
    GOLEMANCY
  </div>
  <div id="status" style="font-size:13px; margin-bottom:16px; color:#8B95A5">Preparing...</div>
  <div style="width:300px; height:14px; background:#1A1F2E; border:2px solid #2D3748">
    <div id="bar" style="height:100%; background:#6C63FF; width:0%; transition:width 0.3s"></div>
  </div>
  <div id="pct" style="margin-top:12px; font-size:12px; color:#718096">0%</div>
  <script>
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('setup:progress', (_, d) => {
      document.getElementById('bar').style.width = d.percent + '%';
      document.getElementById('pct').textContent = d.percent + '%';
    });
    ipcRenderer.on('setup:status', (_, d) => {
      document.getElementById('status').textContent = d.text;
    });
  </script>
</body>
</html>`

/** Create a small setup window showing extraction progress. */
export function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: '#0B0E14',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(SETUP_HTML))
  return win
}
