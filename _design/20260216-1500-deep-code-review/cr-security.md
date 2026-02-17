# 安全审查报告

> 审查者: CR-Security
> 日期: 2026-02-16
> 审查范围: 全代码库（`apps/desktop/`, `packages/server/`, `packages/shared/`, `packages/ui/`）

## 审查概览
- 审查文件数：48
- 发现问题数：Critical: 2 / High: 5 / Medium: 6 / Low: 4

---

## Critical 问题

### [S-C-001] MCP Sandbox 包裹失败时静默降级为无沙箱运行
- **文件**: `packages/server/src/agent/mcp-pool.ts:535-539`
- **漏洞类型**: 权限绕过 / Sandbox 逃逸
- **问题**: 当 MCP server 的 sandbox 包裹（`wrapWithSandbox`）失败时，代码仅记录 warn 日志，然后 **继续以无沙箱方式运行 MCP server 命令**。这意味着配置为 sandbox 模式的项目，其 MCP server 可能在完全无隔离的情况下执行。
- **代码路径**:
  ```
  buildTransport() → sandbox wrapping try/catch → catch: log.warn + proceed without sandbox
  ```
  ```typescript
  // mcp-pool.ts:535-539
  } catch (err) {
    log.warn(
      { err, name: server.name },
      'failed to wrap MCP command with sandbox, proceeding without sandbox',
    )
  }
  ```
- **攻击路径**: 如果 sandbox runtime 初始化失败（例如依赖缺失、权限问题、竞态条件），MCP server 会以 unrestricted 方式运行，绕过所有 filesystem/network/command 限制。用户不会收到明确通知。
- **建议**:
  1. sandbox wrapping 失败时应 **阻止 MCP server 启动**（fail-closed），而非静默降级
  2. 或至少返回 error 到上层，让用户在 UI 中看到明确警告
  3. 将日志级别从 `warn` 提升为 `error`

### [S-C-002] Unrestricted 模式下的 NativeSandbox 无任何安全检查
- **文件**: `packages/server/src/agent/native-sandbox.ts:39-41`, `packages/server/src/agent/builtin-tools.ts:100-110`
- **漏洞类型**: 缺失安全控制 / 命令注入
- **问题**: `NativeSandbox` 在 unrestricted 模式下 **完全没有** command blacklist 检查、path validation、或任何安全控制。所有命令直接通过 `bash -c` 执行，可以访问整个主机系统。
- **代码路径**:
  ```
  createBashToolForMode(unrestricted) → NativeSandbox → spawn('bash', ['-c', command])
  ```
  ```typescript
  // native-sandbox.ts:39-41
  async executeCommand(command: string): Promise<CommandResult> {
    return this.spawnCommand(command)
  }
  // 没有任何 checkBlacklist 或 validatePath 调用
  ```
  对比 `AnthropicSandbox`:
  ```typescript
  // anthropic-sandbox.ts:96-99
  async executeCommand(command: string): Promise<CommandResult> {
    this.checkBlacklist(command)  // ← NativeSandbox 没有这个
    return this.executeWrapped(command)
  }
  ```
- **攻击路径**: AI agent 在 unrestricted 模式下可以执行 `rm -rf /`、`sudo` 等危险命令。虽然 unrestricted 模式按设计是「无限制」的，但连最基本的 `BUILTIN_DANGEROUS_PATTERNS`（如 fork bomb、rm root）都不检查，风险极高。
- **建议**:
  1. 即使在 unrestricted 模式，也应保留 `BUILTIN_DANGEROUS_PATTERNS` 检查（fork bomb、rm /、dd to device 等致命操作）
  2. 至少在 NativeSandbox 中添加 `deniedCommands` 检查（用户配置的命令黑名单）
  3. 在 UI 中使用更强的警告语，明确告知用户 unrestricted 模式的风险

---

## High 问题

