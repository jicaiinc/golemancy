# Architecture: Workspace File Browser (replacing Artifacts)

> Date: 2026-02-19
> Status: Draft
> Requirement: `_requirement/20260219-1500-workspace-file-browser.md`

## Overview

Replace the dead-code Artifacts system with a Workspace File Browser that directly browses `~/.golemancy/projects/{id}/workspace/` via filesystem APIs. Left panel = collapsible directory tree; right panel = file preview (tier 1 inline, tier 2 meta+actions).

---

## 1. New Types (`packages/shared/src/types/workspace.ts`)

```typescript
// No branded ID needed — workspace entries are identified by their relative path string.
// This is a filesystem browser, not a CRUD entity store.

/** Category derived from file extension */
export type FileCategory =
  | 'code'      // .py .js .ts .jsx .tsx .json .yaml .yml .xml .html .css .sh .bash .zsh .toml .ini .env .sql .go .rs .c .cpp .h .java .rb .php .lua .r .swift .kt
  | 'text'      // .txt .md .log .rst .csv .tsv
  | 'image'     // .png .jpg .jpeg .gif .svg .webp .ico .bmp
  | 'document'  // .pdf .doc .docx .xls .xlsx .ppt .pptx .odt .ods .odp
  | 'archive'   // .zip .tar .gz .bz2 .7z .rar .tgz
  | 'audio'     // .mp3 .wav .ogg .flac .aac .m4a
  | 'video'     // .mp4 .mkv .avi .mov .webm
  | 'binary'    // everything else

/** A single entry in the workspace directory tree */
export interface WorkspaceEntry {
  /** Relative path from workspace root, using '/' as separator (cross-platform) */
  name: string
  /** Absolute path on the server filesystem (only used server-side, not sent to client) */
  // (not exposed to client)
  /** 'file' or 'directory' */
  type: 'file' | 'directory'
  /** File size in bytes (0 for directories) */
  size: number
  /** ISO 8601 modified timestamp */
  modifiedAt: string
  /** File category based on extension (only for files) */
  category?: FileCategory
  /** Nested children (only for directories, only populated when expanded) */
  children?: WorkspaceEntry[]
}

/** Preview data returned when reading a file */
export interface FilePreviewData {
  /** Relative path from workspace root */
  path: string
  /** File category */
  category: FileCategory
  /** File size in bytes */
  size: number
  /** ISO 8601 modified timestamp */
  modifiedAt: string
  /** Text content for tier-1 files (code/text/csv). null for tier-2. */
  content: string | null
  /** Parsed CSV rows for .csv/.tsv files (first 200 rows max) */
  csvRows?: string[][]
  /** Image URL (relative API path) for image files */
  imageUrl?: string | null
  /** MIME type when determinable */
  mimeType: string
  /** File extension (lowercase, without dot) */
  extension: string
}
```

### File Extension → Category Map (`packages/shared/src/lib/file-categories.ts`)

```typescript
const EXT_TO_CATEGORY: Record<string, FileCategory> = {
  // code
  py: 'code', js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  json: 'code', yaml: 'code', yml: 'code', xml: 'code', html: 'code',
  css: 'code', scss: 'code', less: 'code', sh: 'code', bash: 'code',
  zsh: 'code', toml: 'code', ini: 'code', env: 'code', sql: 'code',
  go: 'code', rs: 'code', c: 'code', cpp: 'code', h: 'code',
  java: 'code', rb: 'code', php: 'code', lua: 'code', r: 'code',
  swift: 'code', kt: 'code', vue: 'code', svelte: 'code',
  // text
  txt: 'text', md: 'text', log: 'text', rst: 'text',
  // csv/tsv (subcategory of text but useful to distinguish)
  csv: 'text', tsv: 'text',
  // image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  svg: 'image', webp: 'image', ico: 'image', bmp: 'image',
  // document
  pdf: 'document', doc: 'document', docx: 'document',
  xls: 'document', xlsx: 'document', ppt: 'document', pptx: 'document',
  odt: 'document', ods: 'document', odp: 'document',
  // archive
  zip: 'archive', tar: 'archive', gz: 'archive', bz2: 'archive',
  '7z': 'archive', rar: 'archive', tgz: 'archive',
  // audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
  aac: 'audio', m4a: 'audio',
  // video
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video',
}

export function getFileCategory(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_CATEGORY[ext] ?? 'binary'
}

/** Whether this category supports inline text preview (tier 1) */
export function isTier1(category: FileCategory): boolean {
  return category === 'code' || category === 'text' || category === 'image'
}

/** Get MIME type from extension (best-effort, no library) */
const EXT_TO_MIME: Record<string, string> = {
  // text/code
  txt: 'text/plain', md: 'text/markdown', log: 'text/plain',
  csv: 'text/csv', tsv: 'text/tab-separated-values',
  json: 'application/json', xml: 'application/xml', html: 'text/html',
  css: 'text/css', js: 'text/javascript', ts: 'text/typescript',
  py: 'text/x-python', sh: 'text/x-shellscript', yaml: 'text/yaml', yml: 'text/yaml',
  // images
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
  // documents
  pdf: 'application/pdf',
  // archives
  zip: 'application/zip', gz: 'application/gzip',
  // audio/video
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}
```

