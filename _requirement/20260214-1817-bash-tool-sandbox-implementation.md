# Bash Tool Sandbox Implementation - Requirements Document

**Created**: 2026-02-14 18:17
**Project**: Golemancy - AI Agent Orchestration Platform
**Feature**: Bash Tool Sandbox Runtime Integration

---

## 概述

为 Bash Tool 实现三种执行模式（Restricted / Sandbox / Unrestricted），集成 Anthropic Sandbox Runtime，支持应用程序级和项目级的安全配置。这是一个关键的安全功能节点。

---

## 1. 应用程序级别配置（Global Settings）

### 1.1 三种执行模式
- **Restricted** (虚拟沙箱)
  - 使用 Just-Bash，虚拟文件系统
  - 70+ 内置命令，不执行真实系统命令
  - UI 副标题："Do Not Touch My Computer"
  - 适用场景：不信任的 AI、公开项目、最高安全性

- **Sandbox** (系统沙箱，**默认模式**)
  - 使用 Anthropic Sandbox Runtime，OS 级隔离
  - 执行真实命令，但受沙箱限制
  - 默认配置预设：**Balanced**
  - 适用场景：大多数开发场景、日常使用

- **Unrestricted / Full Access** (无限制)
  - 无沙箱保护
  - 完全系统权限
  - ⚠️ 危险模式，仅用于开发调试
  - 适用场景：本地开发、可信环境

### 1.2 Sandbox 模式的 Balanced 预设配置

**文件系统权限**：
```json
{
  "allowWrite": [
    "/workspace",
    "/tmp",
    "~/.npm",
    "~/.cache"
  ],
  "denyRead": [
    "~/.ssh",
    "~/.aws",
    "/etc/passwd",
    "/etc/shadow",
    "**/.env",
    "**/secrets/**"
  ],
  "denyWrite": [
    "**/.git/hooks/**"
  ],
  "allowGitConfig": true
}
```

**网络权限**：
```json
{
  "allowedDomains": [
    "github.com",
    "*.github.com",
    "api.github.com",
    "raw.githubusercontent.com",
    "registry.npmjs.org",
    "*.npmjs.org",
    "registry.yarnpkg.com",
    "registry.npmmirror.com",
    "pypi.org",
    "files.pythonhosted.org",
    "hub.docker.com",
    "registry.hub.docker.com",
    "*.cloudflare.com",
    "*.jsdelivr.net",
    "*.unpkg.com"
  ]
}
```

**其他配置**：
- `enablePython`: true
- `deniedCommands`: ['sudo', 'su', 'doas', 'osascript', 'security']

### 1.3 UI 层级结构
- **路径**：Settings > **Safety**
- **Safety Tab 下的两个子项**：
  - **Bash Tool**：配置 Bash 执行模式和权限
  - **MCP**：配置 MCP Server 是否在 sandbox 内运行

### 1.4 配置存储
- **存储方式**：JSON 文件
- **存储路径**：`~/.golemancy/settings.json`
- **配置结构**：
```json
{
  "bashTool": {
    "defaultMode": "sandbox",
    "sandboxPreset": "balanced",
    "customConfig": {
      "filesystem": {...},
      "network": {...},
      "enablePython": true,
      "deniedCommands": [...]
    }
  },
  "mcpServers": {
    "runInSandbox": false
  }
}
```

---

## 2. 项目级别配置（Project Settings）

### 2.1 UI 路径
- **路径**：Project Settings > **Safety**
- **Safety 下的两个子项**：
  - **Bash Tool**：项目级 Bash 配置
  - **MCP**：项目级 MCP 配置

### 2.2 执行模式选择
- 继承应用程序级别的三种模式：Restricted / Sandbox / Unrestricted
- 可选择继承或覆盖全局配置

### 2.3 Sandbox 模式的两种行为

