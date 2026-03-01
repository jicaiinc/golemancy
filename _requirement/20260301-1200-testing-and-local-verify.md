# 需求清单：全面测试补充 + 本地打包验证流程

> 创建时间：2026-03-01
> 状态：已确认

## 功能需求

1. 全面补充测试覆盖——不限于 E2E，还包括单元测试和集成测试。根据分析，哪里有缺口就补哪里。具体包括：
   - Server 端缺失的单元测试（scheduler、agent runtime/compact/skills、storage 层、route 层等）
   - E2E 测试缺失的 CRUD 操作和用户交互流程（Memory、Skill、Chat 侧边栏、Workspace 等）

2. 本地打包验证流程——把 CI（GitHub Actions）里做的构建验证步骤搬到本地来，让用户在本地就能跑一遍完整的验证，不需要推到 GitHub 等很久才发现问题。这不是一个单独的冒烟测试脚本，而是一个完整的本地验证链（类型检查 → 单元测试 → 构建 → bundle → preflight → smoke test），一条命令跑完。

## 流程要求

1. 使用团队模式（`_team/team.md`）——按照角色和流程执行，需要的话创建团队并行工作
2. 实现完成后串行运行验证——不要同时跑多个测试，避免内存问题
3. 监控后台进程——关注 vite/vitest/electron 进程，如果有长时间占用大量内存的僵尸进程要及时 kill

## 注意事项

1. 用户自己会记住本地该跑什么命令（如 lint），不需要 CI 自动化、不需要 pre-commit hooks
2. 绝对不要动 git，可以查看但不允许提交代码