### [S-H-001] API 认证令牌通过 process.argv 暴露给渲染进程
- **文件**: `apps/desktop/src/main/index.ts:185-188`, `apps/desktop/src/preload/index.ts:8-9`
- **漏洞类型**: 敏感数据暴露
- **问题**: 服务器认证令牌（`serverToken`）通过 `additionalArguments` 传递到渲染进程的 `process.argv`，再由 preload 脚本解析并通过 `contextBridge` 暴露为 `window.electronAPI.getServerToken()`。
- **完整调用链**:
  ```
  server (IPC) → main process (serverToken) → additionalArguments
  → preload (process.argv parse) → contextBridge → renderer (window.electronAPI.getServerToken())
  ```
- **攻击路径**: 如果渲染进程被 XSS 攻击或恶意代码入侵，攻击者可以直接调用 `window.electronAPI.getServerToken()` 获取认证令牌，然后直接调用 server API 执行任意操作。
- **建议**:
  1. 不要通过 `contextBridge` 直接暴露 token。改为在 preload 中封装 HTTP 请求函数，自动注入 token，不让渲染进程直接接触 token
  2. 或者使用 Electron 的 `session.setPermissionRequestHandler` 等机制来控制访问

### [S-H-002] WebSocket 连接无认证机制
- **文件**: `packages/server/src/ws/handler.ts:16-19`
- **漏洞类型**: 缺失认证
- **问题**: WebSocket 连接没有 Bearer token 验证。HTTP API 有 `authToken` 保护（`app.ts:61-68`），但 WebSocket handler (`WebSocketManager`) 完全没有认证逻辑。任何连接到 localhost 的客户端都可以建立 WebSocket 连接、订阅任意频道、接收所有事件。
- **攻击路径**: 本地恶意进程可以连接 WebSocket，监听 agent 的实时事件流（可能包含敏感数据如对话内容、tool call 结果等）。
- **建议**:
  1. 在 WebSocket 握手时验证 Bearer token（通过 URL query parameter 或 Sec-WebSocket-Protocol header）
  2. 实现频道级别的权限控制（按 projectId 隔离）

### [S-H-003] Sandbox 模式失败时静默降级为 Restricted 模式
- **文件**: `packages/server/src/agent/builtin-tools.ts:94-97`
- **漏洞类型**: 权限降级 / 安全模式变更
- **问题**: 当 sandbox 模式的 Bash tool 创建失败时，代码静默回退到 restricted 模式。虽然 restricted 模式比 unrestricted 更安全，但两者的安全属性完全不同：restricted 是虚拟沙箱（just-bash），sandbox 是 OS 级隔离（sandbox-exec/bubblewrap）。用户选择了 sandbox 模式，但实际可能运行在 restricted 模式下而不自知。
  ```typescript
  // builtin-tools.ts:94-97
  } catch (err) {
    log.warn({ err, mode }, 'sandbox mode unavailable, falling back to restricted')
    return createRestrictedBashTool(options)
  }
  ```
- **攻击路径**:
  1. restricted 模式使用 just-bash 虚拟沙箱，其安全保证完全依赖 JavaScript 实现，不如 OS 级沙箱可靠
  2. restricted 模式的网络配置是 `dangerouslyAllowFullInternetAccess: true`（`builtin-tools.ts:182`），即使用户在 sandbox 模式下配置了网络限制，降级后网络限制失效
- **建议**:
  1. 降级时应向用户发出明确警告（通过 tool warnings 机制）
  2. 考虑 fail-closed 策略：sandbox 不可用时拒绝执行，而非静默降级
  3. 至少记录 error 级别日志而非 warn

### [S-H-004] API Key 明文存储且通过 API 完整返回
- **文件**: `packages/server/src/storage/settings.ts:25-28`, `packages/server/src/routes/settings.ts:10-13`
- **漏洞类型**: 敏感数据暴露
- **问题**: AI provider API keys（`ProviderConfig.apiKey`）以明文 JSON 存储在 `~/.golemancy/settings.json`，且 `GET /api/settings` 端点返回完整的 settings 对象，包含所有 API keys。
- **调用链**:
  ```
  GET /api/settings → FileSettingsStorage.get() → readJson(settings.json) → 返回完整 GlobalSettings（含所有 apiKey）
  ```
