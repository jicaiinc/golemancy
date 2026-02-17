# 深度 Code Review 最终审查报告

> 日期：2026-02-16
> 流程：CR-Quality + CR-Security + CR-Performance → Team Lead 二次校验 → 事实验证师交叉验证
> 审查范围：全代码库（apps/desktop/, packages/server/, packages/shared/, packages/ui/）
> 模式：纯审计（audit-only），不修改代码

---

## 审查统计

| 报告 | 审查文件数 | 发现问题数 |
|------|-----------|-----------|
| CR-Quality | 60+ | P0: 5 / P1: 12 / P2: 8 |
| CR-Security | 48 | Critical: 2 / High: 5 / Medium: 6 / Low: 4 |
| CR-Performance | 45+ | P0: 3 / P1: 9 / P2: 11 |
| **合计** | — | **55 个问题** |

交叉验证后调整：1 项从 P0 降级 P2，1 项从 Critical 降级 P1，2 项确认为行业已知限制。

---

## 一、经交叉验证确认的最高优先级问题

### Critical / P0（5 项，必须修复）

#### [S-C-001] MCP Sandbox 包裹失败时静默降级为无沙箱运行
- **文件**: `packages/server/src/agent/mcp-pool.ts:535-539`
- **问题**: sandbox wrapping 失败后 MCP server 直接以无隔离方式运行，仅 log.warn
- **影响**: 用户配置了 sandbox 模式但 MCP 可能以 unrestricted 运行，违背安全期望
- **验证状态**: ✅ 源码确认 + 二次校验确认
- **建议**: fail-closed — sandbox 失败时阻止 MCP server 启动

#### [S-H-003] Bash Sandbox 失败时静默降级为 Restricted 模式
- **文件**: `packages/server/src/agent/builtin-tools.ts:94-97`
- **问题**: sandbox 模式创建失败后静默回退到 restricted 模式，且 restricted 模式网络完全不受限（`dangerouslyAllowFullInternetAccess: true`）
- **影响**: 用户选择了 OS 级沙箱，实际运行在虚拟沙箱 + 完全网络访问下，安全降级无通知
- **验证状态**: ✅ 源码确认 + 二次校验确认
- **建议**: fail-closed 或至少通过 tool warnings 通知用户

#### [Q-P0-004] AgentProcessManager 引用不存在的 worker.js
- **文件**: `packages/server/src/agent/process.ts:30`
- **问题**: `workerPath` 指向不存在的文件，有 TODO 占位符注释，但模块已导出可被调用
- **影响**: 任何触发 `spawnAgent()` 的路径会运行时崩溃
- **验证状态**: ✅ 源码确认
- **建议**: 添加 `throw new Error('Not implemented')` 或实现 worker

#### [Q-P0-005] Python 下载缺少 SHA256 校验
- **文件**: `scripts/download-runtime.sh:56-80`
- **问题**: Node.js 下载有 SHA256 校验，Python 下载完全无校验
- **影响**: 供应链攻击风险——篡改的 Python 二进制可被打包到应用中
- **验证状态**: ✅ 源码确认 + 事实验证确认 python-build-standalone 提供 SHA256SUMS 文件
- **建议**: 从 python-build-standalone release 的 SHA256SUMS 获取哈希，添加校验

#### [Q-P0-003] deprecated 类型仍被核心运行时依赖（半迁移状态）
- **文件**: `packages/shared/src/types/bash-tool-config.ts`（全文件 @deprecated）
- **引用方**: sandbox-pool.ts, anthropic-sandbox.ts, mcp-pool.ts, builtin-tools.ts
- **问题**: SandboxConfig 等类型标记 @deprecated 但仍是核心类型，半迁移状态增加维护混乱
- **验证状态**: ✅ 源码确认
- **建议**: 完成迁移（运行时层直接消费 PermissionsConfig）或移除 @deprecated 标注

---

### High / P1（18 项，应该修复）

#### 安全类

