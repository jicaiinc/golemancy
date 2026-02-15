# Fact Check Report: Bash Tool Sandbox Implementation

**Date**: 2026-02-14
**Fact Checker**: Fact Checker Agent
**Requirements Doc**: `_requirement/20260214-1817-bash-tool-sandbox-implementation.md`

---

## 1. Anthropic Sandbox Runtime API

### 1.1 SandboxManager.wrapWithSandbox() 方法

**Claim**: 使用 `SandboxManager.wrapWithSandbox()` 包裹命令，通过 `spawn()` 执行子进程

**Verdict**: ✅ Verified

**Evidence**: 源码 `/Users/cai/developer/github/sandbox-runtime/src/sandbox/sandbox-manager.ts`

实际签名：
```typescript
wrapWithSandbox(
  command: string,
  binShell?: string,
  customConfig?: Partial<SandboxRuntimeConfig>,
  abortSignal?: AbortSignal,
): Promise<string>
```

- 接受命令字符串，返回包裹后的命令字符串
- 返回值通过 `spawn()` 执行（shell: true）
- 支持 `customConfig` 参数实现 per-call 配置覆盖

### 1.2 Network Proxy

**Claim**: Sandbox Runtime 支持网络代理限制

**Verdict**: ✅ Verified

**Evidence**: 源码分析确认完整的网络代理架构：
- HTTP Proxy Server（拦截 HTTP/HTTPS）
- SOCKS5 Proxy Server（处理 SSH、数据库等非 HTTP 流量）
- 配置通过环境变量传递：`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`
- 支持 `allowedDomains` / `deniedDomains` 过滤
- 支持 MITM proxy 代理
- macOS 上限制网络为 localhost proxy 端口
- Linux 上通过 `--unshare-net` 创建网络命名空间

网络配置类型：
```typescript
interface NetworkConfig {
  allowedDomains: string[]
  deniedDomains: string[]
  allowUnixSockets?: string[]
  allowAllUnixSockets?: boolean
  allowLocalBinding?: boolean
  httpProxyPort?: number
  socksProxyPort?: number
  mitmProxy?: { socketPath: string; domains: string[] }
}
```

### 1.3 Filesystem Rules

**Claim**: Sandbox Runtime 支持文件系统规则（denyRead, allowWrite, denyWrite）

**Verdict**: ✅ Verified

**Evidence**: 源码确认文件系统配置：
```typescript
interface FilesystemConfig {
  denyRead: string[]     // 拒绝读取（deny-only: 默认允许所有读取）
  allowWrite: string[]   // 允许写入（allow-only: 默认拒绝所有写入）
  denyWrite: string[]    // 拒绝写入（allowWrite 的例外）
  allowGitConfig?: boolean  // 默认 false
}
```

**⚠️ 重要纠正**：
- **读取是 deny-only 模式**（默认允许所有读取，通过 denyRead 拒绝特定路径）
- **写入是 allow-only 模式**（默认拒绝所有写入，通过 allowWrite 允许特定路径）
- 需求文档的配置结构 `allowWrite` + `denyRead` + `denyWrite` 与实际 API 一致
- 额外发现：Sandbox Runtime 有 **Mandatory Deny Paths**（始终阻止写入），包括：
  - Shell 配置：`.bashrc`, `.bash_profile`, `.zshrc`, `.zprofile`, `.profile`
  - Git：`.git/hooks/**`, `.git/config`（除非 `allowGitConfig: true`）
  - 敏感文件：`.gitmodules`, `.ripgreprc`, `.mcp.json`
  - IDE 配置：`.vscode/`, `.idea/`

### 1.4 Stdio Passthrough

**Claim**: 支持 stdio passthrough

**Verdict**: ✅ Verified

**Evidence**: `wrapWithSandbox()` 返回的是一个 shell 命令字符串，可通过 `spawn(wrapped, { shell: true, stdio: 'inherit' })` 或 `stdio: 'pipe'` 执行。标准 I/O 通过 shell 管道自然传递。macOS 上可选 `allowPty: boolean` 支持 PTY 分配。

### 1.5 SandboxManager 是否为全局单例

