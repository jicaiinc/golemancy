# 超级个体 AI Agent 项目体系 — 详细配置

> 最后更新：2026-03-13
> 总览文档：`overview.md`

每个 Project 包含：项目定位、Agent 列表、Skills、MCP Server、Built-in Tools、Cron Job、可复用参考。

---

## 免费层 — 通用角色

---

### Project 1: 智能秘书 (Smart Secretary)

**替代角色**：行政助理 / 私人秘书
**一句话**：管理你的邮件、日程、待办和信息流，让你专注于核心工作。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **Secretary** | 全能秘书 | 邮件分类与回复草稿、日程管理、会议纪要、待办整理、信息汇总 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 邮件模板（正式/非正式/感谢/道歉/跟进）、会议纪要模板、待办提取模板 |
| **MCP Servers** | Gmail MCP、Google Calendar MCP (nspady/google-calendar-mcp)、Todoist MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住常用联系人、邮件签名偏好、日程习惯（如"周三下午不排会"） |
| **Cron Jobs** | 每日早 9 点：生成今日日程摘要 + 未读邮件概览；每日晚 6 点：汇总今日待办完成情况 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Gmail Automation Skill | ComposioHQ/awesome-claude-skills | 邮件收发、搜索、整理 |
| Google Calendar Automation Skill | ComposioHQ/awesome-claude-skills | 日程管理 |
| Meeting Insights Analyzer Skill | ComposioHQ/awesome-claude-skills | 会议纪要分析 |
| Email Automation Agent | kaymen99/langgraph-email-automation | 邮件分类+自动回复参考架构 |
| Personal AI Infrastructure | danielmiessler/Personal_AI_Infrastructure | 持久化个人助理参考架构 |

---

### Project 2: 翻译官 (Translator)

**替代角色**：翻译员 / 本地化专员
**一句话**：不是逐句翻译，而是理解上下文的多语言沟通伙伴。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **Translator** | 翻译专家 | 文档翻译、邮件互译、商务沟通翻译、术语管理、本地化建议 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 商务邮件翻译模板、技术文档翻译模板、营销文案本地化模板、学术论文翻译模板 |
| **MCP Servers** | Google Sheets MCP（术语表管理）、Fetch MCP（获取网页内容翻译） |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住用户偏好术语（如"server → 服务器"还是"伺服器"）、常用语言对、行业领域 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Better i18n Skills | better-i18n/skills | i18n 最佳实践、自动 key 提取、locale 路由 |
| Crowdin Automation Skill | ComposioHQ/awesome-claude-skills | 翻译管理平台自动化 |
| Google Workspace Skills | ComposioHQ/awesome-claude-skills | 文档跨语言操作 |

---

### Project 3: 写作助手 (Writing Assistant)

**替代角色**：文案编辑 / 内容撰写员
**一句话**：帮你写好每一段文字 — 从邮件到博客到朋友圈。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **Writer** | 写作专家 | 各类文书撰写、语气调整、格式适配、润色校对 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 社交媒体文案模板（小红书/推特/LinkedIn/微信公众号）、商务邮件模板、博客写作模板、求职信/简历模板、投诉信/感谢信模板 |
| **MCP Servers** | Fetch MCP（获取参考内容） |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住用户写作风格、常用语气（正式/轻松/幽默）、品牌语气指南 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Content Creator Skill | alirezarezvani/claude-skills | 博客、公告、SEO 内容 |
| Content Research Writer Skill | ComposioHQ/awesome-claude-skills | 调研+写作+引用 |
| Copywriting Skill | coreyhaines31/marketingskills | 转化导向文案 |
| Copy Editing Skill | coreyhaines31/marketingskills | 润色校对 |
| Brand Voice Analyzer | alirezarezvani/claude-skills | 品牌语气分析与一致性 |
| Tailored Resume Generator | ComposioHQ/awesome-claude-skills | 简历生成 |
| Internal Comms Skill | ComposioHQ/awesome-claude-skills | 内部沟通文档模板 |

---

### Project 4: 知识探索 (Knowledge Explorer)

**替代角色**：研究助理 / 学习导师
**一句话**：帮你搜集信息、整理知识、辅导学习。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **Explorer** | 知识探索者 | 信息搜集、摘要生成、知识问答、学习计划制定、概念解释 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 费曼教学法模板、苏格拉底提问法模板、思维导图生成模板、知识卡片模板 |
| **MCP Servers** | Brave Search MCP (brave/brave-search-mcp-server)、Fetch MCP、Context7 MCP（技术文档查询） |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住学习进度、知识薄弱点、感兴趣的领域、理解深度偏好 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Brave Search MCP | brave/brave-search-mcp-server | 网络搜索 |
| Exa Search MCP | exa-labs/exa-mcp-server | 语义搜索 |
| Obsidian MCP | cyanheads/obsidian-mcp-server | 笔记知识库管理 |
| Context7 MCP | context7 | 技术文档查询（最热门 MCP，690+ 安装） |
| Notion MCP | makenotion/notion-mcp-server | 知识库管理 |

