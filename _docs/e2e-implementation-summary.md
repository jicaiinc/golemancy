# SoloCraft E2E 测试实现总结

> **阶段**: E2E 测试（Playwright + Electron）
> **状态**: 基础实现完成 + Code Review P1 修复
> **验证**: 26 测试全部通过 · 耗时 11.2s · 3 层测试分级

---

## 一、概述

在 UI-First 和 Server 实现阶段之后，本阶段为 SoloCraft 搭建了 **端到端（E2E）测试体系** —— 基于 Playwright 的 Electron 实验性 API，直接启动编译后的 Electron 应用、自动 fork Server 子进程，验证从 UI 到 Server 的完整用户流程。

### 本阶段做了什么

| 维度 | 内容 |
|------|------|
| **测试框架** | Playwright Electron 实验性 API（`_electron.launch()`） |
| **三层分级** | smoke（纯 UI）→ server（需要 Server）→ ai（需要 API Key） |
| **Fixture 体系** | 4 个自定义 Fixture：ElectronApp / StoreBridge / ConsoleLogger / TestHelper |
| **数据隔离** | 临时目录 + `SOLOCRAFT_DATA_DIR` 环境变量，与真实用户数据完全隔离 |
| **API Key 管理** | `.env.e2e.local`（gitignored）→ global-setup 种子化 → Server 自动读取 |
| **双轨验证** | Store 状态断言（可靠）+ DOM 可见性断言（用户视角） |
| **生产代码改动** | 仅 2 处 env var 兼容（`SOLOCRAFT_ROOT_DIR` / `SOLOCRAFT_FORK_EXEC_PATH`），向后兼容 |

### 核心设计原则

- **真实运行**：不 Mock Server，不 Mock 数据库 —— Electron 真实启动、Server 真实 fork、SQLite 真实读写
- **测试隔离**：每次运行使用 `os.tmpdir()/solocraft-e2e-{pid}` 作为数据目录，互不干扰
- **事件驱动**：全部使用 `waitForSelector` / `waitForFunction` / `expect().toBeVisible()` 等待，零 `waitForTimeout`

---

## 二、技术栈

| 分类 | 技术 | 版本 | 用在哪里 |
|------|------|------|---------|
| 测试框架 | **@playwright/test** | 1.52 | E2E 测试核心 |
| Electron API | **_electron.launch()** | 实验性 | 启动 Electron 应用 |
| 构建工具 | **electron-vite** | 5 | `--mode test` 构建（暴露 Store） |
| 状态桥接 | **window.__SOLOCRAFT_STORE__** | — | Zustand Store 暴露给测试 |
| 进程管理 | **child_process.fork()** | Node.js 内置 | Server 自动启动 |
| 数据库 | **better-sqlite3** | 11 | 真实 SQLite 存储 |

### 为什么不 Mock Server

E2E 测试的目标是验证 **Electron → fork() → Server → SQLite** 完整链路。之前的单元测试（429 个）已覆盖各层独立逻辑，E2E 专注于跨进程集成。

---

## 三、目录结构