- **攻击路径**:
  1. 本地文件系统访问（同机其他进程可读取 `~/.golemancy/settings.json`）
  2. 任何能调用 `/api/settings` 的代码（含 XSS 攻击后获得 token 的场景）都能一次性获取所有 API keys
- **建议**:
  1. GET 响应中对 API key 进行掩码处理（例如只返回前4字符+星号）
  2. 需要完整 key 时使用单独的安全端点
  3. 考虑使用操作系统密钥链（macOS Keychain / Windows Credential Manager / Linux Secret Service）存储 API keys
  4. 至少设置文件权限为 0600

### [S-H-005] 命令黑名单解析器可被复杂 shell 构造绕过
- **文件**: `packages/server/src/agent/check-command-blacklist.ts:180-253`
- **漏洞类型**: 安全检查绕过
- **问题**: `splitCommandSegments` 和 `extractCommandName` 对 shell 语法的解析是尽力而为的（best-effort），无法覆盖所有 shell 构造。以下构造可以绕过检查：
  1. **嵌套子shell**: `$($(echo su)do command)` — 只解析一层 `$(...)`
  2. **heredoc**: `bash <<< "sudo rm -rf /"` — 未处理 here-string
  3. **process substitution**: `bash <(echo "sudo rm -rf /")` — 未处理 `<()`
  4. **eval**: `eval "su""do" command` — eval 内的字符串拼接不会被检测
  5. **变量扩展**: `cmd=sudo; $cmd rm -rf /` — 变量引用不会被检测
  6. **base64 编码**: `echo c3Vkbw== | base64 -d | bash` — 编码绕过
- **重要上下文**: 这个黑名单是 **应用层** 防御，在 sandbox 模式下有 OS 级沙箱作为主要防线。此问题主要影响依赖此黑名单作为唯一防线的场景（unrestricted 模式下如果启用了 deniedCommands）。
- **建议**:
  1. 在文档/UI 中明确说明命令黑名单是辅助防御，不应作为唯一安全依赖
  2. 考虑将 `eval`、`bash`、`sh`、`source`/`.` 加入默认 `BUILTIN_DANGEROUS_PATTERNS`
  3. 对于高安全需求场景，推荐使用 sandbox 模式而非仅依赖命令黑名单

---

## Medium 问题

### [S-M-001] Electron 渲染进程 `sandbox: false` 削弱 Chromium 进程沙箱
- **文件**: `apps/desktop/src/main/index.ts:184`
- **漏洞类型**: 安全配置缺失
- **问题**: `BrowserWindow` 的 `webPreferences` 设置了 `sandbox: false`，这禁用了 Chromium 的操作系统级进程沙箱。虽然 `contextIsolation` 在 Electron v20+ 默认为 `true`（preload 与 renderer 在不同 JS 上下文），但禁用 sandbox 意味着渲染进程的 exploit 更容易逃逸。
- **现代 Electron 实际影响**: `sandbox: false` 在现代 Electron 中主要是为了让 preload 脚本能使用 Node.js API（如 `process.argv`）。当 `contextIsolation: true`（默认）时，渲染进程的 JS 代码无法直接访问 Node API。因此实际风险被大幅降低。
- **建议**:
  1. 考虑使用 `sandbox: true` + `preload` 中仅使用 `contextBridge` 和有限的 Node API（通过 electron v20+ 的 utility process 等替代方案）
  2. 这是一个 defense-in-depth 改进，不是紧急修复

### [S-M-002] 权限配置验证缺少字段必填性检查
- **文件**: `packages/server/src/agent/validate-permissions-config.ts:62-93`
- **漏洞类型**: 输入验证不足
- **问题**: `validatePermissionsConfigFile` 中 `title`、`mode`、`config` 都是可选的（`if (d.title !== undefined)` / `if (d.mode !== undefined)` / `if (d.config !== undefined)`）。这意味着可以通过 POST/PATCH 创建一个没有 `mode` 或 `config` 的权限配置文件。
- **影响**: 当 `resolvePermissionsConfig` 加载这样的配置时，`configFile.mode` 为 `undefined`，可能导致意外行为。例如在 `builtin-tools.ts:61` 中 `mode` 会被默认为 `'restricted'`（`const mode = resolved?.mode ?? 'restricted'`），这可能不符合用户预期。
- **建议**:
  1. 在 POST 创建时要求 `title`、`mode`、`config` 为必填
  2. 在 PATCH 更新时可以保持可选（部分更新）
  3. 添加 `mode` 值的白名单校验（目前已有，但仅在 mode 存在时检查）