**Inherit from App**（继承，推荐）：
- 使用应用程序级别的 sandbox 配置
- **不创建**独立的 Sandbox Manager
- 共享全局的 sandbox 实例
- 优点：节省资源，配置简单
- 适用场景：大多数项目

**Custom**（覆盖）：
- 项目有自己的 sandbox 配置
- **创建**独立的 Sandbox Manager（通过 Worker Pool）
- 可自定义 filesystem, network, enablePython, deniedCommands
- 优点：项目特定的安全策略
- 适用场景：需要特殊权限的项目（如开源项目需要更宽松的网络）

### 2.4 配置存储
- **存储方式**：JSON 文件
- **存储路径**：`~/.golemancy/projects/{projectId}/config.json`
- **配置结构**：
```json
{
  "bashTool": {
    "mode": "sandbox",
    "inherit": true,
    "customConfig": {
      "filesystem": {...},
      "network": {...}
    }
  }
}
```

---

## 3. Worker Pool 实现

### 3.1 架构设计
- **一个 Hono Server 进程**（主进程）
- **多个 Worker 子进程**（每个有独立 sandbox 配置的 Project 一个）
- 每个 Worker 运行独立的 Sandbox Manager 实例

### 3.2 Worker 创建条件

**创建 Worker**（当且仅当）：
- Project 配置为 Sandbox 模式
- **且** 选择了 Custom（覆盖配置）
- 需要独立的 sandbox 配置

**不创建 Worker**（使用主进程）：
- Project 配置为 Sandbox 模式 + Inherit（继承）
- 或 Project 配置为 Restricted / Unrestricted
- 使用主进程的 Sandbox Manager 或无沙箱

### 3.3 Worker 生命周期
- **通过 worker pool 自动管理**
- Worker Pool 负责：
  - Worker 的创建和销毁
  - 资源管理和回收
  - 进程监控和错误处理
- 具体策略由 Worker Pool 实现决定

### 3.4 进程间通信（IPC）
- 主进程（Hono Server）↔ Worker：通过 Node.js IPC
- **消息格式**：
  - Request: `{ type: 'execute', command: string, options: {...} }`
  - Response: `{ type: 'result', stdout: string, stderr: string, exitCode: number }`
  - Worker Ready: `{ type: 'ready' }`

---

## 4. Bash Tool 的 Sandbox 接口实现

### 4.1 接口定义
- 实现 `bash-tool` 的 `Sandbox` 接口
```typescript
interface Sandbox {
  executeCommand(command: string): Promise<CommandResult>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}
```

### 4.2 executeCommand 实现
- 使用 `SandboxManager.wrapWithSandbox()` 包裹命令
- 通过 `spawn()` 执行子进程
- 返回 `{ stdout, stderr, exitCode }`
- **命令黑名单检查**（执行前）：
  - 检查命令是否在 `deniedCommands` 中
  - 使用正则匹配（如 `/\brm\s+-rf\s+\//`）
  - 如果匹配，拦截并返回错误

### 4.3 readFile 实现
- **使用 Node.js fs**（不用 shell 命令，兼容性更好）
- **执行前进行权限校验**：
  1. 规范化路径（`path.normalize`, `path.resolve`）
  2. 检查路径是否在 workspace 范围内
  3. 检查路径是否匹配 `denyRead` 规则
  4. 防止路径穿越攻击（`../`）
- **如果校验失败**：
  - 拒绝操作
  - 返回错误：`Error: Access denied: ${path}`
- **如果校验通过**：
  - 使用 `fs.readFile()` 读取文件

### 4.4 writeFiles 实现
- **使用 Node.js fs**（不用 shell 命令）
- **执行前进行权限校验**：
  1. 规范化路径
  2. 检查路径是否在 `allowWrite` 白名单内
  3. 检查路径是否在 `denyWrite` 黑名单内
  4. 防止路径穿越攻击
- **如果校验失败**：
  - 拒绝操作
  - 返回错误：`Error: Write access denied: ${path}`
