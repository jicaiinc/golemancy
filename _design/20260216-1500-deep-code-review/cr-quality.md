# 代码质量审查报告

> 审查人：CR-Quality
> 审查时间：2026-02-16
> 审查范围：全代码库（重点：Sandbox / Permission / Code Runtime / 编译打包 / 测试）

## 审查概览
- 审查文件数：60+
- 发现问题数：P0: 5 / P1: 12 / P2: 8

---

## P0 问题（必须修复）

### [Q-P0-001] `permissionsToSandboxConfig` 函数重复定义
- **文件**: `packages/server/src/agent/builtin-tools.ts:139` 和 `packages/server/src/agent/mcp-pool.ts:190`
- **问题**: `permissionsToSandboxConfig()` 函数在两个文件中有完全相同的实现。这是明显的 DRY 违反——两份代码做完全一样的事情（将 `PermissionsConfig` 桥接到 `SandboxConfig`）。
- **影响**: 修改一处忘记修改另一处会导致 sandbox 行为不一致。已经有 `@deprecated` 标注表明应迁移，但两个副本增加了迁移遗漏的风险。
- **建议**: 抽取到 `packages/server/src/agent/permissions-adapter.ts` 作为唯一导出，两个调用方均引用同一来源。

### [Q-P0-002] `SandboxManagerAPI` 接口重复定义
- **文件**: `packages/server/src/agent/sandbox-pool.ts:55-66` 和 `packages/server/src/agent/sandbox-worker.ts:18-29`
- **问题**: `SandboxManagerAPI` 接口在两个文件中独立定义了完全相同的类型。注释说明是因为动态 import `@anthropic-ai/sandbox-runtime`，但这不妨碍将接口定义统一。
- **影响**: 两处接口可能随 SDK 更新而出现不同步，导致类型不匹配的运行时错误（worker 期望的方法签名与 pool 不一致）。
- **建议**: 将 `SandboxManagerAPI` 定义到 `@golemancy/shared` 或一个共享的本地文件中，两处均引用。

### [Q-P0-003] deprecated 类型仍被核心运行时依赖
- **文件**: `packages/shared/src/types/bash-tool-config.ts` (全文件 `@deprecated`)
- **引用方**: `sandbox-pool.ts:9` (`ResolvedBashToolConfig`), `anthropic-sandbox.ts:6` (`SandboxConfig`), `mcp-pool.ts:11` (`SandboxConfig`), `builtin-tools.ts:12` (`SandboxConfig`, `ResolvedBashToolConfig`)
- **问题**: `bash-tool-config.ts` 中的所有类型（`SandboxConfig`, `FilesystemConfig`, `NetworkConfig`, `ResolvedBashToolConfig`）均标记为 `@deprecated`，但它们仍然是 sandbox 运行时的核心类型。这不是真正的 "deprecated"——它们被积极使用中。
- **影响**: 误导其他开发者认为这些类型即将被移除，可能在迁移时引入 breaking changes。`builtin-tools.ts:77-81` 构造的 `ResolvedBashToolConfig` 对象证明了这些类型仍是不可或缺的。
- **建议**: 要么完成迁移（让 `SandboxPool`/`AnthropicSandbox` 直接消费 `PermissionsConfig`），要么移除 `@deprecated` 标注直到迁移真正发生。当前状态是半迁移状态，增加维护混乱。

### [Q-P0-004] `AgentProcessManager` 引用不存在的 `worker.js`
- **文件**: `packages/server/src/agent/process.ts:30`
- **问题**: `const workerPath = path.join(import.meta.dirname, 'worker.js')` 引用了一个不存在的文件，且有 TODO 注释 `// TODO: worker.js is a placeholder`。但 `process.ts` 已被导出并可被调用。
- **影响**: 如果任何代码路径触发 `spawnAgent()`，会因找不到 worker.js 而运行时崩溃。目前此功能可能未被使用（cron job 或 task 执行路径），但作为已导出的模块，它是一个随时可能被触发的 bomb。
- **建议**: 要么实现 worker.js，要么在 `spawnAgent()` 中添加明确的 `throw new Error('Not implemented')` 防止意外调用，并在 TODO 中记录依赖关系。

