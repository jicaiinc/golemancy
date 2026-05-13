/**
 * Windows first-launch resource extraction.
 *
 * On Windows, runtime/ and server/ are shipped as a single .tar.gz archive
 * to avoid NSIS extracting ~20,000 files (Windows Defender scans each one).
 * This module detects the archive on first launch (or after update) and
 * extracts it with a progress UI.
 *
 * Extraction strategy:
 *   1. Prefer system tar.exe (fast, available since Windows 10 1803)
 *   2. Fall back to node-tar if system tar is unavailable
 */

import { app, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { access, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as tar from 'tar'
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

/** Check if system tar is available. */
async function isTarAvailable(): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('tar', ['--version'], (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
    return true
  } catch {
    return false
  }
}

/** Extract using system tar.exe (fast path). */
async function extractWithSystemTar(
  archivePath: string,
  resPath: string,
  totalFiles: number,
  onProgress?: (progress: ExtractProgress) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = execFile(
      'tar',
      ['xzf', archivePath, '-C', resPath, '-v'],
      { maxBuffer: 50 * 1024 * 1024 },
      (error) => {
        if (error) {
          logger.error({ err: error }, 'System tar extraction failed')
          reject(error)
        } else {
          resolve()
        }
      },
    )

    // Parse verbose output for progress
    let current = 0
    let buffer = ''
    const onChunk = (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      current += lines.length
      onProgress?.({ current, total: totalFiles })
    }
    // Listen to both stdout and stderr — Windows tar.exe outputs verbose to stderr
    proc.stdout?.on('data', onChunk)
    proc.stderr?.on('data', onChunk)
  })
}

/** Extract using node-tar (fallback when system tar is unavailable). */
async function extractWithNodeTar(
  archivePath: string,
  resPath: string,
  totalFiles: number,
  onProgress?: (progress: ExtractProgress) => void,
): Promise<void> {
  let current = 0
  await tar.extract({
    file: archivePath,
    cwd: resPath,
    onentry: () => {
      current++
      onProgress?.({ current, total: totalFiles })
    },
  })
}

/** Clean up partially extracted directories (best-effort). */
async function cleanupExtractedDirs(resPath: string): Promise<void> {
  for (const dir of ['runtime', 'server']) {
    try {
      await rm(join(resPath, dir), { recursive: true, force: true })
    } catch (err) {
      logger.warn({ err, dir }, 'Failed to clean up partially extracted directory')
    }
  }
}

/** Extract the resources archive. Prefers system tar, falls back to node-tar. */
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
    } catch {
      continue // Doesn't exist, skip
    }
    try {
      logger.info(`Removing old ${dir}/ for re-extraction`)
      await rm(dirPath, { recursive: true, force: true })
    } catch (err) {
      logger.error({ err, dir }, 'Failed to remove old directory before re-extraction')
      throw err
    }
  }

  // Detect system tar and extract
  const hasTar = await isTarAvailable()
  if (hasTar) {
    logger.info('Extracting resources archive with system tar...')
  } else {
    logger.warn('System tar not available, falling back to node-tar')
  }

  try {
    if (hasTar) {
      await extractWithSystemTar(archivePath, resPath, totalFiles, onProgress)
    } else {
      await extractWithNodeTar(archivePath, resPath, totalFiles, onProgress)
    }
  } catch (err) {
    logger.error({ err }, 'Resource extraction failed, cleaning up partial files')
    await cleanupExtractedDirs(resPath)
    throw err
  }

  // Write version marker (non-fatal — worst case it re-extracts next launch)
  try {
    await writeFile(join(resPath, VERSION_FILE), app.getVersion())
  } catch (err) {
    logger.warn({ err }, 'Failed to write version marker, extraction will re-run on next launch')
  }

  logger.info('Resource extraction complete')
}

// 48x48 app icon as base64 PNG (must match resources/build/icons/png/48x48.png)
const ICON_BASE64 = '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'

const SETUP_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Golemancy</title><link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet"></head>
<body style="margin:0; background:#0B0E14; color:#A0AEC0; font-family:'Courier New',monospace;
             display:flex; flex-direction:column; justify-content:center; align-items:center;
             height:100vh; user-select:none; -webkit-app-region:drag">
  <img src="data:image/png;base64,${ICON_BASE64}" width="48" height="48"
       style="margin-bottom:12px; image-rendering:pixelated" />
  <div style="font-size:14px; margin-bottom:20px; color:#4ADE80; letter-spacing:2px; font-family:'Press Start 2P',monospace">
    Golemancy
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