```
apps/desktop/
├── e2e/                            E2E 测试根目录
│   ├── playwright.config.ts        Playwright 配置（3 tier project）
│   ├── tsconfig.json               E2E 专用 TS 配置
│   ├── constants.ts                常量：路径、超时、选择器
│   ├── global-setup.ts             全局启动：解析 .env、创建临时数据目录、种子化 settings
│   ├── global-teardown.ts          全局清理：删除临时目录、杀残留进程
│   │
│   ├── fixtures/                   自定义 Fixture 层
│   │   ├── index.ts                导出 test / expect + 组合全部 Fixture
│   │   ├── electron.ts             worker-scoped：ElectronApp + Window
│   │   ├── store-bridge.ts         StoreBridge：Zustand 状态访问
│   │   ├── console-logger.ts       worker-scoped：ConsoleLogger 日志收集
│   │   └── test-helper.ts          test-scoped：统一测试 API
│   │
│   ├── smoke/                      Tier 1：纯 UI 测试（无需 API Key）
│   │   ├── app-launch.spec.ts      应用启动 + React 渲染 + Store 桥接
│   │   ├── navigation.spec.ts      路由导航 + 侧栏
│   │   ├── project-crud.spec.ts    项目 CRUD
│   │   ├── agent-crud.spec.ts      Agent CRUD
│   │   └── settings.spec.ts        全局设置
│   │
│   ├── server/                     Tier 2：需要 Server 运行（无需 API Key）
│   │   ├── chat-ui.spec.ts         聊天 UI 交互
│   │   └── dashboard.spec.ts       全局 Dashboard
│   │
│   └── ai/                         Tier 3：需要 API Key
│       ├── chat-completion.spec.ts 真实 AI 对话
│       └── agent-execution.spec.ts 自定义 System Prompt
│
├── .env.e2e                        E2E 模式标记（committed）
├── .env.e2e.local                  API Key（gitignored）
├── .env.e2e.local.example          API Key 模板（committed）
└── package.json                    test:e2e / test:e2e:ai / test:e2e:smoke 脚本
```

### 其他修改文件

| 文件 | 变更 |
|------|------|
| `apps/desktop/src/main/index.ts` | `SOLOCRAFT_ROOT_DIR` + `SOLOCRAFT_FORK_EXEC_PATH` env var 兼容 |
| `packages/ui/src/stores/useAppStore.ts` | `window.__SOLOCRAFT_STORE__` 暴露（非 production） |
| `packages/ui/src/components/layout/ProjectSidebar.tsx` | 展开/折叠状态均添加 `data-testid` |
| 多个 UI 组件 | `data-testid` 属性（layout、project、agent、chat、settings） |
| `package.json`（root） | `test:e2e` / `test:e2e:ai` 脚本 |
| `.gitignore` | `test-results/` |
| `_pitfalls/electron-server-fork.md` | 新增坑 4（PATH 继承）和坑 5（app.getAppPath 路径） |

---

## 四、三层测试分级

```
                    ┌──────────────────────────────────┐
                    │          测试层级架构             │
                    ├──────────┬───────────┬───────────┤
                    │  smoke   │  server   │    ai     │
                    │ (纯 UI)  │ (需 Server)│ (需 Key) │
                    ├──────────┼───────────┼───────────┤
                    │ 启动渲染  │ 聊天 UI    │ AI 对话   │
                    │ 路由导航  │ Dashboard │ System    │
                    │ 项目 CRUD │           │  Prompt   │
                    │ Agent CRUD│           │           │
                    │ 设置页面  │           │           │
                    ├──────────┼───────────┼───────────┤
                    │ 15 tests │  7 tests  │ 2 tests   │
                    │ 0 Key    │  0 Key    │ 需 Key    │
                    └──────────┴───────────┴───────────┘
                    ← pnpm test:e2e →  ← pnpm test:e2e:ai →
```

### Playwright 配置

```typescript
// playwright.config.ts
{
  workers: 1,              // 单 Worker（Electron 串行）
  timeout: 60_000,         // 单测超时 60s
  retries: 1,              // 重试 1 次
  projects: [
    { name: 'smoke',  testDir: './smoke' },
    { name: 'server', testDir: './server', dependencies: ['smoke'] },
    { name: 'ai',     testDir: './ai',     dependencies: ['server'] },
  ],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
}
```

### 运行命令

| 命令 | 说明 |
|------|------|
| `pnpm test:e2e` | 构建 + 运行 smoke + server 层 |
| `pnpm test:e2e:ai` | 构建 + 运行全部 3 层（需 `.env.e2e.local`） |
| `pnpm test:e2e:smoke` | 构建 + 仅运行 smoke 层 |
| `pnpm test:e2e:only` | 跳过构建，直接运行（需已构建） |

所有带构建的命令使用 `electron-vite build --mode test`，确保 Store 暴露。

---

## 五、Fixture 架构

### 生命周期与作用域

