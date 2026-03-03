# i18n Key Summary

> 生成时间：2026-03-01
> 总计：747 keys × 2 语言 (en, zh)

## Namespace 统计

| Namespace | Key 数 | 覆盖范围 |
|-----------|--------|---------|
| agent | 86 | Agent 列表/详情/拓扑/创建、技能/工具/MCP/子 Agent 标签页 |
| permissions | 76 | 权限模式、沙盒配置、文件系统/网络/命令限制、MCP 沙盒 |
| onboarding | 71 | 欢迎/供应商/语音/项目/完成 5 步引导流程 |
| speech | 57 | 语音转文字设置、转录历史、录音/播放/重试操作 |
| common | 52 | 通用按钮(22)、状态、时间格式(含复数)、确认对话框、拖放区域 |
| dashboard | 52 | 项目/全局仪表盘、Token 用量图表/表格、活动面板 |
| settings | 50 | 全局设置、外观/语言、供应商管理、默认模型 |
| error | 50 | 错误边界 UI、48 个服务器错误码映射、通用回退 |
| chat | 45 | 聊天窗口、侧边栏、输入框、消息气泡、工具调用显示 |
| mcp | 44 | MCP 服务器列表/表单、导入、警告、引用计数 |
| cron | 42 | 自动化列表/表单、运行历史、预设时间模板 |
| nav | 34 | 侧边导航项、状态栏(权限模式/上下文/Token 统计) |
| project | 33 | 项目列表/创建/设置(基本信息/Agent/权限标签页) |
| skill | 23 | 技能列表/表单、导入/删除错误 |
| workspace | 19 | 工件文件树、文件预览、删除确认 |
| task | 13 | 对话任务列表/状态 |

## 翻译文件位置

```
packages/ui/src/locales/
├── en/          # English (16 files)
│   ├── agent.json
│   ├── chat.json
│   ├── common.json
│   ├── cron.json
│   ├── dashboard.json
│   ├── error.json
│   ├── mcp.json
│   ├── nav.json
│   ├── onboarding.json
│   ├── permissions.json
│   ├── project.json
│   ├── settings.json
│   ├── skill.json
│   ├── speech.json
│   ├── task.json
│   └── workspace.json
└── zh/          # 中文 (16 files, same structure)
```

## Key 命名规则

- `namespace:section.key` — 点分 camelCase 层级
- 共用按钮统一使用 `common:button.*`（cancel, save, delete 等）
- 复数：`_one` / `_other` 后缀（i18next v4 CLDR 格式）
- 插值：`{{variable}}` 语法

## 相关文档

- 设计准则：`_design/i18n-guidelines.md`
- 例外清单：`_design/i18n-exceptions.md`
- 需求文档：`_requirement/20260301-i18n-full-rollout.md`