### [Q-P0-005] `download-runtime.sh` Python 下载缺少 SHA256 校验
- **文件**: `scripts/download-runtime.sh:56-80`
- **问题**: Node.js 下载有 SHA256 校验（行 108-136），但 Python 下载完全没有任何完整性校验。只检查了二进制文件是否存在和可执行。
- **影响**: 供应链攻击风险——如果 python-build-standalone 的 GitHub release 被篡改，恶意 Python 二进制会被直接打包到应用中，且不会被检测到。这与 Node.js 校验的安全标准不一致。
- **建议**: 为每个 Python 平台架构添加 SHA256 校验，与 Node.js 保持一致的安全标准。

---

## P1 问题（建议修复）

### [Q-P1-001] `validatePermissionsConfig` 不验证 `networkRestrictionsEnabled`
- **文件**: `packages/server/src/agent/validate-permissions-config.ts:30-55`
- **问题**: 验证函数检查了所有 `STRING_ARRAY_FIELDS` 和 `applyToMCP`（boolean），但遗漏了 `networkRestrictionsEnabled`（也是 boolean）。如果 API 收到 `networkRestrictionsEnabled: "true"`（字符串而非布尔值），不会报错但运行时行为可能不一致。
- **影响**: 类型不安全的数据可能通过 API 存入配置文件，导致 `sandboxConfigToRuntimeConfig` 中的 `config.network.allowedDomains` 判断异常。
- **建议**: 在验证函数中添加 `networkRestrictionsEnabled` 的 boolean 类型检查。

### [Q-P1-002] `sandboxConfigEquals` 使用 `JSON.stringify` 做深比较
- **文件**: `packages/server/src/agent/sandbox-pool.ts:464-466`
- **问题**: `JSON.stringify(a) === JSON.stringify(b)` 做对象比较依赖于属性序列化顺序。如果两个对象内容相同但属性顺序不同，会误判为不相等，导致不必要的 worker 重建。
- **影响**: 不必要的 worker 重启会中断正在执行的 sandbox 命令，降低可用性。虽然 JavaScript 对象属性在现代引擎中通常保持插入顺序，但这不是一个可靠的假设（尤其是序列化/反序列化后）。
- **建议**: 使用结构化比较（递归对比或使用 `fast-deep-equal` 等库），或至少 JSON.stringify 前对 key 排序。同样的问题存在于 `mcp-pool.ts:136` 的 `fingerprintEquals`。

### [Q-P1-003] `resolvePermissionsConfig` 中 `replace` 只替换第一个匹配
- **文件**: `packages/server/src/agent/resolve-permissions.ts:53-55`
- **问题**: `expanded.replace('{{workspaceDir}}', workspaceDir)` 使用字符串替换，只会替换第一个匹配。如果用户在一个 allowWrite 模式中写了 `{{workspaceDir}}/a:{{workspaceDir}}/b`，第二个 `{{workspaceDir}}` 不会被替换。
- **影响**: 虽然当前 UI 和默认配置中每个 allowWrite 条目只包含一个模板变量，但作为通用模板替换逻辑，这是不完整的。
- **建议**: 使用 `replaceAll` 或正则表达式全局替换：`expanded.replace(/\{\{workspaceDir\}\}/g, workspaceDir)`。

