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

const SETUP_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Golemancy</title></head>
<body style="margin:0; background:#0B0E14; color:#A0AEC0; font-family:'Courier New',monospace;
             display:flex; flex-direction:column; justify-content:center; align-items:center;
             height:100vh; user-select:none; -webkit-app-region:drag">
  <div style="font-size:15px; margin-bottom:24px; color:#E2E8F0">Setting up Golemancy...</div>
  <div style="width:300px; height:14px; background:#1A1F2E; border:2px solid #2D3748">
    <div id="bar" style="height:100%; background:#6C63FF; width:0%; transition:width 0.2s"></div>
  </div>
  <div id="pct" style="margin-top:12px; font-size:12px; color:#718096">0%</div>
  <script>
    const { ipcRenderer } = require('electron');
    ipcRenderer.on('setup:progress', (_, d) => {
      document.getElementById('bar').style.width = d.percent + '%';
      document.getElementById('pct').textContent = d.percent + '%';
    });
  </script>
</body>
</html>`

/** Create a small setup window showing extraction progress. */
export function createSetupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 200,
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