> **Note:** This file lives in `packages/shared/src/lib/file-categories.ts` and is used by both server and UI. Export from `packages/shared/src/index.ts`.

---

## 2. Service Interface (`packages/shared/src/services/interfaces.ts`)

### Remove: `IArtifactService`

### Add: `IWorkspaceService`

```typescript
import type { ProjectId, WorkspaceEntry, FilePreviewData } from '../types'

export interface IWorkspaceService {
  /** List entries in a directory. `dirPath` is relative to workspace root. Empty string = root. */
  listDir(projectId: ProjectId, dirPath: string): Promise<WorkspaceEntry[]>

  /** Read a file for preview. Returns text content for tier-1, meta-only for tier-2. */
  readFile(projectId: ProjectId, filePath: string): Promise<FilePreviewData>

  /** Delete a file or empty directory. `filePath` is relative to workspace root. */
  deleteFile(projectId: ProjectId, filePath: string): Promise<void>

  /** Get the full URL to download/serve a workspace file (for images, downloads). */
  getFileUrl(projectId: ProjectId, filePath: string): string
}
```

### Update `ServiceContainer` (and all related imports)

Replace `artifacts: IArtifactService` → `workspace: IWorkspaceService` everywhere.

---

## 3. Server Routes (`packages/server/src/routes/workspace.ts`)

### Remove: `packages/server/src/routes/artifacts.ts`

### New route file: `packages/server/src/routes/workspace.ts`

Registered in `app.ts` as:
```typescript
app.route('/api/projects/:projectId/workspace', createWorkspaceRoutes())
```

No storage dependency injection needed — workspace routes use `fs` directly with path utilities.

