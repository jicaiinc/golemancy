# Browser Tool Integration Guide

## 快速开始

### 1. 在 UI 中启用浏览器工具

在 **Agent Settings** 页面，Built-in Tools 部分：

```
☑ Bash
☑ Browser    ← 勾选启用
☐ OS Control (coming soon)
```

### 2. Agent 自动获得 22 个浏览器工具

启用后，Agent 的 system prompt 自动包含工具描述：

```
You have access to the following browser automation tools:

browser_navigate(url) — Navigate to a URL and get page snapshot
browser_snapshot() — Get accessibility tree of current page
browser_click(ref, description) — Click an element by ref
browser_type(ref, text, submit?) — Type into input field
...
```

### 3. Agent 使用示例

**用户提问：**
> "帮我在 Google 上搜索 'Playwright automation' 并告诉我第一条结果是什么"

**Agent 执行流程：**

```typescript
// Step 1: Navigate to Google
await browser_navigate("https://www.google.com")
// → Returns:
// Page: Google
// URL: https://www.google.com
//
// textbox "Search" [ref=e0]
// button "Google Search" [ref=e1]
// button "I'm Feeling Lucky" [ref=e2]
// ...

// Step 2: Type into search box
await browser_type("e0", "Playwright automation", true)
// submit=true → presses Enter after typing
// → Returns: new page snapshot with search results

// Step 3: Read the snapshot
await browser_snapshot()
// → Returns:
// Page: Playwright automation - Google Search
//
// link "Playwright: Fast and reliable end-to-end testing..." [ref=e5]
// link "Playwright Tutorial: Web Scraping and Automation" [ref=e6]
// ...

// Agent responds to user:
"第一条结果是 'Playwright: Fast and reliable end-to-end testing for modern web apps'，
链接是 playwright.dev"
```

## 高级配置

### Headless vs Headed 模式

**桌面应用推荐：Headed（默认）**
```json
{
  "browser": {
    "driver": "playwright",
    "headless": false  // 用户可见浏览器窗口
  }
}
```

优势：
- 用户看到 Agent 在做什么（透明性）
- 可以手动干预（暂停 Agent，手动操作浏览器）
- 调试方便

**后台任务推荐：Headless**
```json
{
  "browser": {
    "headless": true
  }
}
```

适用场景：
- Cron 定时任务
- 批量数据抓取
- 无人值守的 Agent

### 连接现有浏览器（CDP）

如果你已经在本地启动了 Chrome：

```bash
# 启动 Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-profile
```

Agent 配置：
```json
{
  "browser": {
    "driver": "playwright",
    "cdpUrl": "http://localhost:9222"
  }
}
```

优势：
- 复用已登录的会话（cookies、auth）
- 不需要重复登录
- 可以在同一个浏览器中手动操作和 Agent 自动化共存

### 调整超时和视口

```json
{
  "browser": {
    "timeout": 60000,  // 60 秒（默认 30 秒）
    "viewport": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

## 工具使用最佳实践

### 1. 始终先 `browser_snapshot`

```typescript
// ✅ GOOD
await browser_navigate("https://example.com")
await browser_snapshot()  // 获取页面结构，找到 refs
await browser_click("e3", "clicking submit button")

// ❌ BAD — 不知道 ref 是什么
await browser_navigate("https://example.com")
await browser_click("e3", "???")  // 哪来的 e3？
```

### 2. `browser_screenshot` 仅作补充

Accessibility snapshot (文本) 是主要方式，截图用于：
- 验证视觉布局
- 查看图片/图表内容
- Debug 时确认页面状态

```typescript
// 先用快照理解结构
const snap = await browser_snapshot()

// 如果快照不够清楚，再截图
if (needVisualConfirmation) {
  await browser_screenshot()
}
```

### 3. 使用 `description` 参数记录意图

```typescript
await browser_click("e5", "clicking the login button to access account")
await browser_type("e8", "user@example.com", false)  // description 是第 2 个参数
```

虽然 LLM 不强制要求 description，但它帮助：
- 调试时理解 Agent 在做什么
- 生成更可读的日志

### 4. 等待页面加载

```typescript
await browser_navigate("https://slow-site.com")
await browser_wait(2)  // 等待 2 秒让动态内容加载
await browser_snapshot()  // 现在能看到完整内容了
```

### 5. 处理多标签页

```typescript
// 获取所有 tabs
const tabs = await browser_tabs()
// → Returns:
// → [0] Main Page
//     https://example.com
//   [1] Help Page
//     https://example.com/help

