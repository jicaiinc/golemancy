# 需求清单：Browser Tools 重构 — 集成 agent-browser

> 创建时间：2026-02-25
> 状态：已确认

## 目标

将 `packages/tools/src/browser/` 的浏览器工具从"自己管 Playwright"重构为"包装 agent-browser BrowserManager"，获得 95 个命令、5 层 snapshot 过滤、diff 引擎、错误转换等能力。

## 具体改动

1. **PlaywrightDriver 重写** — 从 ~426 行自管 Playwright → ~150 行包装 BrowserManager
2. **BrowserDriver 接口更新** — 新增 snapshot options、diffSnapshot、command 方法
3. **Tool 定义重写** — 22 个 → 16 个（15 结构化 + 1 万能 browser_command）
4. **snapshot.ts 清理** — 删除 SNAPSHOT_SCRIPT，用 agent-browser 的 getEnhancedSnapshot
5. **detect.ts 删除** — BrowserManager 自带浏览器检测
6. **index.ts 更新** — Config 类型扩展（autoConnect, profile, extensions 等）
7. **ExtensionDriver 不动** — 保持现状
8. **不加 human-like** — 不加 CDP 5 步点击，不加自创功能
9. **新增依赖** — `agent-browser: "0.14.0"` 锁版本

## 文件级变化

| 文件 | 操作 | 说明 |
|------|------|------|
| `driver.ts` | 改 | 更新接口，新增 SnapshotOptions/DiffResult/command |
| `drivers/playwright.ts` | 重写 | ~426 行 → ~150 行，包装 BrowserManager |
| `drivers/extension.ts` | 不动 | 保持现状 |
| `tools.ts` | 重写 | 22 → 16 个 tool |
| `snapshot.ts` | 大改 | 删 SNAPSHOT_SCRIPT，保留 format 工具函数 |
| `detect.ts` | 删 | BrowserManager 自带 |
| `index.ts` | 改 | Config 扩展 |
| `drivers/playwright.test.ts` | 更新 | 匹配新实现 |
| `package.json` | 改 | 加 agent-browser 依赖 |

## Tool 定义 (16 个)

### 保留并增强 (12 个)
- browser_navigate
- browser_snapshot ← 加 mode/selector/maxDepth/cursor 参数
- browser_screenshot
- browser_click
- browser_type
- browser_press (原 browser_press_key)
- browser_scroll
- browser_wait ← 增强
- browser_select (原 browser_select_option)
- browser_hover
- browser_tab_list (原 browser_tabs)
- browser_tab_switch (原 browser_switch_tab)

### 新增 (4 个)
- browser_diff_snapshot — diff 引擎
- browser_fill — 直接填值
- browser_check — checkbox/radio
- browser_command — 万能工具，覆盖 80+ 命令

### 收进 browser_command (10 个)
- browser_go_back, browser_go_forward
- browser_drag, browser_fill_form
- browser_file_upload, browser_handle_dialog
- browser_close_tab, browser_resize
- browser_console_messages, browser_network_requests
- browser_evaluate

## agent-browser 复用清单

从 `agent-browser` npm 包 deep import:
- `agent-browser/dist/browser.js` → BrowserManager
- `agent-browser/dist/snapshot.js` → getEnhancedSnapshot, getSnapshotStats
- `agent-browser/dist/diff.js` → diffSnapshots
- `agent-browser/dist/actions.js` → executeCommand, toAIFriendlyError
- `agent-browser/dist/protocol.js` → parseCommand

## 质量要求

1. 每个模块必须有单元测试
2. 需要集成测试验证 PlaywrightDriver + BrowserManager 联动
3. 所有测试必须通过才能交付
4. Team Lead 对每个完成的任务进行二次代码校验

## 不做的事

- 不加 human-like CDP 交互
- 不改 ExtensionDriver
- 不加自创功能
- 不改 server 端 agent runtime