- **如果校验通过**：
  - 确保目录存在（`fs.mkdir` recursive）
  - 使用 `fs.writeFile()` 写入文件

### 4.5 路径校验逻辑（核心安全机制）

**实现 `validatePath()` 方法**：
```typescript
function validatePath(
  path: string,
  workspaceRoot: string,
  config: FilesystemConfig,
  operation: 'read' | 'write'
): string {
  // 1. 规范化路径
  const normalized = normalize(path)
  const absolute = resolve(workspaceRoot, normalized)

  // 2. 检查是否在 workspace 范围内
  if (!absolute.startsWith(workspaceRoot + '/') && absolute !== workspaceRoot) {
    throw new Error(`Access denied: ${path} is outside workspace`)
  }

  // 3. 检查路径穿越
  if (normalized.includes('..')) {
    throw new Error(`Access denied: ${path} contains path traversal`)
  }

  // 4. 检查黑名单
  if (operation === 'read' && matchesPattern(absolute, config.denyRead)) {
    throw new Error(`Access denied: ${path} matches denyRead`)
  }

  if (operation === 'write' && matchesPattern(absolute, config.denyWrite)) {
    throw new Error(`Write access denied: ${path} matches denyWrite`)
  }

  // 5. 检查白名单（仅写操作）
  if (operation === 'write') {
    if (!matchesAnyPattern(absolute, config.allowWrite)) {
      throw new Error(`Write access denied: ${path} not in allowWrite`)
    }
  }

  return absolute
}
```

**模式匹配支持**：
- `~/.ssh` → 展开为用户目录
- `**/.env` → glob 模式匹配
- `/etc/passwd` → 精确匹配

---

## 5. 命令级别限制（扩展能力）

### 5.1 命令黑名单配置
- 在 sandbox 配置中扩展 `deniedCommands` 字段
- 支持通配符和正则匹配

### 5.2 预设的危险命令黑名单
```json
{
  "deniedCommands": [
    "rm -rf /",
    "sudo *",
    "su *",
    "doas *",
    "osascript *",
    "security *",
    "mkfs *",
    "dd if=* of=/dev/*",
    "chmod 777 *"
  ]
}
```

### 5.3 应用程序级别限制（可选扩展）
- 禁止打开某些应用程序
- 例如：
  - `open -a "Google Chrome"`
  - `python3`（如果 `enablePython: false`）
  - `docker`（如果配置禁止）

### 5.4 命令校验实现
```typescript
function checkCommandBlacklist(command: string, deniedCommands: string[]): void {
  for (const pattern of deniedCommands) {
    const regex = patternToRegex(pattern)  // 'sudo *' → /\bsudo\s+.*/
    if (regex.test(command)) {
      throw new Error(`Command blocked: ${command} matches blacklist pattern: ${pattern}`)
    }
  }
}
```

---

## 6. UI 设计

### 6.1 命名确认
- ✅ 使用 **Safety**（而非 Security）
- 更友好，强调"安全保护"而非"安全策略"

### 6.2 Settings > Safety > Bash Tool

```
┌────────────────────────────────────────────────┐
│ Settings > Safety > Bash Tool                  │
├────────────────────────────────────────────────┤
│                                                │
│ Default Execution Mode                         │
│                                                │
│ ○ Restricted                                   │
│   Do Not Touch My Computer                     │
│   Virtual filesystem, 70+ built-in commands    │
│   No real system commands (git, npm, docker)   │
│                                                │
│ ● Sandbox (Recommended)                        │
│   OS-level isolation, real commands allowed    │
│   Preset: [Balanced ▼]                         │
│     • Balanced (Default)                       │
│     • Strict                                   │
│     • Permissive                               │
│     • Custom                                   │
│                                                │
│ ○ Unrestricted                                 │
│   No sandbox - Full system access ⚠️           │
│   Development and trusted environments only    │
│                                                │
│ ────────────────────────────────────────────── │
│                                                │
│ [▼ Advanced Configuration] (仅 Sandbox 模式)   │
│                                                │
│   File System Permissions                      │
│   • Allow Write: /workspace, /tmp, ~/.cache    │
│   • Deny Read: ~/.ssh, ~/.aws, .env files      │
│   [Edit...]                                    │
│                                                │
│   Network Permissions                          │
│   • Allowed Domains: github.com, npmjs.org...  │
│   [Edit...]                                    │
│                                                │
│   Other Settings                               │
│   ☑ Enable Python                              │
│   ☑ Allow Git Config Write                     │
│                                                │
└────────────────────────────────────────────────┘
```

