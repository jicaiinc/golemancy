# 浏览器自动化方案研究报告

> 创建时间：2026-02-24
> 状态：研究完成，待实现

## 一、研究背景

### 两个核心问题

1. **用户 Profile 问题**：Playwright 默认启动空 Profile，没有用户的登录凭证、Cookie 等认证状态，不符合使用习惯
2. **Token 爆炸问题**：Agent 每次读取页面可能产生 5 万字，操作后又要重读，context 增长极快

### 调研对象

| 项目 | 类型 | Stars | 核心特点 |
|------|------|-------|----------|
| [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | CLI + npm | 15k+ | Snapshot+Refs, 5 层过滤, 93% token 压缩 |
| [browser-use](https://github.com/browser-use/browser-use) | Python 库 | — | 索引元素 + 边界框截图双模态 |
| [browserbase/stagehand](https://github.com/browserbase/stagehand) | TypeScript | — | Accessibility tree + DOM 合并 |
| [AgentQL](https://github.com/tinyfish-io/agentql) | 查询语言 | — | 语义查询，LLM 不看原始页面 |
| Anthropic Computer Use | Vision | — | 纯截图 + 像素坐标，跨应用 |
| 我们当前实现 (packages/tools) | TypeScript | — | 22 工具, 双 Driver, 自写 DOM 遍历 |
| zza 项目 | TypeScript | — | CDP 级人类模拟 (force:0.5, 随机延迟) |

---

## 二、agent-browser 深度分析

### 2.1 架构

```
Rust CLI (二进制)
  ↕ Unix Socket / TCP (JSON-newline 协议)
Node.js Daemon
  └── BrowserManager (Playwright 封装)
        ├── Snapshot 系统 (ariaSnapshot + 后处理)
        ├── Diff 引擎 (Myers diff)
        ├── Actions (95 个命令)
        └── State/Stream/Recording
```

- **Rust CLI**：命令解析，sub-ms 开销，重试/超时逻辑
- **Node.js Daemon**：长驻后台，Socket 服务，命令队列串行执行
- **BrowserManager**：2027 行代码，Playwright 全部能力封装

### 2.2 BrowserManager 能力清单

#### 启动模式 (6 种)

| 模式 | 说明 |
|------|------|
| 普通 launch | `chromium.launch()` |
| CDP 连接 | `chromium.connectOverCDP(port/url/ws)` |
| Auto-Connect | 自动发现运行中的 Chrome (读 DevToolsActivePort) |
| Profile 持久化 | `launchPersistentContext(path)` |
| Extensions | 加载浏览器扩展 (强制 headful) |
| 云供应商 | Browserbase / BrowserUse / Kernel |

Auto-Connect 发现策略：
1. 读 Chrome User Data 目录下的 `DevToolsActivePort` 文件
2. macOS: `~/Library/Application Support/Google/Chrome`, Chrome Canary, Chromium
3. Windows: `%LOCALAPPDATA%\Google\Chrome\User Data`
4. Linux: `~/.config/google-chrome`, chromium
5. 尝试 HTTP 探测端口 → 失败则直接 WebSocket (Chrome M144+)
6. 兜底探测 9222, 9229 常见端口

#### 启动参数

```typescript
interface LaunchCommand {
  headless?: boolean
  viewport?: { width: number; height: number } | null
  browser?: 'chromium' | 'firefox' | 'webkit'
  executablePath?: string
  cdpPort?: number
  cdpUrl?: string
  autoConnect?: boolean
  extensions?: string[]
  profile?: string
  storageState?: string
  proxy?: { server: string; bypass?; username?; password? }
  args?: string[]
  userAgent?: string
  provider?: string  // browserbase / browseruse / kernel
  ignoreHTTPSErrors?: boolean
  allowFileAccess?: boolean
  colorScheme?: 'light' | 'dark' | 'no-preference'
  headers?: Record<string, string>
}
```

#### 页面/Tab/Frame 管理

- 多 Tab (index-based)，自动跟踪 `window.open()` 创建的新 Tab
- 多 Window (`newWindow()` → 独立 cookie jar)
- Frame 切换 (`frame()` / `mainframe()`)
- CDP Session 管理 (lazy create, page 切换时自动 invalidate)

#### 高级能力

- Cookie / localStorage / sessionStorage CRUD
- 网络拦截 (`route()` / `unroute()`)
- Geolocation / Permissions / Timezone / Locale 模拟
- 设备模拟 (Playwright devices 全集)
- HAR 录制
- 录屏 (WebM via Playwright native)
- Tracing + Chrome DevTools Profiling
- Screencast (CDP 实时画面流 via WebSocket)
- State save/load (AES-256-GCM 加密)

### 2.3 Snapshot 系统 (Token 优化核心)

#### 基础：Playwright `ariaSnapshot()`

```typescript
const locator = options.selector
  ? page.locator(options.selector)
  : page.locator(':root')
const ariaTree = await locator.ariaSnapshot()
// → YAML-like 缩进字符串，表示 accessibility tree
```

agent-browser **不自己遍历 DOM**，而是用 Playwright 内置 API 获取 ARIA 树，然后做后处理。

#### 五层过滤

| 标志 | 名称 | 效果 | Token 节省 |
|------|------|------|-----------|
| `-i` | Interactive Only | 只保留 20 种可交互角色，输出扁平列表 | ~95% |
| `-c` | Compact | 删除无名结构容器 + 无 ref 子节点的分支 | ~50% |
| `-d N` | Depth Limit | 截断超过 N 层的节点 | 可变 |
| `-s "sel"` | Selector Scope | 只快照 CSS 选择器匹配区域 | 可变 |
| `-C` | Cursor Interactive | 检测 `cursor:pointer` / `onclick` 元素 | 增加覆盖 |

**INTERACTIVE_ROLES (20 种)**:

```
button, link, textbox, checkbox, radio, combobox, listbox,
menuitem, menuitemcheckbox, menuitemradio, option, searchbox,
slider, spinbutton, switch, tab, treeitem
```

**CONTENT_ROLES (10 种, 有 name 时分配 ref)**:

```
heading, cell, gridcell, columnheader, rowheader, listitem,
article, region, main, navigation
```

**STRUCTURAL_ROLES (16 种, compact 模式可过滤)**:

```
generic, group, list, table, row, rowgroup, grid, treegrid,
menu, menubar, toolbar, tablist, tree, directory, document,
application, presentation, none
```

#### Ref 系统

```typescript
// 格式: e1, e2, e3... (每次 snapshot 重置)
// 接受: "@e1", "ref=e1", "e1" 三种写法

interface RefMap {
  [ref: string]: {
    selector: string    // Playwright getByRole 选择器
    role: string
    name?: string
    nth?: number        // 同 role+name 重复时的消歧索引
  }
}
```

重复消歧：`RoleNameTracker` 计数每个 role+name 组合，重复时加 `[nth=1]`。后处理 `removeNthFromNonDuplicates()` 清理唯一元素的 nth。

Ref 解析：优先按 ref 查找 → 失败则当 CSS selector → 支持双模式。

#### Compact Tree 算法

```
对每一行:
  1. 有 [ref=...] → 保留
  2. 有文本内容(含 : 但不以 : 结尾) → 保留
  3. 否则: 向下查找子节点中是否有 ref
     有 → 保留 (作为结构容器)
     无 → 删除 (空容器)
```

#### Cursor-Interactive 检测 (`-C`)

在浏览器中执行 JS，检测:
- `getComputedStyle(el).cursor === 'pointer'`
- `el.hasAttribute('onclick')`
- 非负 `tabindex`

过滤掉原生交互元素 (a, button, input 等)，避免重复。
构建 CSS 选择器: data-testid > id > 路径选择器。
分配伪角色 `clickable` 或 `focusable`。

#### Token 统计

```typescript
function getSnapshotStats(tree: string, refs: RefMap) {
  return {
    lines: tree.split('\n').length,
    chars: tree.length,
    tokens: Math.ceil(tree.length / 4),  // 粗估: 4 chars/token
    refs: Object.keys(refs).length,
    interactive: Object.values(refs).filter(r => INTERACTIVE_ROLES.has(r.role)).length,
  }
}
```

### 2.4 Diff 引擎

#### Myers Diff

```typescript
function diffSnapshots(before: string, after: string): DiffSnapshotData
// 返回:
// { diff: string, additions: number, removals: number, unchanged: number, changed: boolean }
// diff 格式: "  " 不变, "+ " 新增, "- " 删除
```

- `Int32Array` V 数组优化
- 相同数组快速 O(n) 短路
- Snapshot-based trace 用于回溯

#### Screenshot Diff

```typescript
function diffScreenshots(context, baselineBuffer, currentBuffer, opts): Promise<DiffScreenshotData>
// 用浏览器 Canvas API 做像素比较
// 阈值: RGB 欧氏距离, 默认 0.1
// 差异图: 红色=差异, 灰色=相同
// 返回: { diffPath, totalPixels, differentPixels, mismatchPercentage, match }
```

### 2.5 95 个命令完整清单

#### 导航 (6)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `navigate` | 打开 URL | url, waitUntil, headers |
| `back` | 后退 | — |
| `forward` | 前进 | — |
| `reload` | 刷新 | — |
| `url` | 获取当前 URL | — |
| `title` | 获取当前标题 | — |

#### 感知 (5)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `snapshot` | Accessibility 快照 | interactive, cursor, maxDepth, compact, selector |
| `screenshot` | 截图 | path, fullPage, selector, format, quality, annotate |
| `content` | 获取页面 HTML | selector |
| `diff_snapshot` | 快照 diff | baseline, selector, compact, maxDepth |
| `diff_screenshot` | 截图像素 diff | baseline, output, threshold, selector, fullPage |

#### 点击/输入 (11)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `click` | 点击 | selector, button, clickCount, delay, newTab |
| `type` | 按键输入(模拟击键) | selector, text, delay, clear |
| `fill` | 直接填值(无击键) | selector, value |
| `check` | 勾选 checkbox | selector |
| `uncheck` | 取消勾选 | selector |
| `dblclick` | 双击 | selector |
| `hover` | 悬停 | selector |
| `drag` | 拖拽 | source, target |
| `tap` | 触摸点击(移动端) | selector |
| `focus` | 聚焦元素 | selector |
| `clear` | 清空输入框 | selector |

#### 选择 (3)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `select` | 下拉选择 | selector, values |
| `multiselect` | 多选 | selector, values |
| `selectall` | 全选文本(Ctrl+A) | selector |

#### 键盘 (6)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `press` | 按键/组合键 | key, selector |
| `keyboard` | 键盘操作(子命令) | subaction(type/press/insertText), keys, text, delay |
| `keydown` | 按下键 | key |
| `keyup` | 释放键 | key |
| `inserttext` | 插入文本(IME) | text |

#### 鼠标 (4)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `mousemove` | 移动鼠标到坐标 | x, y |
| `mousedown` | 按下鼠标 | button |
| `mouseup` | 释放鼠标 | button |
| `wheel` | 滚轮 | deltaX, deltaY, selector |

#### 滚动 (2)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `scroll` | 滚动 | selector, x, y, direction, amount |
| `scrollintoview` | 滚动到可见 | selector |

#### 等待 (4)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `wait` | 等待/等待元素 | selector, timeout, state |
| `waitforurl` | 等待 URL 变化 | url, timeout |
| `waitforloadstate` | 等待加载状态 | state(load/domcontentloaded/networkidle), timeout |
| `waitforfunction` | 等待 JS 条件为真 | expression, timeout |

#### 语义定位 (8)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `getbyrole` | 按角色定位+操作 | role, name, exact, subaction(click/fill/check/hover), value |
| `getbytext` | 按文本定位+操作 | text, exact, subaction(click/hover) |
| `getbylabel` | 按 label 定位 | label, exact, subaction, value |
| `getbyplaceholder` | 按 placeholder 定位 | placeholder, exact, subaction, value |
| `getbyalttext` | 按 alt 定位 | text, exact, subaction |
| `getbytitle` | 按 title 定位 | text, exact, subaction |
| `getbytestid` | 按 data-testid 定位 | testId, subaction, value |
| `nth` | 第 N 个匹配 | selector, index, subaction, value |

#### 元素查询 (10)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `getattribute` | 获取属性值 | selector, attribute |
| `gettext` | 获取文本 | selector |
| `isvisible` | 是否可见 | selector |
| `isenabled` | 是否启用 | selector |
| `ischecked` | 是否勾选 | selector |
| `count` | 匹配数量 | selector |
| `boundingbox` | 位置和尺寸 | selector |
| `styles` | CSS 样式 | selector |
| `innertext` | innerText | selector |
| `innerhtml` | innerHTML | selector |
| `inputvalue` | input 当前值 | selector |

#### Tab/窗口 (6)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `tab_new` | 新建 Tab | url |
| `tab_list` | 列出所有 Tab | — |
| `tab_switch` | 切换 Tab | index |
| `tab_close` | 关闭 Tab | index |
| `window_new` | 新窗口(独立 cookie) | viewport |
| `bringtofront` | 窗口置顶 | — |

#### Frame (2)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `frame` | 切换到 iframe | selector, name, url |
| `mainframe` | 回到主 frame | — |

#### 对话框 (1)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `dialog` | 处理 alert/confirm/prompt | response(accept/dismiss), promptText |

#### Cookie/Storage (6)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `cookies_get` | 获取 cookie | urls |
| `cookies_set` | 设置 cookie | cookies[] (name, value, domain, path, expires...) |
| `cookies_clear` | 清除 cookie | — |
| `storage_get` | 获取 storage | key, type(local/session) |
| `storage_set` | 设置 storage | key, value, type |
| `storage_clear` | 清除 storage | type |

#### 网络 (6)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `requests` | 查看网络请求 | filter, clear |
| `responsebody` | 获取响应体 | url, timeout |
| `route` | 拦截请求(mock) | url, response(status/body/contentType/headers), abort |
| `unroute` | 取消拦截 | url |
| `offline` | 离线模式 | offline(bool) |
| `headers` | 设置请求头 | headers |
| `credentials` | HTTP Basic Auth | username, password |

#### 页面配置 (7)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `viewport` | 设置视口大小 | width, height |
| `useragent` | 设置 UA (仅启动时) | userAgent |
| `device` | 设备模拟 | device (name) |
| `device_list` | 列出可模拟设备 | — |
| `geolocation` | 地理位置模拟 | latitude, longitude, accuracy |
| `permissions` | 权限设置 | permissions[], grant |
| `emulatemedia` | 媒体模拟 | media, colorScheme, reducedMotion, forcedColors |
| `timezone` | 时区 (仅启动时) | timezone |
| `locale` | 语言 (仅启动时) | locale |

#### JS 执行 (3)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `evaluate` | 执行 JS 返回结果 | script, args |
| `evalhandle` | 执行 JS 返回 handle | script |
| `addinitscript` | 页面加载前注入 JS | script |

#### 页面修改 (5)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `setvalue` | 直接设置 input value | selector, value |
| `setcontent` | 设置页面 HTML | html |
| `addscript` | 注入 `<script>` | content, url |
| `addstyle` | 注入 `<style>` | content, url |
| `dispatch` | 派发自定义事件 | selector, event, eventInit |
| `expose` | 暴露函数给页面 | name |

#### 文件/下载 (2)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `upload` | 上传文件 | selector, files |
| `download` | 下载文件 | selector, path |

#### 差异对比 (3)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `diff_snapshot` | 快照文本 diff | baseline, selector, compact, maxDepth |
| `diff_screenshot` | 截图像素 diff | baseline, output, threshold, selector, fullPage |
| `diff_url` | 两个 URL 对比 | url1, url2, screenshot, fullPage, waitUntil, selector |

#### 状态管理 (7)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `state_save` | 保存浏览器状态 | path |
| `state_load` | 加载浏览器状态 | path |
| `state_list` | 列出已保存状态 | — |
| `state_clear` | 清除状态 | sessionName, all |
| `state_show` | 查看状态内容 | filename |
| `state_clean` | 清理过期状态 | days |
| `state_rename` | 重命名状态 | oldName, newName |

#### 录制/调试 (11)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `recording_start` | 开始录屏 (webm) | path, url |
| `recording_stop` | 停止录屏 | — |
| `recording_restart` | 重启录屏 | path, url |
| `video_start` | Playwright 原生录制 | path |
| `video_stop` | 停止 Playwright 录制 | — |
| `trace_start` | 开始 trace | screenshots, snapshots |
| `trace_stop` | 停止 trace | path |
| `profiler_start` | 开始 Chrome 性能分析 | categories |
| `profiler_stop` | 停止性能分析 | path |
| `har_start` | 开始 HAR 录制 | — |
| `har_stop` | 停止 HAR 录制 | path |

#### CDP 底层输入 (4)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `input_mouse` | CDP 鼠标事件 | type, x, y, button, clickCount, deltaX, deltaY, modifiers |
| `input_keyboard` | CDP 键盘事件 | type, key, code, text, modifiers |
| `input_touch` | CDP 触摸事件 | type, touchPoints[], modifiers |
| `swipe` | 触摸滑动 | direction, distance |

#### Screencast (2)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `screencast_start` | 实时画面流 | format, quality, maxWidth, maxHeight, everyNthFrame |
| `screencast_stop` | 停止画面流 | — |

#### 其他 (5)

| 命令 | 说明 | 关键参数 |
|------|------|----------|
| `console` | 控制台消息 | clear |
| `errors` | 页面错误 | clear |
| `clipboard` | 剪贴板操作 | operation(copy/paste/read), text |
| `highlight` | 高亮元素(调试) | selector |
| `pdf` | 导出 PDF | path, format(Letter/Legal/A0-A6) |
| `pause` | 暂停(调试) | — |
| `launch` | 启动浏览器 | (见 LaunchCommand) |
| `close` | 关闭浏览器 | — |

### 2.6 AI-Friendly 错误转换

```typescript
function toAIFriendlyError(error: unknown, selector: string): Error
```

| Playwright 原始错误 | 转换后 Agent 看到的 |
|---------------------|-------------------|
| `strict mode violation: resolved to N elements` | `Selector "X" matched N elements. Run 'snapshot' to get updated refs.` |
| `element intercepts pointer events` | `Element "X" is blocked by another element (likely modal/overlay). Try dismissing modals first.` |
| `not visible` | `Element "X" is not visible. Try scrolling or check if hidden.` |
| `Timeout exceeded` | `Action on "X" timed out. Element may be blocked/loading. Run 'snapshot'.` |
| `waiting for...to be visible` | `Element "X" not found or not visible. Run 'snapshot'.` |

### 2.7 MCP 支持

**agent-browser 本身没有 MCP 实现。**

社区包装：
- `agent-browser-mcp` (社区, spawn CLI 子进程)
- `@coofly/agent-browser-mcp` (社区, CLI 包装)

另一个独立项目 `@agent-browser-io/browser` (非 Vercel) 有内置 MCP + AI SDK 集成，但功能远不如 agent-browser 成熟。

### 2.8 Programmatic API

虽然是 CLI 优先，但 npm 包可以 programmatic 使用：

```typescript
import { BrowserManager } from 'agent-browser/dist/browser.js'
import { getEnhancedSnapshot, parseRef, getSnapshotStats } from 'agent-browser/dist/snapshot.js'
import { diffSnapshots } from 'agent-browser/dist/diff.js'
import { executeCommand } from 'agent-browser/dist/actions.js'
import { toAIFriendlyError } from 'agent-browser/dist/actions.js'
import { parseCommand } from 'agent-browser/dist/protocol.js'
```

注意：无 `exports` field，需要 deep import。ESM only。

### 2.9 工具加载策略

agent-browser 作为 CLI 工具时，**不是加载 95 个 tool schema**：

```
Claude Code:
  1 个 Bash tool + SKILL.md (~16KB 文本描述)
  AI 读文档 → 决定执行什么 CLI 命令

AI SDK (我们的方式):
  每个 tool() → JSON Schema → 每次 API 请求都发送
  95 tool × ~200 token/tool = 19,000 token/请求
  ← 这是不可接受的
```

**解决方案：15 + 1 混合模式**
- 15 个高频核心 Tool（结构化 Zod schema，模型选择准确）
- 1 个万能 `browser_command` Tool（覆盖剩余 80 个命令，运行时 Zod 校验）
- 总开销 ~3,200 token/请求

---

## 三、反检测能力对比

### 3.1 agent-browser：无反检测

```
click 实现:
  await locator.click({ button, clickCount, delay })
  ← 就这一行，直接调 Playwright API

无:
  · force/pressure 参数
  · 鼠标移动模拟
  · 随机延迟
  · navigator.webdriver 隐藏
  · CDP 标记清除
  · Canvas/WebGL 指纹伪装
  · stealth 插件

唯一 "stealth": Kernel 云供应商的 stealth:true 标志 (服务端实现，非本地)
```

### 3.2 zza 项目：CDP 级人类模拟

```typescript
// 5 步 CDP 点击 (cdp-tab.ts)
async click(x: number, y: number): Promise<void> {
  // 1. 先移动鼠标
  await this.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'none', buttons: 0
  })
  // 2. 人类犹豫
  await this.randomDelay(50, 150)
  // 3. 按下 (force: 0.5 = 人类力度)
  await this.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y,
    button: 'left', buttons: 1, clickCount: 1, force: 0.5
  })
  // 4. 按下持续时间
  await this.randomDelay(30, 100)
  // 5. 释放
  await this.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y,
    button: 'left', buttons: 0, clickCount: 1
  })
}
```

**关键参数**：
- `force: 0.5` — 人类按压力度 (0.3~0.7 范围，自动化通常 0 或 1.0)
- 随机延迟 — 50-150ms 悬停、30-100ms 按压、30-80ms 双击间隔
- 完整事件链 — mouseMoved → mousePressed → mouseReleased
- buttons bitmask — 1=pressed, 0=released (正确值)

**为什么需要**：
- Reddit、Instagram、Cloudflare 等检测事件序列是否自然
- 检查是否有 mousemove 前置（直接 click 没有）
- 检查 force 值（自动化通常 force=0）
- 检查时序模式（固定间隔 = 机器人）

### 3.3 对比表

| 能力 | agent-browser | zza 项目 | 我们需要 |
|------|--------------|---------|---------|
| 鼠标移动到目标 | ❌ | ✅ mouseMoved | ✅ |
| 点击力度 (force) | ❌ | ✅ 0.5 | ✅ |
| 随机延迟 | ❌ | ✅ 50-150ms | ✅ |
| 完整事件链 | ❌ (locator.click) | ✅ 5 步 CDP | ✅ |
| 双击模拟 | ❌ (clickCount:2) | ✅ 4 事件 | ✅ |
| CDP 级键盘 | ❌ | ✅ keyDown/char/keyUp | ✅ |
| navigator.webdriver | 暴露 (true) | 不处理 | 需要 |
| Canvas 指纹 | ❌ | ❌ | 可选 |
| stealth 插件 | ❌ | ❌ | 可选 |

---

## 四、我们当前实现 vs agent-browser

### 4.1 代码量对比

| 模块 | agent-browser | 我们的实现 |
|------|--------------|-----------|
| BrowserManager / PlaywrightDriver | ~2027 行 (60+ 方法) | ~400 行 (~20 方法) |
| Snapshot 系统 | ~514 行 (5 层过滤 + ref 消歧) | ~300 行 (固定全树，无过滤) |
| Actions / Tools | ~1862 行 (95 命令) | ~377 行 (22 工具) |
| Diff 引擎 | ~271 行 (Myers + 像素) | 无 |
| Types | ~853 行 | ~140 行 |
| Protocol (Zod) | ~932 行 (95 schema) | 内嵌在 tool 定义中 |

### 4.2 能力对比

| 能力 | agent-browser | 我们 |
|------|--------------|------|
| 启动模式 | 6 种 (含 autoConnect, profile, 云) | 2 种 (launch, CDP) |
| Snapshot 过滤 | 5 层 (-i/-c/-d/-s/-C) | 无 |
| Diff | ✅ (文本 + 像素) | ❌ |
| Ref 消歧 | ✅ (nth) | ❌ |
| AI-Friendly 错误 | ✅ | ❌ |
| 截图标注 | ✅ (annotate) | ❌ |
| Frame 切换 | ✅ | ❌ |
| Cookie/Storage | ✅ CRUD | ❌ |
| 网络拦截 | ✅ (route) | ❌ |
| 设备/地理模拟 | ✅ | ❌ |
| 状态持久化 | ✅ (加密) | ❌ |
| 录屏/HAR/Trace | ✅ | ❌ |
| 反检测 (click) | ❌ | ❌ |
| 双 Driver 抽象 | ❌ (仅 Playwright) | ✅ (Playwright + Extension) |
| 浏览器插件驱动 | ❌ | ✅ (ExtensionDriver) |

---

## 五、用户 Profile 问题方案

### 5.1 方案对比

| 方案 | 用户体验 | 实现成本 | 可靠性 | 说明 |
|------|---------|---------|--------|------|
| CDP 连接 | 中 | 低 (已支持) | 中 | 用户需加启动参数 `--remote-debugging-port=9222` |
| Auto-Connect | 中+ | 低 (agent-browser 有) | 中 | 自动发现 DevToolsActivePort，Chrome v136+ 有限制 |
| Profile 持久化 | 中 | 低 (agent-browser 有) | 差 | Chrome 有 lock 机制，不能同时使用 |
| 浏览器插件 | 高 | 高 | 高 | 天然拥有用户所有登录状态，最终方案 |
| Kernel 云 (stealth) | 高 | 低 | 高 | 服务端反检测，但要付费 |

### 5.2 Chrome v136+ 限制

Chrome v136+ 不再支持用默认 `user-data-dir` 进行 CDP 连接。影响:
- `connectOverCDP` 连接默认 profile 时页面可能不加载
- 需使用非默认 profile 或 Chromium

---

## 六、目标架构设计

### 6.1 总体架构

```
AI Agent (Vercel AI SDK streamText)
  ↓ tool calls
Tool Layer (15 + 1 tools)
  ↓
BrowserDriver (interface) ← 我们的抽象，保留双 Driver
  ├── PlaywrightDriver ← 内部封装 agent-browser BrowserManager
  │     ├── 感知: getEnhancedSnapshot (5 层过滤, diff, stats)
  │     ├── 生命周期: launch, autoConnect, CDP, profile, 云
  │     ├── 管理: Tab, Frame, Cookie, Network, State
  │     └── 交互: Human-Like CDP Engine (自研, 非 agent-browser)
  │
  └── ExtensionDriver ← WebSocket + JSON-RPC → 浏览器插件
        ├── 感知: 复用 agent-browser 过滤/diff 模块 (后处理)
        ├── 交互: Human-Like CDP Engine (通过 chrome.debugger API)
        └── 天然拥有用户 Profile
```

### 6.2 复用清单

**从 agent-browser 复用 (npm: agent-browser)**:
- `BrowserManager` — 生命周期, 启动, 连接, Tab/Frame/Cookie/Network/State
- `getEnhancedSnapshot` — 5 层过滤 + Ref 系统
- `diffSnapshots` — Myers diff
- `getSnapshotStats` — Token 统计
- `toAIFriendlyError` — 错误转换
- `parseCommand` — 运行时 Zod 校验 (万能工具用)
- `executeCommand` — 80 个非核心命令的执行器

**从 zza 项目借鉴 (自研)**:
- CDP Click Engine — force:0.5 + 5 步模拟
- CDP Type Engine — 逐字符 keyDown/char/keyUp
- 随机延迟系统
- 事件序列正确性

**保留我们自有的**:
- `BrowserDriver` 接口 — 统一双 Driver
- `ExtensionDriver` — 浏览器插件通信
- Tool Definitions — AI SDK tool() 格式

### 6.3 Tool Schema 设计

**15 个核心 Tool (结构化, ~3,000 token)**:

| # | Tool | 类别 | 说明 |
|---|------|------|------|
| 1 | `browser_navigate` | 感知 | 打开 URL |
| 2 | `browser_snapshot` | 感知 | Accessibility 快照 (mode/selector/maxDepth/cursor) |
| 3 | `browser_diff_snapshot` | 感知 | 增量 diff |
| 4 | `browser_screenshot` | 感知 | 截图 (annotate) |
| 5 | `browser_click` | 交互 | 点击 (ref 或 CSS selector) |
| 6 | `browser_type` | 交互 | 按键输入 |
| 7 | `browser_fill` | 交互 | 直接填值 |
| 8 | `browser_select` | 交互 | 下拉选择 |
| 9 | `browser_check` | 交互 | 勾选/取消 |
| 10 | `browser_hover` | 交互 | 悬停 |
| 11 | `browser_press` | 输入 | 按键/组合键 |
| 12 | `browser_scroll` | 输入 | 滚动 |
| 13 | `browser_wait` | 输入 | 等待 |
| 14 | `browser_tab_list` | 管理 | 列出 Tab |
| 15 | `browser_tab_switch` | 管理 | 切换 Tab |

**1 个万能 Tool (覆盖剩余 80 个命令, ~200 token)**:

| # | Tool | 说明 |
|---|------|------|
| 16 | `browser_command` | 透传任意命令，运行时 Zod 校验 |

### 6.4 交互模式

```typescript
type InteractionMode = 'standard' | 'humanlike' | 'stealth' | 'cloud'
```

| 模式 | click 实现 | 适用场景 |
|------|-----------|---------|
| `standard` | `locator.click()` (agent-browser 原生) | 自己的网站、内部工具 |
| `humanlike` | 5 步 CDP 模拟 (force:0.5, 随机延迟) | Reddit, Instagram 等 |
| `stealth` | humanlike + navigator.webdriver=false + 反检测参数 | Cloudflare 保护站点 |
| `cloud` | Kernel/Browserbase 云 (服务端反检测) | 最高反检测需求 |

---

## 七、Token 消耗估算

### 场景: 操作一个 5 万字页面，做 3 次交互

| 方式 | 计算 | 总 Token |
|------|------|---------|
| 当前 (无优化) | snapshot(50k) × 3 次 | ~37,500 |
| agent-browser -i | snapshot(400) + diff(200) × 2 | ~200 |
| 节省 | | **99.5%** |

### agent-browser 官方基准

六次测试交互:
- Playwright MCP: ~31K chars ≈ 7,800 tokens
- agent-browser: ~5.5K chars ≈ 1,400 tokens
- 节省: **93%**

---

## 八、参考资料

- [agent-browser GitHub](https://github.com/vercel-labs/agent-browser)
- [agent-browser 官网](https://agent-browser.dev/)
- [Context Wars: Token Bleeding](https://paddo.dev/blog/agent-browser-context-efficiency/)
- [agent-browser npm](https://www.npmjs.com/package/agent-browser) (v0.14.0, Apache-2.0)
- [Stagehand v3](https://www.browserbase.com/blog/stagehand-v3)
- [browser-use](https://github.com/browser-use/browser-use)
- [AgentQL](https://docs.agentql.com/concepts/query-language)
- [Chrome v136 CDP 限制](https://github.com/browser-use/browser-use/issues/1520)
- [D2Snap DOM Downsampling](https://arxiv.org/abs/2508.04412)
- [Set-of-Mark Prompting](https://arxiv.org/abs/2310.11441)
- [Anthropic Computer Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
