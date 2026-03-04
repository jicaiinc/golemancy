# Golemancy 完整存储结构

> 基于代码审查生成（2026-03-05）。每一项均来自实际 storage 实现文件 + schema 定义 + types。

---

## 一、全局层（`~/.golemancy/`）

| 路径 | 存储介质 | 数据类型 | 内容说明 | 归属 |
|------|---------|---------|---------|------|
| `settings.json` | JSON 文件 | 全局配置 | Provider API keys、默认模型、主题、语言、语音设置、onboarding 状态 | 全局 |
| `speech.db` | SQLite | 历史数据 | `transcription_records` 表 — 语音转文字记录（id、status、text、audio 元数据、projectId、conversationId） | 全局 |
| `speech/audio/{uuid}.{ext}` | 二进制文件 | 历史数据 | 语音转文字的音频文件（webm 等） | 全局 |
| `logs/server.{yyyy-MM-dd}` | 文本文件 | 运行时 | 服务端日志（pino-roll 每日轮转，保留 6 份） | 全局 |
| `runtime/cache/pip/` | 目录 | 运行时 | 全局 pip 下载缓存（跨项目共享） | 全局 |
| `runtime/cache/npm/` | 目录 | 运行时 | 全局 npm 下载缓存（跨项目共享） | 全局 |
| `data.db` | SQLite | 遗留 | 旧全局 DB（`getDbPath()` 定义但无代码引用，已弃用） | 全局 |

---

## 二、项目层 — 文件系统（`~/.golemancy/projects/{projectId}/`）

| 路径 | 存储介质 | 数据类型 | 字段 / 内容 | 交叉引用 |
|------|---------|---------|------------|---------|
| `project.json` | JSON | **配置** | `id`、`name`、`description`、`icon`、`config`（maxConcurrentAgents、permissionsConfigId?）、`defaultAgentId?`、`defaultTeamId?`、`agentCount`、`activeAgentCount`、`lastActivityAt`、时间戳 | `defaultAgentId` → Agent、`defaultTeamId` → Team、`config.permissionsConfigId` → PermissionsConfig |
| `agents/{agentId}.json` | JSON | **配置** | `id`、`name`、`description`、`status`、`systemPrompt`、`modelConfig`（provider+model）、`skillIds[]`、`tools[]`（自定义 schema）、`mcpServers[]`（name 字符串）、`builtinTools`（bash/browser/computer_use/task/memory 开关）、`compactThreshold?`、时间戳 | `skillIds[]` → Skill、`mcpServers[]` → mcp.json 中的 server name |
| `skills/{skillId}/SKILL.md` | Markdown + YAML frontmatter | **配置** | frontmatter: `name`、`description`；body: `instructions`（markdown） | 无 |
| `skills/{skillId}/metadata.json` | JSON | **配置** | `id`、`createdAt`、`updatedAt` | 无 |
| `skills/{skillId}/*` | 任意文件 | **配置** | ZIP 导入时带入的额外资源文件（图片、模板等） | 无 |
| `teams/{teamId}.json` | JSON | **配置** | `id`、`name`、`description`、`instruction?`、`members[]`（`{agentId, parentAgentId?}`）、`layout?`（`{[agentId]: {x,y}}`）、时间戳 | `members[].agentId` → Agent、`members[].parentAgentId` → Agent、`layout` keys → Agent |
| `cronjobs/{cronJobId}.json` | JSON | **配置 + 运行状态混合** | 配置：`id`、`agentId`、`teamId?`、`name`、`cronExpression`、`enabled`、`instruction?`、`scheduleType`、`scheduledAt?`、时间戳。运行状态：`lastRunAt?`、`lastRunStatus?`、`nextRunAt?`、`lastRunId?` | `agentId` → Agent、`teamId` → Team |
| `permissions-config/{permId}.json` | JSON | **配置** | `id`、`title`、`mode`（restricted/sandbox/unrestricted）、`config`（allowWrite/denyRead/denyWrite/allowedDomains/deniedDomains/deniedCommands/applyToMCP 等，含 `{{workspaceDir}}` 模板变量）、时间戳 | 无（被 `project.config.permissionsConfigId` 引用） |
| `mcp.json` | JSON | **配置** | 单文件，结构 `{ mcpServers: { [name]: { transportType, description?, command?, args?, env?, cwd?, url?, headers?, enabled } } }`。注意：`env` 和 `headers` 可能含敏感信息（API key / token） | 无（被 Agent.mcpServers 按 name 引用） |
| `workspace/` | 任意文件 | **运行时** | Agent 运行时工作区，Agent 通过 bash/browser 工具在此创建/修改文件 | 无 |
| `uploads/{sha256-32}.{ext}` | 二进制文件 | **运行时** | 聊天消息内嵌图片（content-addressed 去重）。格式：png/jpg/gif/webp/svg/bmp/tiff。消息中通过 `golemancy-upload:{mediaType}:{filename}` 协议引用 | 关联到 messages 中的 parts |
| `tasks/` | 空目录 | **遗留** | 项目创建时 mkdir 但无存储实现写入（tasks 存在 SQLite `conversation_tasks` 表中） | 无 |
| `data/` | 目录 | 容器 | 存放 per-project SQLite 数据库 | — |
| `runtime/python-env/` | 目录 | **运行时** | Per-project Python 虚拟环境（venv），含 bin/、lib/ 等 | 无 |

