# Design 阶段汇总：targetType + targetId 统一方案

> 汇总时间：2026-03-13
> Team Lead 确认：通过

## 设计结论

### 核心方案
- **命名**：扁平 `targetType: TargetType` + `targetId: AgentId | TeamId`
- **TargetType**：`'agent' | 'team'`，定义在 `shared/types/common.ts`
- **Project**：`defaultTargetType?` + `defaultTargetId?`（可选，允许未配置）
- **CronJobRun.agentId**：保留不变（运行时事实字段）

### 影响范围
- shared: 7 文件（含新建 utils/target.ts）
- server: 14 文件（含 dashboard.ts + global-dashboard.ts）
- UI: 11 文件
- 测试: 8+ 文件
- 总计约 40 个文件

### 实施顺序（5 Phase）
1. Types & Shared（类型定义 + resolveAgentId）
2. Server Storage & DB（schema + migration + storage + dashboard SQL）
3. Server Routes（chat.ts + conversations + agents/teams cascade + scheduler）
4. UI（store + services + pages）
5. Tests（所有测试文件更新）

### 关键决策
1. 扁平字段（非嵌套对象）——SQLite 直接映射，与项目风格一致
2. 联合类型 `AgentId | TeamId`（非新建 branded type）——务实选择
3. resolveAgentId() 放 shared 包——server + UI 共用
4. DB 迁移带 DEFAULT 值 + 列存在检查——防中间状态
5. Dashboard SQL：WHERE 过滤用 `target_id`（前缀不同不会交叉），SELECT 改为 `target_type + target_id`
6. 文件系统 normalize 读时转换、写时自然覆盖——不主动回写

### 审查结果
- 抽象策略师：无阻断性问题，2 个必须解决的 CONCERN 已由架构师补充完成
- 事实验证：SQLite 3.49.2 完全支持 DROP COLUMN，项目内已有 4 处先例
- 需求分析：50+ 影响点、13 条验收标准、13 项功能回归检查点

## 参考文档
- 需求基准：`_requirement/20260313-1500-target-refactor.md`
- 架构设计：`architecture.md`
- 需求分析：`requirements.md`
- 事实验证：`fact-check.md`
- 抽象审查：`abstraction-review.md`
