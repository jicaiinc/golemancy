# 需求清单：消除 agentId + teamId 互斥双字段设计缺陷

> 创建时间：2026-03-13 15:00
> 状态：已确认

## 功能需求

1. 消除 `agentId` + `teamId?` 互斥双字段设计缺陷——`Conversation`、`CronJob`、`Project`（defaultAgentId/defaultTeamId）三处统一改造
2. 统一为两个字段表示目标：一个 type 字段（`'agent' | 'team'`）+ 一个 id 字段（`AgentId | TeamId`）。因为 Conversation 等实体本身已有 `id` 属性，实际字段名需要避免冲突（如 `targetType` + `targetId` 或嵌套 `target: { type, id }`），具体命名待 Design 阶段确定
3. 提供 `resolveAgentId()` 工具函数——当 `type === 'team'` 时自动从 team 解析 leader agent
4. 所有死代码必须清除——旧的 `agentId`/`teamId` 双字段相关的所有代码、判空逻辑、兼容 hack、`normalizeDefaultTarget()` 等全部删除，不留残余

## 技术约束

1. 不考虑向后兼容，不做渐进改造——彻底解决
2. 不保留旧字段——直接删除替换
3. DB 迁移：新列 + 旧数据一次性转换 + drop 旧列
4. `targetId` 类型用联合类型 `AgentId | TeamId`

## 流程要求

1. 需求持久化——本文档作为团队工作的唯一基准
2. Team Lead 二次确认——团队成员上报的内容，Team Lead 必须亲自验证后才能推进
3. 需求分析师全程监管——确保实现过程中不遗漏任何需求点，持续对照需求文档
4. Team Lead 和团队成员在实现中间过程不断对照本文档——防止偏离最初目的
5. 实现完成后进行测试和 Code Review
6. 改动不能破坏现有功能

## 注意事项

1. 用户原话："这种考虑兼容的方式导致了我们后续的改动中堆积实战代码不断地有 bug"——必须彻底
2. 用户原话："这个 agent id 和 team id 互斥的这种行为本身就是我们设计的缺陷"——根因是设计问题
3. 之前 commit `22e2885` 的全面重构被 revert 过，这次要吸取教训，确保方案正确再实施
4. 所有死代码必须清除，不留任何旧字段/旧逻辑残余
