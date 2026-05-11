# 项目需求与考量维度整理

来源：本轮关于本地桌面 AI Agent Run Loop 客户端的完整对话  
范围：只整理用户提到的背景、要求、问题、边界、考量维度和讨论方向  
说明：本文不记录方案结论，不记录问题答案，不作为最终技术选型决议

## 1. 项目背景

用户想构建一个运行在用户电脑端的本地桌面 AI Agent Run Loop 客户端。

背景信息：

- Agent 在用户本机运行。
- 数据存储也在用户本机。
- 需要支持本地工具、本地 Shell、本地浏览器、本地模型能力、本地 CLI 订阅能力。
- 未来可能有官网、云端长运行 Agent 或其他云服务。
- 本地桌面客户端是核心产品形态。
- 技术选型需要服务未来完整产品，而不是 demo 或临时方案。

## 2. 总体产品要求

用户明确提到希望支持：

- AI Agent Run Loop。
- Streaming response。
- MCP。
- Skills。
- Agent tool call。
- 本地执行 Shell。
- Shell 超时命令。
- 本地数据持久化。
- 多模型 Provider 切换。
- 尽量兼容市面上的模型。
- OAuth Provider。
- 通过本地 CLI 工具调用 AI 能力。
- 浏览器插件和本地程序通信。
- 多 Chrome Profile 下的浏览器操作。
- 未来可能的云端长运行 Agent。

## 3. 技术栈候选和取舍要求

用户明确提到或要求评估的技术包括：

- Tauri。
- Electron。
- Node.js。
- AI SDK。
- OpenAI Agents SDK。
- React UI。
- Vite。
- Hono。
- Rust。
- SQLite。
- better-sqlite3。
- OS secure storage / keychain。
- Next.js。
- Vercel。
- Cloudflare。
- Fly.io。
- Browser Extension。
- Native Messaging。
- WebSocket。
- Claude Code CLI。
- Codex CLI。

用户要求技术栈分析时说明：

- 哪些技术是必须的。
- 哪些技术不是必须但更优。
- 是哪个组件或需求导致某个技术更合适。
- 如果前后方案变化，要说明为什么变化。
- 可以坚持原观点，也可以切换观点，但必须说明理由。
- 不能只给结论。
- 需要解释选型背后的约束和驱动因素。

## 4. 本地数据和持久化要求

用户关心的问题包括：

- 本地数据应该用什么存储。
- OpenAI SDK / OpenAI Agents SDK 是否本身有持久化层。
- 是否还需要自己把数据传到 Rust 层持久化。
- 数据传到 Rust 层是否冗余或浪费。
- UI、SDK、Sidecar、DB 之间的数据流如何走。
- Streaming、tool call、消息、run state 如何持久化。
- 数据和密钥应该如何区分存储。
- Secure storage 是否跨 macOS / Windows / Linux 可用。
- better-sqlite3 是 native addon，打包到 macOS / Linux / Windows 是否有难度。

持久化考量维度：

- 数据是否本地优先。
- 数据库是否由桌面壳、Rust 层、Node Sidecar 或 SDK 管理。
- Provider 侧状态和本地状态如何区分。
- Streaming 过程中如何同时返回 UI 和落库。
- 密钥和普通业务数据是否分离。
- 跨平台打包复杂度。

## 5. UI 和 Runtime 通信要求

用户要求梳理：

- OpenAI SDK / OpenAI Agents SDK 到底运行在哪里。
- UI 如何和 SDK 通信。
- UI 是否通过 HTTP 请求 Sidecar。
- Sidecar 里的 SDK 是否可以直接返回 streaming。
- 是否有必要为了 streaming 改架构。
- UI、Sidecar、SDK、DB 的完整流程是什么。
- 本地 API 是否需要 Hono。
- Hono 是不是一开始就在方案里。
- Hono 到底是否必要，还是只是更优。

通信考量维度：

- UI 到 Runtime 的调用边界。
- Runtime 到 DB 的持久化边界。
- Streaming response 的传输方式。
- 本地 API 是否需要独立框架。
- 浏览器插件是否复用同一通信层。
- Sidecar 是否是统一 Runtime 入口。

## 6. Streaming 相关要求

用户明确关心：

- 整体方案是否支持 streaming response。
- 如果 UI 请求 HTTP，Sidecar 里的 SDK 直接返回 streaming 是否更好。
- 是否为了 streaming 需要调整架构。
- Streaming 时 DB 持久化如何处理。
- Streaming 和 UI 通信、Sidecar、SDK、DB 的关系如何设计。

Streaming 考量维度：

- UI 是否直接接收 SDK stream。
- Sidecar 是否负责 stream 转换和落库。
- Streaming event 如何结构化。
- Tool call / tool result 是否也进入 stream。
- Streaming 和最终持久化状态是否一致。

## 7. Provider 和模型兼容要求

用户提出的模型兼容范围包括：