---

### Project 5: 生活管家 (Life Manager)

**替代角色**：生活助理
**一句话**：旅行规划、比价、菜谱、生活琐事一站式处理。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **LifeHelper** | 生活助手 | 旅行行程规划、价格比较、菜谱推荐、搬家清单、礼物建议、生活提醒 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 旅行规划模板、预算管理模板、比价分析模板 |
| **MCP Servers** | Brave Search MCP、Google Calendar MCP、Google Maps MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住预算范围、饮食禁忌/过敏、旅行偏好（冒险/休闲）、家庭成员信息 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Travel Planner Skill | Community/mcpmarket.com | 行程规划、预算分解 |
| Google Calendar Automation | ComposioHQ/awesome-claude-skills | 日程管理 |
| Google Maps Automation | ComposioHQ/awesome-claude-skills | 位置和路线 |
| AI Travel Planner Agent Team | awesome-llm-apps | 多 Agent 旅行规划参考 |

---

### Project 6: 文档处理中心 (Document Hub)

**替代角色**：文员 / 行政
**一句话**：PDF、Word、Excel、PPT 的 AI 处理中心。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **DocProcessor** | 文档处理专家 | 读取/生成/转换 PDF、DOCX、XLSX、PPTX；数据提取；格式化报告 |

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | PDF 处理 Skill、DOCX 处理 Skill、XLSX 处理 Skill、PPTX 处理 Skill |
| **MCP Servers** | Google Drive MCP（文件存取）、Google Sheets MCP |
| **Built-in Tools** | `memory: true`, `bash: true` |
| **Memory 策略** | 记住常用文档模板、公司信头格式、报告结构偏好 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| PDF Skill | ComposioHQ/awesome-claude-skills | 提取、合并、注释 |
| DOCX Skill | ComposioHQ/awesome-claude-skills | 创建、编辑、跟踪修改 |
| XLSX Skill | ComposioHQ/awesome-claude-skills | 公式、图表、数据处理 |
| PPTX Skill | ComposioHQ/awesome-claude-skills | 读取、生成、调整幻灯片 |
| Invoice Organizer Skill | ComposioHQ/awesome-claude-skills | 发票自动整理 |
| File Organizer Skill | ComposioHQ/awesome-claude-skills | 文件归类 |
| Spreadsheet Skill | openai/skills | Excel/CSV 分析 |

---

## 付费层 — 专业角色

---

### Project 7: 深度调研 (Deep Research)

**替代角色**：市场分析师 / 调研顾问
**一句话**：多维度、多来源的深度调研，输出专业级报告。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **ResearchLead** | 调研主管 | 制定调研框架、分配任务、汇总报告 |
| **WebResearcher** | 网络调研员 | 网页搜索、信息抓取、数据收集 |
| **Analyst** | 分析师 | 数据分析、趋势识别、竞品对比、洞察提炼 |

#### Team 拓扑