### 6.3 Settings > Safety > MCP

```
┌────────────────────────────────────────────────┐
│ Settings > Safety > MCP                        │
├────────────────────────────────────────────────┤
│                                                │
│ MCP Server Execution Environment               │
│                                                │
│ ○ Run inside sandbox                           │
│   MCP servers inherit sandbox restrictions     │
│   ⚠️ May limit MCP functionality               │
│   (e.g., filesystem MCP cannot access files)   │
│                                                │
│ ● Run outside sandbox (Recommended)            │
│   MCP servers run in main process              │
│   ✓ Full functionality preserved               │
│   ✓ Security controlled by MCP configuration   │
│                                                │
│ ────────────────────────────────────────────── │
│                                                │
│ ℹ️ Why run outside sandbox?                    │
│                                                │
│ MCP servers are designed to provide additional │
│ capabilities (filesystem, database, network).  │
│ Running them inside sandbox defeats their      │
│ purpose. They are user-installed trusted code. │
│                                                │
└────────────────────────────────────────────────┘
```

### 6.4 Project Settings > Safety > Bash Tool

```
┌────────────────────────────────────────────────┐
│ Project Settings > Safety > Bash Tool          │
├────────────────────────────────────────────────┤
│                                                │
│ Execution Mode                                 │
│                                                │
│ ● Inherit from App Settings                    │
│   Uses global sandbox configuration            │
│   Current: Sandbox (Balanced)                  │
│   ✓ Recommended for most projects              │
│                                                │
│ ○ Custom Configuration                         │
│   Create project-specific sandbox              │
│   ⚠️ Creates a separate sandbox worker         │
│   [Configure...]                               │
│                                                │
│ ────────────────────────────────────────────── │
│                                                │
│ [▼ Preview Inherited Configuration]            │
│   • Allow Write: /workspace, /tmp              │
│   • Deny Read: ~/.ssh, ~/.aws, .env            │
│   • Network: github.com, npmjs.org...          │
│                                                │
└────────────────────────────────────────────────┘
```

### 6.5 Project Settings > Safety > MCP