```
Worker 生命周期（整个测试文件共享）
├── electronApp          _electron.launch() → app.close()
├── window               electronApp.firstWindow()
└── consoleLogger        new ConsoleLogger() → attach(window)
    │
    Test 生命周期（每个 test() 独立）
    └── helper            new TestHelper(window, consoleLogger)
                          └── 构造时自动 consoleLogger.clear()
```

### 5.1 ElectronApp Fixture（worker-scoped）

```typescript
// fixtures/electron.ts
const nodePath = execSync('which node', { encoding: 'utf-8' }).trim()

const app = await _electron.launch({
  args: [MAIN_ENTRY],      // apps/desktop/ 目录
  env: {
    ...process.env,
    SOLOCRAFT_DATA_DIR: testDataDir,          // 临时数据目录
    SOLOCRAFT_FORK_EXEC_PATH: nodePath,       // node 绝对路径
    SOLOCRAFT_ROOT_DIR: ROOT_DIR,             // monorepo 根路径
    NODE_ENV: 'test',
  },
  timeout: 30_000,
})
```

关键点：
- `MAIN_ENTRY` 指向 `apps/desktop/`（非 `out/main/index.js`），确保 `app.getAppPath()` 返回正确路径
- 3 个 env var 解决 Electron fork 五坑中的坑 4 和坑 5

### 5.2 StoreBridge

```
测试代码 ──evaluate()──→ window.__SOLOCRAFT_STORE__
                         │
                         ├── getState()      完整状态快照
                         ├── get('path')     dot-notation 取值
                         └── waitFor(pred)   等待状态条件
```

Store 暴露机制：

```typescript
// packages/ui/src/stores/useAppStore.ts
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'production') {
  (window as any).__SOLOCRAFT_STORE__ = useAppStore
}
```

- `import.meta.env.MODE`（非 `process.env.NODE_ENV`）—— Vite 环境变量
- `electron-vite build --mode test` → `MODE === 'test'` → Store 暴露
- `electron-vite build` → `MODE === 'production'` → Store 不暴露

### 5.3 ConsoleLogger（worker-scoped）

```typescript
class ConsoleLogger {
  attach(page: Page)              // 绑定 page.on('console') + page.on('pageerror')
  getAll(): LogEntry[]            // 全部日志
  getErrors(): LogEntry[]         // 仅错误
  clear(): void                   // 清空（每个 test 开始时由 TestHelper 调用）
  dump(): void                    // 调试输出
}
```

**必须 worker-scoped**：Page 是 worker-scoped（整个文件共享一个窗口），如果 ConsoleLogger 是 test-scoped，每个 test 都会 `page.on('console', ...)` 新增一个监听器，导致监听器泄漏。

### 5.4 TestHelper（test-scoped）

统一测试 API，组合 StoreBridge + ConsoleLogger + DOM 操作：

| 分类 | 方法 | 说明 |
|------|------|------|
| 导航 | `navigateTo(route)` | HashRouter 路由跳转 |
| 导航 | `goHome()` | 回到项目列表 |
| 导航 | `goToProject(id)` | 进入指定项目 |
| 导航 | `clickNav(name)` | 点击侧栏导航项 |
| 项目 | `createProject(name, desc?)` | UI 创建项目，返回 projectId |
| Agent | `createAgent(name, prompt?)` | UI 创建 Agent，返回 agentId |
| 聊天 | `sendChatMessage(msg)` | 输入并发送消息 |
| 聊天 | `waitForResponse(timeout?)` | 等待助手回复 |
| 断言 | `hasNoErrors()` | 检查无控制台错误 |

---

## 六、数据隔离与 API Key 管理

### 测试数据目录