```
ResearchLead (leader)
├── WebResearcher（搜索和数据收集）
└── Analyst（分析和洞察）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 深度调研模板（市场规模/竞品分析/SWOT/用户画像）、报告输出模板（摘要+详细+附录） |
| **MCP Servers** | Brave Search MCP、Exa Search MCP、Firecrawl MCP、Fetch MCP |
| **Built-in Tools** | `memory: true`, `browser: true`, `bash: true` |
| **Memory 策略** | 记住之前的调研主题和结论，支持增量更新；记住用户关注的竞品列表 |
| **Cron Jobs** | 可选：每周定时更新竞品动态报告 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Open Deep Research | langchain-ai/open_deep_research (10.8k stars) | 多阶段自主调研，支持多模型多搜索引擎 |
| DeepResearchAgent | SkyworkAI/DeepResearchAgent | 分层多 Agent 调研（Planning + Researcher + Browser + Analyzer） |
| Deep Research Skills | Weizhena/Deep-Research-skills | 两阶段调研（大纲+深入），支持人工介入 |
| Competitive Analyst Skill | alirezarezvani/claude-skills | SWOT、竞品定位 |
| Market Researcher Skill | alirezarezvani/claude-skills | 市场规模、趋势、客户分群 |
| Competitive Ads Extractor | ComposioHQ/awesome-claude-skills | 竞品广告策略分析 |
| AI Competitor Intelligence Team | awesome-llm-apps | 多 Agent 竞情分析参考 |
| Brand Reputation Monitor | awesome-ai-apps | 品牌舆情监控+情感分析 |

---

### Project 8: 内容营销 (Content Marketing)

**替代角色**：营销经理 / 内容策划
**一句话**：从选题到写作到多平台分发的完整内容流水线。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **ContentLead** | 内容主管 | 内容策略、选题策划、日历排期、品牌一致性把控 |
| **ContentWriter** | 内容写手 | 长文撰写、SEO 优化、关键词植入 |
| **Editor** | 编辑 | 润色校对、事实核查、语气调整 |
| **Distributor** | 分发专员 | 内容适配多平台格式、定时发布 |

#### Team 拓扑

```
ContentLead (leader)
├── ContentWriter（撰写）
├── Editor（编辑）
└── Distributor（分发）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 内容日历模板、各平台格式模板（微信/小红书/推特/LinkedIn/Medium）、SEO 写作指南、品牌语气指南 |
| **MCP Servers** | Brave Search MCP（选题调研）、Social Media Sync MCP（跨平台发布）、Twitter MCP、LinkedIn MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住品牌语气、核心话题领域、已发布内容清单（避免重复）、效果好的内容模式 |
| **Cron Jobs** | 每周一：生成本周内容日历；每日：检查待发布内容提醒 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| AI Marketing Suite | zubair-trabzada/ai-marketing-claude (318 stars) | 15 个营销 Skills，直接安装使用 |
| Copywriting Skill | coreyhaines31/marketingskills | 转化导向文案 |
| Content Strategy Skill | coreyhaines31/marketingskills | 编辑日历、内容支柱 |
| Social Content Skill | coreyhaines31/marketingskills | 平台特定内容 |
| Content Creator Skill | alirezarezvani/claude-skills | 博客、公告、SEO 内容 |
| Blog Writing Agent | awesome-ai-apps | 带 Memory 的个性化博客写作 |
| SEO Machine | TheCraigHewitt/seomachine | SEO 长文+WordPress 发布 |

---

### Project 9: 社媒运营 (Social Media Operations)

**替代角色**：社媒运营专员
**一句话**：多平台社交媒体账号的 AI 运营中心。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **SocialManager** | 社媒经理 | 发布策略、内容排期、数据复盘 |
| **CommunityManager** | 社区管理 | 互动回复、评论管理、粉丝关系维护 |

#### Team 拓扑

```
SocialManager (leader)
└── CommunityManager（互动管理）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 各平台发布最佳时间模板、话题标签策略、互动回复话术模板 |
| **MCP Servers** | Twitter/X MCP (taazkareem)、LinkedIn MCP (alinaqi)、Instagram Analytics MCP、Social Media Sync MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住各平台账号信息、粉丝画像、高互动内容特征、竞争账号 |
| **Cron Jobs** | 每日：检查各平台通知和互动；每周：生成社媒数据分析报告 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Social Media Agent | langchain-ai/social-media-agent | 生产级社媒自动化（LangChain 内部使用） |
| Twitter Algorithm Optimizer | ComposioHQ/awesome-claude-skills | 推特算法优化 |
| Social Media Analyzer | alirezarezvani/claude-skills | 社媒数据分析 |
| Social Media Agent (Memory) | awesome-ai-apps | 带品牌记忆的社媒自动化 |
| Multi-Platform MCP | @muhammadhamidraza/social-media-mcp-server | YouTube/LinkedIn/Facebook/Instagram/TikTok/Twitter 549 工具 |

---

### Project 10: SEO 优化 (SEO Optimizer)

**替代角色**：SEO 专家
**一句话**：技术 SEO + 内容 SEO + AI 搜索优化（GEO/AEO）。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **SEOStrategist** | SEO 策略师 | 关键词研究、内容策略、技术审计、排名监控 |
| **SEOWriter** | SEO 写手 | SEO 优化的内容创作、元标签优化、Schema 标记 |

#### Team 拓扑

```
SEOStrategist (leader)
└── SEOWriter（内容执行）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 技术 SEO 审计模板、关键词研究模板、内容优化模板、Schema Markup 模板、GEO/AEO 优化模板 |
| **MCP Servers** | Ahrefs MCP、Semrush MCP、Google Analytics MCP、Google Ads MCP、Firecrawl MCP、Brave Search MCP |
| **Built-in Tools** | `memory: true`, `browser: true`, `bash: true` |
| **Memory 策略** | 记住目标关键词列表、当前排名、竞品 SEO 策略、网站技术问题 |
| **Cron Jobs** | 每周：关键词排名变化报告；每月：竞品 SEO 对比分析 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Claude SEO | AgriciDaniel/claude-seo | 13 子技能 + 6 子 Agent，最完整 SEO 技能集 |
| GEO-SEO Claude | zubair-trabzada/geo-seo-claude | AI 搜索优化（引用率、爬虫分析、品牌权威） |
| SEO Audit Skill | coreyhaines31/marketingskills | 技术+页面 SEO 审计 |
| Programmatic SEO | coreyhaines31/marketingskills | 规模化页面生成 |
| AI SEO Skill | coreyhaines31/marketingskills | GEO/AEO 优化 |
| Schema Markup Skill | coreyhaines31/marketingskills | 结构化数据 |
| AI SEO Audit Team | awesome-llm-apps | 多 Agent SEO 审计参考 |

