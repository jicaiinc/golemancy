# 需求清单：Onboarding 流程审查与修复
> 创建时间：2026-03-01 12:44
> 状态：已确认

## 功能需求

### 首页（Welcome 页面）视觉问题
1. **"Golemancy" 标题字体颜色** — 应该显示为绿色，与主题色一致，但目前没有显示绿色
2. **欢迎语** — 需要更醒目，位置应该向下一点并居中显示

### Provider 流程（Connect an AI Provider）功能问题
3. **Test Connection 异常跳转** — 填写完 API Key 后点击 "Test Connection"，直接跳转到了 "Create Project" 页面，没有显示测试结果
4. **流程缺失** — 点击 Test Connection 后没有显示 Speech 配置步骤和 Project 配置步骤的相关内容，直接跳过了

### 全面审查
5. **代码审查范围** — 审查整个 Provider 的 Test Connection 流程，以及后续所有 Onboarding 流程（Speech → Project → Complete），通过阅读代码的方式进行跟踪和确认
6. **确认流程正确性** — 确认每一步的实现逻辑是否正确，是否存在错误或遗漏

## 技术约束
1. 必须通过阅读代码进行审查和确认，不能凭推测

## 流程要求
1. **项目经理全程负责** — 项目经理对所有事情负责，控制整个流程
2. **二次确认制度** — 项目经理需要对团队成员的结论进行二次确认，不能仅凭团队成员的报告就相信，需要亲自验证
3. **审计确认** — 发现错误/错漏后，通过审计进行确认
4. **解决方案二次确认** — 修复方案需要二次确认后才开始修复
5. **修复后测试** — 修复完成后需要跑完整的 E2E 测试、打包测试（`pnpm verify`）等全部验证流程
6. **代码 Code Review** — 测试通过后进行代码审查

## 风格要求
1. 像素风格（Minecraft 美学）、深色主题
2. 主题色为绿色
3. **WelcomeStep 必须参考官网 (golemancy.ai) 进行设计**，将官网的卖点和风格迁移过来

## 官网参考信息（golemancy.ai）

### 核心文案
- **主标题**: "Command Your AI Golems"
- **副标题**: "Orchestrate autonomous AI agents from your desktop."
- **口号**: "One person. Infinite golems."
- **品牌标语**: "Built for Super Individuals."

### 8 个卖点（Feature Cards）
1. **Multi-Agent Orchestration** — "Summon multiple AI agents in isolated projects. Each agent runs independently with its own context, tools, and mission."
2. **Recursive Sub-Agents** — "Agents spawn sub-agents with unlimited nesting. One command triggers an entire autonomous workforce, streaming results in real-time."
3. **9+ LLM Providers** — "Claude, GPT, Gemini, DeepSeek, Groq, Mistral, and more. Switch models per agent. Use the right brain for every task."
4. **MCP Protocol** — "Native Model Context Protocol support with connection pooling. Plug into the expanding MCP ecosystem out of the box."
5. **Browser Automation** — "16 built-in tools and 80+ operations powered by Playwright. Your agents don't just think — they browse, click, and extract."
6. **Skill System** — "Equip agents with reusable prompt templates. Create, share, and import skill packs like equipping items in an RPG."
7. **Cron Scheduling** — "Set it and forget it. Schedule agents to run on autopilot — daily reports, periodic scraping, recurring workflows."
8. **Local-First Security** — "Your data never leaves your machine. Loopback-only server, per-session auth tokens, three-tier sandboxed permissions."

### 官网视觉风格
- `accent-green` 主色调
- `font-pixel` 像素字体
- `font-mono` 等宽字体
- `pixel-shadow-raised` / `pixel-shadow-sunken` 像素阴影
- Hero 渐入动画 (`hero-fade-in`, staggered delays)
- "GOLEMANCY" logo 文字

## 注意事项
1. 项目经理对所有内容都需要进行二次确认，不能团队成员说什么就完全相信
2. 整个流程控制要严格执行