```
globalSetup()
│
├── 1. 解析 .env.e2e.local          简单 key=value 解析器（无 dotenv 依赖）
│
├── 2. 创建临时目录                  os.tmpdir()/solocraft-e2e-{pid}/
│
├── 3. 种子化 settings.json          匹配 FileSettingsStorage 格式
│      {
│        "providers": [{ provider, apiKey, defaultModel }],
│        "defaultProvider": "google",
│        "theme": "dark",
│        "userProfile": { name: "E2E Test User", email: "e2e@test.local" }
│      }
│
├── 4. 存入 process.env              SOLOCRAFT_TEST_DATA_DIR = 临时路径
│
└── 5. Fixture 传给 Electron         env: { SOLOCRAFT_DATA_DIR: testDataDir }
       │
       └── Server fork 继承 env      → FileSettingsStorage 读取 settings.json
```

### API Key 流转

```
.env.e2e.local (开发者本地)
  │
  ├── TEST_GOOGLE_API_KEY=sk-xxx
  ├── TEST_OPENAI_API_KEY=sk-yyy
  └── TEST_ACTIVE_PROVIDER=google
       │
       ▼
globalSetup → settings.json (临时目录)
  │
  ├── providers: [{ provider: 'google', apiKey: 'sk-xxx', ... }]
  └── defaultProvider: 'google'
       │
       ▼
SOLOCRAFT_DATA_DIR → Server 读取
  │
  └── FileSettingsStorage.get() → resolveModel() → API 调用
```

**零生产代码改动**：Server 的 `FileSettingsStorage` 本来就从 `SOLOCRAFT_DATA_DIR/settings.json` 读取配置，E2E 只是通过 env var 指向临时目录。

### 清理

```typescript
// global-teardown.ts
fs.rmSync(testDataDir, { recursive: true, force: true })    // 删除临时目录
execSync("pkill -f 'packages/server/src/index\\.ts'")       // 杀残留 Server 进程
```

---

## 七、data-testid 规范

### 添加的 data-testid

| 区域 | testid | 组件 |
|------|--------|------|
| 布局 | `app-shell` | AppShell.tsx |
| 布局 | `sidebar` | ProjectSidebar.tsx |
| 布局 | `top-bar` | TopBar.tsx |
| 导航 | `nav-dashboard` / `nav-agents` / `nav-chat` / `nav-tasks` / `nav-artifacts` / `nav-memory` / `nav-settings` | ProjectSidebar.tsx（展开 + 折叠） |
| 项目 | `create-project-btn` | ProjectListPage.tsx |
| 项目 | `project-item-{id}` | ProjectListPage.tsx |
| 项目 | `project-name-input` / `project-desc-input` | ProjectCreateModal.tsx |
| 项目 | `confirm-btn` / `cancel-btn` | ProjectCreateModal.tsx |
| Agent | `create-agent-btn` | AgentListPage.tsx |
| Agent | `agent-item-{id}` | AgentListPage.tsx |
| Agent | `agent-name-input` / `agent-prompt-input` | AgentCreateModal.tsx |
| 聊天 | `chat-window` / `chat-input` / `chat-send-btn` | ChatWindow.tsx / ChatInput.tsx |
| 聊天 | `chat-message` + `data-role` | MessageBubble.tsx |
| 设置 | `settings-form` | GlobalSettingsPage.tsx |

### 选择器集中管理

所有 `data-testid` 在 `e2e/constants.ts` 的 `SELECTORS` 对象中集中定义，测试文件不硬编码选择器字符串。

---

## 八、测试用例清单

### Tier 1: smoke（15 tests）

| 文件 | 测试 | 验证内容 |
|------|------|---------|
| **app-launch.spec.ts** (4) | window opens and renders React app | `#root > *` 存在 |
| | store bridge is available | `window.__SOLOCRAFT_STORE__` 可访问 |
| | initial state is defined | `state.projects` 存在 |
| | project list page is displayed by default | `create-project-btn` 可见 |
| **navigation.spec.ts** (5) | project list page loads at root | `/` 路由正确 |
| | navigate to dashboard page | `/dashboard` 路由 |
| | navigate to global settings page | `/settings` 路由 |
| | sidebar navigation within project | agents → chat → tasks → dashboard |
| | navigate back to project list from project | 返回首页 |
| **project-crud.spec.ts** (5) | project list shows existing projects | 列表页渲染 |
| | create project modal opens | Modal 表单元素 |
| | create a new project via UI | UI 创建 + Store 验证 |
| | project appears in list after creation | 列表更新 |
| | navigate into project by clicking card | 卡片点击进入 |
| **agent-crud.spec.ts** (3) | navigate to agents page | Agent 列表渲染 |
| | agent create modal opens | Modal 表单元素 |
| | create a new agent and verify in store | UI 创建 + Store 验证 |
| **settings.spec.ts** (3) | settings page loads | 设置页渲染 |
| | settings tabs are visible | 5 个 Tab 全部可见 |
| | provider section is visible | Provider 选项可见 |