---

### Project 11: 销售获客 (Sales Pipeline)

**替代角色**：销售代表 / BD
**一句话**：从线索发现到成交跟进的全链路销售助手。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **SalesLead** | 销售主管 | 销售策略、管线管理、预测分析 |
| **Prospector** | 线索猎手 | 线索发现、客户画像研究、资质判断 |
| **OutreachSpecialist** | 外展专家 | 个性化邮件撰写、跟进序列、客户沟通 |

#### Team 拓扑

```
SalesLead (leader)
├── Prospector（线索研究）
└── OutreachSpecialist（外展沟通）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 客户画像模板、SPIN 销售模板、冷邮件序列模板、提案撰写模板、异议处理指南 |
| **MCP Servers** | HubSpot MCP、LinkedIn MCP、Gmail MCP、Brave Search MCP、Firecrawl MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住客户档案、沟通历史、成功的邮件模板、行业话术 |
| **Cron Jobs** | 每日：检查 CRM 待跟进线索；每周：生成销售管线报告 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Sales Outreach Automation | kaymen99/sales-outreach-automation-langgraph | 端到端销售流水线（调研→资质→个性化外展），集成 HubSpot/Airtable/Google Sheets |
| AI CRM Agents | KlementMultiverse/ai-crm-agents | 6 个自主 Agent 的完整 CRM 替代方案 |
| HubSpot Automation | ComposioHQ/awesome-claude-skills | CRM 操作自动化 |
| Salesforce Automation | ComposioHQ/awesome-claude-skills | CRM 操作自动化 |
| Cold Email Skill | coreyhaines31/marketingskills | 冷邮件序列 |
| Sales Enablement Skill | coreyhaines31/marketingskills | 销售物料、战斗卡、异议处理 |
| Lead Research Assistant | ComposioHQ/awesome-claude-skills | 潜在客户研究 |
| AI Lead Generator | brightdata/ai-lead-generator | 线索发现+资质评估 |
| AI Sales Intelligence Team | awesome-llm-apps | 多 Agent 销售智能参考 |

---

### Project 12: 客户服务 (Customer Service)

**替代角色**：客服专员 / 售后支持
**一句话**：自动化客户支持，从工单分类到智能回复。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **SupportManager** | 客服主管 | 工单分类、优先级判断、升级决策 |
| **SupportAgent** | 客服代表 | FAQ 回答、问题排查、回复草拟 |

#### Team 拓扑

```
SupportManager (leader)
└── SupportAgent（一线回复）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 客服话术模板、投诉处理流程、退款政策模板、满意度调查模板 |
| **MCP Servers** | Slack MCP (slack-api)、Discord MCP、Gmail MCP、Twilio MCP（短信通知） |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住 FAQ 知识库、客户历史问题、常见问题解决方案、升级阈值 |
| **Cron Jobs** | 每 30 分钟：检查未回复工单；每日：客服数据汇总（响应时间、解决率） |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Email Automation Agent | kaymen99/langgraph-email-automation | 4 Agent 邮件自动化（分类→RAG 回复→QA 审查→发送） |
| Customer Service Demo | openai/openai-cs-agents-demo | OpenAI 官方客服 Agent 示例 |
| Customer Support Voice Agent | awesome-ai-apps | 语音客服+持久记忆 |
| Slack Automation | ComposioHQ/awesome-claude-skills | Slack 消息管理 |
| Churn Prevention Skill | coreyhaines31/marketingskills | 流失预防 |
| Customer Success Manager | alirezarezvani/claude-skills | 客户健康评分、留存策略 |

---

### Project 13: 财务管理 (Financial Management)

**替代角色**：会计 / 财务顾问
**一句话**：记账、报税、发票管理、财务分析一体化。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **FinanceLead** | 财务主管 | 财务策略、预算规划、财务健康评估 |
| **Bookkeeper** | 记账员 | 日常记账、发票管理、费用分类、银行对账 |
| **TaxAdvisor** | 税务顾问 | 可抵扣项识别、节税建议、税务申报提醒 |

#### Team 拓扑

