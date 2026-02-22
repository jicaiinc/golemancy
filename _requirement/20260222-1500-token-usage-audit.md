# 需求清单：Token Usage 审查
> 创建时间：2026-02-22 15:00
> 状态：已确认

## 功能需求
1. 审查 Project Level 的 token usage 统计 — 项目级别的 token 统计是否正确
2. 审查 Global Level 的 token usage 统计 — 全局级别的 token 统计是否正确
3. 审查 Chat 右下角 StatusBar 中的 token 显示 — 实时展示给用户的 token 数是否正确
4. 审查 Context Window 的 token 统计 — 上下文窗口大小的计算是否正确
5. 审查落盘持久化的 token 统计 — 写入数据库的 token 记录是否正确
6. 发现并审查其他可能存在的 token 统计点

## 审查内容
1. 每个统计点的计算是否正确
2. 使用的是 AI SDK 的哪个 usage 字段（step usage / totalUsage / steps[].usage）
3. 计算的原理和逻辑是什么

## 流程要求
1. 创建团队进行审查
2. Team Lead 必须二次确认团队成员的审查结果，不盲信
3. 团队成员的思路和分析过程必须整理成 MD 文件留存
4. 团队解散后工作记录可追溯

## 最终产出
1. 一份表格文档（MD 格式），汇总所有 token 统计点的审查结论
2. 表格包含：统计位置、使用的 AI SDK 字段、计算原理、是否正确、问题描述（如有）
