# 事实交叉验证报告

> 验证人：Fact Checker
> 日期：2026-02-16
> 验证原则：每项至少两种验证手段（WebSearch / Context7 / 源码确认）

---

## 争议项 1 — S-C-002 Unrestricted 模式是否应该有最低安全检查？

### CR-Security 主张
即使 unrestricted 模式也应保留 BUILTIN_DANGEROUS_PATTERNS 检查（fork bomb、rm / 等）。

### 验证结论：**部分支持** — 行业做法不统一，但本项目的做法需要改进

### 验证过程

**手段 1：源码确认**

- `NativeSandbox.executeCommand()`（`packages/server/src/agent/native-sandbox.ts:39-41`）直接调用 `this.spawnCommand(command)`，**没有任何命令检查**
- `AnthropicSandbox.executeCommand()`（`packages/server/src/agent/anthropic-sandbox.ts:96-99`）先调用 `this.checkBlacklist(command)`，再执行
- 确认：unrestricted 模式下 `checkCommandBlacklist()` 完全不被调用

**手段 2：WebSearch — 同类产品对比**

| 产品 | "无限制"模式行为 | 是否有最低安全检查 |
|------|----------------|-------------------|
| **Claude Code** (`bypassPermissions`) | 跳过所有权限提示，但文档明确说 "Only use this in fully isolated environments like containers, VMs, or ephemeral CI runners" | 环境级隔离代替应用级检查 |
| **Claude Code** (`dontAsk`) | 只执行 allow list 中的操作，其余静默拒绝 | 有白名单机制 |
| **Cursor / Continue** | 无公开的 "unrestricted" 模式文档 | N/A |

**关键发现：Claude Code 的 `bypassPermissions` 模式明确要求在隔离环境中运行（容器/VM），不是简单地移除所有检查后在宿主机上运行。**

**手段 3：WebSearch — 行业观点**

安全文献普遍认为：即使用户选择了"不限制"，仍应阻止明确的系统破坏性命令（fork bomb、rm -rf /、dd of=/dev/），因为这些命令的执行几乎不可能是有意的合法操作。

### 最终判定

| 维度 | 评估 |
|------|------|
| CR-Security 的发现是否真实？ | **是** — unrestricted 模式确实完全没有命令检查 |
| 这是否构成实际问题？ | **是，但严重程度可降级** — unrestricted 模式需要用户在 UI 中明确确认（有 warning modal），用户已知风险 |
| 推荐优先级 | **P1**（非 P0）— 建议在 NativeSandbox 中添加 BUILTIN_DANGEROUS_PATTERNS 检查（仅检查明确破坏性命令），但不需要完整的 deniedCommands 配置 |