```typescript
import { Hono } from 'hono'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProjectId } from '@golemancy/shared'
import { getFileCategory, getMimeType } from '@golemancy/shared'
import { getProjectPath, validateFilePath } from '../utils/paths'
import { isNodeError } from '../storage/base'
import { logger } from '../logger'

const log = logger.child({ component: 'routes:workspace' })

const MAX_TEXT_PREVIEW_SIZE = 512 * 1024  // 512 KB — don't load huge text files
const MAX_CSV_ROWS = 200

function getWorkspacePath(projectId: string): string {
  return path.join(getProjectPath(projectId), 'workspace')
}

export function createWorkspaceRoutes() {
  const app = new Hono()

  // GET / — List directory entries
  // Query: ?path=subdir/nested (relative to workspace root, default "")
  app.get('/', async (c) => {
    const projectId = c.req.param('projectId') as string
    const dirPath = c.req.query('path') ?? ''
    const wsRoot = getWorkspacePath(projectId)

    // Ensure workspace directory exists
    await fs.mkdir(wsRoot, { recursive: true })

    const targetDir = validateFilePath(wsRoot, dirPath || '.')
    log.debug({ projectId, dirPath, targetDir }, 'listing workspace directory')

    try {
      const entries = await fs.readdir(targetDir, { withFileTypes: true })
      const result: WorkspaceEntry[] = []

      for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) continue

        const fullPath = path.join(targetDir, entry.name)
        const relativePath = path.relative(wsRoot, fullPath).split(path.sep).join('/')

        if (entry.isDirectory()) {
          result.push({
            name: relativePath,
            type: 'directory',
            size: 0,
            modifiedAt: (await fs.stat(fullPath)).mtime.toISOString(),
          })
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath)
          result.push({
            name: relativePath,
            type: 'file',
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            category: getFileCategory(entry.name),
          })
        }
      }

      // Sort: directories first, then alphabetical
      result.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      return c.json(result)
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json([])
      throw e
    }
  })

  // GET /file — Read file for preview
  // Query: ?path=subdir/file.txt
  app.get('/file', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path query param required' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    log.debug({ projectId, filePath }, 'reading workspace file')

    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) return c.json({ error: 'Not a file' }, 400)

      const filename = path.basename(filePath)
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      const category = getFileCategory(filename)
      const mimeType = getMimeType(filename)

      const base: Omit<FilePreviewData, 'content'> = {
        path: filePath,
        category,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        mimeType,
        extension: ext,
      }

      // Tier 1: code/text → read text content
      if (category === 'code' || category === 'text') {
        if (stat.size > MAX_TEXT_PREVIEW_SIZE) {
          // Too large — return truncated
          const fd = await fs.open(fullPath, 'r')
          const buf = Buffer.alloc(MAX_TEXT_PREVIEW_SIZE)
          await fd.read(buf, 0, MAX_TEXT_PREVIEW_SIZE, 0)
          await fd.close()
          const textContent = buf.toString('utf-8') + '\n\n... (truncated, file too large for preview)'

          const result: FilePreviewData = { ...base, content: textContent }

          // CSV/TSV parsing for truncated doesn't make sense
          return c.json(result)
        }

        const textContent = await fs.readFile(fullPath, 'utf-8')
        const result: FilePreviewData = { ...base, content: textContent }

        // Parse CSV/TSV
        if (ext === 'csv' || ext === 'tsv') {
          const separator = ext === 'tsv' ? '\t' : ','
          const rows = textContent.split('\n')
            .slice(0, MAX_CSV_ROWS)
            .map(row => row.split(separator))
          result.csvRows = rows
        }

        return c.json(result)
      }

      // Tier 1: image → return imageUrl (client will fetch via /raw endpoint)
      if (category === 'image') {
        const imageUrl = `/api/projects/${projectId}/workspace/raw?path=${encodeURIComponent(filePath)}`
        return c.json({ ...base, content: null, imageUrl } satisfies FilePreviewData)
      }

      // Tier 2: everything else — meta only
      return c.json({ ...base, content: null } satisfies FilePreviewData)

    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'File not found' }, 404)
      throw e
    }
  })

  // GET /raw — Serve raw file bytes (for images, downloads)
  // Query: ?path=subdir/image.png
  app.get('/raw', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path query param required' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    try {
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) return c.json({ error: 'Not a file' }, 400)

      const buffer = await fs.readFile(fullPath)
      const mimeType = getMimeType(path.basename(filePath))

      c.header('Content-Type', mimeType)
      c.header('Content-Length', String(buffer.length))
      c.header('X-Content-Type-Options', 'nosniff')

      return c.body(new Uint8Array(buffer))
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'File not found' }, 404)
      throw e
    }
  })

  // DELETE /file — Delete a file
  // Query: ?path=subdir/file.txt
  app.delete('/file', async (c) => {
    const projectId = c.req.param('projectId') as string
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path query param required' }, 400)

    const wsRoot = getWorkspacePath(projectId)
    const fullPath = validateFilePath(wsRoot, filePath)

    log.debug({ projectId, filePath }, 'deleting workspace file')

    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) {
        // Only delete empty directories
        const entries = await fs.readdir(fullPath)
        if (entries.length > 0) {
          return c.json({ error: 'Directory is not empty' }, 400)
        }
        await fs.rmdir(fullPath)
      } else {
        await fs.unlink(fullPath)
      }
      return c.json({ ok: true })
    } catch (e) {
      if (isNodeError(e) && e.code === 'ENOENT') return c.json({ error: 'File not found' }, 404)
      throw e
    }
  })

  return app
}
```

### Endpoints Summary

| Method | Path | Query | Description |
|--------|------|-------|-------------|
| `GET` | `/api/projects/:projectId/workspace` | `?path=subdir` | List directory entries |
| `GET` | `/api/projects/:projectId/workspace/file` | `?path=file.txt` | Read file preview data |
| `GET` | `/api/projects/:projectId/workspace/raw` | `?path=img.png` | Serve raw file bytes |
| `DELETE` | `/api/projects/:projectId/workspace/file` | `?path=file.txt` | Delete file/empty dir |