```
FinanceLead (leader)
├── Bookkeeper（日常记账）
└── TaxAdvisor（税务分析）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 财务报表模板（损益表/资产负债表/现金流）、发票模板、预算规划模板、税务日历 |
| **MCP Servers** | QuickBooks MCP (laf-rge/quickbooks-mcp) 或 Xero MCP (XeroAPI)、Stripe MCP、Google Sheets MCP |
| **Built-in Tools** | `memory: true`, `bash: true`（处理 CSV/Excel） |
| **Memory 策略** | 记住费用分类规则、税率、常用供应商信息、财务周期 |
| **Cron Jobs** | 每日：费用分类提醒；每月：月度财务汇总；每季：税务准备提醒 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| TaxHacker | vas3k/TaxHacker | 自托管 AI 记账（拍照→提取→分类→货币转换），专为自由职业者设计 |
| FinRobot | AI4Finance-Foundation/FinRobot (6.4k stars) | 金融 AI Agent 平台（研报、估值、风险评估） |
| Accounts AI | panaversity/accounts_ai | AI 会计副驾（OCR 发票、银行对账、现金流预测） |
| Financial Analyst Skill | alirezarezvani/claude-skills | DCF 建模、预算、预测 |
| Invoice Organizer Skill | ComposioHQ/awesome-claude-skills | 发票自动整理 |
| FRED Economic Data | K-Dense-AI/claude-scientific-skills | 80 万+经济时间序列 |
| Alpha Vantage | K-Dense-AI/claude-scientific-skills | 实时股票/外汇/加密数据 |
| QuickBooks Automation | ComposioHQ/awesome-claude-skills | 会计操作自动化 |
| Stripe Automation | ComposioHQ/awesome-claude-skills | 支付管理自动化 |
| SaaS Metrics Coach | alirezarezvani/claude-skills | ARR/MRR/LTV 等 SaaS 指标分析 |
| Financial Services Plugins | anthropics/financial-services-plugins | 官方金融插件（投行、PE、资管连接器） |

---

### Project 14: 法务合规 (Legal & Compliance)

**替代角色**：法律顾问 / 合规专员
**一句话**：合同审查、条款风险标注、合规检查。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **LegalAnalyst** | 法律分析师 | 合同逐条分析、风险标注、法规对照 |
| **LegalDrafter** | 法律撰写师 | 合同修改建议、条款起草、合规文档生成 |

#### Team 拓扑

```
LegalAnalyst (leader)
└── LegalDrafter（修改执行）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | 合同审查清单模板、风险等级评估模板、常见条款库（保密/竞业/知识产权/免责）、GDPR 合规检查模板 |
| **MCP Servers** | Brave Search MCP（法规查询）、Fetch MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住用户所在司法管辖区、行业特定法规、之前审查过的合同模式 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Contracts & Proposals Manager | alirezarezvani/claude-skills | 合同起草、提案撰写、谈判支持 |
| GDPR Compliance Officer | alirezarezvani/claude-skills | GDPR 合规评估 |
| ISO 27001 Security Specialist | alirezarezvani/claude-skills | 信息安全管理合规 |
| Risk Management Specialist | alirezarezvani/claude-skills | 风险评估框架 |
| AI Legal Agent Team | awesome-llm-apps | 多 Agent 法务团队参考 |

---

### Project 15: 数据分析 (Data Analytics)

**替代角色**：数据分析师
**一句话**：从原始数据到可视化洞察的全链路分析。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **DataEngineer** | 数据工程师 | 数据清洗、格式转换、数据集成 |
| **DataAnalyst** | 数据分析师 | 统计分析、趋势识别、可视化、业务洞察报告 |

#### Team 拓扑

