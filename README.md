# Golemancy

Golemancy 是一个本地优先 AI 工作台，用于把零散的 AI 生成能力组织成可控、可持久化、可审计、可交付的生产流程。

它不是普通聊天壳，也不是云端 AI 套壳。当前产品主形态是桌面客户端：在用户自己的电脑上，把模型、工具、浏览器 Profile、Shell、MCP、Skills、本地文件、本地数据和 CLI Agent 组织进一个 Agent Run Loop。

面向用户时，Golemancy 是帮助交付结果的工作台：官网、PPT、视频、文案、调研、决策材料和定制工作流。面向工程实现时，Golemancy 是本地桌面 Agent Runtime，需要稳定的状态持久化、工具执行、审批、日志和清晰的本地/云端边界。

## Product Direction

- 本地优先：数据和执行默认留在用户电脑上。
- 生产级优先：不把 demo、mock、临时页面当主产品路径。
- Provider 中立：UI、DB 和事件模型不绑定某一家模型 Provider 的特殊结构。
- 执行可控：Shell、Browser、文件系统、MCP、Skills、CLI Agent 都必须有权限、超时、取消、审批、日志和可见结果。
- 交付物导向：Chat 只是交互方式之一，产品对象应围绕 Project、Workflow、Run、Tool、Trust State 和 Deliverable 展开。

## Architecture Boundary

- Tauri 负责桌面壳、窗口生命周期、打包、更新、Sidecar 启动、OS Secure Storage Bridge 和原生系统集成。
- Node Sidecar 负责本地 API、Agent Run Loop、Provider 调用、工具编排、SQLite、Run Event、Browser Bridge、MCP、Skills、Shell 和 CLI Agent Runtime。
- SQLite 是本地业务状态的 canonical state。
- OS Secure Storage 保存 API Key、OAuth Token、Local Bridge Token 等敏感凭证。
- 云端能力是后续增强层，不是本地桌面客户端的强依赖。

## Technical Baseline

| Area | Decision |
| --- | --- |
| Desktop shell | Tauri |
| Desktop UI | React + Vite |
| Local runtime | Node.js Sidecar |
| Local API | Hono |
| Local database | SQLite / `node:sqlite` |
| Secrets | OS Secure Storage via Tauri/Rust |
| Streaming | SSE, WebSocket where needed |
| Agent runtime | OpenAI Agents SDK as one runtime engine |
| Provider strategy | OpenAI-compatible `baseURL` first, AI SDK adapter as secondary path |
| Browser control | MV3 Extension + Native Messaging Bridge |
| i18n | Lingui |

## Documents

Core references:

- `_docs/ui-designer-handoff.zh.md`：产品、UI、信息架构、设计重点和验收标准摘要。
- `_docs/local-desktop-agent-product-architecture.zh.md`：本地桌面 Agent Runtime 的产品与架构基线。
- `_decisions/desktop-technical-decisions.md`：桌面端技术栈、运行边界和真实产品路径决策。
- `_gtm/brand-narrative.zh.md`：对外定位、品牌叙事、目标用户和商业包装。

Additional references:

- `_docs/all-user-requirements-structured.zh.md`：需求、边界和考量维度整理。
- `_decisions/cloud-technical-decisions.md`：官网、账号、计费、Hosted API、Gateway 和云端服务边界。
- `_gtm/product-growth-considerations.zh.md`：GTM、定价、发布、内容、客服和增长检查清单。
- `_decisions/release-compatibility-considerations.zh.md`：0.2+ 发布兼容策略待确认事项。
- `_docs/design/golemancy-rebuild-v0-2/`：桌面 UI 设计交接包和原型。