---

## 4. Server Storage

**No separate storage class.** Unlike Artifacts (which used `FileArtifactStorage` with JSON metadata files), the workspace routes operate directly on the filesystem using `node:fs/promises`. This is intentional:

- No metadata to persist — we read directory listings and file contents directly
- `getProjectPath()` + `/workspace/` gives us the base path
- `validateFilePath()` prevents path traversal
- No need for `IArtifactService` DI pattern — the routes are self-contained

### Remove: `packages/server/src/storage/artifacts.ts`

### Files to modify in `packages/server/src/index.ts`:
- Remove `FileArtifactStorage` import and instantiation
- Remove `artifactStorage` from `deps`

### Files to modify in `packages/server/src/app.ts`:
- Remove `IArtifactService` import and `artifactStorage` from `ServerDependencies`
- Replace artifact route registration with workspace route
- Remove body limit exception or add one for workspace/raw if needed for large file downloads

---

## 5. Store Slice (`packages/ui/src/stores/useAppStore.ts`)

### Remove: `ArtifactSlice`, `ArtifactActions`, all artifact state/actions

### Add: `WorkspaceSlice`, `WorkspaceActions`

```typescript
interface WorkspaceSlice {
  /** Current directory listing (flat — one level at a time) */
  workspaceEntries: WorkspaceEntry[]
  /** Current directory path (relative to workspace root) */
  workspaceCurrentPath: string
  /** Currently previewed file data */
  workspacePreview: FilePreviewData | null
  workspaceLoading: boolean
  workspacePreviewLoading: boolean
}

interface WorkspaceActions {
  /** Load entries for a directory path */
  loadWorkspaceDir(projectId: ProjectId, dirPath?: string): Promise<void>
  /** Navigate into a directory (updates currentPath and loads) */
  navigateWorkspace(dirPath: string): Promise<void>
  /** Load file preview */
  loadWorkspaceFile(filePath: string): Promise<void>
  /** Delete a file, then refresh the current directory */
  deleteWorkspaceFile(filePath: string): Promise<void>
  /** Clear workspace state (on project switch) */
  clearWorkspace(): void
}
```

### Implementation inside store:

```typescript
// --- Workspace state ---
workspaceEntries: [],
workspaceCurrentPath: '',
workspacePreview: null,
workspaceLoading: false,
workspacePreviewLoading: false,

async loadWorkspaceDir(projectId: ProjectId, dirPath = '') {
  set({ workspaceLoading: true, workspaceCurrentPath: dirPath })
  const entries = await getServices().workspace.listDir(projectId, dirPath)
  set({ workspaceEntries: entries, workspaceLoading: false })
},

async navigateWorkspace(dirPath: string) {
  const projectId = get().currentProjectId
  if (!projectId) return
  set({ workspacePreview: null })
  await get().loadWorkspaceDir(projectId, dirPath)
},

async loadWorkspaceFile(filePath: string) {
  const projectId = get().currentProjectId
  if (!projectId) return
  set({ workspacePreviewLoading: true })
  const preview = await getServices().workspace.readFile(projectId, filePath)
  set({ workspacePreview: preview, workspacePreviewLoading: false })
},

async deleteWorkspaceFile(filePath: string) {
  const projectId = get().currentProjectId
  if (!projectId) throw new Error('No project selected')
  await getServices().workspace.deleteFile(projectId, filePath)
  // Refresh current directory
  await get().loadWorkspaceDir(projectId, get().workspaceCurrentPath)
  // Clear preview if deleted file was being previewed
  if (get().workspacePreview?.path === filePath) {
    set({ workspacePreview: null })
  }
},

clearWorkspace() {
  set({
    workspaceEntries: [],
    workspaceCurrentPath: '',
    workspacePreview: null,
    workspaceLoading: false,
    workspacePreviewLoading: false,
  })
},
```

