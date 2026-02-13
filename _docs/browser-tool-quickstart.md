# Browser Tool 快速上手

## 1. 在 UI 中启用

### Agent Settings → Built-in Tools

```
☑ Bash
☑ Browser    ← 勾选
☐ OS Control
```

保存后，Agent 自动获得 22 个浏览器工具。

---

## 2. 立即试用

### 对话示例 1：获取网页信息

**User:** "打开 example.com 并告诉我页面上有什么"

**Agent 执行：**
```
1. browser_navigate("https://example.com")
2. browser_snapshot()
   → 返回：
     Page: Example Domain
     URL: https://example.com

     heading "Example Domain" [level=1]
     paragraph: "This domain is for use in illustrative..."
     link "More information..." [ref=e0]

3. 回答：页面是一个示例域名说明页，有一个标题 "Example Domain" 和一段说明文字，
   还有一个 "More information" 链接。
```

### 对话示例 2：搜索任务

**User:** "在 Google 上搜索 'Playwright' 并告诉我第一条结果"

**Agent 执行：**
```
1. browser_navigate("https://google.com")
2. browser_snapshot()
   → 找到搜索框 [ref=e0]

3. browser_type("e0", "Playwright", true)
   → submit=true 自动按 Enter

4. browser_snapshot()
   → 看到搜索结果页面
   → 第一条: link "Playwright: Fast and reliable..." [ref=e5]

5. 回答：第一条结果是 "Playwright: Fast and reliable end-to-end testing for modern web apps"
```

### 对话示例 3：表单填写

**User:** "帮我在 httpbin.org/forms/post 填写表单：name=张三, email=test@test.com"

**Agent 执行：**
```
1. browser_navigate("https://httpbin.org/forms/post")
2. browser_snapshot()
   → textbox "Customer name" [ref=e1]
   → textbox "Email" [ref=e2]
   → button "Submit" [ref=e5]

3. browser_fill_form([
     { ref: "e1", value: "张三" },
     { ref: "e2", value: "test@test.com" }
   ])

4. browser_click("e5", "submitting the form")
5. browser_snapshot()
   → 确认提交成功

6. 回答：表单已成功提交
```

---

## 3. 工具列表速查

### 核心 (8)

| 工具 | 说明 |
|------|------|
| `browser_navigate(url)` | 导航到 URL |
| `browser_snapshot()` | **最重要** — 获取页面结构 |
| `browser_screenshot(fullPage?)` | 截图（视觉补充） |
| `browser_click(ref, desc)` | 点击元素 |
| `browser_type(ref, text, submit?)` | 输入文字 |
| `browser_press_key(key)` | 按键 (Enter, Tab, ...) |
| `browser_scroll(direction, amount?)` | 滚动 |
| `browser_wait(seconds?)` | 等待 |

### 扩展 (9)

| 工具 | 说明 |
|------|------|
| `browser_go_back()` / `go_forward()` | 历史导航 |
| `browser_select_option(ref, values)` | 下拉选择 |
| `browser_hover(ref)` | 悬停 |
| `browser_drag(source, target)` | 拖拽 |
| `browser_fill_form([{ref, value}])` | 批量填表 |
| `browser_evaluate(script)` | 执行 JS |
| `browser_file_upload(ref, paths)` | 上传文件 |
| `browser_handle_dialog(action, text?)` | 处理弹窗 |

### 管理 (5)

| 工具 | 说明 |
|------|------|
| `browser_tabs()` | 列出标签页 |
| `browser_switch_tab(id)` | 切换标签 |
| `browser_close_tab(id?)` | 关闭标签 |
| `browser_resize(w, h)` | 调整视口 |
| `browser_console_messages()` | 获取控制台日志 |
| `browser_network_requests()` | 获取网络请求 |

---

## 4. 高级配置

### UI 中配置（未来功能）

在 Agent Settings 中点击 Browser 旁边的齿轮图标：

