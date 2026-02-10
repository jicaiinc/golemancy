# 踩坑：Electron fork() 启动 Server 子进程

> **日期**：2026-02-10
> **阶段**：Agent Server 实现（Phase 2 → Code Review → 修复）
> **影响**：`pnpm dev` 启动直接崩溃，Server 无法启动

---

## 背景

SoloCraft 是 Electron 桌面应用，Server（Hono + SQLite）作为子进程运行。Electron 主进程通过 `child_process.fork()` 启动 Server。

```
Electron main process
  └── fork() → Server child process (Hono + better-sqlite3)
```

## 连环三坑

### 坑 1：`__dirname` 在 electron-vite 编译后改变

**错误代码**：
```ts
const serverEntry = join(__dirname, '../../packages/server/src/index.ts')
```

**问题**：electron-vite 把 `apps/desktop/src/main/index.ts` 编译到 `apps/desktop/out/main/index.js`。运行时 `__dirname` 是 `out/main/`，`../../` 只退到 `apps/desktop/`，最终路径变成 `apps/desktop/packages/server/src/index.ts` — 不存在。

**修复**：
```ts
// app.getAppPath() 始终返回 apps/desktop/，不受编译输出影响
const serverEntry = join(app.getAppPath(), '../../packages/server/src/index.ts')
```

**规则**：在 electron-vite 项目中，永远不要用 `__dirname` 做跨包路径计算，用 `app.getAppPath()` 代替。

---

### 坑 2：`fork()` 继承父进程 cwd，pnpm 依赖找不到

**错误代码**：
```ts
fork(serverEntry, [], {
  execArgv: ['--import', 'tsx'],  // tsx 在哪？
})
```

**问题**：`fork()` 继承 Electron 主进程的 cwd（`apps/desktop/`）。但 `tsx` 是 `@solocraft/server` 的 devDependency，pnpm 只安装在 `packages/server/node_modules/tsx/`。从 `apps/desktop/` 无法解析到 tsx。

**报错**：
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from /Users/.../apps/desktop/
```

**修复**：
```ts
fork(serverEntry, [], {
  cwd: join(app.getAppPath(), '../../packages/server'),  // 设到 server 包目录
  execArgv: ['--import', 'tsx'],
})
```

**规则**：pnpm monorepo 中 `fork()` / `spawn()` 必须显式设置 `cwd` 到拥有依赖的包目录。

---

### 坑 3：Electron 内嵌 Node 的 ABI 版本与系统 Node 不同

**错误代码**：
```ts
fork(serverEntry, [])  // 默认 execPath = process.execPath = Electron 二进制
```

**问题**：`fork()` 默认用 `process.execPath`（Electron 二进制，内嵌 Node ABI 143）执行子进程。但 `better-sqlite3` 是 C++ 原生模块，编译时链接的是系统 Node（ABI 127）。ABI 不匹配，加载直接崩溃。

**报错**：
```
Error [ERR_DLOPEN_FAILED]: The module 'better-sqlite3.node'
was compiled against NODE_MODULE_VERSION 127. This version requires NODE_MODULE_VERSION 143.
```

**修复**：
```ts
fork(serverEntry, [], {
  execPath: app.isPackaged ? process.execPath : 'node',  // dev 用系统 node
})
```

**规则**：Electron `fork()` 启动含原生模块的子进程时，dev 模式必须用系统 `node`（`execPath: 'node'`），不能用 Electron 内嵌的 Node。

---

## 最终正确写法

```ts
// apps/desktop/src/main/index.ts
const serverEntry = app.isPackaged
  ? join(process.resourcesPath, 'server', 'index.js')
  : join(app.getAppPath(), '../../packages/server/src/index.ts')

const serverCwd = app.isPackaged
  ? join(process.resourcesPath, 'server')
  : join(app.getAppPath(), '../../packages/server')

const child = fork(serverEntry, [], {
  env: { ...process.env, PORT: '0' },
  execPath: app.isPackaged ? process.execPath : 'node',
  execArgv: app.isPackaged ? [] : ['--import', 'tsx'],
  cwd: serverCwd,
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
})
```

## 为什么没有在开发中发现

1. **429 个单元测试全部通过** — 但 vitest 在纯 Node 环境运行，完全不涉及 Electron 启动流程
2. **Code Reviewer 指出了路径问题** — 但修复时仍用 `__dirname`，没理解根因
3. **团队流程缺失** — 阶段二出口条件是"测试通过"，但没有要求 `pnpm dev` 冒烟测试

## 教训

- **单元测试 ≠ 集成测试**：跨进程边界（Electron ↔ fork ↔ Node child）的问题，单元测试覆盖不到
- **涉及 Electron + child_process 的改动，必须 `pnpm dev` 实际启动验证**
- **electron-vite 编译会改变 `__dirname`**：这是 electron-vite 特有的陷阱，与普通 Vite 项目不同
- **pnpm strict isolation + Electron fork**：三者组合会放大依赖解析问题，`cwd` 和 `execPath` 必须显式设置