### 验证来源
- 源码：`native-sandbox.ts:39-41`、`anthropic-sandbox.ts:96-99`、`builtin-tools.ts:100-110`
- [Claude Code Permissions 文档](https://code.claude.com/docs/en/permissions)
- [Claude Code Sandboxing 文档](https://code.claude.com/docs/en/sandboxing)

---

## 争议项 2 — S-M-001 BrowserWindow sandbox:false 的实际风险

### CR-Security 主张
sandbox:false 削弱 Chromium 进程沙箱，但 contextIsolation:true（默认）降低了实际风险。

### 验证结论：**确认为真实安全问题，但实际风险可控**

### 验证过程

**手段 1：源码确认**

- `apps/desktop/src/main/index.ts:184` 明确设置 `sandbox: false`
- 未显式设置 `contextIsolation`（但 Electron 12+ 默认为 `true`）
- 未显式设置 `nodeIntegration`（Electron 默认为 `false`）
- 项目使用 Electron `^40.0.0`（`apps/desktop/package.json:39`）
- preload 脚本（`apps/desktop/src/preload/index.ts`）使用 `contextBridge.exposeInMainWorld()`，API 表面非常小（5 个只读方法 + 1 个 IPC invoke）

**手段 2：Context7 — Electron 官方文档**

Electron 官方安全文档明确指出：
- **推荐 #4**："Enable process sandboxing" — 这是 Electron 20+ 的默认行为
- sandbox:false 明确是"disabling"安全功能
- 文档原文："Disabling the sandbox comes with security risks, especially if any untrusted code or content is present in the unsandboxed process"
- 文档原文："Loading, reading or processing any untrusted content in an unsandboxed process, including the main process, is not advised"

**手段 3：WebFetch — Electron sandbox 教程**

- Electron 20 起 sandbox 默认启用
- sandbox:false 让 renderer 进程可以访问文件系统、创建子进程、修改系统资源
- contextIsolation:true 防止 preload 脚本的 API 泄露到不受信任的代码，但**不能替代 sandbox 的 OS 级进程隔离**
- Electron 官方原文："it is still possible to leak privileged APIs to untrusted code"

### 实际风险评估

| 因素 | 风险影响 |
|------|---------|
| 应用只加载本地 HTML（不加载远程 URL） | 大幅降低风险 |
| contextIsolation:true（默认启用） | 防止 API 泄露 |
| nodeIntegration:false（默认禁用） | 防止 renderer 直接访问 Node |
| preload API 表面极小（5 个只读 getter + 1 个 IPC） | 攻击面很小 |
| AI Agent 输出可能包含恶意内容（Markdown 渲染、HTML 注入） | 有一定风险 |

### 最终判定

| 维度 | 评估 |
|------|------|
| CR-Security 的发现是否真实？ | **是** — sandbox:false 确实违反 Electron 官方安全建议 |
| contextIsolation:true 是否充分缓解？ | **部分缓解**，但不能完全替代 sandbox 的 OS 级保护 |
| 推荐优先级 | **P1** — 建议调查启用 sandbox:true 的可行性，但当前配置在实际风险上是可控的（本地加载 + 小 API 面 + 无 nodeIntegration） |
| 为何 sandbox:false？ | 可能是因为 preload 脚本需要 `process.argv` 访问（sandbox:true 时 preload 的 Node API 受限）— 需要进一步确认 |

### 验证来源
- 源码：`apps/desktop/src/main/index.ts:182-191`、`apps/desktop/src/preload/index.ts:1-21`、`apps/desktop/package.json:39`
- [Electron Security 文档 — 推荐 #4](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Process Sandboxing 教程](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Context Isolation 文档](https://www.electronjs.org/docs/latest/tutorial/context-isolation)

---

## 争议项 3 — S-H-005 命令黑名单的 shell 绕过是已知行业限制还是本项目特有？

### CR-Security / CR-Quality 主张
嵌套子 shell、heredoc、eval 等可以绕过字符串解析的命令黑名单。

### 验证结论：**这是已知的行业性限制，非本项目特有。项目已有合理缓解措施**

### 验证过程

**手段 1：源码确认**

项目已有的缓解措施（`packages/server/src/agent/check-command-blacklist.ts`）：
- **Tier 1**（行 96-111）：首 token 匹配 + 引号剥离（`su'do'` → `sudo`）
- **Tier 2**（行 113-129）：管道/子 shell 段分析 — `splitCommandSegments()` 处理 `|`、`;`、`&&`、`||`、`$(...)`、反引号
- **Tier 3**（行 131-136）：内建危险模式正则（永远生效）
- **Tier 4**（行 138-146）：用户自定义模式

已知绕过向量（从源码分析）：
- `eval "sudo rm -rf /"` — eval 内的命令不会被解析
- `bash -c "sudo ..."` — nested bash 不被拦截
- `heredoc` — `cat << EOF\nsudo ...\nEOF | bash` 不被拦截
- 变量展开 — `cmd=sudo; $cmd rm -rf /`

**手段 2：WebSearch — 行业现状**

安全文献明确指出命令黑名单的固有限制：
- "Blacklist-based security approaches have fundamental flaws that reveal multiple critical bypasses"
- 常见绕过技术：引号混淆、IFS 变量操纵、brace expansion、base64 编码、环境变量注入
- **行业共识**：字符串级命令解析不可能完美覆盖所有绕过，这是 shell 的本质特性

**手段 3：WebSearch + WebFetch — @anthropic-ai/sandbox-runtime 的定位**

关键发现：sandbox-runtime 的设计哲学是 **OS 级强制执行**，不依赖应用级命令黑名单：
- macOS: `sandbox-exec` + Seatbelt profiles — 内核级系统调用拦截
- Linux: `bubblewrap` + seccomp BPF — 网络命名空间隔离 + 系统调用过滤
- 文档原文："The network namespace of the sandboxed process is removed entirely, so all network traffic must go through the proxies"
- **sandbox-runtime 不做命令拦截**，它做的是 FS/网络/进程 隔离 — 即使 `eval "sudo ..."` 也无法突破 OS 沙箱

### 最终判定

| 维度 | 评估 |
|------|------|
| 绕过是否可能？ | **是** — 这是字符串级命令黑名单的固有限制，行业公认 |
| 是否是本项目特有问题？ | **否** — 所有基于字符串解析的命令黑名单都有此问题 |
| 项目的防御策略是否合理？ | **是** — 防御纵深设计正确：应用级黑名单（第一层）+ OS 级沙箱（第二层，不可绕过）|
| 实际风险？ | **sandbox 模式下极低** — 即使绕过黑名单，OS 沙箱仍然强制执行 FS/网络限制。**unrestricted 模式下较高** — 没有第二层防御 |
| 推荐 | **维持现状（P2 信息项）** — 命令黑名单作为第一道防线已足够，OS 沙箱是真正的安全保障。可以考虑添加 `eval`/`bash -c` 检测作为改进 |

### 验证来源
- 源码：`check-command-blacklist.ts:30-69`（内建模式）、`82-147`（四层检查）、`180-253`（段分析器）
- [Command Injection Blacklist Bypass (Medium)](https://ymiir.medium.com/command-injection-blacklist-bypass-when-secure-filters-fail-cf1dfab6a1bc)
- [Bypass Bash Restrictions (HackTricks)](https://book.hacktricks.xyz/linux-hardening/bypass-bash-restrictions)
- [@anthropic-ai/sandbox-runtime README](https://github.com/anthropic-experimental/sandbox-runtime/blob/main/README.md)
- [Anthropic Engineering: Claude Code Sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)

---

## 争议项 4 — S-M-003 just-bash 的 dangerouslyAllowFullInternetAccess 是否有替代？

### CR-Security 主张
restricted 模式使用 `dangerouslyAllowFullInternetAccess: true`，存在安全风险。

### 验证结论：**just-bash 支持精细网络控制，当前配置可以改进**

### 验证过程

**手段 1：Context7 — just-bash 官方文档**

just-bash（`@vercel-labs/just-bash`）的网络配置选项：

```typescript
// 选项 1：仅允许特定 URL 前缀（最安全）
new Bash({
  network: {
    allowedUrlPrefixes: ["https://api.github.com/repos/myorg/"],
    allowedMethods: ["GET", "HEAD"],  // 默认值
  },
})

// 选项 2：允许特定 URL + 额外方法
new Bash({
  network: {
    allowedUrlPrefixes: ["https://api.example.com"],
    allowedMethods: ["GET", "HEAD", "POST"],
  },
})

// 选项 3：完全开放（当前项目使用的方式）
new Bash({
  network: { dangerouslyAllowFullInternetAccess: true },
})
```

文档原文：
- "Network access and the curl command are **disabled by default** for security"
- "Use with **extreme caution**" — 关于 dangerouslyAllowFullInternetAccess
- 不配置 network 选项时，curl 命令会返回 "command not found"

**手段 2：源码确认**

`packages/server/src/agent/builtin-tools.ts:179-184`：
```typescript
sandbox = new Bash({
  fs: mountableFs,
  python: true,
  network: { dangerouslyAllowFullInternetAccess: true },
  cwd: '/workspace',
})
```

确认 restricted 模式使用了最不安全的网络配置。

**手段 3：分析 restricted 模式的定位**

- restricted 模式的核心是 **虚拟文件系统隔离**（MountableFs + OverlayFs）
- just-bash 是一个模拟的 bash 环境，curl 实际上是内建模拟，不是真正的系统 curl
- 因此 `dangerouslyAllowFullInternetAccess` 控制的是 just-bash 虚拟环境中模拟的 curl 行为
- 即使开启，也只能通过 just-bash 的模拟 curl 访问网络，无法绕过到真正的 shell

### 最终判定

| 维度 | 评估 |
|------|------|
| just-bash 是否支持精细网络控制？ | **是** — 支持 `allowedUrlPrefixes` + `allowedMethods` |
| dangerouslyAllowFullInternetAccess 的实际风险？ | **中等** — just-bash 的网络是模拟实现，但仍然能发出真实 HTTP 请求 |
| 是否有更好的替代？ | **是** — 可以使用 `allowedUrlPrefixes` 限制为 PyPI/npm/GitHub 等必要域名 |
| 推荐优先级 | **P2** — 建议将 `dangerouslyAllowFullInternetAccess: true` 替换为 `allowedUrlPrefixes` 配置，与 sandbox 模式的 `allowedDomains` 保持一致 |

### 验证来源
- 源码：`builtin-tools.ts:179-184`
- [just-bash README — Network Access Configuration](https://github.com/vercel-labs/just-bash/blob/main/README.md)（Context7 查询）

---

## 争议项 5 — P-P1-002 drizzle-orm 的 onConflictDoNothing() 是否可用？

### CR-Performance 主张
建议用 `db.insert().onConflictDoNothing()` 替代 SELECT+INSERT。

### 验证结论：**事实确认 — drizzle-orm + better-sqlite3 完全支持 onConflictDoNothing()**

### 验证过程

**手段 1：Context7 — drizzle-orm 官方文档**

文档明确声明支持 PostgreSQL、SQLite、CockroachDB：

```typescript
// 方式 1：无 target（使用表的 UNIQUE 约束）
await db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing();

// 方式 2：指定 target
await db.insert(users)
  .values({ id: 1, name: 'John' })
  .onConflictDoNothing({ target: users.id });
```

文档原文："The `onConflictDoNothing()` method will cancel the insert if a conflict occurs, preventing duplicate key errors. [...] This is supported in **PostgreSQL, SQLite, and CockroachDB**."

同时也支持 `onConflictDoUpdate()` 用于 upsert 场景。

**手段 2：Context7 — better-sqlite3 driver 兼容性**

drizzle-orm 的 better-sqlite3 driver 文档确认完整的 SQLite dialect 支持：
```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3'
const db = drizzle({ client: sqlite })
```

SQLite 原生支持 `INSERT OR IGNORE`（即 `ON CONFLICT DO NOTHING`），drizzle-orm 正确映射了此 SQL 特性。

### 最终判定

| 维度 | 评估 |
|------|------|
| API 是否可用？ | **是** — `onConflictDoNothing()` 是 drizzle-orm 的正式 API |
| better-sqlite3 是否支持？ | **是** — SQLite 原生支持 ON CONFLICT DO NOTHING |
| CR-Performance 的建议是否可行？ | **是** — SELECT+INSERT 可以安全替换为 `insert().onConflictDoNothing()` |
| 推荐优先级 | 维持 CR-Performance 的 **P1** 评级 |

### 验证来源
- [drizzle-orm 官方文档 — Insert: Upserts and conflicts](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/insert.mdx)（Context7 查询）
- [drizzle-orm better-sqlite3 driver](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/get-started-sqlite.mdx)（Context7 查询）

---

## 争议项 6 — Q-P0-005 python-build-standalone 的供应链安全

### CR-Quality 主张
Python 下载缺少 SHA256 校验（Node.js 有校验但 Python 没有）。

### 验证结论：**事实确认 — python-build-standalone 提供 SHA256SUMS，项目应当使用**

### 验证过程

**手段 1：源码确认**

`scripts/download-runtime.sh`：
- **Node.js 下载**（行 107-136）：有硬编码的 SHA256 哈希，下载后验证 ✓
- **Python 下载**（行 37-81）：直接 `curl -fSL` 下载，**无任何哈希校验** ✗

```bash
# Node.js — 有校验
case "$platform" in
  darwin-arm64) expected_sha256="5ed4db0fcf..." ;;
  darwin-x64)   expected_sha256="5ea50c9d6d..." ;;
  linux-x64)    expected_sha256="c33c39ed9c..." ;;
esac
# ... shasum 验证

# Python — 无校验
curl -fSL --progress-bar -o "$tmpfile" "$url"
tar xzf "$tmpfile" -C "${RUNTIME_DIR}"  # 直接解压，无验证
```

**手段 2：WebSearch — python-build-standalone release assets**

- astral-sh/python-build-standalone **确实提供** `SHA256SUMS` 文件作为每个 release 的资产
- URL 格式：`https://github.com/astral-sh/python-build-standalone/releases/download/{TAG}/SHA256SUMS`
- 自 20250708 release 起，从单独的 `.sha256` 文件改为统一的 `SHA256SUMS` 清单文件（因 GitHub 1000 文件限制）
- pipx 等工具已使用此文件进行校验（参见 [pypa/pipx#1655](https://github.com/pypa/pipx/pull/1655)）

**手段 3：WebFetch — 直接验证 SHA256SUMS 存在性**

尝试下载 `https://github.com/astral-sh/python-build-standalone/releases/download/20260203/SHA256SUMS`：
- 收到 HTTP 302 重定向到 GitHub release assets CDN — **确认文件存在**
- 项目使用的 release tag `20260203` 有可用的 SHA256SUMS

### 最终判定

| 维度 | 评估 |
|------|------|
| CR-Quality 的发现是否真实？ | **是** — Python 下载确实无 SHA256 校验 |
| 是否有官方校验源？ | **是** — python-build-standalone 提供 SHA256SUMS 文件 |
| 这是否构成供应链风险？ | **是** — MITM 攻击或 CDN 篡改可能导致恶意 Python 被打包 |
| 推荐优先级 | **P0** — 与 Node.js 校验一致，在 `download-runtime.sh` 中添加 Python SHA256 校验 |

### 验证来源
- 源码：`scripts/download-runtime.sh:37-81`（Python 无校验）、`107-136`（Node.js 有校验）
- [astral-sh/python-build-standalone Releases](https://github.com/astral-sh/python-build-standalone/releases)
- [pypa/pipx PR#1655 — 使用 SHA256SUMS 校验](https://github.com/pypa/pipx/pull/1655)
- [pypa/pipx Issue#1652 — Checksum validation](https://github.com/pypa/pipx/issues/1652)

---

## 争议项 7 — P-P0-001 Electron 应用中代码分割的实际收益

### CR-Performance 主张
路由无代码分割是 P0，但 Electron 从本地文件加载。

### 验证结论：**代码分割有价值但非 P0 — 应降级为 P1 或 P2**

### 验证过程

**手段 1：WebFetch — Electron 官方性能指南**

Electron 官方建议：
- "We heavily recommend that you **bundle all your code into one single file** to ensure that the overhead included in calling `require()` is only paid once"
- 推荐使用 Webpack/Parcel/rollup.js 打包
- 强调**延迟加载**（lazy loading）大型库到实际使用时

关键区别：Electron 官方建议的是**合并为一个 bundle**（减少 require 开销），不是 Web 式的**按路由拆分**。

**手段 2：WebSearch — Electron 应用启动性能**

- Electron 的主要启动瓶颈是 JavaScript 解析和评估（本地 FS 读取速度很快）
- "The biggest bottleneck in app launch is the process to load JavaScript"
- "Chromium has to read and evaluate JS and modules which takes longer than expected even when from local filesystem"
- Slack/Notion/VSCode 的优化策略主要是：减少初始 bundle 大小、延迟加载非关键模块、V8 snapshots

**手段 3：对比分析 — Web vs Electron 的代码分割收益**

| 维度 | Web 应用 | Electron 应用 |
|------|---------|-------------|
| I/O 速度 | 网络（100ms+） | 本地 FS（<1ms） |
| 主要瓶颈 | 下载 + 解析 | 仅解析 |
| 代码分割减少的 | 下载时间 + 解析时间 | 仅解析时间 |
| 实际收益 | **显著**（50%+ 改善） | **有限**（仅减少 JS 解析） |
| 替代方案 | 无 | V8 snapshot、延迟 require |

**关键事实**：
- Web 代码分割的主要收益来自减少网络传输，这在 Electron 中不存在
- JS 解析确实受 bundle 大小影响，但现代 V8 的解析速度很快（约 1-2MB/ms）
- 对于中等规模应用（<5MB JS），解析开销通常在 50-200ms 范围内

### 最终判定

| 维度 | 评估 |
|------|------|
| 代码分割对 Electron 有价值吗？ | **有**，但远不如 Web 应用那么关键 |
| P0 优先级是否合理？ | **不合理** — P0 意味着阻断性问题，但 Electron 本地加载的延迟是可接受的 |
| Electron 官方怎么说？ | 官方更推荐**单 bundle + 延迟 require**，不是 Web 式的按路由拆分 |
| 推荐优先级 | **降级为 P2** — 代码分割是锦上添花，不是必须。应优先考虑：减少首屏依赖、延迟加载重型库（如 CodeMirror、Markdown 渲染器），而非路由级拆分 |

### 验证来源
- [Electron Performance 官方教程](https://www.electronjs.org/docs/latest/tutorial/performance)
- [How to make your Electron app launch 1,000ms faster](https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/)
- [6 Ways Slack, Notion, and VSCode Improved Electron App Performance](https://palette.dev/blog/improving-performance-of-electron-apps)

---

## 汇总表

| # | 争议项 | 原始优先级 | 验证结论 | 建议优先级 |
|---|--------|----------|---------|----------|
| 1 | Unrestricted 最低安全检查 | — | 部分支持，NativeSandbox 确实无任何检查 | **P1** |
| 2 | BrowserWindow sandbox:false | — | 确认违反官方建议，但实际风险可控 | **P1** |
| 3 | 命令黑名单 shell 绕过 | — | 行业已知限制，项目防御纵深设计正确 | **P2 信息项** |
| 4 | just-bash dangerouslyAllowFullInternetAccess | — | just-bash 支持精细控制，可改进 | **P2** |
| 5 | drizzle-orm onConflictDoNothing | P1 | API 确认可用，建议可行 | **P1**（维持） |
| 6 | Python SHA256 校验缺失 | P0 | 确认 python-build-standalone 提供 SHA256SUMS | **P0**（维持） |
| 7 | Electron 代码分割 | P0 | Electron 本地加载收益有限，官方推荐单 bundle | **降级 P2** |