---

## 三、项目层 — SQLite 数据库（`data/data.db`）

每个项目独立数据库，由 `ProjectDbManager` 在首次访问时懒加载创建，WAL 模式。

| 表名 | 数据类型 | 字段 | 关联 |
|------|---------|------|------|
| `conversations` | **历史数据** | `id` (PK)、`agent_id`、`team_id?`、`title`、`last_message_at?`、`created_at`、`updated_at` | `agent_id` → Agent、`team_id` → Team |
| `messages` | **历史数据** | `id` (PK)、`conversation_id` (FK→conversations, CASCADE)、`role`（user/assistant）、`parts` (JSON, UIMessage parts)、`content`（纯文本 for FTS）、`input_tokens`、`output_tokens`、`context_tokens`、`provider`、`model`、`metadata` (JSON)、`created_at` | `conversation_id` → conversations |
| `messages_fts` | **索引** | FTS5 虚拟表，基于 `messages.content`，通过触发器（`messages_ai`/`messages_ad`/`messages_au`）自动同步 | 跟随 messages |
| `conversation_tasks` | **历史数据** | `id` (PK)、`conversation_id` (FK→conversations, CASCADE)、`subject`、`description`、`status`（pending/in_progress/completed）、`active_form?`、`owner?`、`metadata` (JSON)、`blocks` (JSON)、`blocked_by` (JSON)、时间戳 | `conversation_id` → conversations |
| `token_records` | **历史数据** | `id` (PK)、`conversation_id?`、`message_id?`、`agent_id`、`provider`、`model`、`input_tokens`、`output_tokens`、`source`（chat/cron/sub-agent/compact）、`parent_record_id?`、`aborted`（0/1）、`created_at` | `agent_id` → Agent、`conversation_id` → conversations |
| `compact_records` | **历史数据** | `id` (PK)、`conversation_id` (FK→conversations, CASCADE)、`summary`、`boundary_message_id`、`input_tokens`、`output_tokens`、`trigger`（auto/manual）、`created_at` | `conversation_id` → conversations |
| `agent_memories` | **历史数据** | `id` (PK)、`agent_id`、`content`、`pinned`（0/1）、`priority`（0-5，默认3）、`tags` (JSON string[])、时间戳 | `agent_id` → Agent |
| `cron_job_runs` | **历史数据** | `id` (PK)、`cron_job_id`、`agent_id`、`conversation_id?`、`status`（running/success/error）、`duration_ms?`、`error?`、`triggered_by`（schedule/manual）、时间戳 | `cron_job_id` → CronJob、`agent_id` → Agent、`conversation_id` → conversations |

---

## 四、交叉引用关系图（项目内）

```
project.json
  ├─ defaultAgentId ─────────────► agents/{agentId}.json
  ├─ defaultTeamId ──────────────► teams/{teamId}.json
  └─ config.permissionsConfigId ─► permissions-config/{permId}.json

agents/{agentId}.json
  ├─ skillIds[] ─────────────────► skills/{skillId}/
  └─ mcpServers[] ───────────────► mcp.json 中的 server name（字符串匹配）

teams/{teamId}.json
  ├─ members[].agentId ──────────► agents/{agentId}.json
  ├─ members[].parentAgentId ────► agents/{agentId}.json
  └─ layout keys ────────────────► agents/{agentId}.json（字符串匹配）

cronjobs/{cronJobId}.json
  ├─ agentId ────────────────────► agents/{agentId}.json
  └─ teamId ─────────────────────► teams/{teamId}.json

conversations (SQLite)
  ├─ agent_id ───────────────────► agents/{agentId}.json
  └─ team_id ────────────────────► teams/{teamId}.json

messages (SQLite)
  └─ conversation_id ────────────► conversations

token_records (SQLite)
  ├─ agent_id ───────────────────► agents/{agentId}.json
  └─ conversation_id ────────────► conversations

agent_memories (SQLite)
  └─ agent_id ───────────────────► agents/{agentId}.json

cron_job_runs (SQLite)
  ├─ cron_job_id ────────────────► cronjobs/{cronJobId}.json
  ├─ agent_id ───────────────────► agents/{agentId}.json
  └─ conversation_id ────────────► conversations
```