### [Q-P1-004] `NativeSandbox.spawnCommand` 中 Timer 可能泄漏
- **文件**: `packages/server/src/agent/native-sandbox.ts:95-100`
- **问题**: 在 `spawnCommand` 中，timeout timer 内的第二个 `setTimeout`（SIGKILL grace）没有被 `clearTimeout` 清理。当进程正常结束时，外层 `clearTimeout(timer)` 只清理了外层 timer。如果 SIGTERM 被发出但进程在 KILL_GRACE_MS 之前就结束了，内层 `setTimeout` 的回调仍然会在 5 秒后执行。
- **影响**: 虽然 `child.killed` 检查防止了重复 kill，但 timer 本身会保持事件循环 active 5 秒。同样的问题存在于 `anthropic-sandbox.ts:209-214`。
- **建议**: 保存内层 timer 引用，在 `close` 事件中一并清理。

### [Q-P1-005] `splitCommandSegments` 不处理嵌套 `$()` 子shell
- **文件**: `packages/server/src/agent/check-command-blacklist.ts:219-229`
- **问题**: `$()`子shell提取使用 `command.indexOf(')', i + 2)` 查找最近的 `)`，不处理嵌套情况。例如 `$(echo $(whoami))` 会在第一个 `)` 处截断，只提取 `echo $(whoami` 作为段，遗漏了内层 `whoami`。
- **影响**: 攻击者可能通过嵌套子shell绕过命令黑名单检查。例如 `$($(sudo) rm)` 在 Tier 2 检查中不会被正确分析。不过 Tier 3 的内置正则模式会在全命令字符串上匹配 `sudo`，提供了额外的防线。
- **建议**: 实现平衡括号解析来正确处理嵌套 `$()`，或在文档中明确标注此限制。

### [Q-P1-006] `env-builder.ts` 硬编码 `:` 作为 PATH 分隔符
- **文件**: `packages/server/src/runtime/env-builder.ts:53`
- **问题**: `pathParts.join(':')` 使用硬编码的 Unix PATH 分隔符。虽然 `permissions.ts` 中列出了 `win32` 作为支持的平台，且 Windows 的 PATH 分隔符是 `;`。
- **影响**: 如果项目未来支持 Windows sandbox（虽然当前仅支持 deniedCommands），runtime env 在 Windows 上会完全失效。
- **建议**: 使用 `path.delimiter` 代替硬编码的 `:`。

### [Q-P1-007] `PermissionsSettings.tsx` 缺少保存前的数据验证
- **文件**: `packages/ui/src/components/settings/PermissionsSettings.tsx:164-180`
- **问题**: `handleSave` 函数直接将 `config` 状态发送到服务端，没有任何客户端验证。虽然服务端有 `validatePermissionsConfigFile` 验证，但 UI 不会给用户明确的错误反馈（服务端返回 400 后只是 `finally { setSaving(false) }`，没有错误提示）。
- **影响**: 用户输入无效数据（如 allowWrite 中的空字符串、deniedCommands 中的特殊字符）后点击保存，界面只是回到可编辑状态，没有任何错误提示。
- **建议**: 在 `handleSave`/`handleSaveAs` 中添加 try-catch，捕获服务端错误并显示给用户。

### [Q-P1-008] `bundle-server.mjs` 中 `execSync` 的 `cp -rL` 不跨平台
- **文件**: `scripts/bundle-server.mjs:255,303`
- **问题**: 使用 `execSync(`cp -rL "${src}" "${dest}"`)` 来解引用符号链接并复制。`cp -rL` 是 GNU/BSD coreutils 命令，在 Windows 上不存在。
- **影响**: 虽然当前 CI/CD 可能只在 macOS/Linux 上运行打包，但 `electron-builder.yml` 配置了 Windows 目标。如果有人在 Windows 上尝试运行 `bundle-server`，会直接失败且没有友好错误。
- **建议**: 使用 Node.js 的 `fs.cp(src, dest, { recursive: true, dereference: true })` （Node 16+），或至少在脚本开头检测平台并给出明确错误。