### [S-M-003] Restricted 模式的 just-bash 虚拟沙箱配置了全网络访问
- **文件**: `packages/server/src/agent/builtin-tools.ts:182`
- **漏洞类型**: 安全配置宽松
- **问题**: restricted 模式创建的 just-bash 实例配置了 `network: { dangerouslyAllowFullInternetAccess: true }`。这意味着在虚拟沙箱内的代码可以进行任意网络请求。
  ```typescript
  sandbox = new Bash({
    fs: mountableFs,
    python: true,
    network: { dangerouslyAllowFullInternetAccess: true },
    cwd: '/workspace',
  })
  ```
- **影响**: restricted 模式本应是最严格的模式（虚拟文件系统），但网络完全不受限。虚拟沙箱内的 Python 代码可以向外发送数据。
- **建议**:
  1. 评估 just-bash 是否支持网络限制配置
  2. 如不支持，在 UI/文档中明确说明 restricted 模式的网络行为
  3. 考虑是否需要将 restricted 模式的网络访问权限与 sandbox 模式对齐

### [S-M-004] CORS 正则表达式允许端口号为空的 localhost 请求
- **文件**: `packages/server/src/app.ts:51`
- **漏洞类型**: CORS 配置
- **问题**: CORS origin 正则 `/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/` 中端口号是可选的（`(:\d+)?`）。这允许来自 `http://localhost`（端口80）和 `http://127.0.0.1`（端口80）的请求。这不是严重问题（因为 server 绑定到 127.0.0.1），但略微扩大了允许的来源范围。
- **实际风险**: 低。因为 server 绑定到 127.0.0.1（`index.ts:72`），只有本地进程能访问。CORS 的安全作用主要依赖浏览器实施，本地应用的安全边界在于网络绑定和 auth token。
- **建议**: 可以保持现状，此为信息级别记录。

### [S-M-005] 路径遍历检查的竞态条件（TOCTOU）
- **文件**: `packages/server/src/agent/validate-path.ts:171-208`
- **漏洞类型**: TOCTOU 竞态条件
- **问题**: `validatePathAsync` 先做同步校验（fast-fail），再做 `fs.realpath()` 解析 symlink。在这两步之间，攻击者（或同时运行的进程）可能创建或修改 symlink，使得最终操作的路径与校验时的路径不同。
- **实际风险**: 在此应用场景中，攻击窗口极小且攻击者需要本地文件系统访问权限。此外，AnthropicSandbox 有 OS 级沙箱作为二层防护，即使 TOCTOU 攻击成功，OS 沙箱也会阻止越权操作。
- **建议**: 这是已知的文件系统安全限制，当前的防御层次（应用层 + OS 层）已经足够。记录为已知风险即可。

### [S-M-006] 设置 API 无输入验证
- **文件**: `packages/server/src/routes/settings.ts:16-23`
- **漏洞类型**: 输入验证不足
- **问题**: `PATCH /api/settings` 端点直接将请求 body 传递给 `storage.update(data)`，无任何字段白名单或类型验证。攻击者可以注入任意字段到 settings 对象中。
  ```typescript
  app.patch('/', async (c) => {
    const data = await c.req.json()
    const updated = await storage.update(data)  // 无验证
    return c.json(updated)
  })
  ```
- **影响**: 由于 `FileSettingsStorage.update` 使用 spread operator（`{ ...existing, ...data }`），恶意字段会被写入 `settings.json`。虽然不会直接导致代码执行，但可能影响应用行为（例如修改 `defaultProvider` 等）。
- **建议**:
  1. 添加字段白名单（只允许已知字段）
  2. 添加类型验证（provider 必须是有效枚举值等）

---

## Low 问题