| # | 编号 | 问题 | 文件 | 验证状态 |
|---|------|------|------|---------|
| 1 | S-H-001 | Auth token 通过 contextBridge 暴露给渲染进程 | `main/index.ts:185` + `preload/index.ts:8` | ✅ 源码确认 |
| 2 | S-H-002 | WebSocket 连接完全无认证 | `ws/handler.ts:16-19` | ✅ 源码确认 |
| 3 | S-H-004 | API Key 明文存储且 GET /api/settings 返回完整 key | `routes/settings.ts:10-13` | ✅ 源码确认 |
| 4 | S-H-005 | 命令黑名单可被 eval/heredoc/变量扩展绕过 | `check-command-blacklist.ts:180-253` | ✅ 行业已知限制，有 OS 沙箱兜底 |
| 5 | S-C-002↓ | Unrestricted 模式无任何安全检查 | `native-sandbox.ts:39-41` | ✅ 交叉验证降级为 P1 |
| 6 | S-M-001 | BrowserWindow sandbox:false | `main/index.ts:184` | ✅ 交叉验证确认违反官方建议 |

#### 代码质量类

| # | 编号 | 问题 | 文件 | 验证状态 |
|---|------|------|------|---------|
| 7 | Q-P0-001 | `permissionsToSandboxConfig` 两处重复定义 | `builtin-tools.ts:139` + `mcp-pool.ts:190` | ✅ 源码确认 |
| 8 | Q-P0-002 | `SandboxManagerAPI` 接口两处重复定义 | `sandbox-pool.ts:55` + `sandbox-worker.ts:18` | ✅ 源码确认 |
| 9 | Q-P1-001 | 验证函数遗漏 `networkRestrictionsEnabled` | `validate-permissions-config.ts:30-55` | ✅ 源码确认 |
| 10 | Q-P1-003 | 模板替换 `replace` 只替换第一个匹配 | `resolve-permissions.ts:53-55` | ✅ 源码确认 |
| 11 | Q-P1-009 | 访问 SDK 私有属性 `transport.process` | `mcp-pool.ts:571` | ✅ 源码确认 |
| 12 | Q-P1-011 | 消息保存失败被静默吞掉 | `routes/chat.ts:112-117` | ✅ 源码确认 |

#### 性能类

| # | 编号 | 问题 | 文件 | 验证状态 |
|---|------|------|------|---------|
| 13 | P-P0-002 | Chat 实例内存无限累积（无 LRU） | `lib/chat-instances.ts:31` | ✅ 源码确认 |
| 14 | P-P0-003 | 模块加载时 spawnSync 阻塞事件循环 | `sandbox-pool.ts:36-49` | ✅ 源码确认 |
| 15 | P-P1-001 | 数据库连接无限缓存，SIGTERM 未 closeAll | `db/project-db.ts:11` + `index.ts:60` | ✅ 源码确认 |
| 16 | P-P1-002 | saveMessage SELECT+INSERT 可用 onConflictDoNothing | `storage/conversations.ts:109-119` | ✅ 交叉验证确认 API 可用 |
| 17 | P-P1-003 | AbortController 创建但未传递给 fetch | `stores/useAppStore.ts:209-276` | ✅ 源码确认 |
| 18 | P-P1-005 | ToolCallDisplay 未 memo，流式传输大量重渲染 | `pages/chat/ToolCallDisplay.tsx:229` | ✅ 源码确认 |

---

### P2（26 项，可优化）

<details>
<summary>点击展开 P2 问题列表</summary>

#### 安全类
| 编号 | 问题 | 文件 |
|------|------|------|
| S-M-002 | 权限配置缺少必填字段检查 | `validate-permissions-config.ts:62-93` |
| S-M-003 | restricted 模式 just-bash 全网络访问 | `builtin-tools.ts:182` |
| S-M-004 | CORS 正则允许空端口 localhost | `app.ts:51` |
| S-M-005 | 路径遍历 TOCTOU 竞态（OS 沙箱兜底） | `validate-path.ts:171-208` |
| S-M-006 | 设置 API 无输入验证 | `routes/settings.ts:16-23` |
| S-L-001 | macOS entitlements 宽松权限（Electron 标准做法） | `entitlements.mac.plist:10` |
| S-L-002 | pip install 执行 setup.py 供应链风险 | `runtime/python-manager.ts:103-121` |
| S-L-003 | 项目路由缺少输入验证 | `routes/projects.ts:26-37` |
| S-L-004 | 健康检查泄露服务器时间（极低风险） | `app.ts:80-82` |