### [Q-P1-009] `mcp-pool.ts` 访问私有属性 `transport.process`
- **文件**: `packages/server/src/agent/mcp-pool.ts:571`
- **问题**: `(this as unknown as { process?: ChildProcess }).process` 通过类型断言访问 `Experimental_StdioMCPTransport` 的私有 `process` 字段来附加 stderr 捕获。这是一个非常脆弱的实现——依赖于 `@ai-sdk/mcp` 的内部实现细节。
- **影响**: `@ai-sdk/mcp` 的任何版本更新如果重命名/移除该字段，stderr 捕获会静默失败（不会报错，只是不再捕获 stderr）。
- **建议**: 在代码注释中明确记录依赖的 SDK 版本，并添加运行时检查：如果 `proc` 为 `undefined`，记录一个警告日志。此外考虑向 `@ai-sdk/mcp` 提交 feature request 请求 stderr 访问的公开 API。

### [Q-P1-010] `runtime.ts`（agent runtime）硬编码 `stepCountIs(10)` 限制
- **文件**: `packages/server/src/agent/runtime.ts:37` 和 `packages/server/src/agent/sub-agent.ts:87`
- **问题**: AI agent 的 tool 调用步骤被硬编码限制为 10 步（`stepCountIs(10)`）。在 `sub-agent.ts` 中同样硬编码了 10 步。这个限制没有暴露到配置中。
- **影响**: 对于需要复杂多步骤工具调用的 agent（如代码审查、文件搜索+修改+验证），10 步可能不够。用户无法通过配置调整此限制。
- **建议**: 将此值提取为 `Agent` 配置的一部分（如 `maxToolSteps`），或至少提取为常量并在文档中说明。

### [Q-P1-011] `chat.ts` 中保存用户消息的错误被静默吞掉
- **文件**: `packages/server/src/routes/chat.ts:112-117`
- **问题**: 保存用户消息失败时只 `log.error` 然后继续 streaming。如果数据库出现问题，聊天会继续但消息不会被持久化，用户完全不知道。
- **影响**: 用户以为对话被保存了，但实际上消息可能丢失。特别是 SQLite 写入失败可能是磁盘满或 WAL 损坏的信号。
- **建议**: 至少通过 stream 发送一个警告事件通知客户端（类似 `data-warning` 的机制），或考虑在消息保存失败时返回错误响应。

### [Q-P1-012] `preflight-check.mjs` 仅检查 macOS entitlements
- **文件**: `scripts/preflight-check.mjs:155-159`
- **问题**: entitlements 文件检查使用 `process.platform === 'darwin'` 判断，但整个脚本已经有 `targetPlatform` 变量来支持 `--target` 参数。检查应该用 `targetPlatform` 而不是 `process.platform`。
- **影响**: 在 macOS 上为 Linux 目标做 preflight check 时（虽然会因为跨平台检查失败），entitlements 检查仍然会运行，而在 Linux CI 上检查 macOS 目标时不会检查 entitlements（如果跨平台检查被移除/放松）。
- **建议**: 将 `process.platform` 改为 `targetPlatform`。

---

## P2 问题（可优化）

### [Q-P2-001] `shellEscape` 函数在两处不同实现
- **文件**: `packages/server/src/agent/anthropic-sandbox.ts:14-16` 和 `packages/server/src/agent/mcp-pool.ts:182-185`
- **问题**: 两个 `shellEscape` 函数签名相同但实现略有不同。`anthropic-sandbox.ts` 的版本使用单引号包裹所有输入；`mcp-pool.ts` 的版本先检查是否需要转义（简单字符串直接返回），只在需要时才加引号。
- **建议**: 统一为一个共享的 shell-escape 工具函数。

### [Q-P2-002] `check-command-blacklist.ts` 中 `extractCommandName` 对 `nice -n` 的处理不够精确
- **文件**: `packages/server/src/agent/check-command-blacklist.ts:168`
- **问题**: `nice` 被视为 wrapper 而跳过，但 `nice -n 10 make build` 中 `-n` 不是 wrapper 却变成了提取到的 "command name"。测试文件也承认了这一点（行 440-442 注释）。
- **影响**: 如果 `-n` 恰好匹配某个 deniedCommand 模式，会产生误判。实际风险很低，因为 deniedCommands 通常是完整命令名。
- **建议**: 在跳过 `nice`/`env` 等 wrapper 后，也跳过它们的已知参数（如 `nice` 后跟 `-n <number>` 时跳过两个 token）。