### [S-L-001] macOS 签名 entitlements 包含宽松权限
- **文件**: `apps/desktop/resources/build/entitlements.mac.plist:10`
- **漏洞类型**: 安全配置
- **问题**: entitlements 包含 `com.apple.security.cs.disable-library-validation`，允许加载未签名的动态库。这是 Electron 应用的常见做法（Node native modules 需要），但降低了 macOS 的 library validation 保护。
- **实际风险**: 低。这是 Electron 生态的标准做法，`allow-jit` 和 `allow-unsigned-executable-memory` 也是 V8/Chromium 所必需的。
- **建议**: 记录为已知配置，无需修改。

### [S-L-002] Python 包安装可执行 setup.py 中的任意代码
- **文件**: `packages/server/src/runtime/python-manager.ts:103-121`
- **漏洞类型**: 供应链风险
- **问题**: `pip install` 会执行包的 `setup.py`，恶意包可以在安装过程中执行任意代码。这是 pip 生态的已知风险。包名验证正则 `/^[a-zA-Z0-9._\-\[\]>=<!, ]+$/`（`routes/runtime.ts:56`）可以防止命令注入到 pip 命令行，但无法防止恶意包内容。
- **实际风险**: 中低。用户手动选择安装哪些包，但 AI agent 可能被误导安装恶意包（typosquatting 等）。
- **建议**:
  1. 考虑在 sandbox 模式下通过沙箱执行 pip install
  2. 在 UI 中展示安装包的警告信息

### [S-L-003] 项目路由缺少部分输入验证
- **文件**: `packages/server/src/routes/projects.ts:26-37`
- **漏洞类型**: 输入验证不足
- **问题**: `POST /api/projects` 和 `PATCH /api/projects/:id` 直接将 `c.req.json()` 传给 storage，没有验证 name、description 等字段的类型和长度。
- **实际风险**: 低。storage 层生成 ID 时使用 `generateId()`（`utils/ids.ts`），ID 格式安全。文件存储层对路径做了 `validateId()` 检查。但缺少业务层验证可能导致存储异常大的数据。
- **建议**: 添加基本的输入验证（字段白名单、长度限制）。

### [S-L-004] 健康检查端点泄露服务器时间
- **文件**: `packages/server/src/app.ts:80-82`
- **漏洞类型**: 信息泄露（极低风险）
- **问题**: `GET /api/health` 返回 `timestamp: new Date().toISOString()`。这在严格安全要求下可能被认为是信息泄露（服务器时钟信息）。但由于此应用绑定到 localhost，实际风险可忽略。
- **建议**: 无需修改，记录为信息级别。

---

## 按领域汇总

### Permission 系统
**安全性评估**: 中高。三层模式（restricted/sandbox/unrestricted）设计合理，但降级行为是关键风险。

| 项目 | 评价 |
|------|------|
| 模式设计 | **合理** — restricted（虚拟沙箱）→ sandbox（OS 隔离）→ unrestricted（无限制）渐进式 |
| 权限解析 | **良好** — `resolvePermissionsConfig` 正确处理模板变量、路径遍历检查、平台差异 |
| 路径验证 | **优秀** — null byte 检测、长度限制、tilde 展开、symlink 解析、mandatory deny 列表 |
| 命令黑名单 | **尚可** — 多层检查（command name + pipeline + builtin + user patterns），但可被复杂 shell 构造绕过 |
| 降级行为 | **需改进** — sandbox 失败 → 静默降级到 restricted；MCP sandbox 失败 → 静默继续无沙箱 |
| 配置验证 | **需改进** — 缺少必填字段检查 |

**可用性评估**:
- 三模式设计对用户来说直观易懂
- Permission config 的模板变量（`{{workspaceDir}}` 等）提供了灵活性
- 默认配置涵盖了常见的 deny read/write 路径和 denied commands
- **问题**: 用户可能不清楚 restricted 模式的网络不受限，也不清楚降级行为的存在

### Sandbox 功能
**安全性评估**: 高。OS 级沙箱（sandbox-exec on macOS / bubblewrap on Linux）提供了强隔离。