```
┌────────────────────────────────────────────────┐
│ Project Settings > Safety > MCP                │
├────────────────────────────────────────────────┤
│                                                │
│ ● Inherit from App Settings                    │
│   Current: Run outside sandbox                 │
│                                                │
│ ○ Custom Configuration                         │
│   [Configure...]                               │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 7. MCP Server 的处理

### 7.1 配置选项
- **Run inside sandbox**：MCP Server 进程被 SandboxManager 包裹
- **Run outside sandbox**（✅ **默认推荐**）：MCP Server 直接在主进程启动

### 7.2 默认推荐：Run outside sandbox

**理由**：
1. **权限矛盾**：MCP 的目的是提供额外能力（文件系统、网络、数据库），如果在 sandbox 内，这些能力会被限制
2. **受信任代码**：MCP Server 是用户显式安装的，应当信任
3. **MCP 自身的安全机制**：MCP 的安全性由 MCP 配置（args, allowed paths）控制
4. **功能保障**：例如 `@modelcontextprotocol/server-filesystem` 需要访问文件系统，`server-sqlite` 需要访问数据库

### 7.3 如果用户选择 Run inside sandbox
- MCP Server 启动时通过 `SandboxManager.wrapWithSandbox()` 包裹
- 继承项目的 sandbox 配置（或全局配置）
- **警告用户**：MCP 功能可能受限（UI 中显示警告）

---

## 8. 代码实现关键文件

### 8.1 新增文件

**共享类型定义**：
- `packages/shared/src/types/bash-tool-config.ts` - 配置类型定义
- `packages/shared/src/types/bash-tool-presets.ts` - 预设配置（Balanced, Strict, Permissive, Development）

**服务端实现**：
- `packages/server/src/agent/anthropic-sandbox.ts` - Sandbox 接口实现
- `packages/server/src/agent/sandbox-pool.ts` - Worker Pool 管理器
- `packages/server/src/agent/sandbox-worker.ts` - Worker 子进程入口
- `packages/server/src/agent/resolve-bash-config.ts` - 配置继承解析逻辑
- `packages/server/src/agent/validate-path.ts` - 路径校验逻辑
- `packages/server/src/agent/check-command-blacklist.ts` - 命令黑名单检查

**UI 组件**：
- `packages/ui/src/components/settings/SafetySettings.tsx` - Safety 设置页面容器
- `packages/ui/src/components/settings/BashToolSettings.tsx` - Bash Tool 配置组件
- `packages/ui/src/components/settings/MCPSettings.tsx` - MCP 配置组件
- `packages/ui/src/components/settings/BashPresetSelector.tsx` - 预设选择器
- `packages/ui/src/components/project/ProjectSafetySettings.tsx` - 项目 Safety 设置

### 8.2 修改文件

**服务端**：
- `packages/server/src/agent/builtin-tools.ts` - 使用 AnthropicSandbox 代替 Just-Bash
- `packages/server/src/app.ts` - 初始化 Worker Pool

**UI**：
- `packages/ui/src/pages/SettingsPage.tsx` - 新增 Safety Tab
- `packages/ui/src/pages/ProjectSettingsPage.tsx` - 新增 Safety Tab
- `packages/ui/src/app/routes.tsx` - 添加新路由（如果需要）

**类型**：
- `packages/shared/src/types/settings.ts` - 扩展全局配置类型
- `packages/shared/src/types/project.ts` - 扩展项目配置类型

---

## 9. 技术细节

### 9.1 配置继承解析逻辑

```typescript
// packages/server/src/agent/resolve-bash-config.ts

export function resolveBashConfig(
  globalConfig: GlobalBashToolConfig,
  projectConfig?: ProjectBashToolConfig
): ResolvedBashToolConfig {
  // 如果项目选择继承
  if (!projectConfig || projectConfig.inherit) {
    return {
      mode: globalConfig.defaultMode,
      ...globalConfig.customConfig,
    }
  }

  // 如果项目自定义
  return {
    mode: projectConfig.mode ?? globalConfig.defaultMode,
    filesystem: {
      ...globalConfig.customConfig.filesystem,
      ...projectConfig.customConfig?.filesystem,
    },
    network: {
      ...globalConfig.customConfig.network,
      ...projectConfig.customConfig?.network,
    },
    enablePython: projectConfig.customConfig?.enablePython ?? globalConfig.customConfig.enablePython,
    deniedCommands: [
      ...(globalConfig.customConfig.deniedCommands ?? []),
      ...(projectConfig.customConfig?.deniedCommands ?? []),
    ],
  }
}
```

### 9.2 Sandbox Manager 实例管理

```typescript
// packages/server/src/agent/sandbox-pool.ts

class SandboxPool {
  private globalManager: SandboxManager | null = null
  private projectWorkers = new Map<ProjectId, WorkerProcess>()

  async getSandboxForProject(projectId: ProjectId): Promise<SandboxInstance> {
    const config = await resolveBashConfig(projectId)

    // 如果继承全局配置
    if (config.inherit) {
      if (!this.globalManager) {
        this.globalManager = await this.createGlobalManager()
      }
      return this.globalManager
    }

    // 如果自定义配置，使用 worker pool
    let worker = this.projectWorkers.get(projectId)
    if (!worker) {
      worker = await this.createWorker(projectId, config)
      this.projectWorkers.set(projectId, worker)
    }
    return worker
  }

