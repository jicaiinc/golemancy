# Fact Check: Workspace File Browser Technical Approach

> 验证日期：2026-02-19
> 验证人：Fact Checker

---

## 1. Node.js `fs.readdir` with `recursive` option

### 结论：✅ 可用，无跨平台问题

| 项目 | 详情 |
|------|------|
| 引入版本 | Node.js v18.17.0 / v20.1.0（通过 PR [#41439](https://github.com/nodejs/node/pull/41439)） |
| 本项目 Node 版本 | v22.21.0 — 完全支持 |
| API | `fs.promises.readdir(path, { recursive: true })` 或 `fs.readdirSync(path, { recursive: true })` |
| 默认值 | `recursive: false` |
| 跨平台 | macOS / Windows / Linux 均支持，无平台差异 |

### 已知问题（已修复）

- **`recursive` + `withFileTypes` 组合 bug**（[#48858](https://github.com/nodejs/node/issues/48858)）：v18.17.0 中同时使用 `{ recursive: true, withFileTypes: true }` 会返回不完整结果。已在后续补丁修复，Node v22 不受影响。
- **文档不完整**（[#48640](https://github.com/nodejs/node/issues/48640)）：早期文档缺少行为说明，已通过 PR #48902 补全。

### 建议

- 推荐使用 `fs.promises.readdir(path, { withFileTypes: true })` 进行**非递归**逐层读取（用户展开目录时按需加载），而非一次性递归读取整个 workspace。原因：
  1. 递归读取在大目录下可能很慢
  2. 按需加载与前端目录树的交互模式更匹配
  3. 减少不必要的 I/O 开销

---

## 2. Hono 路由通配符/参数语法

### 结论：✅ 支持通过 regex 命名参数捕获文件路径

| 项目 | 详情 |
|------|------|
| 文档来源 | [Hono Routing Docs](https://hono.dev/docs/api/routing) |
| 通配符语法 | `app.get('/path/*', handler)` — 匹配所有子路径，通过 `c.req.param('*')` 获取 |
| 命名参数 + regex | `app.get('/:filepath{.+}', handler)` — 通过 `c.req.param('filepath')` 获取（参考 [Issue #3190](https://github.com/honojs/hono/issues/3190)） |

### 推荐语法

对于 workspace 文件路径路由，使用 **通配符 `*`** 而非 regex 命名参数：

```typescript
// 在 workspace route 文件内部（已挂载到 /api/projects/:projectId/workspace）
app.get('/files/*', async (c) => {
  const relativePath = c.req.param('*')  // e.g. "src/main.py" 或 ""
  // ...
})
```

**原因**：
- 项目中其他路由未使用 regex 命名参数，保持一致性
- `*` 通配符语法更简洁，且 Hono 原生支持
- 空路径（根目录）时 `c.req.param('*')` 返回空字符串，可正常处理

### 路由挂载模式（与项目一致）

从 `app.ts` 可见现有模式：
```typescript
app.route('/api/projects/:projectId/workspace', createWorkspaceRoutes())
```

---

## 3. Electron `shell.openPath()` API

### 结论：✅ 可用，需通过 IPC 暴露

| 项目 | 详情 |
|------|------|
| API 签名 | `shell.openPath(path: string): Promise<string>` |
| 返回值 | Promise，resolve 时返回空字符串表示成功，返回错误消息字符串表示失败 |
| 文档 | [Electron shell API](https://www.electronjs.org/docs/latest/api/shell) |
| 本项目 Electron 版本 | ^40.0.0 |

### 暴露模式

**不能**在 preload 中直接 `require('electron').shell.openPath()`（sandbox renderer 中不可用）。必须通过 IPC 中转：

**Main process**（`apps/desktop/src/main/index.ts`）：
```typescript
import { shell } from 'electron'

ipcMain.handle('shell:openPath', (_event, filePath: string) => {
  return shell.openPath(filePath)
})
```

**Preload**（`apps/desktop/src/preload/index.ts`）：
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ...existing methods...
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
})
```

**类型定义**（`packages/ui/src/electron.d.ts`）：
```typescript
interface ElectronAPI {
  // ...existing...
  openPath: (filePath: string) => Promise<string>
}
```

### 安全注意

- `shell.openPath()` 能打开任意文件，需在 main process 端做路径校验（确保在 workspace 目录内）
- 项目已有 IPC handler 模式（`window:open`），可参考

### Electron 36+ shell undefined 问题

[Issue #47413](https://github.com/electron/electron/issues/47413) 报告了 Electron 36+ 中 preload.cjs 里 `require('electron').shell` 为 undefined 的问题。但这仅影响**在 preload 中直接使用 shell**的场景。我们推荐的 IPC 模式（在 main process 中使用 shell）不受影响。

---

## 4. 现有 `validateFilePath` 实现

### 结论：✅ 适用于 workspace 文件访问

**文件位置**：`packages/server/src/utils/paths.ts:12-18`

```typescript
export function validateFilePath(basePath: string, filePath: string): string {
  const resolved = path.resolve(basePath, filePath)
  if (!resolved.startsWith(basePath + path.sep) && resolved !== basePath) {
    throw new Error(`Path traversal detected: ${filePath}`)
  }
  return resolved
}
```

### 分析

| 检查项 | 结果 |
|--------|------|
| 防止 `../` 路径穿越 | ✅ `path.resolve` 会解析 `..`，然后检查前缀 |
| 防止绝对路径注入 | ✅ 即使传入绝对路径，`startsWith` 检查也会拦截 |
| 允许访问 basePath 本身 | ✅ `resolved === basePath` 条件覆盖 |
| 跨平台 | ✅ 使用 `path.sep`，在 Windows (`\`) 和 Unix (`/`) 上均正确 |
| 已有使用者 | `uploads.ts` 路由中已在使用 |

### 用法示例

```typescript
const workspacePath = path.join(getProjectPath(projectId), 'workspace')
const resolvedPath = validateFilePath(workspacePath, userProvidedPath)
// resolvedPath 保证在 workspacePath 目录内
```

### 注意事项

- 符号链接（symlink）：`validateFilePath` 不检查符号链接。如果 workspace 内有 symlink 指向外部目录，仍可通过验证。但对于本项目场景（agent 生成的文件），symlink 攻击风险极低。
- 建议：如果未来需要更严格的安全性，可用 `fs.realpath()` 解析后再验证。当前阶段不需要。

---

## 5. Hono 提供二进制文件（图片等）

### 结论：✅ 可用，使用 `new Uint8Array(buffer)` 或 `new Response()`

| 项目 | 详情 |
|------|------|
| 文档 | [Hono Context](https://hono.dev/docs/api/context) |
| `c.body()` 接受类型 | `string | ArrayBuffer | ReadableStream` |

### 推荐模式（项目已有先例）

从 `packages/server/src/routes/uploads.ts:41-48` 可见，项目**已有**提供二进制文件的模式：

```typescript
const { buffer, mediaType } = await readUploadBuffer(projectId, filename)
c.header('Content-Type', mediaType)
c.header('Content-Length', String(buffer.length))
c.header('X-Content-Type-Options', 'nosniff')
return c.body(new Uint8Array(buffer))
```

### 注意事项

- **必须用 `new Uint8Array(buffer)`** 而非直接传 `Buffer`。Hono 的 `c.body()` TypeScript 类型不包含 `Buffer`，但 `Uint8Array` 可以正常工作。
- 如果遇到 `c.body()` 的 TypeScript 类型问题（[Issue #3729](https://github.com/honojs/hono/issues/3729)），可降级使用 `new Response(buffer, { headers: c.res.headers })`。
- 二进制响应在 [Issue #3517](https://github.com/honojs/hono/issues/3517) 中有报告过问题，但使用 `Uint8Array` 是稳定的方式。

---

## 6. Hono 文件下载（Content-Disposition）

### 结论：✅ 标准 HTTP header，直接设置即可

### 推荐模式

```typescript
app.get('/download/*', async (c) => {
  const relativePath = c.req.param('*')
  const filename = path.basename(relativePath)
  const buffer = await fs.readFile(resolvedPath)

  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  c.header('Content-Length', String(buffer.length))
  return c.body(new Uint8Array(buffer))
})
```

### 注意事项

- **文件名编码**：使用 `encodeURIComponent()` 处理中文或特殊字符的文件名（RFC 5987）
- `Content-Type` 设为 `application/octet-stream` 强制下载，而非浏览器尝试渲染
- 参考 [MDN Content-Disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)

---

## 总结

| 验证项 | 状态 | 风险等级 |
|--------|------|----------|
| Node.js `fs.readdir` recursive | ✅ 可用（v22 完全支持） | 无 |
| Hono 通配符路由 | ✅ `*` 或 `/:name{.+}` 均可 | 无 |
| Electron `shell.openPath()` | ✅ 通过 IPC 暴露 | 低（需路径校验） |
| `validateFilePath` | ✅ 适用，防穿越 | 极低（不检查 symlink） |
| Hono 二进制文件响应 | ✅ 项目已有先例（uploads.ts） | 无 |
| Hono 文件下载 | ✅ 标准 Content-Disposition | 无 |

**所有技术方案均已验证可行，无阻塞性问题。**