### Tier 2: server（7 tests）

| 文件 | 测试 | 验证内容 |
|------|------|---------|
| **chat-ui.spec.ts** (4) | beforeAll: create project + agent | 前置数据准备 |
| | chat page loads and shows empty state | 空状态 UI |
| | start chat shows chat input | 点击 Agent 开始聊天 |
| | type and send a user message | 发送消息 + 消息气泡显示 |
| **dashboard.spec.ts** (3) | dashboard page loads | Dashboard 渲染 |
| | dashboard has overview section | Overview 三列 |
| | dashboard tabs work | Tab 切换 |

### Tier 3: ai（2 tests，需 API Key）

| 文件 | 测试 | 验证内容 |
|------|------|---------|
| **chat-completion.spec.ts** (1) | basic AI response | 发送数学问题 → 验证回复包含正确答案 |
| **agent-execution.spec.ts** (1) | agent with custom system prompt | Pirate Agent → 验证回复含海盗语言 |

AI 层测试在无 API Key 时自动 `test.skip()`，不影响 CI。

---

## 九、生产代码改动

### 改动 1：Electron 主进程 env var 兼容

```typescript
// apps/desktop/src/main/index.ts

// 改动前（固定路径计算）：
const rootDir = join(app.getAppPath(), '../..')

// 改动后（env var 优先）：
const rootDir = process.env.SOLOCRAFT_ROOT_DIR || join(app.getAppPath(), '../..')
const execPath = app.isPackaged
  ? process.execPath
  : (process.env.SOLOCRAFT_FORK_EXEC_PATH || 'node')
```

- `SOLOCRAFT_ROOT_DIR`：解决 Playwright 启动时 `app.getAppPath()` 返回 `out/main/` 的问题
- `SOLOCRAFT_FORK_EXEC_PATH`：解决 macOS GUI 进程不继承 shell PATH 的问题
- **向后兼容**：`pnpm dev` 不设这两个 env var，fallback 到原有逻辑

### 改动 2：Zustand Store 暴露

```typescript
// packages/ui/src/stores/useAppStore.ts（文件末尾追加）
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'production') {
  (window as any).__SOLOCRAFT_STORE__ = useAppStore
}
```

- 仅在非 production 模式下暴露
- `pnpm dev`（development 模式）和 `electron-vite build --mode test`（test 模式）均可访问
- `electron-vite build`（production 模式，正式打包）不暴露

### 改动 3：data-testid 添加

在 10+ 个 UI 组件中添加 `data-testid` 属性，不影响任何运行时逻辑。

---

## 十、踩坑记录

### 坑总览

| 坑 | 现象 | 根因 | 修复 |
|----|------|------|------|
| macOS PATH | `spawn node ENOENT` | GUI 进程不继承 shell PATH | `SOLOCRAFT_FORK_EXEC_PATH` |
| app.getAppPath | `spawn node ENOENT`（cwd 不存在） | Playwright 启动时返回 `out/main/` | `SOLOCRAFT_ROOT_DIR` |
| Store 不暴露 | StoreBridge 断言失败 | `electron-vite build` 默认 production | `--mode test` |
| ESM __dirname | `ReferenceError: __dirname is not defined` | E2E 文件是 ESM | `import.meta.url` polyfill |
| ConsoleLogger 泄漏 | 每个 test 新增 listener | test-scoped Logger + worker-scoped Page | Logger 改为 worker-scoped |

### 详细解析：macOS GUI PATH 问题