### Update `selectProject()`:
- Replace `artifacts: [],` → `workspaceEntries: [],`
- Replace `artifactsLoading: true,` → `workspaceLoading: false,` (don't auto-load workspace on project select — lazy load on page visit)
- Remove `safe(svc.artifacts.list(id)),` from the parallel load
- Remove artifact-related `set()` assignments

### Update `clearProject()`:
- Replace artifact clearing with workspace clearing

### Update `deleteProject()`:
- Replace `artifacts: []` with `workspaceEntries: []`

### Combined type:
- Replace `ArtifactSlice` → `WorkspaceSlice` in `AppState`
- Replace `ArtifactActions` → `WorkspaceActions` in `AppState`

---

## 6. Service Implementations

### 6a. HTTP Service (`packages/ui/src/services/http/services.ts`)

Remove `HttpArtifactService`. Add:

```typescript
import type { ProjectId, WorkspaceEntry, FilePreviewData, IWorkspaceService } from '@golemancy/shared'

export class HttpWorkspaceService implements IWorkspaceService {
  constructor(private baseUrl: string) {}

  listDir(projectId: ProjectId, dirPath: string) {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''
    return fetchJson<WorkspaceEntry[]>(
      `${this.baseUrl}/api/projects/${projectId}/workspace${params}`
    )
  }

  readFile(projectId: ProjectId, filePath: string) {
    return fetchJson<FilePreviewData>(
      `${this.baseUrl}/api/projects/${projectId}/workspace/file?path=${encodeURIComponent(filePath)}`
    )
  }

  async deleteFile(projectId: ProjectId, filePath: string) {
    await fetchJson(
      `${this.baseUrl}/api/projects/${projectId}/workspace/file?path=${encodeURIComponent(filePath)}`,
      { method: 'DELETE' }
    )
  }

  getFileUrl(projectId: ProjectId, filePath: string): string {
    return `${this.baseUrl}/api/projects/${projectId}/workspace/raw?path=${encodeURIComponent(filePath)}`
  }
}
```

### 6b. Mock Service (`packages/ui/src/services/mock/services.ts`)

Remove `MockArtifactService`. Add:

```typescript
import type { ProjectId, WorkspaceEntry, FilePreviewData, IWorkspaceService } from '@golemancy/shared'
import { getFileCategory, getMimeType } from '@golemancy/shared'

export class MockWorkspaceService implements IWorkspaceService {
  // In-memory fake filesystem for dev
  private files: Array<{ path: string; content: string; size: number; modifiedAt: string }> = [
    { path: 'report.md', content: '# Analysis Report\n\nSample content...', size: 2048, modifiedAt: new Date().toISOString() },
    { path: 'data/results.csv', content: 'name,value,score\nAlpha,100,0.95\nBeta,85,0.87\nGamma,72,0.81', size: 512, modifiedAt: new Date().toISOString() },
    { path: 'scripts/analyze.py', content: 'import pandas as pd\n\ndef analyze(data):\n    return data.describe()', size: 1024, modifiedAt: new Date().toISOString() },
    { path: 'output/chart.png', content: '', size: 45000, modifiedAt: new Date().toISOString() },
  ]

  async listDir(_projectId: ProjectId, dirPath: string): Promise<WorkspaceEntry[]> {
    await delay()
    const prefix = dirPath ? dirPath + '/' : ''
    const entries = new Map<string, WorkspaceEntry>()

    for (const file of this.files) {
      if (!file.path.startsWith(prefix)) continue
      const rest = file.path.slice(prefix.length)
      const parts = rest.split('/')

      if (parts.length === 1) {
        // Direct file
        entries.set(parts[0], {
          name: file.path,
          type: 'file',
          size: file.size,
          modifiedAt: file.modifiedAt,
          category: getFileCategory(parts[0]),
        })
      } else {
        // Directory entry
        const dirName = prefix + parts[0]
        if (!entries.has(parts[0])) {
          entries.set(parts[0], {
            name: dirName,
            type: 'directory',
            size: 0,
            modifiedAt: file.modifiedAt,
          })
        }
      }
    }

    const result = [...entries.values()]
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return result
  }

  async readFile(_projectId: ProjectId, filePath: string): Promise<FilePreviewData> {
    await delay()
    const file = this.files.find(f => f.path === filePath)
    if (!file) throw new Error('File not found')
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const category = getFileCategory(filePath)
    return {
      path: filePath,
      category,
      size: file.size,
      modifiedAt: file.modifiedAt,
      content: category === 'code' || category === 'text' ? file.content : null,
      mimeType: getMimeType(filePath),
      extension: ext,
    }
  }

  async deleteFile(_projectId: ProjectId, filePath: string): Promise<void> {
    await delay()
    this.files = this.files.filter(f => f.path !== filePath)
  }

  getFileUrl(_projectId: ProjectId, filePath: string): string {
    return `/mock/workspace/${encodeURIComponent(filePath)}`
  }
}
```

### 6c. Update factory files

**`packages/ui/src/services/mock/index.ts`:**
- Replace `MockArtifactService` → `MockWorkspaceService`
- Replace `artifacts: new MockArtifactService()` → `workspace: new MockWorkspaceService()`

**`packages/ui/src/services/http/index.ts`:**
- Replace `HttpArtifactService` → `HttpWorkspaceService`
- Replace `artifacts: new HttpArtifactService(baseUrl)` → `workspace: new HttpWorkspaceService(baseUrl)`

**`packages/ui/src/services/container.ts`:**
- Replace `artifacts: IArtifactService` → `workspace: IWorkspaceService`

**`packages/ui/src/services/interfaces.ts`:**
- Re-export `IWorkspaceService` instead of `IArtifactService`

---

## 7. Component Tree

### Page: `packages/ui/src/pages/workspace/WorkspacePage.tsx`

```
WorkspacePage
├── Header (title "Workspace", breadcrumb, refresh button)
├── Split layout (flex row)
│   ├── FileTree (left panel, ~280px width, scrollable)
│   │   ├── BreadcrumbNav (current path navigation)
│   │   └── EntryList (sorted: dirs first, then files)
│   │       ├── DirectoryItem (click → navigateWorkspace)
│   │       └── FileItem (click → loadWorkspaceFile)
│   └── FilePreview (right panel, flex-1)
│       ├── EmptyState (when no file selected)
│       ├── TextPreview (code/text → <pre>)
│       ├── ImagePreview (image → <img> with auth)
│       ├── CsvPreview (csv/tsv → <table>)
│       └── MetaPreview (tier 2 → file info + action buttons)
│           ├── "Open with System App" button (shell.openPath)
│           └── "Download" button (open raw URL)
└── DeleteConfirmModal (PixelModal)
```

### File list:

| File | Description |
|------|-------------|
| `packages/ui/src/pages/workspace/WorkspacePage.tsx` | Main page component |
| `packages/ui/src/pages/workspace/FileTree.tsx` | Left panel: directory listing |
| `packages/ui/src/pages/workspace/FilePreview.tsx` | Right panel: file preview area |
| `packages/ui/src/pages/workspace/index.ts` | Barrel export |

### Delete: `packages/ui/src/pages/artifact/` (entire directory)

### Key UI Details:

**FileTree:**
- Shows current directory entries as a flat list (not deeply nested tree)
- Breadcrumb at top for navigation: `workspace / subdir / nested` — each segment clickable
- ".." parent directory entry when not at root
- Directory icons: folder emoji/pixel icon
- File icons: based on `category` — use simple text icons matching pixel art style
- Click directory → `navigateWorkspace(entry.name)`
- Click file → `loadWorkspaceFile(entry.name)`
- Active file highlighted

**FilePreview:**
- Code/text: `<pre className="font-mono text-[12px] text-accent-green">` (no syntax highlighting per requirement)
- Image: `<img>` tag pointing to `/api/projects/:id/workspace/raw?path=...` — needs auth header, so use `fetch()` + `URL.createObjectURL()` pattern
- CSV/TSV: `<table>` with `<thead>` for first row, `<tbody>` for rest, styled with pixel borders
- Tier 2 (document/archive/audio/video/binary): PixelCard showing file name, size, type, modified date + action buttons
- Delete button on every file preview (opens confirm modal)
- Download button: opens the raw file URL in a new tab (or triggers download)

**Image auth pattern:**
```typescript
// Since the server requires Bearer token, images can't use a plain <img src>.
// Use fetch + blob URL:
useEffect(() => {
  if (preview?.imageUrl) {
    const token = window.electronAPI?.getServerToken()
    const baseUrl = window.electronAPI?.getServerBaseUrl()
    if (baseUrl && token) {
      fetch(`${baseUrl}${preview.imageUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.blob())
        .then(blob => {
          setBlobUrl(URL.createObjectURL(blob))
        })
    }
  }
  return () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }
}, [preview?.imageUrl])
```

Alternatively, the `getFileUrl` on `HttpWorkspaceService` can append the token as a query param (less secure but simpler). **Recommended approach: use fetch+blob** for security.

---

## 8. Electron Preload (`apps/desktop/src/preload/index.ts`)

### Add `openPath` to exposed API:

```typescript
import { contextBridge, ipcRenderer, shell } from 'electron'

