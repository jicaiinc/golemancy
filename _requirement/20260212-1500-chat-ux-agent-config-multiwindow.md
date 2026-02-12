# 需求清单：Chat 体验优化 + Agent 配置 + 多窗口

> 创建时间：2026-02-12 15:00
> 最后更新：2026-02-12 16:00（经过多轮 UI 设计讨论后更新）
> 状态：已确认 (2026-02-12)

---

## 功能需求

### 1. 聊天标题自动生成

新对话标题不再使用 "Chat with Main Agent"，改用用户开启的第一对话（第一条消息）作为标题，如果太长的话给它适当的截断。

**实现细节**：
- 创建对话时使用临时标题（如 "New Chat"）
- 用户发送第一条消息后，自动将该消息内容作为标题
- 截断规则：最长 50 字符，在词边界处截断，超出部分加 `...`
- 需要新增 `IConversationService.update()` 方法 + `PATCH` 路由

### 2. 聊天标题双击重命名

在 Chat History 列表中双击标题可以进行 rename，给它重新命名，产生一个新的标题（不止是用户输入的第一条信息作为标题）。

**实现细节**：
- 双击标题 → 进入 inline 编辑模式（`<input>` 替换 `<span>`）
- Enter 或 blur → 保存新标题
- Escape → 取消编辑，恢复原标题
- 复用需求 1 的 `update()` API

### 3. Chat History 侧边栏 UI 重设计

现在左边有一个 navigation（ProjectSidebar），然后可以折叠，再往右一点又有 chat history（ChatSidebar），聊天框变得非常小，不够简洁。

**设计方案（经过多轮讨论确定）**：

**核心思路**：ChatSidebar 默认完全隐藏（0px），通过 ChatWindow 头部的 toggle 按钮展开/收起。ProjectSidebar 完全不变。

#### 状态 1：收起（默认，进入 Chat 页面时）
```
+------------------+---------------------------------------------+
| ProjectSidebar   | [⊞] [+ New]      Chat Title         [...]  |
|                  | ───────────────────────────────────────────  |
|                  |                                             |
| (完全不变)       | Messages...                                 |
|                  |                                             |
|                  | [Type message.......................] [Send] |
+------------------+---------------------------------------------+
      240px                    1040px (全宽聊天)
```

- ChatSidebar 完全不显示（**0px**，不是缩小到某个宽度）
- ChatWindow 头部左侧：**[⊞] sidebar toggle 图标** + **[+ New] 新建对话按钮**
- ChatWindow 头部中间：**Chat Title 居中显示**
- ChatWindow 头部右侧：更多操作按钮

#### 状态 2：展开（点击 toggle 图标后）
```
+------------------+------------------+---------------------------+
| ProjectSidebar   | ChatSidebar      |                           |
|                  |                  | [⊟]    Chat Title   [...] |
| (完全不变)       | [+ New Chat    ] | ──────────────────────    |
|                  |                  |                           |
|                  | * Blog Draft     | Messages...               |
|                  |   @Writer  5m    |                           |
|                  |   SEO Analysis   |                           |
|                  |   @Researcher    | [Type message...] [Send]  |
+------------------+------------------+---------------------------+
      240px              240px              800px
```

- ChatSidebar 展开，**push 布局**（占位，不是 overlay），与当前 ChatSidebar 相同内容
- **[+ New] 从 ChatWindow 头部消失**（因为 ChatSidebar 里已有 [+ New Chat] 按钮，避免重复）
- ChatWindow 头部只剩 **[⊟] 收起图标**（图标状态改变，见下方图标设计）
- Chat Title 继续居中显示
- 再点 [⊟] → 回到状态 1

#### Toggle 图标设计（像素风 SVG）

两个状态使用不同图标，传达语义：

**收起状态的图标 [⊞]**（点击后将展开 sidebar）：
- 矩形面板 + 左侧竖线分割 + 左区域有横线条纹
- 语义：「左边有一个侧边面板」→ 「点击展开它」
- 类似 Claude.ai / Notion 左上角的 sidebar toggle 图标

**展开状态的图标 [⊟]**（点击后将收起 sidebar）：
- 完整矩形面板，**没有竖线分割**，没有左侧分区
- 语义：「显示完整内容区域」→ 「点击收起 sidebar，回到全宽」