#### 代码质量类
| 编号 | 问题 | 文件 |
|------|------|------|
| Q-P1-002 | JSON.stringify 做对象深比较 | `sandbox-pool.ts:464` + `mcp-pool.ts:136` |
| Q-P1-004 | Timer 泄漏（内层 setTimeout 未清理） | `native-sandbox.ts:95-100` |
| Q-P1-005 | 嵌套子shell解析不完整 | `check-command-blacklist.ts:219-229` |
| Q-P1-006 | PATH 分隔符硬编码 `:` | `env-builder.ts:53` |
| Q-P1-007 | UI 保存缺少错误反馈 | `PermissionsSettings.tsx:164-180` |
| Q-P1-008 | `cp -rL` 不跨平台 | `bundle-server.mjs:255,303` |
| Q-P1-010 | agent 步骤限制硬编码 10 步 | `runtime.ts:37` + `sub-agent.ts:87` |
| Q-P1-012 | preflight check 用错平台变量 | `preflight-check.mjs:155-159` |
| Q-P2-001~008 | shellEscape 重复、nice 参数、fork 注释等 | 多处 |

#### 性能类
| 编号 | 问题 | 文件 |
|------|------|------|
| P-P0-001↓ | 路由无代码分割（交叉验证降级 P2） | `pages/index.tsx` |
| P-P1-004 | loadAgentTools 每请求重新加载 | `routes/chat.ts:124-129` |
| P-P1-006 | listJsonFiles 批量策略保守 | `storage/base.ts:31-48` |
| P-P1-007 | 主进程 readFileSync 同步读取 | `main/index.ts:7-14` |
| P-P1-008 | conversations.update 加载全部消息 | `storage/conversations.ts:139-153` |
| P-P1-009 | Turborepo lint/test 无缓存配置 | `turbo.json:12-14` |
| P-P2-001~011 | chunk 分割、搜索双查询、console.debug 残留等 | 多处 |

</details>

---

## 二、按领域汇总

### Sandbox 功能
**总体评价**: 架构设计优秀（全局管理器 + 按项目 worker + crash recovery + 配置热更新），防御纵深设计专业。

**关键问题**:
- ⚠️ **降级行为是最大风险**：MCP sandbox 失败和 Bash sandbox 失败都是静默降级，违背 fail-closed 原则
- `permissionsToSandboxConfig` 和 `SandboxManagerAPI` 重复定义增加不同步风险
- 模块级 `spawnSync` 阻塞启动路径

**亮点**: Worker crash recovery、IPC 超时检测、配置 fingerprint 失效机制、writeFiles 先写 /tmp 防绕过

### Permission 系统
**总体评价**: 三层模式（restricted/sandbox/unrestricted）设计合理，路径验证系统（8 步校验）优秀。

**安全性**: 中高
- 路径验证：✅ null byte、traversal、tilde、symlink、mandatory deny
- 命令黑名单：✅ 4 层检查，作为第一道防线够用（OS 沙箱兜底）
- 降级行为：❌ 需改为 fail-closed
- 配置验证：⚠️ 遗漏 networkRestrictionsEnabled 字段

**可用性**: 良好
- 三模式设计直观易懂
- 模板变量（`{{workspaceDir}}`）提供灵活性
- ⚠️ 用户可能不清楚 restricted 模式网络不受限

### Code Runtime
**总体评价**: Python venv + Node.js bundled runtime 设计正确，PATH 优先级合理。

**关键问题**:
- ⚠️ Python 下载无 SHA256 校验（供应链风险）
- PATH 分隔符硬编码 `:`
- python-manager execCommand 无 output 截断

**亮点**: per-project venv 隔离、共享 pip/npm 缓存、venv symlinks 节省磁盘

### 编译打包
**总体评价**: bundle-server.mjs 设计周到（esbuild + pnpm deploy + hoisting），preflight-check 有价值。

**关键问题**:
- ⚠️ Python SHA256 校验缺失
- `cp -rL` 不跨平台
- preflight check 用错 `process.platform` vs `targetPlatform`
- 缺少 linux-arm64 支持