// ... existing code ...

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...
  openPath: (fullPath: string) => ipcRenderer.invoke('shell:openPath', fullPath),
})
```

### Main process handler (`apps/desktop/src/main/index.ts`)

Add IPC handler:

```typescript
import { ipcMain, shell } from 'electron'

ipcMain.handle('shell:openPath', async (_event, fullPath: string) => {
  // Security: only allow opening files under the golemancy data directory
  const dataDir = path.join(os.homedir(), '.golemancy')
  const resolved = path.resolve(fullPath)
  if (!resolved.startsWith(dataDir)) {
    throw new Error('Cannot open paths outside data directory')
  }
  return shell.openPath(resolved)
})
```

### Update `ElectronAPI` type (`packages/ui/src/electron.d.ts`):

```typescript
interface ElectronAPI {
  getServerPort: () => number | null
  getServerBaseUrl: () => string | null
  getServerToken: () => string | null
  getInitialProjectId: () => string | null
  openNewWindow: (projectId?: string) => Promise<void>
  openPath: (fullPath: string) => Promise<string>  // NEW — returns error string or ''
}
```

### Usage in UI:

For tier-2 files, the "Open with System App" button needs the server to return the absolute path. Add a server endpoint:

**Option A (recommended):** Add an `openPath` field to `FilePreviewData` containing the absolute file path. This is safe because the server only returns paths within the workspace directory, and `shell.openPath` is sandboxed to the golemancy data dir via the IPC handler.

Update `FilePreviewData`:
```typescript
export interface FilePreviewData {
  // ... existing fields ...
  /** Absolute path on disk (for Electron shell.openPath). Only populated in Electron. */
  absolutePath?: string
}
```

Server returns `absolutePath` in the file preview response. The UI calls `window.electronAPI?.openPath(preview.absolutePath)`.

---

## 9. Routing Updates (`packages/ui/src/app/routes.tsx`)

```diff
- import { ArtifactsPage } from '../pages'
+ import { WorkspacePage } from '../pages'

  <Route path="artifacts" element={<ArtifactsPage />} />