**Claim**: (隐含) 每个 Worker 运行独立 SandboxManager 实例

**Verdict**: ⚠️ Partially true — 需要注意设计约束

**Evidence**: SandboxManager 在源码中是模块级 const 对象（`export const SandboxManager: ISandboxManager`），而非 class 实例。每个 **Node.js 进程** 只有一个 SandboxManager 实例。因此：
- ✅ 在 Worker Pool 设计中，每个 fork 的子进程可以有自己的 SandboxManager（因为独立进程 = 独立模块作用域）
- ❌ 不能在同一进程内创建多个 SandboxManager 实例
- 需求文档的 Worker Pool 设计（每个项目一个 worker 子进程）正好满足此约束

### 1.6 SandboxManager.initialize() 方法

**Verdict**: ✅ Verified — 需求文档未显式提及但实现需要

**Evidence**: 初始化签名：
```typescript
async initialize(
  runtimeConfig: SandboxRuntimeConfig,
  sandboxAskCallback?: SandboxAskCallback,
  enableLogMonitor?: boolean,
): Promise<void>
```
- 必须先调用 `initialize()` 才能使用 `wrapWithSandbox()`
- 会启动 HTTP/SOCKS 代理服务器
- 支持 `sandboxAskCallback` 回调处理未映射的网络请求

---

## 2. Worker Pool 可行性

### 2.1 Node.js child_process.fork() 运行多个 SandboxManager

**Claim**: 可以通过 child_process.fork() 创建 Worker，每个 Worker 运行独立 SandboxManager

**Verdict**: ✅ Verified — 技术上可行

**Evidence**:
1. **SandboxManager 是模块级单例** — 每个 fork 的子进程有独立的 V8 实例和模块作用域，因此每个 Worker 自然获得独立的 SandboxManager
2. **fork() 支持 IPC 通信** — 通过 `process.send()` / `process.on('message')` 实现进程间通信
3. **项目已有 fork() 先例** — `apps/desktop/src/main/index.ts` 已使用 `child_process.fork()` 启动 server
4. **资源开销**：每个 Worker = 一个完整 Node.js 进程 + HTTP Proxy + SOCKS Proxy + (Linux) socat 进程

**⚠️ 性能注意**：
- 每个 Worker 会启动 HTTP 和 SOCKS 代理服务器（各占一个端口）
- Linux 上还需要 socat 桥接进程
- 建议限制最大 Worker 数量（如 5-10 个）
- Worker 创建有冷启动延迟（proxy 启动 + 依赖检查）

### 2.2 IPC 消息格式

**Claim**: Request/Response 格式 `{ type: 'execute', command }` / `{ type: 'result', stdout, stderr, exitCode }`

**Verdict**: ✅ Verified（设计合理）

**Evidence**: 这是需求文档自定义的 IPC 协议设计，不是 SandboxManager 的原生 API。设计合理，与项目已有的 Electron-Server IPC 模式一致（`{ type: 'ready', port, token }`）。

---

## 3. bash-tool Sandbox 接口

### 3.1 Sandbox 接口定义

**Claim**:
```typescript
interface Sandbox {
  executeCommand(command: string): Promise<CommandResult>
  readFile(path: string): Promise<string>
  writeFiles(files: Array<{ path: string; content: string | Buffer }>): Promise<void>
}
```

**Verdict**: ✅ Verified — 完全准确

**Evidence**: 源码 `node_modules/.pnpm/bash-tool@1.3.14/node_modules/bash-tool/dist/types.d.ts`

接口定义完全匹配：
```typescript
export interface Sandbox {
    executeCommand(command: string): Promise<CommandResult>;
    readFile(path: string): Promise<string>;
    writeFiles(files: Array<{
        path: string;
        content: string | Buffer;
    }>): Promise<void>;
}

export interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
```

### 3.2 bash-tool 内置的 Sandbox 适配器

**Verdict**: ✅ 额外发现 — 需求文档未提及但实现可参考