两个图标都使用 **像素风 SVG** 实现（锐利边角、2px 线条、与设计系统一致）

#### Chat Title 居中

ChatWindow 头部的对话标题改为 **居中显示**（当前靠左）。左侧放功能按钮（toggle + New），右侧放操作按钮，标题在中间。

#### 交互逻辑
- Toggle 图标是一个按钮：点一次展开 ChatSidebar，再点收起
- [+ New] 仅在 ChatSidebar **收起时**显示在 ChatWindow 头部；展开后隐藏
- 默认收起，状态持久化到 localStorage
- 不涉及任何键盘快捷键

#### 改动范围
- 修改：`ChatSidebar.tsx`（添加条件渲染）、`ChatPage.tsx`（toggle 状态管理）、`ChatWindow.tsx`（头部布局 + toggle 按钮 + 居中标题）、`useAppStore.ts` ui slice（新增 `chatHistoryExpanded` 状态）
- 新增：像素风 SVG toggle 图标（内联 SVG 或小组件）
- 不新增页面、不删除组件、不改路由、**不改 ProjectSidebar**

### 4. Running 状态管理修复

如果 agent 调用了一个 sub agent 是 running 状态，又调了一个 bash tool 也是 running 状态，然后把聊天页面切走再切回来，状态还是卡在 running。后台可能已经执行完成，但前端状态不更新。这种状态管理不好，需要修复。

**根因分析**（Design 阶段确认）：
- 没有 WebSocket 实时推送，Chat 使用纯 HTTP SSE 流
- SubAgentStreamState 是序列化快照数据，流完成后快照仍停在 `status: 'running'`
- Chat 实例在组件卸载后继续运行（缓存在 `chat-instances.ts`），但 useChat 重新挂载时可能没有正确反映最终状态

**修复方案**：
- 在 ToolCallDisplay 中交叉引用 Chat 实例的 status：如果 `chat.status === 'idle'` 但 tool 显示 `running`，则显示为 `done`/`interrupted`
- 切换对话时刷新 agent 状态

### 5. Abort/中断机制

点击完对话后，右边的 send 按钮可以变成一个 stop process 的按钮（停止按钮），点了之后停止所有 main agent 的输出、sub agent 的输出、tool call，该停也都应该停。总之要有一个中断机制。

**完整 abort 链路**（Design 阶段源码验证）：
```
客户端 chat.stop() / useChat().stop()
  → fetch abort → HTTP 连接关闭
  → Hono c.req.raw.signal 触发 abort
  → streamText({ abortSignal }) 停止生成
  → 正在执行的 tool execute() 通过 ToolExecutionOptions 收到 abortSignal
  → sub-agent 的 streamText 也被 abort（sub-agent.ts:53,87 已实现传递）
  → 无限深度级联自动生效
  → finally 块保证每层 cleanup
```

**需要改动的地方**（仅 `routes/chat.ts`）：
- 添加 `abortSignal: c.req.raw.signal` 到 `streamText()` 调用
- 添加 `onAbort` 回调（与 `onFinish` 并列），用于 cleanup（使用幂等 `ensureCleanup` 模式）

**已经正确工作（无需改动）**：
- `sub-agent.ts:53,87` — abort 级联穿过无限层 sub-agent
- `@ai-sdk/mcp` — 协议级取消

**不可 abort（当前可接受）**：
- `bash-tool` (v1.3.14) — `just-bash` 内存解释器忽略 abortSignal，命令会执行完成，但 abort 后不会请求新的 tool step

**客户端 UI**：
- 消息发送后（status 为 `submitted` 或 `streaming`），Send 按钮变为 Stop 按钮
- 点击 Stop → 调用 `chat.stop()`（不销毁 chat 实例）
- 停止后 status 变为 `ready`，按钮恢复为 Send

### 6. IME 输入法兼容

输入对话框时，当敲的是中文，可能需要用回车来选择（选字），它就会默认发送。输入没有完成时不应该默认直接发送出去，快捷键有问题。

**修复**（一行代码）：
- `ChatInput.tsx` 的 `handleKeyDown` 中添加 `!e.nativeEvent.isComposing` 检查
- Electron 使用 Chromium，`isComposing` 完全可靠，无需额外的 `compositionstart/end` 监听
- 已验证 Vercel 官方 AI Chatbot 用同样的修复方式（PR #786）