| 项目 | 评价 |
|------|------|
| OS 隔离 | **良好** — 使用 `@anthropic-ai/sandbox-runtime` 的 sandbox-exec（macOS）/ bubblewrap（Linux） |
| 防御纵深 | **优秀** — 应用层（validatePath + checkBlacklist）+ OS 层（sandbox-exec）双重检查 |
| 环境隔离 | **良好** — `SAFE_ENV_KEYS` 白名单限制传递给子进程的环境变量 |
| 文件写入 | **良好** — writeFiles 先写 /tmp 再通过沙箱 cp，避免绕过 |
| 工作进程隔离 | **良好** — 每项目独立 worker 进程，通过 IPC 通信 |
| mandatory deny | **良好** — 共享库级和应用级双重 mandatory deny write 列表 |

**关键风险**: 降级行为（S-C-001, S-H-003）

### Code Runtime
**安全性评估**: 中。Python venv 和 Node.js 运行时本身不提供安全隔离。

| 项目 | 评价 |
|------|------|
| Python venv | **正确** — 每项目独立 venv，使用 bundled Python 或系统 python3 |
| Node.js | **正确** — bundled Node.js 通过 PATH 注入，与系统 Node.js 隔离 |
| pip 安全 | **基本** — 包名正则验证防止命令注入，但不防恶意包内容 |
| PATH 注入 | **良好** — `buildRuntimeEnv` 正确设置 PATH 优先级（venv > bundled > system） |
| 缓存隔离 | **良好** — pip/npm 缓存在项目/全局独立目录 |

### Electron 安全
**安全性评估**: 中高。关键配置基本正确。

| 项目 | 评价 |
|------|------|
| nodeIntegration | **良好** — 未显式设置，默认为 false |
| contextIsolation | **良好** — 未显式设置，默认为 true（Electron v20+） |
| sandbox | **需关注** — 显式设置为 false，削弱 Chromium 进程沙箱 |
| preload | **良好** — 使用 `contextBridge.exposeInMainWorld` 正确暴露有限 API |
| 暴露面 | **需改进** — token 通过 contextBridge 暴露给渲染进程 |
| IPC | **良好** — 仅一个 IPC handler（`window:open`），功能简单 |
| 菜单 | **良好** — DevTools 仅在开发模式可用 |
| 远程内容 | **良好** — 未加载远程 URL（除 dev 模式的 HMR） |
| CSP | **需改进** — HTML 中未设置 Content-Security-Policy meta 标签 |

### IPC 安全
**安全性评估**: 良好。

| 项目 | 评价 |
|------|------|
| Server IPC | **良好** — 通过 `child_process.fork()` 的内置 IPC channel，进程间隔离 |
| 令牌传递 | **良好** — token 通过 IPC 从 server 传递到 main process，非网络暴露 |
| Sandbox Worker IPC | **良好** — UUID-based request/response 关联，超时处理，崩溃恢复 |
| WebSocket | **需改进** — 无认证机制 |

### 敏感数据
**安全性评估**: 需改进。

| 项目 | 评价 |
|------|------|
| API Key 存储 | **需改进** — 明文 JSON，无加密，无文件权限控制 |
| API Key 传输 | **需改进** — GET /api/settings 返回完整 key |
| Auth Token | **良好** — crypto.randomUUID() 生成，每次启动刷新 |
| deny read 列表 | **良好** — 覆盖 .env、SSH keys、AWS credentials 等常见敏感路径 |
| 日志安全 | **良好** — 错误处理不在生产环境泄露 stack trace |

### 其他
- **Body Size Limit**: 2MB — 合理
- **Server Binding**: 127.0.0.1 — 正确，不暴露到网络
- **ID Validation**: `validateId()` 使用严格正则 — 防止路径遍历
- **Error Handling**: 生产环境不泄露详细错误信息 — 良好
- **XSS**: UI 代码未使用 `dangerouslySetInnerHTML`（仅测试文件中有 `innerHTML` 读取用于断言）— 良好
- **SQL Injection**: 使用 drizzle-orm 参数化查询 — 良好
- **CSRF**: localhost-only + Bearer token + CORS 限制 — 风险极低