**Evidence**: bash-tool 已提供两种 Sandbox 适配器：
1. **JustBashLike Wrapper** (`dist/sandbox/just-bash.js`) — 将 just-bash 实例包装为 Sandbox 接口
2. **VercelSandboxLike Wrapper** (`dist/sandbox/vercel.js`) — 将 @vercel/sandbox 包装为 Sandbox 接口

这意味着我们的 `AnthropicSandbox` 实现将是第三种适配器，遵循相同的模式。

### 3.3 当前项目使用方式

**Evidence**: `packages/server/src/agent/builtin-tools.ts` 当前使用 just-bash：
```typescript
const sandbox = new Bash({
    fs: mountableFs,
    python: true,
    network: { dangerouslyAllowFullInternetAccess: true },
    cwd: '/workspace',
})
const bashToolkit = await createBashTool({ sandbox, destination: '/workspace' })
```
bash-tool 通过 `isJustBash()` 自动检测并包装 just-bash 实例为 Sandbox 接口。

---

## 4. Just-Bash 能力验证

### 4.1 70+ 内置命令

**Claim**: Just-Bash 支持 70+ 内置命令

**Verdict**: ✅ Verified — 实际上支持 83+ 命令

**Evidence**: 源码 `node_modules/.pnpm/just-bash@2.9.8/node_modules/just-bash/` 分析

实际命令清单（86 个）：

| 分类 | 命令 | 数量 |
|------|------|------|
| 文件操作 | cat, cp, file, ln, ls, mkdir, mv, readlink, rm, rmdir, split, stat, touch, tree | 14 |
| 文本处理 | awk, base64, column, comm, cut, diff, expand, fold, grep, egrep, fgrep, head, join, md5sum, nl, od, paste, printf, rev, rg, sed, sha1sum, sha256sum, sort, strings, tac, tail, tr, unexpand, uniq, wc, xargs | 32 |
| 数据处理(opt-in) | jq, yq, xan, sqlite3 | 4 |
| 压缩归档 | gzip, gunzip, zcat, tar | 4 |
| 导航环境 | basename, cd, dirname, du, echo, env, export, find, hostname, printenv, pwd, tee | 12 |
| Shell 工具 | alias, bash, chmod, clear, date, expr, false, help, history, seq, sh, sleep, time, timeout, true, unalias, which, whoami | 18 |
| 网络(opt-in) | curl | 1 |
| Python(opt-in) | python3, python | 2 |
| HTML | html-to-markdown | 1 |
| **总计** | | **88** |

**纠正**：需求文档说 "70+ 内置命令" 是**保守估计**，实际为 83 核心命令 + 网络/Python 可选命令。

### 4.2 "不执行真实系统命令"

**Claim**: Just-Bash 不执行真实系统命令（git, npm, docker 不可用）

**Verdict**: ✅ Verified

**Evidence**: Just-Bash 使用纯 JavaScript/TypeScript 实现所有命令，不调用任何系统二进制文件。架构是 Input → Parser → AST → Interpreter → Output，完全在 V8 引擎内运行。git, npm, docker 等外部二进制不在命令列表中。

### 4.3 虚拟文件系统类型

**Claim**: Just-Bash 有虚拟文件系统

**Verdict**: ✅ Verified — 实际支持 4 种文件系统

**Evidence**: 源码确认 4 种 `IFileSystem` 实现：

1. **InMemoryFs**（默认）— 纯内存文件系统，无磁盘访问
2. **OverlayFs** — Copy-on-Write，从真实目录读取，写入在内存
3. **ReadWriteFs** — 直接读写真实文件系统
4. **MountableFs** — 挂载组合多种文件系统到不同路径

当前项目使用 `MountableFs`（在 `builtin-tools.ts` 中）。

---

## 5. macOS sandbox-exec vs Linux bubblewrap

### 5.1 平台差异

**Claim**: macOS 使用 sandbox-exec，Linux 使用 bubblewrap，行为可能不一致

**Verdict**: ✅ Verified — 确实存在重要差异

**Evidence**: 源码分析确认以下差异：