// 切换到 tab 1
await browser_switch_tab("1")

// 关闭当前 tab
await browser_close_tab()
```

## 与现有系统集成

### Agent Runtime 加载流程

```typescript
// packages/server/src/agent/runtime.ts
export async function executeAgentTask(agent: Agent, prompt: string) {
  // 1. Load tools (包括 browser tools)
  const { tools, cleanup } = await loadAgentTools({
    agent,
    projectId,
    settings,
    allAgents,
    mcpStorage,
  })

  try {
    // 2. Stream AI response
    const result = streamText({
      model: await resolveModel(settings, agent.modelConfig),
      system: agent.systemPrompt,
      tools,  // ← Browser tools 在这里
      prompt,
    })

    // 3. Agent 自动调用 browser_* tools
    for await (const chunk of result.fullStream) {
      // Handle tool calls...
    }
  } finally {
    // 4. Cleanup (关闭浏览器)
    await cleanup()
  }
}
```

### Built-in Tools 加载链

```
loadAgentTools()
  ↓
loadBuiltinTools(agent.builtinTools)
  ↓
if (config.browser) {
  createBrowserTools({ driver: 'playwright', headless: false })
    ↓
  new PlaywrightDriver(config)
    ↓
  defineBrowserTools(driver)  // 22 个工具
    ↓
  return { tools, cleanup: () => driver.close() }
}
```

## 示例对话

### Example 1: 网页信息提取

**User:** "去 HN 首页，告诉我第一个帖子的标题和链接"

**Agent:**
```typescript
await browser_navigate("https://news.ycombinator.com")
const snap = await browser_snapshot()

// 从 snap.text 中提取：
// link "Show HN: I built a ..." [ref=e0]
```

**Response:** "第一个帖子是 'Show HN: I built a ...'，链接是 ..."

### Example 2: 表单填写

**User:** "帮我在 example.com/contact 填写联系表单"

**Agent:**
```typescript
await browser_navigate("https://example.com/contact")
await browser_fill_form([
  { ref: "e2", value: "张三" },        // name field
  { ref: "e3", value: "test@test.com" }, // email field
  { ref: "e4", value: "测试消息" }      // message field
])
await browser_click("e5", "submitting the contact form")
```

**Response:** "表单已提交成功"

### Example 3: 多步骤任务

**User:** "帮我在 Google 上搜索 'TypeScript tutorial'，打开第一个结果，然后截图"

**Agent:**
```typescript
// Step 1: Search
await browser_navigate("https://google.com")
await browser_type("e0", "TypeScript tutorial", true)

// Step 2: Click first result
const snap = await browser_snapshot()
// Find first result link ref from snap.text
await browser_click("e5", "opening first search result")

// Step 3: Screenshot
await browser_screenshot(true)  // full page
```

**Response:** "已打开第一个结果（typescriptlang.org/docs/handbook），截图如下：[image]"

## 故障排查

### 问题：Browser not connected

**原因：** `connect()` 失败（浏览器未安装或路径错误）

**解决：**
```json
{
  "browser": {
    "executablePath": "/path/to/chrome"  // 明确指定路径
  }
}
```

### 问题：Element ref not found

**原因：** 页面结构改变，ref 失效

**解决：** Agent 应该先 `browser_snapshot()` 获取最新 refs，再 `browser_click()`

### 问题：Timeout errors

**原因：** 页面加载慢

**解决：**
```json
{
  "browser": {
    "timeout": 60000  // 增加到 60 秒
  }
}
```

或在 Agent prompt 中提示：
```
如果页面加载慢，使用 browser_wait(5) 等待后再操作。
```

## 未来：Extension Driver

当浏览器插件开发完成后：

```json
{
  "browser": {
    "driver": "extension",
    "wsUrl": "ws://localhost:9876",
    "token": "auto-generated-token"
  }
}
```

优势：
- 复用用户的真实浏览器（已登录的网站）
- 不需要额外启动浏览器进程
- 更接近真实用户操作

工具使用方式**完全相同**——只需切换 `driver` 配置。
