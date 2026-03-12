# 需求清单：ChatTarget 统一抽象重构

> 创建时间：2026-03-12 22:00
> 状态：已确认

## 功能需求

1. **引入 `ChatTarget` 统一抽象** — 将现有的 `agentId + teamId?` 双字段模式替换为 discriminated union，用 `kind: 'agent' | 'team'` + `targetId: AgentId | TeamId` 表达"聊天对象是一个 Agent 还是一个 Team"
2. **三个数据实体需要改造**：
   - `Conversation`：`agentId + teamId?` → `target: ChatTarget`
   - `CronJob`：`agentId + teamId?` → `target: ChatTarget`
   - `Project`：`defaultAgentId? + defaultTeamId?` → `defaultTarget?: ChatTarget`
3. **消除判空模式** — 所有消费者不再用 `if (teamId) ... else agentId ...` 的方式，改为对 `target.kind` 做 exhaustive switch
4. **数据迁移** — SQLite（conversations 表）和 file-based（projects、cronjobs JSON）的现有数据需要平滑迁移到新字段
5. **删除 `encodeTeamValue/decodeSelectValue` hack** — UI 中不再需要将 agent/team 编码到同一个 select value

## 技术约束

1. 遵循项目既有的 monorepo 结构和依赖方向：`desktop → ui → shared ← server ← tools`
2. 使用 branded ID 类型（`AgentId`, `TeamId`）保持编译期安全
3. SQLite migration 通过 `db/migrate.ts` 体系
4. File-based storage 需要运行时兼容：发现旧格式自动转换写回

## 流程要求

1. **不影响现有功能** — 这是纯重构，不新增功能，不删除功能
2. **数据兼容** — 旧数据必须能被正确读取和迁移
3. **不涉及 `token-records`、`cron-job-runs` 中的 `agentId`** — 这些是"实际执行了哪个 agent"的事实记录，保留不变
4. **不涉及 `agent/runtime`、`agent/model`、`agent/tools`** — 这些接收已解析的 `Agent` 对象，不关心 target

## 注意事项

1. 改动涉及 ~45 个文件、12 个模块方向，需要仔细规划实现顺序，避免编译断裂
2. 测试文件（unit + E2E）需要同步更新
3. `agent/sub-agent.ts` 创建子 conversation 时也要传 target
4. `scheduler/executor.ts` 从 cronJob 解析 target 的逻辑需要改