| 特性 | macOS (sandbox-exec) | Linux (bubblewrap) |
|------|---------------------|-------------------|
| **隔离机制** | Seatbelt 安全配置文件（Apple Sandbox API） | 用户命名空间 + seccomp BPF |
| **文件系统 Glob** | ✅ 原生支持（转为 regex） | ❌ 不支持 glob，需通过 ripgrep 展开 |
| **网络隔离** | 限制到 localhost proxy 端口 | `--unshare-net` 网络命名空间隔离 |
| **Unix Socket 阻止** | Seatbelt 规则 | seccomp BPF filter（仅 x64/arm64） |
| **违规检测** | ✅ 实时 `log stream` 监控 | ❌ 无内置实时检测，需 strace |
| **依赖** | 内置 sandbox-exec | bwrap + socat + ripgrep（需安装） |
| **PTY 支持** | `allowPty: boolean` 选项 | 无此选项 |
| **Seccomp** | 不适用 | 可选 BPF filter |
| **Docker 兼容** | 不适用 | `enableWeakerNestedSandbox` |
| **Windows** | ❌ 不支持 | ❌ 不支持 |

### 5.2 关键差异影响

**⚠️ 需要特别注意的差异**：

1. **Glob 支持**：macOS 上文件系统规则可以使用 glob 模式（如 `**/.env`），但 Linux 上需要通过 ripgrep 提前展开为具体路径列表。这意味着：
   - Linux 上 `mandatoryDenySearchDepth`（默认 3）限制了扫描深度
   - 运行时新创建的匹配文件在 Linux 上可能不被保护
   - macOS 上 glob 由内核实时匹配，更可靠

2. **违规检测**：macOS 可实时检测并记录违规事件，Linux 不能。这影响安全审计能力。

3. **依赖安装**：Linux 用户需要额外安装 bwrap、socat、ripgrep。需要在 UI 中检测依赖状态并提示。

4. **平台检测**：`isSupportedPlatform()` — macOS 始终支持，Linux 除 WSL1 外支持，Windows 不支持。

### 5.3 Windows 兼容性

**Claim**: Windows 不支持 Sandbox Runtime，需要 fallback 到 Just-Bash

**Verdict**: ✅ Verified

**Evidence**: `isSupportedPlatform()` 明确排除 Windows。需求文档的 fallback 策略正确。

---

## 6. 需求文档中的其他技术细节验证

### 6.1 配置结构中的 `enablePython`

**Claim**: sandbox 配置中有 `enablePython` 字段

**Verdict**: ⚠️ Partially true — 这是 **Just-Bash** 的配置，不是 Sandbox Runtime 的

**Evidence**:
- Sandbox Runtime (`@anthropic-ai/sandbox-runtime`) 没有 `enablePython` 字段
- Just-Bash 有 `python: boolean` 选项（启用 Pyodide-based python3/python 命令）
- 在 Sandbox 模式下，`enablePython` 无意义（因为 Sandbox 执行的是真实系统命令，Python 可用性取决于系统安装）
- **建议**：`enablePython` 仅在 Restricted 模式（Just-Bash）中有效。在 Sandbox 模式中，应替换为是否允许 `python3` 命令（通过 `deniedCommands` 实现）

### 6.2 `deniedCommands` 字段

**Claim**: sandbox 配置中有 `deniedCommands` 字段用于命令黑名单

**Verdict**: ⚠️ Partially true — 这是**应用层**的功能，不是 Sandbox Runtime 原生支持

**Evidence**:
- Sandbox Runtime 本身**没有**命令黑名单功能
- Sandbox Runtime 只提供文件系统和网络隔离
- `deniedCommands` 需要在我们的 `AnthropicSandbox` 适配器层实现（在 `executeCommand` 调用 `wrapWithSandbox` 之前检查）
- 这是正确的设计 — 命令黑名单作为应用层安全策略，独立于 OS 级沙箱

### 6.3 `allowGitConfig` 字段

**Claim**: sandbox 配置中有 `allowGitConfig` 字段

**Verdict**: ✅ Verified — 这是 Sandbox Runtime 原生支持的

**Evidence**: `FilesystemConfig` 中包含 `allowGitConfig?: boolean`（默认 false）。当 false 时，`.git/config` 被加入 mandatory deny 列表。

### 6.4 SandboxRuntimeConfig 完整类型

