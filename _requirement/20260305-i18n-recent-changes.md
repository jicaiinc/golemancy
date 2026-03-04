# 需求清单：最近 Git 提交改动的 i18n 补全
> 创建时间：2026-03-05
> 状态：已确认

## 范围

仅限最近 git 提交涉及的改动：
- `delete need to be confirmed` — 删除确认
- `clone project & agent & team` — Clone 功能
- `chat history filter: cron jobs & subagent chats` — Chat 过滤
- `cron job update in chat` / `cron job for teams` — Cron Job 适配 Team
- Team CRUD + Topology（已有 team i18n part 1-3，检查是否有遗漏）

## 功能需求

1. 检查上述改动涉及的 UI 文件中是否有 hardcoded 字符串，补全英文 key
2. 已知 hardcoded 问题：
   - `'New Chat'`（ChatPage.tsx:171, 176, 190）— 新对话的默认标题
   - `SESSION`（ToolCallDisplay.tsx:236）— Sub-agent session ID 标签
   - `minute hour day month weekday`（CronJobFormModal.tsx:190）— Cron 表达式格式提示
3. 英文确认无误后，翻译到所有 22 种语言
4. `pnpm check:i18n` 校验通过

## 明确不做

5. `(copy)` 后缀不 i18n
6. Chat filter 的 DB prefix `[Cron]` / `[Sub-agent]` 不动
7. 不扩大到其他无关文件的 i18n 排查

## 技术约束

8. 遵循 `__guidelines/i18n-20260302/` 下的 i18n 规范
9. 英文 (en) 是唯一标杆
10. 使用 `pnpm check:i18n` 校验各语言完整性