### [Q-P2-003] `SandboxPool.createWorker` 中 fork 的 serialization 选项
- **文件**: `packages/server/src/agent/sandbox-pool.ts:395`
- **问题**: `fork(workerPath, { serialization: 'json' })` 没有传递 `execArgv` 或 `execPath`。在 Electron 打包环境中，这会使用默认的 Node.js（Electron 内置的 Node），可能与 `sandbox-runtime` 的 native module 不兼容（类似 desktop `index.ts` 中提到的 ABI 不匹配问题）。
- **影响**: 在 Electron 打包后，sandbox worker 可能因 ABI 不匹配而无法正确加载 `@anthropic-ai/sandbox-runtime`。不过，桌面 main process 的 fork 使用了 bundled Node（行 49），所以 sandbox-pool 的 fork 是在 server 进程中发起的，而 server 已经是正确的 Node.js 进程。
- **建议**: 添加注释说明此处 fork 是在 server 子进程（已经是正确的 Node）中进行的，因此不需要 `execPath` 覆盖。这能防止未来维护者误解。

### [Q-P2-004] `download-runtime.sh` 缺少 `linux-arm64` 支持
- **文件**: `scripts/download-runtime.sh:52-53,97-98`
- **问题**: 平台映射中没有 `linux-arm64` 的对应。Python 和 Node.js 都有 Linux ARM64 的二进制，但脚本只支持 `linux-x64`。
- **影响**: 无法在 ARM64 Linux 机器上（如 Graviton EC2 实例或 Docker arm64 容器）进行打包。
- **建议**: 添加 `linux-arm64` 支持，包括对应的 SHA256 哈希值。

### [Q-P2-005] `PermissionsSettings.tsx` 没有对 `config` 变更做 dirty 检测
- **文件**: `packages/ui/src/components/settings/PermissionsSettings.tsx`
- **问题**: 用户修改了 sandbox 配置（如添加/删除 allowWrite 路径）后，没有 dirty 状态检测。用户可能修改了配置后切换 config 或离开页面，变更会静默丢失。
- **建议**: 添加 `isDirty` 状态跟踪，在有未保存变更时提示用户。

### [Q-P2-006] 测试文件中大量重复的 mock spawn 实现
- **文件**: `packages/server/src/agent/native-sandbox.test.ts` (多处)
- **问题**: 每个需要自定义 spawn 行为的测试都重复写了完整的 EventEmitter mock 逻辑（约 8 行代码），共出现了约 7 次。
- **建议**: 抽取为 `createMockChild({ stdout, stderr, code, signal })` 工厂函数，减少重复。

### [Q-P2-007] `validate-permissions-config.ts` 验证逻辑过于宽松
- **文件**: `packages/server/src/agent/validate-permissions-config.ts:40-47`
- **问题**: 对 `STRING_ARRAY_FIELDS` 的验证只检查"是否为字符串数组"，但不检查：空字符串元素、重复元素、路径格式合理性（如 allowWrite 中是否是合法的路径/glob 模式）。
- **建议**: 添加空字符串过滤和基本格式检查。

### [Q-P2-008] `python-manager.ts` 的 `execCommand` 没有 output 截断
- **文件**: `packages/server/src/runtime/python-manager.ts:214-236`
- **问题**: `python-manager.ts` 中的内部 `execCommand` 没有像 `NativeSandbox.spawnCommand` 那样的 output 截断逻辑（MAX_OUTPUT_BYTES）。如果 `pip list` 返回非常大的输出，可能消耗大量内存。
- **建议**: 添加与 sandbox 一致的 output 截断逻辑，或至少设置一个合理的上限。

---

## 按领域汇总