```
DataAnalyst (leader)
└── DataEngineer（数据准备）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | EDA 模板、统计分析模板、可视化规范（图表类型选择指南）、业务洞察报告模板 |
| **MCP Servers** | Google Analytics MCP、Google Sheets MCP、Supabase MCP、PostgreSQL MCP |
| **Built-in Tools** | `memory: true`, `bash: true`（运行 Python 脚本处理数据） |
| **Memory 策略** | 记住数据源格式、常用分析维度、业务指标定义 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Exploratory Data Analysis | K-Dense-AI/claude-scientific-skills | pandas/NumPy 数据探索 |
| Statistical Analysis | K-Dense-AI/claude-scientific-skills | 假设检验、回归分析 |
| Scientific Visualization | K-Dense-AI/claude-scientific-skills | 出版级图表（matplotlib/seaborn/plotly） |
| XLSX Skill | ComposioHQ/awesome-claude-skills | 电子表格分析 |
| Analytics Specialist | alirezarezvani/claude-skills | 产品/业务分析 |
| Google Analytics MCP | googleanalytics/google-analytics-mcp | GA4 报告（200+ 维度和指标） |
| Google Ads MCP | google-marketing-solutions/google_ads_mcp | 广告数据分析 |
| Meta Ads MCP | pipeboard-co/meta-ads-mcp | Facebook/Instagram 广告分析 |
| Coupler.io MCP | coupler.io | 70+ 数据源统一接入 |

---

### Project 16: 产品管理 (Product Management)

**替代角色**：产品经理 / 项目经理
**一句话**：需求分析、PRD 撰写、路线图规划、项目进度跟踪。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **ProductManager** | 产品经理 | 需求分析、用户故事、PRD 撰写、路线图、优先级排序 |
| **ProjectTracker** | 项目跟踪 | 任务分解、进度跟踪、风险预警、状态报告 |

#### Team 拓扑

```
ProductManager (leader)
└── ProjectTracker（执行跟踪）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | PRD 模板、用户故事模板、路线图模板、OKR 模板、Sprint 计划模板、竞品功能对比模板 |
| **MCP Servers** | Linear MCP、Notion MCP、GitHub MCP |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住产品愿景、用户反馈主题、技术债务清单、竞品功能差异 |
| **Cron Jobs** | 每日：进度状态同步；每周：Sprint 回顾数据汇总 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| Product Manager Skills | deanpeters/Product-Manager-Skills (46 个) | 发现、PRD、路线图、用户故事、定位、验证实验 |
| Claude Task Master | eyaltoledano/claude-task-master | AI 驱动任务管理 |
| Agentic Project Management | sdi2200262/agentic-project-management | 真 PM 原则的 AI 工作流 |
| Agile Product Owner | alirezarezvani/claude-skills | 产品 Backlog 管理 |
| Scrum Master | alirezarezvani/claude-skills | 敏捷仪式促进 |
| Jira Specialist | alirezarezvani/claude-skills | Jira 操作 |
| Notion Automation | ComposioHQ/awesome-claude-skills | Notion 自动化 |
| Linear Skill | openai/skills | Linear 项目管理 |

---

### Project 17: 人才招聘 (Recruitment)

**替代角色**：HR / 猎头初筛
**一句话**：JD 撰写 → 简历筛选 → 面试设计 → 候选人评估。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **Recruiter** | 招聘专员 | JD 撰写、简历筛选、候选人排名 |
| **Interviewer** | 面试设计 | 面试问题设计、评估维度、反馈模板 |

#### Team 拓扑

