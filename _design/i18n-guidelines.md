# i18n 详细准则

## 技术选型

| 项目 | 选择 |
|------|------|
| i18n 框架 | `react-i18next` + `i18next` |
| 语言检测 | `i18next-browser-languagedetector`（localStorage → navigator） |
| 翻译文件格式 | JSON，按 namespace 分文件 |
| 翻译文件位置 | `packages/ui/src/locales/{lang}/{namespace}.json` |
| 默认/回退语言 | `en` |

## Namespace 划分

```
locales/en/
├── common.json       Cancel, Save, Delete, Loading, 相对时间等高频复用词
├── nav.json          侧边栏、顶栏、全局导航
├── chat.json         聊天窗口、输入框、消息气泡、工具调用展示
├── agent.json        Agent 列表、详情、创建、拓扑图
├── project.json      项目列表、创建、设置
├── settings.json     全局设置、Provider 管理
├── dashboard.json    仪表盘、Token 统计、运行状态
├── onboarding.json   引导流程
├── permissions.json  权限设置、沙箱模式
├── cron.json         自动化任务
├── mcp.json          MCP 服务器
├── skill.json        技能
├── memory.json       记忆库
├── task.json         对话任务
├── workspace.json    工件浏览、文件预览
├── speech.json       语音转写
└── error.json        ErrorBoundary、通用错误 fallback
```

## 边界准则

### 改（`t()` 包裹）
UI 上用户能直接看到的自然语言文本：标题、按钮、标签、placeholder、空状态、加载状态、客户端 fallback 错误、确认对话框、tooltip、导航菜单、状态标签、相对时间模板。

### 不改（保持英文）
- 品牌名：`Golemancy`, `Discord`, `GitHub`
- Provider/SDK 名：`OpenAI`, `Anthropic`, `DeepSeek`, `Groq`, `Mistral`
- 技术术语：`API Key`, `Base URL`, `SSE`, `stdio`, `MCP`, `JSON`
- AI-facing：`server/agent/` tool descriptions, system prompts, tool results, `PathAccessError`, `CommandBlockedError`, sandbox truncation/timeout
- 外部不可控：`err.message`, STT `record.error`, CronJob `run.error`（只 i18n fallback）
- 代码/格式：cron 表达式、路径模板、符号
- Server HTTP error body（后期做 error code 映射）
- 测试文件、类型定义、日志

## 编码规范

```tsx
// Hook 用法
const { t } = useTranslation('agent')

// 跨 namespace
const { t } = useTranslation(['agent', 'common'])
t('common:button.cancel')

// 插值（禁止字符串拼接）
t('deleteConfirm', { name: agent.name })

// 复数
t('agentCount', { count: agents.length })
// JSON: "agentCount_one": "{{count}} agent", "agentCount_other": "{{count}} agents"
```

### Key 命名
```
{namespace}.{area}.{purpose}

common.button.cancel
common.button.save
common.status.loading
common.time.justNow
common.time.minsAgo
agent.list.title
agent.list.empty
agent.create.modalTitle
error.boundary.title
```

## 错误处理四种方式

| 方式 | 适用范围 | 做法 |
|------|---------|------|
| A：`t()` 直接翻译 | 客户端硬编码 fallback 错误 | `t('error.generic')` |
| B：error code 映射 | Server HTTP error（后期） | Server 返回 code，UI 侧 `t('error.server.CODE')` |
| C：原样透传 | 外部/动态 `err.message` | 直接显示，fallback 用 `t()` |
| D：永远不翻译 | AI-facing tool results | 不碰 |
