# AI Provider & Model Catalog

> 调研日期：2026-03-09
> 价格单位：**USD / 1M tokens**
> 标注 `*` 为估算值（基于汇率或第三方来源）
> 标注 `~` 为近似值（官方分层定价，取标准档）

---

## 目录

1. [已支持的原生 SDK Provider](#1-已支持的原生-sdk-provider)
2. [OpenAI Codex OAuth](#2-openai-codex-oauth)
3. [OpenAI-Compatible 兜底](#3-openai-compatible-兜底)
4. [横向对比速查](#4-横向对比速查)
5. [参考来源](#5-参考来源)

---

## 1. 已支持的原生 SDK Provider

项目当前通过 Vercel AI SDK 原生支持 9 个 provider（见 `packages/server/src/agent/model.ts`）。

### 1.1 Anthropic (`anthropic`)

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Claude Opus 4.6 | `claude-opus-4-6` | $5.00 | $25.00 | 200K (1M beta) | 旗舰；>200K input 2× 价 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | $3.00 | $15.00 | 200K | >200K: $6/$22.50 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | $1.00 | $5.00 | 200K | 性价比之选 |
| Claude 3.5 Haiku | `claude-3-5-haiku-20251022` | $0.25 | $1.25 | 200K | 上代轻量 |

**优惠**: Batch API 50% 折扣 · Prompt Caching 读取 = 10% input 价 · Extended Thinking 按 output 价计费

---

### 1.2 OpenAI (`openai`)

#### GPT-5 系列

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| GPT-5.2 Pro | `gpt-5.2-pro` | $21.00 | $168.00 | — | 极致推理 |
| GPT-5.2 | `gpt-5.2` | $1.75 | $14.00 | — | |
| GPT-5.1 | `gpt-5.1` | $1.25 | $10.00 | — | |
| GPT-5 | `gpt-5` | $1.25 | $10.00 | — | |
| GPT-5 Mini | `gpt-5-mini` | $0.25 | $2.00 | — | |
| GPT-5 Nano | `gpt-5-nano` | $0.05 | $0.40 | — | 极低成本 |

#### O 系列（推理）

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| o3-pro | `o3-pro` | $20.00 | $80.00 | — | |
| o3 | `o3` | $2.00 | $8.00 | 200K | |
| o4-mini | `o4-mini` | $1.10 | $4.40 | 200K | 轻量推理 |
| o3-mini | `o3-mini` | $1.10 | $4.40 | 200K | |
| o1 | `o1` | $15.00 | $60.00 | 200K | 上代推理 |
| o1-pro | `o1-pro` | $150.00 | $600.00 | — | |

#### GPT-4 系列（上代）

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| GPT-4.1 | `gpt-4.1` | $2.00 | $8.00 | 1M | 最强非推理（上代） |
| GPT-4.1 Mini | `gpt-4.1-mini` | $0.40 | $1.60 | 1M | |
| GPT-4.1 Nano | `gpt-4.1-nano` | $0.10 | $0.40 | 1M | |
| GPT-4o | `gpt-4o` | $2.50 | $10.00 | 128K | |
| GPT-4o Mini | `gpt-4o-mini` | $0.15 | $0.60 | 128K | 超低成本 |

> **注意**: O 系列的 reasoning tokens 按 output 价计费但不可见，实际成本可能远高于预期。

---

### 1.3 Google (`google`)

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | ~$2.00 / $4.00 | ~$12.00 / $18.00 | — | ≤200K / >200K |
| Gemini 3 Flash | `gemini-3-flash-preview` | $0.50 | $3.00 | — | |
| Gemini 2.5 Pro | `gemini-2.5-pro` | ~$1.25 / $2.50 | ~$10.00 / $15.00 | 1M | ≤200K / >200K |
| Gemini 2.5 Flash | `gemini-2.5-flash` | $0.30 | $2.50 | 1M | 推荐性价比 |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | $0.10 | $0.40 | — | |
| Gemini 2.0 Flash | `gemini-2.0-flash` | $0.10 | $0.40 | 1M | |
| Gemini 2.0 Flash-Lite | `gemini-2.0-flash-lite` | $0.075 | $0.30 | — | 最便宜 |

**优惠**: 免费额度（业界最佳）· Batch API 50% 折扣 · Context Caching 读取 = 10% input 价

---

### 1.4 DeepSeek (`deepseek`)

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| DeepSeek V3.2 Chat | `deepseek-chat` | $0.28 | $0.42 | 128K | Cache hit: $0.028 |
| DeepSeek V3.2 Reasoner | `deepseek-reasoner` | $0.28 | $0.42 | 128K | Cache hit: $0.028 |
| ~~DeepSeek R1~~ | ~~`deepseek-r1`~~ | ~~$0.55~~ | ~~$2.19~~ | — | 已废弃，合并入 V3.2 |

**优惠**: Cache hit 90% 折扣 · 非高峰时段 (16:30–00:30 GMT) 最高 75% 折扣

---

### 1.5 xAI / Grok (`xai`)

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Grok 4 | `grok-4` | $3.00 | $15.00 | 256K | 推理模型 |
| Grok 4.1 Fast | `grok-4.1-fast` | $0.20 | $0.50 | 2M | 超低价 + 超大窗口 |
| Grok 4 Fast | `grok-4-fast` | $0.20 | $0.50 | 2M | |
| Grok 3 | `grok-3` | $3.00 | $15.00 | 131K | 上代 |
| Grok 3 Mini | `grok-3-mini` | — | — | — | 上代 |

**注意**: Grok 4.2 公测中 · 免费额度 $175/月 · Tool 调用额外 $2.50–$5.00/千次

---

### 1.6 Groq (`groq`) — 推理加速平台

Groq 是推理加速平台（LPU 芯片），托管开源模型，以极速推理为核心卖点。

| Model | Model ID | Input | Output | Context | 速度 |
|-------|----------|-------|--------|---------|------|
| GPT-OSS 120B | `openai/gpt-oss-120b` | $0.15 | $0.60 | 131K | ~500 tps |
| GPT-OSS 20B | `openai/gpt-oss-20b` | $0.075 | $0.30 | 131K | ~1000 tps |
| Llama 3.3 70B | `llama-3.3-70b-versatile` | $0.59 | $0.79 | 131K | ~280 tps |
| Llama 3.1 8B | `llama-3.1-8b-instant` | $0.05 | $0.08 | 131K | ~560 tps |
| Qwen3 32B | — (preview) | ~$0.20* | ~$0.60* | — | Preview |
| Kimi K2 | — (preview) | — | — | — | Preview |

**优惠**: Batch API 50% 折扣

---

### 1.7 Mistral (`mistral`)

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Mistral Large 3 | `mistral-large-latest` | $2.00 | $6.00 | 131K | 旗舰 |
| Mistral Medium 3 | `mistral-medium-latest` | ~$1.00* | ~$3.00* | 131K | |
| Mistral Small 3 | `mistral-small-latest` | $0.20 | $0.60 | — | |
| Devstral 2 | `devstral-2` | $0.50 | $1.50 | — | 代码模型 |
| Ministral 14B | `ministral-14b` | $0.15 | $0.15 | — | |
| Ministral 8B | `ministral-8b` | $0.10 | $0.10 | — | 最便宜 |

**优惠**: 免费开发者 tier

---

### 1.8 Moonshot / Kimi (`moonshot`)

SDK: `@ai-sdk/moonshotai`

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Kimi K2.5 | `kimi-k2.5` | $0.60 | $3.00 | 256K | 最新旗舰 |
| Kimi K2 Thinking | `kimi-k2-thinking` | $0.60 | $2.50 | — | 推理 |
| Kimi K2 0905 | `kimi-k2-0905-preview` | $0.60 | $2.50 | — | |
| Moonshot V1 8K | `moonshot-v1-8k` | $0.20 | $2.00 | 8K | 上代 |
| Moonshot V1 32K | `moonshot-v1-32k` | $1.00 | $3.00 | 32K | 上代 |
| Moonshot V1 128K | `moonshot-v1-128k` | $2.00 | $5.00 | 128K | 上代 |

**优惠**: Cache hit $0.15/M（75% 折扣），自动缓存无需配置

---

### 1.9 Alibaba / Qwen (`alibaba`)

SDK: `@ai-sdk/alibaba`

| Model | Model ID | Input | Output | Context | 备注 |
|-------|----------|-------|--------|---------|------|
| Qwen3.5 Plus | `qwen3.5-plus` | ~$0.12* | ~$0.48* | — | 最新，极低价 |
| Qwen3 Max | `qwen3-max` | ~$0.46* | ~$1.84* | 262K | 降价后 |
| Qwen Plus | `qwen-plus` | ~$0.40* | ~$1.20* | — | |
| Qwen Turbo | `qwen-turbo` | ~$0.065* | ~$0.26* | — | 即将停更，推荐 Flash |

> **注意**: 原价为人民币，已按汇率估算。Batch 50% 折扣。区域限制较多。

---

## 2. OpenAI Codex OAuth

通过 ChatGPT OAuth 认证，走 ChatGPT 后端 API（`https://chatgpt.com/backend-api`），费用包含在 ChatGPT 订阅中。

项目中已实现 OAuth Device Code Flow（见 `packages/server/src/agent/model.ts` OAuth 路径）。

### 2.1 认证方式

| 方式 | 认证 | 计费 | sdkType |
|------|------|------|---------|
| **OAuth (ChatGPT 订阅)** | OAuth → access token | 含在订阅中 (credits) | `openai` (走 `.responses()`) |
| **API Key** | `sk-...` | 按 token 计费（见 1.2 节） | `openai` |

OAuth 路径使用 `createOpenAI({ apiKey: accessToken, baseURL: oauthConfig.apiBaseUrl }).responses(model)`。

### 2.2 ChatGPT 订阅计划

| Plan | 月费 | Codex 模型访问 |
|------|------|----------------|
| Plus | $20/月 | GPT-5.4, GPT-5.1-Codex-Mini |
| Pro | $200/月 | 全部模型（含 GPT-5.3-Codex-Spark） |
| Business | $30/seat/月 | GPT-5.4, GPT-5.3-Codex |
| Enterprise | 联系销售 | 全部 |

### 2.3 Codex 可用模型

| Model | Model ID | API 价格 Input | API 价格 Output | Credits/msg | 状态 |
|-------|----------|---------------|-----------------|-------------|------|
| **GPT-5.4** | `gpt-5.4` | — | — | ~7 | **推荐默认** |
| **GPT-5.3 Codex** | `gpt-5.3-codex` | $1.75 | $14.00 | ~5 | 最强代码 |
| GPT-5.3 Codex Spark | `gpt-5.3-codex-spark` | — | — | — | 仅 Pro，Research Preview |
| GPT-5.2 Codex | `gpt-5.2-codex` | $1.75 | $14.00 | — | 被 5.3 接替 |
| GPT-5.2 | `gpt-5.2` | $1.75 | $14.00 | — | |
| GPT-5.1 Codex Max | `gpt-5.1-codex-max` | $1.25 | $10.00 | — | 超长任务优化 |
| GPT-5.1 Codex | `gpt-5.1-codex` | $1.25 | $10.00 | — | |
| **GPT-5.1 Codex Mini** | `gpt-5.1-codex-mini` | $0.25 | $2.00 | ~1 | 性价比之选，4× 用量 |
| GPT-5 Codex | `gpt-5-codex` | $1.25 | $10.00 | — | |
| GPT-5 | `gpt-5` | $1.25 | $10.00 | — | |
| GPT-5 Mini | `gpt-5-mini` | $0.25 | $2.00 | — | |

> Codex 模型与标准模型同价，只是 coding 特化训练。OAuth 方式按 credits 扣减。

### 2.4 moltbot 参考实现

moltbot（OpenClaw）的 Codex OAuth 实现要点（供参考）：

- **OAuth 库**: `@mariozechner/pi-ai/oauth` 中的 `loginOpenAICodex()`
- **Base URL**: `https://chatgpt.com/backend-api`
- **API 类型**: `openai-codex-responses`（自定义类型，区别于标准 `openai-responses`）
- **默认模型**: `openai-codex/gpt-5.4`
- **模型发现**: 动态（通过 `ModelRegistry`，models 列表为空）
- **Token 刷新**: 使用 file lock 防并发，支持子 agent 继承主 agent credentials
- **Account ID**: 支持 `ChatGPT-Account-Id` header（team/enterprise 场景）

---

## 3. OpenAI-Compatible 兜底

任何兼容 OpenAI Chat Completions API 的平台均可通过 `openai-compatible` sdkType 接入。

| Platform | 特点 | Base URL | 代表模型 | 参考价格 Input/Output |
|----------|------|----------|---------|----------------------|
| **Together AI** | 200+ 开源模型 | `https://api.together.xyz/v1` | Llama, Qwen, Mixtral | $0.05–$2.80/M |
| **Fireworks AI** | 极速推理 | `https://api.fireworks.ai/inference/v1` | Llama, Mixtral | — |
| **OpenRouter** | 路由聚合 | `https://openrouter.ai/api/v1` | 全部主流模型 | 各模型不同 |
| **Perplexity** | 搜索增强 | `https://api.perplexity.ai` | Sonar | $1.00/$1.00 |
| **Cohere** | 企业级 RAG | `https://api.cohere.ai/v2` | Command R+ | $2.50/$10.00 |
| **Azure OpenAI** | 企业合规 | 自定义 | 同 OpenAI 定价 | 同 OpenAI |
| **Amazon Bedrock** | AWS 生态 | 自定义 | Claude, Llama, Nova | 各模型不同 |
| **DeepInfra** | 开源托管 | `https://api.deepinfra.com/v1/openai` | Qwen, Llama | $0.03–$0.35/M |
| **Ollama / LM Studio** | 本地免费 | `http://localhost:11434/v1` | 任何 GGUF | 免费 |
| **GitHub Copilot** | GitHub 生态 | 动态获取 | GPT-4o, Claude | 含在 Copilot 订阅中 |
| **Cloudflare AI Gateway** | 边缘推理 | 自定义 | Workers AI 模型 | — |
| **LiteLLM** | 统一网关 | 自定义 | 100+ providers | 透传 |

### 中国区特色 Provider（moltbot 参考）

以下 provider 在 moltbot 中已有实现，可作为后续扩展参考：

| Platform | Base URL | 代表模型 | 备注 |
|----------|----------|---------|------|
| **MiniMax** | `https://api.minimax.io/anthropic` | MiniMax-M2.5 | Anthropic 兼容 |
| **Xiaomi MiMo** | `https://api.xiaomimimo.com/anthropic` | mimo-v2-flash | Anthropic 兼容，免费 |
| **Volcengine (火山引擎)** | 自定义 | 豆包系列 | 字节跳动 |
| **BytePlus** | 自定义 | 豆包国际版 | 字节跳动海外 |
| **Qianfan (千帆)** | `https://qianfan.baidubce.com/v2` | DeepSeek V3.2, ERNIE 5.0 | 百度 |
| **Z.AI (智谱)** | `https://api.z.ai` | GLM 系列 | |
| **Qwen Portal** | `https://portal.qwen.ai/v1` | Qwen Coder | OAuth 方式 |
| **Kimi Coding** | `https://api.kimi.com/coding/` | k2p5 | 订阅制 |

---

## 4. 横向对比速查

### 按定位（Input/Output $/M）

| 定位 | 最便宜 | 中档 | 高端 |
|------|--------|------|------|
| **超低成本** | GPT-5 Nano $0.05/$0.40 | Gemini 2.0 Flash-Lite $0.075/$0.30 | Ministral 8B $0.10/$0.10 |
| **轻量** | GPT-4o Mini $0.15/$0.60 | Grok 4.1 Fast $0.20/$0.50 | DeepSeek V3.2 $0.28/$0.42 |
| **均衡** | Gemini 2.5 Flash $0.30/$2.50 | Kimi K2.5 $0.60/$3.00 | Claude Haiku 4.5 $1.00/$5.00 |
| **高性能** | GPT-5 $1.25/$10.00 | Gemini 2.5 Pro ~$1.25/$10.00 | GPT-4.1 $2.00/$8.00 |
| **旗舰** | Claude Sonnet 4.6 $3.00/$15.00 | Claude Opus 4.6 $5.00/$25.00 | GPT-5.2 $1.75/$14.00 |
| **极致推理** | o3 $2.00/$8.00 | o3-pro $20.00/$80.00 | GPT-5.2 Pro $21.00/$168.00 |

### 按场景推荐

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 日常对话 / 简单任务 | GPT-4o Mini, Gemini 2.0 Flash | 极低成本，响应快 |
| 代码生成 | GPT-5.3 Codex, Claude Sonnet 4.6 | 代码专长 |
| 复杂推理 | Claude Opus 4.6, o3 | 最强推理能力 |
| 长文档处理 | Gemini 2.5 Pro (1M), Grok 4.1 Fast (2M) | 超大上下文 |
| 成本敏感 | DeepSeek V3.2, Qwen3.5 Plus | 极低价格 |
| 高速推理 | Groq (LPU), Grok 4.1 Fast | 超低延迟 |
| 中国区用户 | Qwen, Kimi, DeepSeek, MiniMax | 国内直连 |

---

## 5. 参考来源

- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI Pricing](https://openai.com/api/pricing/)
- [OpenAI Codex Models](https://developers.openai.com/codex/models/)
- [OpenAI Codex Pricing](https://developers.openai.com/codex/pricing/)
- [Google Gemini Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [DeepSeek Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [xAI Models and Pricing](https://docs.x.ai/developers/models)
- [Groq Pricing](https://groq.com/pricing)
- [GroqCloud Models](https://console.groq.com/docs/models)
- [Mistral Pricing](https://mistral.ai/pricing)
- [Moonshot/Kimi Pricing](https://platform.moonshot.ai/docs/pricing/chat)
- [Alibaba Qwen Pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- [TLDL LLM Pricing Comparison](https://www.tldl.io/resources/llm-api-pricing-2026)
- [PricePerToken](https://pricepertoken.com/)