- OpenAI。
- Anthropic。
- Google。
- Qwen / 通义千问。
- Kimi。
- MiniMax。
- GLM。
- 小模型。
- 本地模型。
- 其他尽量兼容市面上所有模型的 Provider。

用户要求考虑：

- 是否市面上大多数模型都有 OpenAI-compatible 模式。
- 是否需要验证 OpenAI-compatible 覆盖情况。
- 是否可以基于 OpenAI-compatible 来统一。
- 是否可以使用 OpenAI Agents SDK 来兼容这些模型。
- 是否需要 AI SDK 再包一层。
- AI SDK 本身有兼容性，再适配到 OpenAI Agents SDK 是否会多一层不必要复杂度。
- 是否存在意料之外的兼容问题。
- 是否有其他兼容方案，例如直接配置 API base URL。
- 是否应忽略很多 Provider 特有差异，只保留核心 AI 能力。
- 不希望为了每家模型的特殊差异去适配 UI 和存储。

Provider 兼容考量维度：

- OpenAI-compatible 兼容范围。
- Chat Completions 和 Responses 兼容差异。
- AI SDK adapter 的额外层级。
- 直接 baseURL 的可行性。
- Provider 特性是否应进入一等 UI / DB。
- Tool calling 能力差异。
- Streaming 差异。
- OAuth Provider 差异。
- 小模型能力边界。

## 8. OpenAI Agents SDK / AI SDK 相关要求

用户多次要求分析：

- AI SDK 和 OpenAI Agents SDK 应该如何选择。
- OpenAI Agents SDK 能替代 AI SDK 的哪些部分。
- 使用 OpenAI Agents SDK 是否只是为了方便。
- 是否有必要为了方便切换到 OpenAI Agents SDK。
- OpenAI Agents SDK 是否符合未来项目功能设想。
- OpenAI Agents SDK 的兼容层是不是 extension 集成的。
- OpenAI Agents SDK 推荐的兼容方案有几种。
- 是否直接就是 AI SDK。
- 是否还有直接 baseURL / OpenAI-compatible 路径。
- 是否应该检查 OpenAI Agents SDK 源码。
- 基于本地 OpenAI Agents SDK TS 源码判断其能力和边界。

用户提供的本地源码路径：

```text
/Users/cai/Documents/Codex/2026-05-10/openai-agent-sdk-harness-ts-python/openai-agents-js
```

SDK 考量维度：

- Run Loop 能力。
- Tool call 能力。
- Streaming 能力。
- Provider 兼容层。
- AI SDK adapter 层级。
- baseURL 兼容路径。
- MCP / Skills / Shell / Computer 工具抽象。
- 是否会带来额外兼容问题。
- 是否适合未来产品边界。

## 9. CLI Agent 能力要求

用户明确提到要支持：

- Spawn shell 运行 Claude Code CLI。
- Spawn shell 运行 Codex CLI。
- 利用用户本地 subscription 客户端的模型能力。
- 把这些 CLI 工具作为 AI 能力来源。
- 支持本地命令执行。
- 支持命令超时。
- 支持后续可能的其他 CLI Agent。

用户表达的边界：

- CLI 支持和多模型 Provider 支持一样，都是为了提供 AI 能力。
- 不是真的要支持每个工具 / 模型的所有差异细节。

CLI Agent 考量维度：

- 是否作为 AI Backend。
- 是否和普通 Shell Tool 区分。
- 本地订阅能力如何复用。
- stdout / stderr streaming。
- timeout。
- cancellation。
- cwd。
- env。
- process lifecycle。
- auth / subscription 状态。

## 10. 浏览器插件要求

用户提出的浏览器侧能力包括：

- 有一个浏览器插件和本地程序通信。
- 通信方式考虑 Native Messaging 或 WebSocket。
- 插件提供 profile / click / scroll 等操作方法。
- 如果用户电脑上有多个 Chrome、不同 Profile，可以自由选择在哪个 Profile 上执行。
- 倾向插件形式，是为了真实使用用户的浏览器 Profile。
- 插件需要和本地桌面程序配合。
- 浏览器操作也是 Agent 工具能力的一部分。

浏览器插件考量维度：

- Native Messaging。
- WebSocket。
- 多 Chrome。
- 多 Profile。
- 用户选择 Profile。
- click / scroll / page context 等操作。
- 插件和本地程序之间的认证。
- 浏览器工具调用权限。
- 浏览器数据是否发送给模型。

## 11. 桌面端和 Tauri / Electron 要求

用户明确表达：

- 想用 Tauri。
- Electron 本身也会用 Sidecar 启动。
- Electron 甚至会启动一个不一样版本的 Node.js。
- 如果业务能力主要在 Node Sidecar 里，Electron 好像没有用上太多。
- 希望判断 Tauri 是否更合适。
- 如果不用 Tauri，要解释为什么。
- 如果用 Tauri，也要说明它承担什么职责。

桌面端考量维度：