```json
{
  "driver": "playwright",
  "headless": false,       // false=可见窗口（推荐）
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "timeout": 30000         // 操作超时 (ms)
}
```

### 通过 API 配置

```typescript
// packages/server — 修改 builtin-tools.ts 的 DEFAULT_BROWSER_CONFIG
const DEFAULT_BROWSER_CONFIG: BrowserToolsConfig = {
  driver: 'playwright',
  headless: false,
  viewport: { width: 1920, height: 1080 },
  timeout: 60000,
}
```

---

## 5. 常见问题

### Q: 浏览器会一直打开吗？

**A:** 不会。对话结束后自动关闭（cleanup 函数）。

### Q: 可以看到浏览器窗口吗？

**A:** 可以！默认 `headless: false`，桌面会弹出浏览器窗口，你能看到 Agent 在操作。

### Q: Agent 怎么知道点击哪里？

**A:** `browser_snapshot()` 返回的文本中，每个可交互元素都有 `[ref=eN]` 标记。Agent 看到这些 ref 后，用 `browser_click("eN")` 点击。

例如：
```
button "Submit" [ref=e3]
link "Home" [ref=e0]
```
→ Agent 可以 `browser_click("e3")` 点击 Submit 按钮

### Q: 支持多标签页吗？

**A:** 支持。用 `browser_tabs()` 列出，`browser_switch_tab("1")` 切换。

### Q: 可以填写登录表单吗？

**A:** 可以。但 Agent 不会保存密码。每次对话重新登录。

如果需要复用登录状态：
```json
{
  "driver": "playwright",
  "cdpUrl": "http://localhost:9222"  // 连接已登录的浏览器
}
```

### Q: 如何调试？

1. **看浏览器窗口** — `headless: false` 可以看到实时操作
2. **看快照文本** — `browser_snapshot()` 返回的文本就是 Agent 看到的
3. **截图** — `browser_screenshot()` 确认视觉状态
4. **Console 日志** — `browser_console_messages()` 看页面 JS 错误

---

## 6. 最佳实践

### ✅ DO

```typescript
// 1. 先 snapshot 再操作
await browser_navigate("https://example.com")
await browser_snapshot()  // 获取 refs
await browser_click("e3")

// 2. 等待动态内容
await browser_navigate("https://spa-app.com")
await browser_wait(2)  // 等待 React 渲染
await browser_snapshot()

// 3. 用 description 记录意图
await browser_click("e5", "clicking the submit button")
```

### ❌ DON'T

```typescript
// 1. 不先 snapshot 就点击
await browser_navigate("https://example.com")
await browser_click("e3")  // 怎么知道 e3 是什么？

// 2. 过度依赖截图
await browser_screenshot()  // 不如先 snapshot
await browser_screenshot()  // 浪费 token

// 3. 忘记等待
await browser_navigate("https://slow-site.com")
await browser_snapshot()  // 页面还没加载完
```

---

## 7. 架构概览

```
User: "帮我在 Google 搜索 X"
  ↓
Agent Runtime (server/src/agent/runtime.ts)
  ↓
loadAgentTools() → loadBuiltinTools()
  ↓
createBrowserTools({ driver: 'playwright' })
  ↓
PlaywrightDriver.connect()
  ↓ (首次懒加载，启动浏览器)
Chrome 启动 (本地，可见窗口)
  ↓
Agent 调用 browser_navigate("https://google.com")
  ↓
PlaywrightDriver.navigate() → page.goto()
  ↓
返回 PageSnapshot (accessibility tree 文本)
  ↓
Agent 读取快照，找到搜索框 ref
  ↓
Agent 调用 browser_type(ref, "X", submit=true)
  ↓
...
  ↓
对话结束 → cleanup() → browser.close()
```

---

## 8. 下一步

- **查看完整文档**: `_docs/browser-tool-integration.md`
- **架构设计图**: `_design/browser-tool-architecture.html`（用浏览器打开）
- **源码**: `packages/tools/src/browser/`

开始使用吧！