```
pnpm dev（终端启动）                  Playwright 启动
─────────────────                    ─────────────
Shell 启动 Electron                  _electron.launch()
  └── PATH = /usr/local/bin:...       └── macOS GUI 进程
       └── fork('node') ✅                  └── PATH = /usr/bin:/bin（最小集）
                                                └── fork('node') ❌ ENOENT
```

修复：E2E fixture 中 `execSync('which node')` 解析绝对路径，通过 env var 传入。

### 详细解析：app.getAppPath() 路径问题

```
pnpm dev                              Playwright
────────                              ──────────
electron-vite dev                     _electron.launch({ args: ['apps/desktop/'] })
  └── app.getAppPath()                  └── app.getAppPath()
       = apps/desktop/                      = apps/desktop/out/main/（！）
       └── ../../ = monorepo root            └── ../../ = apps/desktop/（错！）
```

`spawn ENOENT` 的报错信息显示 node 路径，但实际是 `cwd` 目录不存在（`apps/desktop/packages/server` ← 不存在）。

修复：通过 `SOLOCRAFT_ROOT_DIR` env var 显式传入 monorepo 根路径。

---

## 十一、Code Review 修复

### P1 修复清单（7 项）

| 问题 | 修复 |
|------|------|
| `pkill -f 'solocraft.*server'` 匹配过宽 | 缩窄为 `pkill -f 'packages/server/src/index\\.ts'` |
| 13 处 `waitForTimeout` 固定等待 | 全部替换为事件驱动等待，测试时间 23s → 11.2s |
| ConsoleLogger test-scoped 导致 listener 泄漏 | 改为 worker-scoped，TestHelper 接收外部 Logger |
| 模块级 `let projectId` 隐式测试顺序依赖 | 改为 `test.beforeAll()` |
| settings 测试缺 Paths Tab 断言 | 补充 `Paths` Tab 检查 |
| 折叠侧栏缺 `data-testid` | 展开/折叠按钮均添加 `data-testid` |
| `testDataDir ?? ''` 空字符串 fallback 危险 | 改为 `throw Error` |

---

## 十二、工作流程图

### 12.1 E2E 测试启动流程

```
pnpm test:e2e
│
├── 1. electron-vite build --mode test
│      └── 编译 main / preload / renderer → apps/desktop/out/
│
├── 2. npx playwright test --config=e2e/playwright.config.ts
│      │
│      ├── globalSetup()
│      │   ├── 解析 .env.e2e.local
│      │   ├── 创建临时数据目录
│      │   ├── 种子化 settings.json
│      │   └── SOLOCRAFT_TEST_DATA_DIR = 临时路径
│      │
│      ├── Worker 启动 (scope: worker)
│      │   ├── electronApp Fixture
│      │   │   ├── which node → 绝对路径
│      │   │   └── _electron.launch({
│      │   │         args: [DESKTOP_DIR],
│      │   │         env: { SOLOCRAFT_DATA_DIR, SOLOCRAFT_ROOT_DIR, ... }
│      │   │       })
│      │   │
│      │   ├── → Electron 主进程
│      │   │     └── fork(packages/server/src/index.ts)
│      │   │         └── IPC: { type: 'ready', port, token }
│      │   │
│      │   ├── window Fixture
│      │   │   └── electronApp.firstWindow()
│      │   │       └── waitForSelector('#root > *')
│      │   │
│      │   └── consoleLogger Fixture
│      │       └── new ConsoleLogger() → attach(window)
│      │
│      ├── Test 执行 (scope: test)
│      │   └── helper Fixture
│      │       └── new TestHelper(window, consoleLogger)
│      │           ├── store = new StoreBridge(window)
│      │           └── console = consoleLogger (clear)
│      │
│      └── globalTeardown()
│          ├── 删除临时数据目录
│          └── pkill 残留 Server 进程
```

### 12.2 双轨验证策略

