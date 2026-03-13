# 内置项目模板系统

> 日期：2026-03-13
> 状态：已确认

## 目标

为 Golemancy 实现内置项目模板系统，用户安装后即有预设项目可直接使用，开箱即用。

## 范围

### 框架代码

1. **ProjectTemplate 类型定义** (`shared/types/template.ts`)
   - 包含 agents/skills/teams/mcpServers/cronJobs 内联定义
   - refId 系统做实体间引用
   - 不做独立的 Agent/Skill/Team/MCP 模板（只有 Project 级别）

2. **模板注册表** (`shared/templates/`)
   - 所有模板以 TypeScript 对象导出
   - 纯数组，不需要 Registry 类

3. **Server 端实例化 API** (`POST /api/projects/from-template`)
   - refId→realId 映射（与 clone-project.ts 同模式）
   - 按顺序创建：Skills → Agents → Teams → MCP → CronJobs
   - 所有 Agent 的 modelConfig = settings.defaultModel
   - 设置 project.defaultTarget

4. **UI 模板选择器**
   - Onboarding ProjectStep 增加模板卡片选择
   - ProjectCreateModal 增加模板卡片选择
   - 选中模板后名称/图标自动填充，用户可改；选 Blank 为当前逻辑

5. **Skills 打包**
   - SKILL.md 文件 bundled 在 `shared/templates/skills/` 下
   - 从开源仓库复用，不手写
   - 实例化时从 bundled 文件创建 Skill 实体

6. **i18n**
   - 新增 `templates` namespace
   - 英文 baseline，模板名/描述/分类

### 模板内容

**实现（2 个）：**
- 写作助手 (writing-assistant)：单 Agent，Skills 来自 alirezarezvani/claude-skills + coreyhaines31/marketingskills
- 深度调研 (deep-research)：3-Agent Team，Skills 来自 Weizhena/Deep-Research-skills + alirezarezvani/claude-skills

**记录（16 个）：**
- 完整配置持久化到 `_design/` 文档，供后续实现参考

### 设计约束

- Model：统一用 `settings.defaultModel`，不做 ModelCapability resolver
- MCP：只用零配置的（npx/uvx，无 API key）
  - `@modelcontextprotocol/server-filesystem` (npx)
  - `@modelcontextprotocol/server-memory` (npx)
  - `@playwright/mcp` (npx)
  - `open-websearch` (npx)
  - `@modelcontextprotocol/server-sequential-thinking` (npx)
  - `mcp-server-fetch` (uvx, Python)
  - `mcp-server-git` (uvx, Python)
- Skills：从开源仓库复用 SKILL.md 格式（与 Golemancy 100% 兼容）
- 不区分免费/付费层

### 测试要求

- 单元测试：类型校验、实例化逻辑、模板注册
- 集成测试：从模板创建项目完整流程（Server 端）
- E2E 测试：UI 模板选择 → 项目创建 → 验证实体存在

## 参考资源

- Skills 来源仓库：alirezarezvani/claude-skills, coreyhaines31/marketingskills, ComposioHQ/awesome-claude-skills, K-Dense-AI/claude-scientific-skills, deanpeters/Product-Manager-Skills, Weizhena/Deep-Research-skills
- 项目配置详情：`_design/20260313-1400-super-individual-agent-projects/projects-detail.md`
- GitHub Trending 分析：`/Users/cai/developer/github/trending_archive/_docs/agent-mcp-skills-analysis/`
- MCP/Skills/Agent 调研：对话 7a51793a 的三份调研报告

## 不做的事

- 独立的 Agent/Skill/Team/MCP 模板
- ModelCapability resolver
- 需要 API key / OAuth 的 MCP
- 手写 Skills 内容
- 免费/付费区分