+ <Route path="workspace" element={<WorkspacePage />} />
- <Route path="artifacts" element={<ArtifactsPage />} />
```

Final route: `/projects/:projectId/workspace`

---

## 10. Sidebar Update (`packages/ui/src/components/layout/ProjectSidebar.tsx`)

```diff
- { label: 'Artifacts', path: '/artifacts', icon: '[]', testId: 'artifacts' },
+ { label: 'Workspace', path: '/workspace', icon: '..', testId: 'workspace' },
```

Icon `..` represents a file browser in pixel text. Could also use `./` or `~/`.

---

## 11. Pages Index (`packages/ui/src/pages/index.tsx`)

```diff
- // Artifacts
- export { ArtifactsPage } from './artifact'
+ // Workspace
+ export { WorkspacePage } from './workspace'
```

---

## 12. Cleanup Plan

### Files to DELETE:
| File | Reason |
|------|--------|
| `packages/shared/src/types/artifact.ts` | Replaced by workspace types |
| `packages/server/src/routes/artifacts.ts` | Replaced by workspace routes |
| `packages/server/src/storage/artifacts.ts` | No storage class needed |
| `packages/ui/src/pages/artifact/ArtifactsPage.tsx` | Replaced by WorkspacePage |
| `packages/ui/src/pages/artifact/ArtifactPreview.tsx` | Replaced by FilePreview |
| `packages/ui/src/pages/artifact/index.ts` | Replaced by workspace index |

### Files to CREATE:
| File | Description |
|------|-------------|
| `packages/shared/src/types/workspace.ts` | `WorkspaceEntry`, `FilePreviewData`, `FileCategory` |
| `packages/shared/src/lib/file-categories.ts` | `getFileCategory()`, `getMimeType()`, `isTier1()` |
| `packages/server/src/routes/workspace.ts` | Hono workspace routes |
| `packages/ui/src/pages/workspace/WorkspacePage.tsx` | Main workspace page |
| `packages/ui/src/pages/workspace/FileTree.tsx` | Directory tree panel |
| `packages/ui/src/pages/workspace/FilePreview.tsx` | File preview panel |
| `packages/ui/src/pages/workspace/index.ts` | Barrel export |

### Files to MODIFY:
| File | Changes |
|------|---------|
| `packages/shared/src/types/index.ts` | Replace `export * from './artifact'` → `export * from './workspace'` |
| `packages/shared/src/types/common.ts` | Remove `ArtifactId` branded type |
| `packages/shared/src/index.ts` | Add `export * from './lib/file-categories'` (new lib barrel) |
| `packages/shared/src/services/interfaces.ts` | Remove `IArtifactService`, add `IWorkspaceService`; update imports |
| `packages/server/src/app.ts` | Remove artifact route, add workspace route; remove `artifactStorage` from `ServerDependencies` |
| `packages/server/src/index.ts` | Remove `FileArtifactStorage` import/instantiation; remove `artifactStorage` from deps |
| `packages/ui/src/stores/useAppStore.ts` | Replace `ArtifactSlice`/`ArtifactActions` with `WorkspaceSlice`/`WorkspaceActions`; update `selectProject`, `clearProject`, `deleteProject` |
| `packages/ui/src/services/container.ts` | Replace `artifacts` → `workspace` in `ServiceContainer` |
| `packages/ui/src/services/interfaces.ts` | Replace `IArtifactService` → `IWorkspaceService` re-export |
| `packages/ui/src/services/http/services.ts` | Remove `HttpArtifactService`, add `HttpWorkspaceService` |
| `packages/ui/src/services/http/index.ts` | Update factory + re-exports |
| `packages/ui/src/services/mock/services.ts` | Remove `MockArtifactService`, add `MockWorkspaceService` |
| `packages/ui/src/services/mock/data.ts` | Remove `SEED_ARTIFACTS` and `ArtifactId` import |
| `packages/ui/src/services/mock/index.ts` | Update factory |
| `packages/ui/src/pages/index.tsx` | Replace artifact export → workspace export |
| `packages/ui/src/app/routes.tsx` | Replace `artifacts` route → `workspace` route |
| `packages/ui/src/components/layout/ProjectSidebar.tsx` | Replace "Artifacts" nav item → "Workspace" |
| `apps/desktop/src/preload/index.ts` | Add `openPath` IPC bridge |
| `apps/desktop/src/main/index.ts` | Add `ipcMain.handle('shell:openPath', ...)` |
| `packages/ui/src/electron.d.ts` | Add `openPath` to `ElectronAPI` interface |

### Grep for remaining `artifact`/`Artifact` references:
After all changes, run `grep -ri 'artifact' packages/ apps/` to catch any stragglers. Known areas:
- Type imports in mock `data.ts` (remove `Artifact`, `ArtifactId` from imports)
- Store type union in `useAppStore.ts`

---

## 13. Implementation Task Breakdown

Suggested implementation order (with dependencies):

1. **Shared types + lib** — Create `workspace.ts` types, `file-categories.ts` lib, update exports
2. **Shared interfaces** — Replace `IArtifactService` → `IWorkspaceService` in interfaces
3. **Server routes** — Create `workspace.ts` routes, update `app.ts` and `index.ts`
4. **UI services** — Create `HttpWorkspaceService` + `MockWorkspaceService`, update containers
5. **Store slice** — Replace artifact slice with workspace slice
6. **UI pages** — Create `WorkspacePage`, `FileTree`, `FilePreview`
7. **Routing + sidebar** — Update routes, sidebar, pages index
8. **Electron preload** — Add `openPath` IPC
9. **Cleanup** — Delete all artifact files, remove stale references
10. **Testing** — Manual `pnpm dev` smoke test, check all scenarios

Tasks 1-2 block everything else. Tasks 3-4 can run in parallel. Task 5 depends on 4. Task 6 depends on 5. Task 7-8 can run in parallel with 6. Task 9 is last.