**亮点**: 依赖 hoisting 解决 pnpm 严格隔离问题、文件 prune 有效减小 bundle

### 测试
**总体评价**: 核心安全模块测试覆盖充分（command blacklist 103 用例、path validation 覆盖全攻击向量）。

**关键问题**:
- ⚠️ AgentProcessManager 引用不存在的 worker.js
- mock spawn 测试重复
- Turborepo lint/test 无缓存配置

**亮点**: E2E 三级分层（smoke → server → ai）、安全模块测试质量高

### Electron 安全
**总体评价**: 中高。关键配置基本正确，但有改进空间。

| 配置项 | 状态 |
|--------|------|
| nodeIntegration: false | ✅ 默认禁用 |
| contextIsolation: true | ✅ 默认启用 |
| sandbox | ⚠️ 显式 false，违反官方建议 |
| preload API 面 | ✅ 极小（5 getter + 1 IPC） |
| server 绑定 | ✅ 127.0.0.1 |
| auth token | ✅ crypto.randomUUID() |
| WebSocket | ❌ 无认证 |
| CSP | ❌ 未设置 |

---

## 三、跨报告交叉验证结果

以下问题被多位 CR 独立发现，互相印证：

| 问题 | CR-Quality | CR-Security | CR-Performance | 交叉验证 |
|------|-----------|------------|---------------|---------|
| JSON.stringify 做对象比较 | Q-P1-002 | — | P-P2-007 | ✅ 一致 |
| 命令黑名单绕过 | Q-P1-005 | S-H-005 | — | ✅ 一致，行业已知限制 |
| restricted 模式全网络访问 | — | S-M-003 | — | ✅ 事实验证确认 just-bash 支持精细控制 |
| Electron sandbox:false | — | S-M-001 | — | ✅ 事实验证确认违反官方建议 |

---

## 四、优先级调整记录（基于交叉验证）

| 编号 | 原始优先级 | 调整后 | 原因 |
|------|----------|--------|------|
| S-C-002 | Critical | **P1** | 用户已在 UI 确认过 unrestricted，但应添加最低检查 |
| P-P0-001 | P0 | **P2** | Electron 本地加载，官方推荐单 bundle，代码分割收益有限 |
| S-H-005 | High | **P2** | 行业已知限制，项目有 OS 沙箱防御纵深 |
| Q-P1-005 | P1 | **P2** | 同上，嵌套子shell解析是行业通病 |

---

## 五、修复优先级建议

### 立即修复（P0，5 项）
1. MCP sandbox 降级 → fail-closed
2. Bash sandbox 降级 → fail-closed 或通知用户
3. worker.js 占位符 → throw NotImplemented 或实现
4. Python SHA256 校验 → 从 SHA256SUMS 获取哈希
5. deprecated 半迁移 → 完成或清理

### 尽快修复（P1，18 项）
重点关注：WebSocket 认证、API Key 掩码、Chat 实例 LRU、DB 连接清理、spawnSync 异步化

### 后续优化（P2，26 项）
记录在案，按需修复

---

## 六、审查亮点（设计良好的部分）

1. **类型系统**: Branded ID types、clean interfaces、strict TypeScript 配置
2. **安全防御纵深**: 应用层（validatePath + checkBlacklist）+ OS 层（sandbox-exec/bubblewrap）
3. **Sandbox 架构**: 全局管理器 + per-project worker、crash recovery、配置热更新
4. **路径验证**: 8 步校验（null byte → traversal → tilde → symlink → mandatory deny）
5. **测试质量**: command blacklist 103 用例、path validation 全攻击向量覆盖
6. **Server 安全基线**: loopback-only + Bearer token + CORS + drizzle-orm 参数化查询
7. **MCP Pool**: fingerprint 失效 + idle 清理 + crash recovery
8. **SQLite**: WAL 模式 + FTS5 content sync + per-project database 隔离

---

> **详细报告文件**:
> - `cr-quality.md` — 代码质量审查（25 项）
> - `cr-security.md` — 安全审查（17 项）
> - `cr-performance.md` — 性能审查（23 项）
> - `cross-validation.md` — 事实交叉验证（7 项争议）