### 7. New Agent 默认 Provider

新建 agent 时默认的 provider 就是 inherit（继承配置的 provider），model config 可以像 main agent 一样参考。

**修复**：
- `AgentCreateModal.tsx` 的 provider 默认值从 `'openai'` 改为 `undefined`（表示 inherit）
- model 默认值从 `'gpt-4o'` 改为空字符串
- Provider 下拉菜单添加 "Inherit (from project/global)" 选项

### 8. Skills & MCP Server 拖拽上传

**MCP tab**：可以直接拖拽 MCP server 的配置文件过来，自动添加
- 接受 JSON 文件，匹配 `MCPProjectFile` 类型（已定义在 `mcp.ts:27`）
- 拖入后解析 JSON → 校验格式 → 为每个 server 调用 `createMCPServer()`

**Skills tab**：比如一个 zip 文件夹是 skills，拖拽到 new skills 中就可以自动添加这个 skill，放到项目目录下
- 接受 `.md` 文件（直接读取内容创建 skill）或 `.zip` 文件（需要服务端解压）
- `.zip` 需要新的服务端上传端点 `POST /api/projects/:projectId/skills/upload`
- 新增 `PixelDropZone` 基础组件（拖拽区域，像素风）
- 服务端 body limit（当前 2MB）需为上传路由豁免

### 9. Open in New Window

Project 可以 open in new window，新开一个窗口来操控这个项目。窗口里可以有多个项目。

**架构**（Design 阶段确认）：
- 每个窗口 = 新的 `BrowserWindow`，独立 Zustand store
- 所有窗口共享单一 server 进程（HTTP 后端是数据源）
- 通过 `additionalArguments` 传递 `--project-id`，preload 提取，React 自动选择项目
- 无需跨窗口状态同步（server 是 source of truth）
- 每个窗口约 150-250MB RAM
- 添加 IPC handler: `window:open` → 创建新 BrowserWindow
- Preload 暴露 `openNewWindow(projectId?)` 方法
- UI 添加 "Open in New Window" 按钮（项目卡片 / 项目头部）

---

## 技术约束

1. AI SDK 的 abort 相关 API 必须通过 Context7 / 查看源码 / 网络搜索来确认，不能凭假设（**已完成验证**，详见 `_design/20260212-1500-chat-ux-v2/fact-check.md`）
2. 必须遵循项目现有技术栈（参见 CLAUDE.md Critical Library Choices）
3. 不涉及任何键盘快捷键（不设置 Cmd+B 等快捷键）

## 流程要求

1. UI 设计方案（#3 Chat History 侧边栏）需要用户确认后再实现（**本文档即为最终确认版**）
2. 实现过程中要严格确认每一步的实现是否都是真正完成了，不能靠团队成员的汇报，必须进行一定程度的校验、查看代码
3. 团队成员汇报时也要汇报实现是如何实现的，而不是单纯回复"完成了"就做下一步，一定要进行校验
4. 所有设计成果持久化到 `_design/` 目录，不依赖对话记忆

## 风格要求

1. 像素风 / Minecraft 风格，暗色主题
2. UI 设计需符合现有设计系统规范（`_docs/ui-design-system.md`）
3. Toggle 图标使用像素风 SVG（锐利边角、2px 线条）
4. 动画使用 `motion/react` 的 `pixelSpring` 预设
5. Chat Title 居中显示

## 注意事项

1. 需求 1 和 2 共享依赖：`IConversationService.update()` 方法，需先实现
2. 需求 4 和 5 有关联：abort 机制到位后，running 状态问题也更容易修复
3. 需求 9 多窗口功能涉及 Electron 层改动，但架构已确认可行
4. bash-tool 当前不支持 abort（可接受），未来自定义 sandbox 再处理

---

## Design 阶段成果（持久化）

所有设计文档保存在 `_design/20260212-1500-chat-ux-v2/`：
- `architecture.md` — 9 个功能的完整架构设计
- `fact-check.md` — AI SDK abort、IME、Electron 多窗口的技术验证报告（含 tool abort 逐文件源码分析）
- `ui-design.md` — Chat History 侧边栏 UI 设计（需更新为最终版）
- `summary.md` — Team Lead 汇总文档