  private async createWorker(projectId: ProjectId, config: BashToolConfig) {
    const worker = fork('./sandbox-worker.js', {
      env: {
        PROJECT_ID: projectId,
        SANDBOX_CONFIG: JSON.stringify(config),
      },
    })

    // 等待 worker 初始化完成
    await this.waitForReady(worker)
    return worker
  }
}
```

### 9.3 权限校验实现

```typescript
// packages/server/src/agent/validate-path.ts

export function validatePath(
  path: string,
  workspaceRoot: string,
  config: FilesystemConfig,
  operation: 'read' | 'write'
): string {
  // 1. 规范化路径
  const normalized = normalize(path)
  const absolute = isAbsolute(normalized)
    ? normalized
    : resolve(workspaceRoot, normalized)

  // 2. 展开 ~ 为用户目录
  const expanded = absolute.startsWith('~')
    ? resolve(homedir(), absolute.slice(1))
    : absolute

  // 3. 检查是否在 workspace 范围内（可选，取决于配置）
  if (!expanded.startsWith(workspaceRoot)) {
    // 某些配置可能允许访问 workspace 外的路径（如 ~/Downloads）
    // 这里根据 allowWrite 和 denyRead 来判断
  }

  // 4. 检查路径穿越
  if (path.includes('..')) {
    throw new Error(`Access denied: path contains traversal (..)`)
  }

  // 5. 检查黑名单
  if (operation === 'read') {
    for (const pattern of config.denyRead) {
      if (matchesGlob(expanded, pattern)) {
        throw new Error(`Access denied: ${path} matches denyRead pattern: ${pattern}`)
      }
    }
  }

  if (operation === 'write') {
    for (const pattern of config.denyWrite) {
      if (matchesGlob(expanded, pattern)) {
        throw new Error(`Write access denied: ${path} matches denyWrite pattern: ${pattern}`)
      }
    }
  }

  // 6. 检查白名单（仅写操作）
  if (operation === 'write') {
    let allowed = false
    for (const pattern of config.allowWrite) {
      if (matchesGlob(expanded, pattern)) {
        allowed = true
        break
      }
    }
    if (!allowed) {
      throw new Error(`Write access denied: ${path} not in allowWrite list`)
    }
  }

  return expanded
}