### Sandbox
**整体评价**: 架构清晰，三层模式（restricted/sandbox/unrestricted）设计合理。SandboxPool 的 global-manager + per-project-worker 模式是一个好的设计决策。代码质量总体良好。

**主要问题**:
- P0-001: `permissionsToSandboxConfig` 重复定义
- P0-002: `SandboxManagerAPI` 接口重复定义
- P1-004: Timer 泄漏
- P2-001: `shellEscape` 两处不同实现
- P2-003: fork 缺少注释

### Permission
**整体评价**: Permission 系统设计成熟——分层解析（Global → Project → Agent）、模板变量替换、平台感知默认值都很好。`validate-path.ts` 的 8 步校验逻辑严谨。

**主要问题**:
- P0-003: deprecated 类型仍被核心依赖（半迁移状态）
- P1-001: 验证遗漏 `networkRestrictionsEnabled`
- P1-003: 模板替换只替换第一个匹配
- P1-005: 嵌套子shell解析不完整
- P2-007: 验证过于宽松

### Code Runtime
**整体评价**: Python venv 管理和 Node.js bundled runtime 的设计思路正确。PATH 优先级设计合理（venv > bundled > system）。`env-builder.ts` 简洁清晰。

**主要问题**:
- P1-006: PATH 分隔符硬编码
- P2-008: python-manager 缺少 output 截断
- P1-010: agent 步骤限制硬编码

### 编译打包
**整体评价**: `bundle-server.mjs` 设计精巧——esbuild + pnpm deploy + .pnpm hoisting 的三步策略很好地解决了 pnpm 严格隔离与 Electron 打包的兼容问题。`preflight-check.mjs` 提供了有价值的预检。`download-runtime.sh` 实现了 idempotent 下载。

**主要问题**:
- P0-005: Python 下载缺少 SHA256 校验
- P1-008: `cp -rL` 不跨平台
- P1-012: entitlements 检查用错平台变量
- P2-004: 缺少 linux-arm64 支持

### 测试
**整体评价**: 测试覆盖面较好——核心安全模块（command blacklist、path validation、sandbox）有充分的单元测试。E2E 三级分层设计（smoke → server → ai）合理。测试代码质量总体较好。

**主要问题**:
- P0-004: `AgentProcessManager` 引用不存在的 worker.js
- P2-006: 测试中 mock spawn 大量重复
- 注意：`check-command-blacklist.test.ts` 有 103 个测试用例，覆盖了 4 层安全检查，质量很高
- 注意：`validate-path.test.ts` 覆盖了 null byte、traversal、tilde、symlink 等攻击向量，覆盖充分

### 其他
- P1-002: `JSON.stringify` 做对象比较（sandbox-pool 和 mcp-pool 共同问题）
- P1-007: UI 保存缺少错误反馈
- P1-009: 依赖 SDK 私有属性
- P1-011: 消息保存失败被静默吞掉
- P2-005: UI 缺少 dirty 检测

---

## 总结

### 代码质量亮点
1. **类型系统设计优秀**：Branded ID types、clean interfaces、strict TypeScript 配置
2. **命名一致性好**：文件命名、组件命名（`Pixel*` 前缀）、service 命名（`I*Service`）都遵循了 CLAUDE.md 约定
3. **安全相关代码质量高**：`check-command-blacklist.ts` 和 `validate-path.ts` 的多层防御设计专业
4. **错误处理在关键路径上完善**：sandbox timeout、worker crash recovery、IPC timeout 都有合理处理
5. **注释质量好**：关键设计决策都有清晰的 JSDoc 说明

### 需要关注的系统性问题
1. **半迁移状态**：`SandboxConfig` → `PermissionsConfig` 的迁移只完成了一半，导致类型重复和桥接代码
2. **代码重复**：多个共享函数（permissionsToSandboxConfig、shellEscape、SandboxManagerAPI）在不同文件中有独立实现
3. **Python 打包安全**：SHA256 校验的缺失是一个真正的安全隐患