```
测试断言
├── Store 状态验证（StoreBridge）
│   ├── store.get('currentProjectId')        精确值检查
│   ├── store.get('agents')                  数组长度/内容检查
│   └── store.waitFor('state.projects.length > 0')  状态变更等待
│
└── DOM 可见性验证（Playwright）
    ├── expect(locator).toBeVisible()         UI 可见性
    ├── expect(locator).toContainText()       文本内容
    └── page.waitForSelector(selector)        元素出现
```

Store 验证确保数据层正确，DOM 验证确保用户视角正确。两者互补。

---

## 十三、环境变量总览

### Electron 主进程读取的 env var

| 变量 | 来源 | 用途 |
|------|------|------|
| `SOLOCRAFT_DATA_DIR` | E2E Fixture | 数据目录（临时目录 vs `~/.solocraft`） |
| `SOLOCRAFT_ROOT_DIR` | E2E Fixture | monorepo 根路径（绕过 app.getAppPath 问题） |
| `SOLOCRAFT_FORK_EXEC_PATH` | E2E Fixture | node 绝对路径（绕过 macOS PATH 问题） |

### E2E 内部使用的 env var

| 变量 | 来源 | 用途 |
|------|------|------|
| `SOLOCRAFT_TEST_DATA_DIR` | globalSetup | 在 globalSetup 和 Fixture 之间传递临时目录路径 |
| `TEST_GOOGLE_API_KEY` | .env.e2e.local | Google AI API Key |
| `TEST_OPENAI_API_KEY` | .env.e2e.local | OpenAI API Key |
| `TEST_ANTHROPIC_API_KEY` | .env.e2e.local | Anthropic API Key |
| `TEST_ACTIVE_PROVIDER` | .env.e2e.local | 默认 AI Provider |

---

## 十四、测试结果

```
Running 26 tests using 1 worker

  smoke
  ✓  app-launch › window opens and renders React app
  ✓  app-launch › store bridge is available
  ✓  app-launch › initial state is defined
  ✓  app-launch › project list page is displayed by default
  ✓  navigation › project list page loads at root
  ✓  navigation › navigate to dashboard page
  ✓  navigation › navigate to global settings page
  ✓  navigation › sidebar navigation within project
  ✓  navigation › navigate back to project list from project
  ✓  project-crud › project list shows existing projects or empty state
  ✓  project-crud › create project modal opens
  ✓  project-crud › create a new project via UI
  ✓  project-crud › project appears in list after creation
  ✓  project-crud › navigate into project by clicking card
  ✓  agent-crud › navigate to agents page
  ✓  agent-crud › agent create modal opens
  ✓  agent-crud › create a new agent and verify in store
  ✓  settings › settings page loads
  ✓  settings › settings tabs are visible
  ✓  settings › provider section is visible

  server
  ✓  chat-ui › chat page loads and shows empty state
  ✓  chat-ui › start chat shows chat input
  ✓  chat-ui › type and send a user message
  ✓  dashboard › dashboard page loads
  ✓  dashboard › dashboard has overview section
  ✓  dashboard › dashboard tabs work

  26 passed (11.2s)
```

AI 层（2 tests）在无 `.env.e2e.local` 时自动跳过。

---

## 十五、当前限制与后续改进

### 已知限制

| 限制 | 说明 |
|------|------|
| 单 Worker | Electron 测试不支持多 Worker 并行（窗口共享） |
| 无截图对比 | 暂未集成 visual regression |
| AI 测试覆盖有限 | 仅验证基本对话和 System Prompt，未覆盖 Tool Call / Sub-Agent |
| 无 CI 集成 | 本地运行，未配置 GitHub Actions |
| 无网络 Mock | ai 层依赖真实 API 调用 |

### 后续路线图

| 阶段 | 内容 |
|------|------|
| **CI 集成** | GitHub Actions + Playwright 报告上传 |
| **Visual Regression** | 截图基线比对（像素风 UI 变化检测） |
| **Tool Call 测试** | Agent 工具调用端到端验证 |
| **性能基准** | 启动时间、首屏渲染时间基线 |
| **多平台** | Windows / Linux E2E 覆盖 |