**Verdict**: ✅ 补充信息 — 需求文档配置结构需要对齐

实际 `SandboxRuntimeConfig` 类型：
```typescript
interface SandboxRuntimeConfig {
  network: NetworkConfig
  filesystem: FilesystemConfig
  ignoreViolations?: Record<string, string[]>
  enableWeakerNestedSandbox?: boolean
  enableWeakerNetworkIsolation?: boolean
  ripgrep?: { command: string; args?: string[] }
  mandatoryDenySearchDepth?: number
  allowPty?: boolean
  seccomp?: { bpfPath?: string; applyPath?: string }
}
```

需求文档的简化配置（`filesystem` + `network` + `enablePython` + `deniedCommands`）是应用层的抽象，最终需要映射到 `SandboxRuntimeConfig`。

---

## 7. 综合评估

### 需求文档准确性总结

| # | 技术声明 | 状态 | 说明 |
|---|---------|------|------|
| 1 | SandboxManager.wrapWithSandbox() API | ✅ Verified | 签名正确，返回包裹后的命令字符串 |
| 2 | 网络代理支持（allowedDomains） | ✅ Verified | 完整的 HTTP/SOCKS 代理架构 |
| 3 | 文件系统规则（denyRead/allowWrite/denyWrite） | ✅ Verified | 配置类型完全一致 |
| 4 | Stdio passthrough | ✅ Verified | 通过 spawn + shell: true 实现 |
| 5 | Worker Pool via fork() | ✅ Verified | 可行，每个进程独立 SandboxManager |
| 6 | bash-tool Sandbox 接口签名 | ✅ Verified | 三个方法签名完全准确 |
| 7 | Just-Bash 70+ 命令 | ✅ Verified | 实际 83+ 核心命令（保守估计） |
| 8 | Just-Bash 虚拟文件系统 | ✅ Verified | 4 种 FS 类型：InMemory/Overlay/ReadWrite/Mountable |
| 9 | macOS sandbox-exec vs Linux bubblewrap | ✅ Verified | 差异显著，需处理 glob/依赖/检测差异 |
| 10 | Windows 不支持 → fallback Just-Bash | ✅ Verified | isSupportedPlatform() 排除 Windows |
| 11 | `enablePython` 在 Sandbox 模式 | ⚠️ Partially true | 仅 Just-Bash 有此字段，Sandbox 模式需不同实现 |
| 12 | `deniedCommands` 是 Sandbox Runtime 功能 | ⚠️ Partially true | 需应用层实现，非 Sandbox Runtime 原生 |
| 13 | `allowGitConfig` 字段 | ✅ Verified | Sandbox Runtime 原生支持 |

### 关键建议

1. **SandboxManager 初始化**：需求文档应明确 `initialize()` 调用时机和参数（包括 `sandboxAskCallback`）
2. **Mandatory Deny Paths**：Sandbox Runtime 有内置的强制拒绝路径列表，这些路径无法通过配置覆盖。应在 UI 中展示
3. **依赖检查**：Linux 需要安装 bwrap/socat/ripgrep，应在启动时检测（`checkDependencies()`）
4. **enablePython 语义**：在 Sandbox 模式下重新定义为 "是否将 python3 加入 deniedCommands"
5. **Cleanup**：需要调用 `cleanupAfterCommand()` 和 `reset()` 管理资源
6. **Violation Store**：可选集成 `getSandboxViolationStore()` 提供安全审计日志

---

## 8. 参考来源

- **sandbox-runtime 源码**: `/Users/cai/developer/github/sandbox-runtime/src/sandbox/`
- **bash-tool 源码**: `node_modules/.pnpm/bash-tool@1.3.14/node_modules/bash-tool/dist/`
- **just-bash 源码**: `node_modules/.pnpm/just-bash@2.9.8/node_modules/just-bash/`
- **npm 包页**: https://www.npmjs.com/package/@anthropic-ai/sandbox-runtime
- **GitHub 仓库**: https://github.com/anthropic-experimental/sandbox-runtime
- **项目代码**: `packages/server/src/agent/builtin-tools.ts`
