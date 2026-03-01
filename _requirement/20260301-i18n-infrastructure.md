# 需求清单：i18n 基础设施搭建（Phase 0）
> 创建时间：2026-03-01
> 状态：已确认

## 功能需求
1. 为 Golemancy UI 引入 `react-i18next` + `i18next` 国际化框架
2. 建立翻译文件目录结构 `packages/ui/src/locales/en/{namespace}.json`，当前只维护英文
3. 创建 `common.json` 包含高频复用词（Cancel, Save, Delete, Loading, 相对时间模板等）
4. 提取 `relativeTime()` 从 4 处重复实现统一到 `packages/ui/src/lib/time.ts`，支持 i18n
5. 配置 `parseMissingKeyHandler` 防止 raw key 暴露给用户
6. 配置测试 mock 保证现有测试不挂
7. 存量改造不在本次范围 — 基础设施就绪即可

## 技术约束
1. 使用 `react-i18next` + `i18next` + `i18next-browser-languagedetector`
2. AI-facing 文本（`server/agent/` 下 tool descriptions、system prompts、tool results、权限拦截错误）永远不做 i18n
3. 外部/动态错误（`err.message`、`record.error`、`run.error`）原样透传，只 i18n fallback
4. 使用插值 `t('key', { var })` 而非字符串拼接
5. Key 命名规范：`{namespace}.{area}.{purpose}`
6. 复数用 `_one` / `_other` 后缀

## 流程要求
1. 团队并行执行互不冲突的模块
2. 翻译实施与一致性审查分角色执行（结对概念）
3. 全局一致性角色贯穿所有模块，确保术语统一
4. 实施后进行一致性审查

## 注意事项
1. 绝对不动 git
2. 不破坏现有功能
3. 包体积影响极小（i18next gzip ~13KB）