---

## 五、完整目录树

```
~/.golemancy/                                    # 根数据目录 ($GOLEMANCY_DATA_DIR)
  settings.json                                  # 全局设置（providers, theme, language）
  speech.db (+wal, +shm)                         # 全局语音转文字 DB
  speech/
    audio/{uuid}.{ext}                           # 音频文件
  logs/
    server.{yyyy-MM-dd}                          # 每日轮转日志（最多 6 份）
  runtime/
    cache/
      pip/                                       # 共享 pip 缓存
      npm/                                       # 共享 npm 缓存
  projects/
    {projectId}/                                 # 例: proj-XyzAbC12345
      project.json                               # 项目元数据 + 配置
      mcp.json                                   # MCP 服务器配置（单文件）
      agents/
        {agentId}.json                           # Agent 配置（每 Agent 一个文件）
      teams/
        {teamId}.json                            # Team 配置（每 Team 一个文件）
      skills/
        {skillId}/
          SKILL.md                               # Skill 内容（frontmatter + markdown）
          metadata.json                          # Skill 元数据（id + 时间戳）
          {additional-assets}                    # ZIP 导入的额外资源文件
      cronjobs/
        {cronJobId}.json                         # CronJob 配置（每 Job 一个文件）
      permissions-config/
        {permConfigId}.json                      # 权限模板（每模板一个文件）
      workspace/
        {user/agent-created files}               # Agent 运行时工作区
      uploads/
        {sha256-32chars}.{ext}                   # 聊天图片（content-addressed）
      data/
        data.db (+wal, +shm)                     # Per-project SQLite 数据库
      runtime/
        python-env/                              # Per-project Python venv
          bin/ (macOS/Linux) 或 Scripts/ (Windows)
          lib/
          ...
      tasks/                                     # 遗留空目录
```

---

## 六、Storage 实现对照

| 实体 | Storage 类 | 源文件 | 存储介质 | 存储位置 |
|------|-----------|--------|---------|---------|
| Project | `FileProjectStorage` | `server/src/storage/projects.ts` | JSON 文件 | `projects/{id}/project.json` |
| Agent | `FileAgentStorage` | `server/src/storage/agents.ts` | JSON 文件 | `projects/{id}/agents/{agentId}.json` |
| Skill | `FileSkillStorage` | `server/src/storage/skills.ts` | MD + JSON | `projects/{id}/skills/{skillId}/` |
| Team | `FileTeamStorage` | `server/src/storage/teams.ts` | JSON 文件 | `projects/{id}/teams/{teamId}.json` |
| CronJob | `FileCronJobStorage` | `server/src/storage/cronjobs.ts` | JSON 文件 | `projects/{id}/cronjobs/{cronJobId}.json` |
| PermissionsConfig | `FilePermissionsConfigStorage` | `server/src/storage/permissions-config.ts` | JSON 文件 | `projects/{id}/permissions-config/{permId}.json` |
| MCP | `FileMCPStorage` | `server/src/storage/mcp.ts` | JSON 文件 | `projects/{id}/mcp.json` |
| Conversation | `SqliteConversationStorage` | `server/src/storage/conversations.ts` | SQLite | `projects/{id}/data/data.db` → `conversations` |
| Message | `SqliteConversationStorage` | `server/src/storage/conversations.ts` | SQLite | `projects/{id}/data/data.db` → `messages` |
| ConversationTask | `SqliteConversationTaskStorage` | `server/src/storage/tasks.ts` | SQLite | `projects/{id}/data/data.db` → `conversation_tasks` |
| TokenRecord | `TokenRecordStorage` | `server/src/storage/token-records.ts` | SQLite | `projects/{id}/data/data.db` → `token_records` |
| CompactRecord | `CompactRecordStorage` | `server/src/storage/compact-records.ts` | SQLite | `projects/{id}/data/data.db` → `compact_records` |
| AgentMemory | `SqliteMemoryStorage` | `server/src/storage/memories.ts` | SQLite | `projects/{id}/data/data.db` → `agent_memories` |
| CronJobRun | `SqliteCronJobRunStorage` | `server/src/storage/cron-job-runs.ts` | SQLite | `projects/{id}/data/data.db` → `cron_job_runs` |
| Settings | `FileSettingsStorage` | `server/src/storage/settings.ts` | JSON 文件 | `settings.json`（全局） |
| Speech | `SpeechStorage` | `server/src/storage/speech.ts` | SQLite + 文件 | `speech.db` + `speech/audio/`（全局） |
| Upload | 函数式（无 class） | `server/src/storage/uploads.ts` | 二进制文件 | `projects/{id}/uploads/` |