- 桌面壳职责。
- Sidecar 启动和管理。
- Node Runtime 数量。
- Rust 原生能力。
- Secure storage。
- Native messaging registration。
- Updater。
- 跨平台打包。
- Electron 和 Tauri 的边界差异。

## 12. Hono 相关要求

用户专门追问：

- Hono 是否需要。
- 最开始方案里是不是没有 Hono。
- 如果后面加 Hono，为什么。
- Hono 是必须还是更优。
- 哪些需求导致 Hono 变得更合适。

Hono 考量维度：

- 本地 HTTP API。
- UI 到 Sidecar 通信。
- Streaming route。
- Browser extension route。
- Provider test API。
- MCP 管理 API。
- Tool approval API。
- 未来云端复用可能。

## 13. 跨平台要求

用户希望尽量支持：

- macOS。
- Windows。
- Linux。

用户特别关心：

- 当前方案跨平台难度大不大。
- better-sqlite3 这种 native addon 对跨平台打包是否困难。
- Secure storage / keychain 是否三平台兼容。
- Shell 执行、命令超时、CLI spawn 在不同平台是否需要考虑。
- Tauri 方案在跨平台上的可行性。

跨平台考量维度：

- Tauri 打包。
- Node Sidecar 打包。
- Native addon。
- SQLite driver。
- OS secure storage。
- Shell timeout。
- Process tree kill。
- PTY。
- Native Messaging host registration。
- 安装包真实验证。

## 14. 官网和云端服务要求

用户提到未来可能包括：

- 官网使用 Next.js。
- 官网部署到 Vercel。
- 也考虑 Cloudflare。
- 云端长运行 Agent。
- 其他云端服务。
- 云端服务考虑过 Fly.io。

云端和官网考量维度：

- 官网和桌面客户端的关系。
- 下载 / 文档 / 账号 / 价格入口。
- 云端长运行 Agent。
- 本地 Run 与 Cloud Run 的边界。
- 云端能力是否可选。
- 未来扩展是否影响当前本地架构。

## 15. 业务和产品边界要求

用户表达的产品边界包括：

- 核心不是做一个普通聊天壳。
- 核心是本地桌面 Agent Run Loop 客户端。
- 多 Provider、多 CLI、多工具支持，都是为了提供 AI 能力。
- 不要陷入适配所有 Provider 特殊差异。
- 差异如果不必要，就忽略。
- 不希望 UI 和存储被 Provider 特性牵着走。
- 需要综合整理新项目确定了哪些信息，包括架构、功能边界等。

业务考量维度：

- 产品是否只是聊天壳。
- 用户为什么需要本地桌面 Agent。
- 多模型能力是否服务核心场景。
- CLI subscription 能力是否能带来差异。
- 浏览器 Profile 是否是关键场景。
- 本地数据和执行是否是定位核心。
- 是否避免成为 Provider 适配平台。

## 16. 本地项目和源码检查要求

用户提出过：

- 看本地 GitHub `golemancy` 项目。
- 基于现有项目看是否需要技术方案调整。
- 尤其关注 AI SDK 的细节部分。
- 查看本地下载的 OpenAI Agents SDK TS 源码。
- 基于源码分析 OpenAI Agents SDK 有哪些省事的地方。
- 判断 OpenAI Agents SDK 是否有必要替代 AI SDK 或作为补充。

源码检查考量维度：

- 当前项目现状。
- AI SDK 使用细节。
- OpenAI Agents SDK 源码能力。
- Runtime / Provider / Streaming / Tool call 的真实接口。
- 是否和未来产品需求匹配。

## 17. 文档沉淀要求

用户要求过：

- 把对话中可沉淀的部分整理到一个 Markdown 文件。
- 包括各种约束条件、边界约束、需求、场景、业务等。
- 再整理一份中文的。
- 当前这次要求：把“所有要求”写入 Markdown 文件。

用户对本次整理的要求：

- 是所有对话中用户提过的要求。
- 带上背景信息。
- 带上要求。
- 带上考量角度 / 维度。
- 只要用户提到的，或者对话中讨论过的方向。
- 不要方向的结果。
- 不要问题的答案。

## 18. 回答方式要求

用户多次表达的回答风格要求包括：

- 可以坚持观点，也可以切换观点，但必须说明理由。
- 要讲清楚为什么。
- 要说明技术选型背后的组件驱动因素。
- 不要只给结论。
- 不要把方向结果当成需求本身。
- 需要综合视角。
- 需要覆盖未来项目设想。
- 矛盾点可以由助手抉择，但要解释取舍。
- 对不确定点要说明是否需要验证。

## 19. 需求整理边界

本文只整理：

- 用户提到的背景。
- 用户提到的需求。
- 用户提出的问题。
- 用户关心的边界。
- 用户要求考虑的技术方向。
- 对话中出现过的考量维度。

本文不整理：

- 最终技术结论。
- 方案答案。
- 推荐架构。
- 已抉择的技术结果。
- 对某个技术的最终评价。