```
Recruiter (leader)
└── Interviewer（面试评估）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | JD 模板（按岗位类型）、简历评分矩阵、面试问题库（行为/技术/情境）、Offer 模板 |
| **MCP Servers** | LinkedIn MCP（候选人搜索）、Gmail MCP（沟通）、Google Sheets MCP（候选人跟踪表） |
| **Built-in Tools** | `memory: true`, `browser: true` |
| **Memory 策略** | 记住公司文化、岗位要求演变、面试反馈模式 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| AI Recruitment Agent Team | awesome-llm-apps | 全链路招聘流水线（筛选→评估→面试准备） |
| AI Recruitment Agent (AutoGen) | Ancastal/AI-Recruitment-Agent | 简历筛选+候选人评估 |
| Candilyzer | awesome-ai-apps | GitHub/LinkedIn 候选人分析 |
| Resume Optimizer | awesome-ai-apps | AI 简历增强 |
| FoloUp | FoloUp/FoloUp | AI 语音面试 |
| Tailored Resume Generator | ComposioHQ/awesome-claude-skills | 简历生成 |

---

### Project 18: 学术科研 (Academic Research)

**替代角色**：科研助理 / 文献综述员
**一句话**：文献检索、论文分析、假设生成、实验设计、论文辅助撰写。

#### Agents

| Agent | 角色 | 说明 |
|-------|------|------|
| **ResearchPI** | 首席研究员 | 研究方向、假设生成、实验设计、论文结构 |
| **LiteratureReviewer** | 文献综述 | 文献检索、论文摘要、综述撰写、引用管理 |
| **DataScientist** | 数据科学家 | 数据分析、统计检验、结果可视化 |

#### Team 拓扑

```
ResearchPI (leader)
├── LiteratureReviewer（文献工作）
└── DataScientist（数据和实验）
```

#### 配置

| 配置项 | 详情 |
|--------|------|
| **Skills** | IMRAD 论文结构模板、文献综述模板、引用格式（APA/AMA/Vancouver）、CONSORT/STROBE/PRISMA 指南 |
| **MCP Servers** | Brave Search MCP、Fetch MCP |
| **Built-in Tools** | `memory: true`, `browser: true`, `bash: true`（运行分析脚本） |
| **Memory 策略** | 记住研究方向、已读论文列表和要点、关键发现和开放问题 |

#### 可复用资源

| 资源 | 来源 | 说明 |
|------|------|------|
| AI-Researcher | HKUDS/AI-Researcher (NeurIPS 2025 Spotlight) | 端到端科研（文献→假设→实验→论文） |
| Agent Laboratory | SamuelSchmidgall/AgentLaboratory | 三阶段研究（综述→实验→报告） |
| Claude Scientific Skills | K-Dense-AI/claude-scientific-skills (170+) | 最完整科研技能集 |
| ArXiv Database Skill | K-Dense-AI/claude-scientific-skills | arXiv 论文检索分析 |
| PubMed Database Skill | K-Dense-AI/claude-scientific-skills | 生物医学文献检索 |
| Scientific Writing Skill | K-Dense-AI/claude-scientific-skills | IMRAD 论文写作 |
| Literature Review Skill | K-Dense-AI/claude-scientific-skills | 系统文献综述 |
| Hypothesis Generation | K-Dense-AI/claude-scientific-skills | 结构化假设生成 |
| Statistical Analysis | K-Dense-AI/claude-scientific-skills | 统计分析 |
| Scientific Visualization | K-Dense-AI/claude-scientific-skills | 出版级科研图表 |

---

## 附录 A：MCP Server 完整参考清单

按类别整理的所有调研到的 MCP Server：

| 类别 | MCP Server | 来源/仓库 | 官方/社区 |
|------|-----------|----------|:---------:|
| **邮件** | Gmail | modelcontextprotocol/servers | 官方 |
| | AgentMail | agentmail-toolkit | 社区 |
| | Outlook | ComposioHQ | 社区 |
| **即时通讯** | Slack (Official) | slack-api/slack-mcp-server | 官方 |
| | Slack (No-Permission) | korotovsky/slack-mcp-server | 社区 |
| | Discord | barryyip0625/mcp-discord | 社区 |
| | Microsoft Teams | via Zapier MCP | 社区 |
| | Twilio (SMS/Voice) | twilio/mcp-server | 官方 |
| | Infobip | infobip MCP | 官方 |
| **日历** | Google Calendar | nspady/google-calendar-mcp | 社区 |
| | Calendly | universal-mcp/calendly | 社区 |
| | Cal.com | cal_dot_com_mcpserver | 社区 |
| **项目管理** | Notion | makenotion/notion-mcp-server | 官方 |
| | Linear | timottowitz/linear-mcp | 社区 |
| | Jira (Atlassian) | Atlassian MCP | 官方 |
| | Todoist | todoist-mcp-server | 官方 |
| | Asana | roychri/mcp-server-asana | 社区 |
| | ClickUp | mikah13/mcp-clickup | 社区 |
| | Trello | smithery-ai/mcpserver-trello | 社区 |
| **CRM** | HubSpot | developers.hubspot.com/mcp | 官方 |
| | Salesforce | developer.salesforce.com | 官方 |
| **社交媒体** | Twitter/X | taazkareem/twitter | 社区 |
| | LinkedIn | alinaqi/linkedin | 社区 |
| | Instagram Analytics | duhlink/instagram-analytics | 社区 |
| | Social Media Sync | social-media-sync | 社区 |
| | Multi-Platform (6) | @muhammadhamidraza/social-media-mcp-server | 社区 |
| **搜索** | Brave Search | brave/brave-search-mcp-server | 官方 |
| | Exa Search | exa-labs/exa-mcp-server | 官方 |
| | Tavily Search | tavily-search MCP | 官方 |
| | Omnisearch (多引擎) | spences10/mcp-omnisearch | 社区 |
| | Open WebSearch (免费) | Aas-ee/open-webSearch | 社区 |
| | Context7 (技术文档) | context7 MCP | 社区 |
| **网页抓取** | Firecrawl | firecrawl MCP | 官方 |
| | Playwright | microsoft/playwright MCP | 官方 |
| | Fetch | modelcontextprotocol/servers | 官方 |
| **文档存储** | Google Drive | modelcontextprotocol/servers | 官方 |
| | Google Sheets | xing5/mcp-google-sheets | 社区 |
| | Obsidian | cyanheads/obsidian-mcp-server | 社区 |
| | Dropbox | amgadabdelhafez/dbx-mcp-server | 社区 |
| | Dropbox (Official) | Dropbox MCP Remote | 官方 |
| | OneDrive | FlowHunt OneDrive | 社区 |
| **支付/会计** | Stripe | docs.stripe.com/mcp | 官方 |
| | QuickBooks | laf-rge/quickbooks-mcp | 社区 |
| | Xero | XeroAPI/xero-mcp-server | 官方 |
| **电商** | Shopify Storefront | shopify.dev/storefront-mcp | 官方 |
| | Shopify Dev | shopify.dev/devmcp | 官方 |
| | WooCommerce | techspawn/woocommerce-mcp-server | 社区 |
| **分析** | Google Analytics | googleanalytics/google-analytics-mcp | 官方 |
| | Google Ads | google-marketing-solutions/google_ads_mcp | 官方 |
| | Meta/Facebook Ads | pipeboard-co/meta-ads-mcp | 社区 |
| | BigQuery | Google Cloud BigQuery MCP | 官方 |
| | Datadog | docs.datadoghq.com/mcp_server | 官方 |
| | Coupler.io (70+源) | coupler.io/mcp | 官方 |
| **SEO** | Ahrefs | ahrefs.com | 官方 |
| | Semrush | semrush.com | 官方 |
| **设计** | Figma | help.figma.com | 官方 |
| | Canva Dev | canva.dev/docs/apps/mcp-server | 官方 |
| | Midjourney | AceDataCloud/MCPMidjourney | 社区 |
| **开发** | GitHub | github/github-mcp-server | 官方 |
| | GitLab | docs.gitlab.com | 官方 |
| | Git | modelcontextprotocol/servers | 官方 |
| | Vercel | vercel.com/docs/mcp | 官方 |
| | Cloudflare | cloudflare MCP | 官方 |
| | AWS | awslabs/mcp | 官方 |
| **数据库** | Supabase | supabase-community/supabase-mcp | 官方 |
| | PostgreSQL | modelcontextprotocol/servers | 官方 |
| | MySQL | benborla29/mcp-server-mysql | 社区 |
| | MongoDB | QuantGeekDev/mongo-mcp | 社区 |
| | Redis | redis/mcp-redis | 官方 |
| | Neo4j | neo4j/mcp | 官方 |
| | SQLite | modelcontextprotocol/servers | 官方 |
| **自动化** | Zapier | zapier.com/mcp | 官方 |
| | n8n | n8n.io | 官方 |
| **知识图谱** | Memory | modelcontextprotocol/servers | 官方 |

## 附录 B：Skills 来源仓库推荐排名

| 排名 | 仓库 | Skills 数 | 推荐场景 |
|:---:|------|:---------:|---------|
| 1 | alirezarezvani/claude-skills | 180+ | 全方位商务运营 |
| 2 | coreyhaines31/marketingskills | 32 | 营销/SEO/CRO |
| 3 | ComposioHQ/awesome-claude-skills | 149+78 | SaaS 自动化+文档处理 |
| 4 | K-Dense-AI/claude-scientific-skills | 170+ | 科研/金融/数据分析 |
| 5 | deanpeters/Product-Manager-Skills | 46 | 产品管理 |
| 6 | AgriciDaniel/claude-seo | 19 | SEO 专业 |
| 7 | Weizhena/Deep-Research-skills | 2+ | 深度调研 |
| 8 | better-i18n/skills | — | 翻译/国际化 |
| 9 | anthropics/financial-services-plugins | — | 机构级金融 |
| 10 | zubair-trabzada/ai-marketing-claude | 15 | AI 营销套件 |
| 11 | muratcankoylan/Agent-Skills-for-Context-Engineering | 5+ | 元技能（提升 Agent 能力） |

## 附录 C：现有 Agent 项目参考排名

按可复用性和成熟度排序：

| 排名 | 项目 | Stars | 类型 | 最适合复用到 |
|:---:|------|------:|------|------------|
| 1 | langchain-ai/open_deep_research | 10.8k | 单 Agent | 深度调研 |
| 2 | virattt/ai-hedge-fund | 8.7k | 多 Agent (7+) | 财务管理 |
| 3 | AI4Finance-Foundation/FinRobot | 6.4k | 多 Agent | 财务管理 |
| 4 | langchain-ai/social-media-agent | — | 多 Agent | 社媒运营 |
| 5 | vas3k/TaxHacker | — | 单 Agent | 财务管理 |
| 6 | kaymen99/sales-outreach-automation-langgraph | — | 多 Agent | 销售获客 |
| 7 | KlementMultiverse/ai-crm-agents | — | 多 Agent (6) | 销售获客 |
| 8 | kaymen99/langgraph-email-automation | — | 多 Agent (4) | 客户服务 |
| 9 | HKUDS/AI-Researcher | — | 多 Agent | 学术科研 |
| 10 | SkyworkAI/DeepResearchAgent | — | 多 Agent (分层) | 深度调研 |
| 11 | msitarzewski/agency-agents | 10k+ | 100+ 角色 | 全项目参考 |
| 12 | danielmiessler/Personal_AI_Infrastructure | — | 单 Agent (持久) | 智能秘书 |
| 13 | zubair-trabzada/ai-marketing-claude | 318 | Skills | 内容营销 |
| 14 | SamuelSchmidgall/AgentLaboratory | — | 多 Agent | 学术科研 |
| 15 | panaversity/accounts_ai | — | 单 Agent | 财务管理 |