function matchesGlob(path: string, pattern: string): boolean {
  // 展开 ~ 和 **
  const expandedPattern = pattern.startsWith('~')
    ? resolve(homedir(), pattern.slice(1))
    : pattern

  // 使用 minimatch 或类似库进行 glob 匹配
  return minimatch(path, expandedPattern, { dot: true })
}
```

---

## 10. 测试要求

### 10.1 单元测试

**路径校验**：
- ✅ 正常路径通过
- ✅ `../` 路径穿越被拦截
- ✅ `~/.ssh` 黑名单被拦截
- ✅ 不在 `allowWrite` 的写操作被拦截
- ✅ glob 模式 `**/.env` 匹配正确

**命令黑名单**：
- ✅ `rm -rf /` 被拦截
- ✅ `sudo apt install` 被拦截
- ✅ `git status` 通过

**配置继承**：
- ✅ Project inherit 使用全局配置
- ✅ Project custom 合并配置
- ✅ deniedCommands 合并不覆盖

### 10.2 集成测试

**Sandbox 接口实现**：
- ✅ `executeCommand('ls -la')` 返回正确结果
- ✅ `readFile('/workspace/test.txt')` 读取成功
- ✅ `readFile('~/.ssh/id_rsa')` 被拦截
- ✅ `writeFiles([{ path: '/workspace/new.txt', content: 'test' }])` 写入成功
- ✅ `writeFiles([{ path: '/etc/hosts', content: 'malicious' }])` 被拦截

**Worker Pool**：
- ✅ Project inherit 不创建 worker
- ✅ Project custom 创建 worker
- ✅ Worker 进程间通信正常
- ✅ Worker 崩溃后可以恢复

### 10.3 E2E 测试

**UI 流程**：
- ✅ Settings > Safety > Bash Tool 切换模式
- ✅ 选择 Sandbox + Balanced 预设
- ✅ Project Settings > Safety > Bash Tool 选择 Inherit
- ✅ Project Settings > Safety > Bash Tool 选择 Custom 并配置

**功能验证**：
- ✅ Sandbox 模式执行 `git status` 成功
- ✅ Sandbox 模式执行 `cat ~/.ssh/id_rsa` 被拦截
- ✅ Restricted 模式执行 `git status` 失败（命令不存在）
- ✅ Unrestricted 模式执行所有命令成功

---

## 11. 风险和注意事项

### 11.1 安全风险
- ⚠️ 路径校验必须严格，防止路径穿越攻击
- ⚠️ 命令黑名单可能被绕过（如 `/bin/rm -rf /`），需要多层防护
- ⚠️ Unrestricted 模式必须有明确警告

### 11.2 性能风险
- ⚠️ Worker Pool 可能占用较多内存（每个 worker 一个 Node.js 进程）
- ⚠️ Worker 创建有延迟（首次执行命令时）

### 11.3 兼容性风险
- ⚠️ macOS 的 sandbox-exec 和 Linux 的 bubblewrap 行为可能不一致
- ⚠️ Windows 不支持 Sandbox Runtime（需要 fallback 到 Just-Bash）

### 11.4 用户体验风险
- ⚠️ 配置过于复杂可能让用户困惑
- ⚠️ 需要清晰的文档和 UI 提示

---

## 12. 交付物

### 12.1 代码
- [ ] 所有新增文件（见第 8 节）
- [ ] 所有修改文件
- [ ] 单元测试
- [ ] 集成测试
- [ ] E2E 测试

### 12.2 文档
- [ ] 用户文档：如何配置 Bash Tool 安全模式
- [ ] 开发文档：Worker Pool 架构说明
- [ ] API 文档：Sandbox 接口说明

### 12.3 配置文件
- [ ] 默认配置：`~/.golemancy/settings.json` 模板
- [ ] Balanced 预设配置
- [ ] 其他预设配置（Strict, Permissive, Development）

---

## 13. 里程碑

### Phase 1: 设计（Design）
- [ ] 架构设计文档
- [ ] UI/UX 设计稿
- [ ] 技术调研（Sandbox Runtime API）
- [ ] 配置 Schema 定义

### Phase 2: 实现（Implement）
- [ ] Sandbox 接口实现
- [ ] Worker Pool 实现
- [ ] 路径校验和命令黑名单
- [ ] UI 组件实现
- [ ] 配置读写逻辑

### Phase 3: 测试（Test）
- [ ] 单元测试
- [ ] 集成测试
- [ ] E2E 测试
- [ ] 手动测试和 QA

### Phase 4: 审查（Review）
- [ ] CR-Quality：代码质量审查
- [ ] CR-Security：安全审查
- [ ] CR-Performance：性能审查

---

## 14. 成功标准

- ✅ 用户可以在 Settings > Safety 中配置三种执行模式
- ✅ Sandbox 模式默认使用 Balanced 预设
- ✅ Project 可以继承或覆盖全局配置
- ✅ Worker Pool 正确创建和管理独立 sandbox
- ✅ 路径校验阻止访问敏感文件（~/.ssh, .env）
- ✅ 命令黑名单阻止危险命令（rm -rf /, sudo）
- ✅ MCP Server 默认在 sandbox 外运行
- ✅ 所有测试通过
- ✅ UI 清晰易用，用户理解各模式的区别

---

**文档结束**
