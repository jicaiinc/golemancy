# Design 阶段汇总 — Runtime 切换验证与修复

> Team Lead 审查通过：2026-02-25
> 状态：Design 完成，进入 Implement

## Design 成果物

| 文件 | 角色 | 状态 |
|------|------|------|
| `fact-check.md` | 事实验证师 | ✅ 通过 |
| `requirements.md` | 需求分析师 | ✅ 通过 |
| `ui-design.md` | UI 设计师 | ✅ 通过 |
| `architecture.md` | 架构师 | ✅ 通过 |

## 关键技术决策

1. **图片支持**：SDK Streaming Input Mode 支持 base64 图片 → 始终使用 Streaming Mode
2. **Skills**：采用 symlink 方案将 Golemancy skills 映射到 `.claude/skills/`，利用 SDK 原生发现
3. **Artifact**：SDK 不支持 → 本期不处理（P2）
4. **Conversation 锁定**：DB 新增 runtime 列 + 路由校验 (409 Conflict)
5. **Skills 迁移**：懒迁移策略，project 优先读取，agent 回退

## Implement 任务分配

### 可并行（Phase 1 + Phase 2 + UI）
- Task #5: Conversation Runtime 锁定（Phase 1）
- Task #6: 图片上传支持（Phase 2）
- Task #8: Global Settings UI 合并
- Task #9: Project Settings UI 改动
- Task #10: Compact UI 修复

### 需等待（Phase 3，依赖 Phase 1/2 完成）
- Task #7: Skills 迁移到 Project 级别

### 最后
- Task #11: 全功能验证
- Task #12-13: 测试
- Task #14: Code Review
