# AI 模型上下文窗口与定价调研

> 调研日期：2026-02-19
> 目的：为自动 Compact 功能提供数据支撑，确定各 Provider/Model 的上下文限制与阶梯计费情况

## 项目支持的 Provider

来源：`packages/shared/src/types/settings.ts` — `ProviderSdkType`

| # | Provider SDK | 说明 |
|---|---|---|
| 1 | `anthropic` | Anthropic Claude |
| 2 | `openai` | OpenAI GPT / o-series |
| 3 | `google` | Google Gemini |
| 4 | `deepseek` | DeepSeek |
| 5 | `xai` | xAI Grok |
| 6 | `groq` | Groq (推理加速平台) |
| 7 | `mistral` | Mistral AI |
| 8 | `moonshot` | Moonshot AI (Kimi) |
| 9 | `alibaba` | Alibaba Qwen (通义千问) |
| 10 | `openai-compatible` | OpenAI 兼容接口 (Ollama 等) |

---

## 综合调研表

> 价格单位：USD / 百万 tokens (MTok)
> 仅收录当前主流模型，已废弃模型略过
> "阶梯计费"列：标注价格跳变的 token 阈值

### 1. Anthropic Claude

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| claude-opus-4-6 | 200K (1M beta) | 128K | $5.00 | $25.00 | >200K: input×2, output×1.5 ($10/$37.50) | 70% of 200K = **140K** |
| claude-sonnet-4-6 | 200K (1M beta) | 64K | $3.00 | $15.00 | >200K: input×2, output×1.5 ($6/$22.50) | 70% of 200K = **140K** |
| claude-sonnet-4-5 | 200K (1M beta) | 64K | $3.00 | $15.00 | >200K: input×2, output×1.5 ($6/$22.50) | 70% of 200K = **140K** |
| claude-haiku-4-5 | 200K | 64K | $1.00 | $5.00 | 无 | 75% = **150K** |
| claude-3-5-haiku | 200K | 8K | $0.80 | $4.00 | 无 | 75% = **150K** |

**关键信息**：
- 1M beta 需要 `context-1m-2025-08-07` header + tier 4+ 账户
- 阶梯计费以 **整个请求的 input token 数** 判定（不是仅超出部分）
- 超过 200K 后，整个请求的所有 token 都按高价计费
- 缓存写入 5min：input×1.25；缓存命中：input×0.1

### 2. OpenAI

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| gpt-4o | 128K | 16K | $2.50 | $10.00 | 无 (cached: $1.25) | 75% = **96K** |
| gpt-4o-mini | 128K | 16K | $0.15 | $0.60 | 无 (cached: $0.075) | 75% = **96K** |
| gpt-4.1 | **1M** | 32K | $2.00 | $8.00 | 无 (cached: $0.50, 75% off) | 50% = **500K** |
| gpt-4.1-mini | **1M** | 32K | $0.40 | $1.60 | 无 (cached: $0.10) | 50% = **500K** |
| gpt-4.1-nano | **1M** | 32K | $0.10 | $0.40 | 无 (cached: $0.025) | 50% = **500K** |
| o3 | 200K | 100K | $2.00 | $8.00 | 无 (cached: $0.50) | 70% = **140K** |
| o3-mini | 200K | 100K | $1.10 | $4.40 | 无 (cached: $0.55) | 70% = **140K** |
| o4-mini | 200K | 100K | $1.10 | $4.40 | 无 (cached: $0.275) | 70% = **140K** |
| gpt-5 | 400K | 128K | $1.25 | $10.00 | 无 (cached: $0.125, 90% off) | 60% = **240K** |
| gpt-5-mini | 400K | 128K | $0.25 | $2.00 | 无 (cached: $0.025) | 60% = **240K** |

**关键信息**：
- GPT-4.1 系列拥有 1M 上下文，缓存折扣 75%
- GPT-5 系列缓存折扣高达 90%
- o 系列（推理模型）内部消耗 reasoning tokens，按 output 计费但不可见
- 无基于上下文长度的阶梯计费，但缓存可大幅降低成本

### 3. Google Gemini

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| gemini-2.5-pro | **1M** | 65K | $1.25 | $10.00 | **>200K: input×2, output×1.5** ($2.50/$15.00) | 70% of 200K = **140K** |
| gemini-2.5-flash | **1M** | 65K | $0.30 | $2.50 | 无 | 50% = **500K** |
| gemini-2.5-flash-lite | **1M** | 65K | $0.10 | $0.40 | 无 | 50% = **500K** |
| gemini-2.0-flash | **1M** | 8K | $0.10 | $0.40 | 无 | 50% = **500K** |
| gemini-3-pro (preview) | **1M** | 65K | $2.00 | $12.00 | **>200K: input×2, output×1.5** ($4.00/$18.00) | 70% of 200K = **140K** |
| gemini-3-flash (preview) | **1M** | 65K | $0.50 | $3.00 | 无 | 50% = **500K** |

**关键信息**：
- Pro 系列模型有 200K 阶梯计费（与 Anthropic 类似）
- Flash 系列无阶梯计费
- 所有当前模型均为 1M 上下文
- 缓存命中约为 input 价格的 10%

### 4. DeepSeek

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| deepseek-chat (V3.2) | 128K | 8K | $0.28 | $0.42 | 无 (cache hit: $0.028, 90% off) | 75% = **96K** |
| deepseek-reasoner (V3.2) | 128K | 64K | $0.28 | $0.42 | 无 | 75% = **96K** |

**关键信息**：
- 极低定价，缓存命中 10× 折扣
- deepseek-coder 已合并至 deepseek-chat

### 5. xAI Grok

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| grok-4.1-fast | **2M** | N/A | $0.20 | $0.50 | 无 (cached: $0.05) | 40% = **800K** |
| grok-4 | 256K | N/A | $3.00 | $15.00 | 无 (cached: $0.75) | 70% = **180K** |
| grok-3 | 131K | 131K | $3.00 | $15.00 | 无 (cached: $0.75) | 75% = **98K** |
| grok-3-mini | 131K | 131K | $0.30 | $0.50 | 无 (cached: $0.07) | 75% = **98K** |
| grok-code-fast-1 | 256K | N/A | $0.20 | $1.50 | 无 (cached: $0.02) | 70% = **180K** |

**关键信息**：
- Grok 4.1 Fast 拥有业界最大的 2M 上下文窗口
- 批量 API 50% 折扣
- 无基于上下文长度的阶梯计费

### 6. Groq (推理加速平台)

| Model | Context | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|
| llama-3.3-70b-versatile | 128K | $0.59 | $0.79 | 无 | 75% = **96K** |
| llama-4-maverick | 128K | $0.20 | $0.60 | 无 | 75% = **96K** |
| llama-4-scout | 128K | $0.11 | $0.34 | 无 | 75% = **96K** |
| llama-3.1-8b-instant | 128K | $0.05 | $0.08 | 无 | 75% = **96K** |
| qwen3-32b | 131K | $0.29 | $0.59 | 无 | 75% = **98K** |

**关键信息**：
- Groq 主打推理速度 (数百~1000+ tokens/sec)
- 提供免费层 (14,400 requests/day)
- 批量 50% 折扣

### 7. Mistral AI

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| mistral-large-latest (v3) | 256K | 256K | $0.50 | $1.50 | 无 | 70% = **180K** |
| mistral-medium-3 | 131K | ~8K | $0.40 | $2.00 | 无 | 75% = **98K** |
| mistral-small-3.2 | 131K | ~8K | $0.06 | $0.18 | 无 | 75% = **98K** |
| codestral-2508 | 256K | ~16K | $0.30 | $0.90 | 无 | 70% = **180K** |
| pixtral-12b | 131K | ~4K | $0.15 | $0.15 | 无 | 75% = **98K** |

**关键信息**：
- 全系列无阶梯计费
- Mistral Large 3 (2024.12) 为当前旗舰，256K 上下文且定价极具竞争力

### 8. Moonshot AI (Kimi)

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| moonshot-v1-8k | 8K | ~4K | $0.20 | $2.00 | **按模型名分层** | 70% = **5.6K** |
| moonshot-v1-32k | 32K | ~4K | $1.00 | $3.00 | **按模型名分层** | 70% = **22K** |
| moonshot-v1-128k | 128K | ~4K | $2.00 | $5.00 | **按模型名分层** | 75% = **96K** |
| kimi-k2 (0905) | 256K | ~8K | $0.60 | $2.50 | 无 | 70% = **180K** |
| kimi-k2.5 | 256K | ~64-96K | $0.60 | $3.00 | 无 | 70% = **180K** |

**关键信息**：
- `kimi-latest` 端点根据实际上下文长度自动选择计费层
- moonshot-v1 按模型名硬分层（选用哪个模型即对应哪个价位）
- K2/K2.5 系列统一定价，无阶梯

### 9. Alibaba Qwen (通义千问)

> 价格基于国际版，中国大陆版约为国际版 1/3~1/5

| Model | Context | Max Output | Input $/MTok | Output $/MTok | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|---|
| qwen3-max | 262K | 32-65K | $1.20 | $6.00 | **CN: 32K / 128K / 252K 三级** | 70% of 128K tier = **90K** |
| qwen3.5-plus | **1M** | 65K | $0.40 | $2.40 | **CN: 128K / 256K / 1M 三级** | 50% of 128K tier = **64K** |
| qwen-plus | **1M** | 32K | $0.40 | $1.20 | **CN: 128K / 256K / 1M 三级** | 50% of 128K tier = **64K** |
| qwen-flash | **1M** | 32K | $0.05 | $0.40 | **CN: 256K / 1M 两级** | 60% of 256K = **154K** |
| qwen-long | **10M** | 32K | $0.072 | $0.287 | 无 | 30% = **3M** |

**关键信息**：
- 中国大陆版定价远低于国际版
- qwen-turbo 已废弃，推荐迁移至 qwen-flash
- qwen-long 拥有 10M 上下文（需文件 ID 引用方式）
- 批量调用 50% 折扣

### 10. Ollama / 本地模型

| Model | 原生 Context | Ollama 默认 | 可配置最大 | 阶梯计费 | Suggested Compact % |
|---|---|---|---|---|---|
| Llama 3.1/3.3 (8B-405B) | 128K | ~2K-8K | 128K | N/A (本地免费) | 75% of configured |
| Llama 4 Scout/Maverick | 128K | ~2K-8K | 128K | N/A | 75% of configured |
| Qwen 2.5/3 | 128K | ~2K-4K | 128K+ | N/A | 75% of configured |
| DeepSeek R1 Distill | 128K | ~2K-4K | 128K | N/A | 75% of configured |

**关键信息**：
- Ollama 全局默认 `num_ctx=2048`，必须显式设置才能使用更大上下文
- 更大上下文需要相应 VRAM/RAM（70B + 128K ≈ 48GB+ VRAM）
- 本地运行无计费，compact 主要考虑质量和速度

---

## 阶梯计费汇总

| Provider | 模型 | 阶梯阈值 | 低价区 Input | 高价区 Input | 涨幅 |
|---|---|---|---|---|---|
| **Anthropic** | Opus/Sonnet 4.6, Sonnet 4.5/4 | 200K | $3-5 | $6-10 | **2×** |
| **Google** | Gemini 2.5 Pro, 3 Pro | 200K | $1.25-2.00 | $2.50-4.00 | **2×** |
| **Moonshot** | moonshot-v1 系列 | 8K / 32K / 128K (按模型名) | $0.20 | $1.00 / $2.00 | 5-10× |
| **Alibaba** | qwen3-max | 32K / 128K / 252K | ¥2.5 | ¥4.0 / ¥7.0 | 1.6-2.8× |
| **Alibaba** | qwen-plus, qwen3.5-plus | 128K / 256K / 1M | ¥0.8 | ¥2.0 / ¥4.0 | 2.5-5× |
| **Alibaba** | qwen-flash | 256K / 1M | ¥0.36 | ¥1.80 | **5×** |

其他 Provider（OpenAI、DeepSeek、xAI、Groq、Mistral）均为**统一定价**，不因上下文长度变化。

---

## Suggested Compact 策略总结

| 场景 | Compact 触发点 | 理由 |
|---|---|---|
| **有阶梯计费（200K 阈值）** | **~140K** (70% of 200K) | 避免触发 2× 涨价，留 60K 余量给新消息+回复 |
| **有阶梯计费（128K 阈值）** | **~90K** (70% of 128K) | 避免触发涨价阶梯 |
| **无阶梯 · 128K context** | **~96K** (75%) | 标准安全边际 |
| **无阶梯 · 200K context** | **~150K** (75%) | 标准安全边际 |
| **无阶梯 · 256K context** | **~180K** (70%) | 适度保守 |
| **无阶梯 · 1M context** | **~500K** (50%) | 超长上下文质量衰减 + 延迟增加 |
| **无阶梯 · 2M context** | **~800K** (40%) | 极长上下文需更激进压缩 |
| **本地模型 (Ollama)** | **75% of num_ctx** | 无成本考虑，主要防 OOM |
| **Moonshot v1 (按名分层)** | **70% of selected tier** | 已按名选层，在层内留余量 |
| **Qwen 阶梯计费** | **70% of 最低价区上限** | 尽量停留在最便宜的计费区间 |

### 实现建议

```
suggested_compact_tokens = f(provider, model, context_window, pricing_tiers)

if has_pricing_tiers:
    # compact before hitting the next pricing tier
    compact_at = first_tier_boundary * 0.70
else if context_window >= 1_000_000:
    compact_at = context_window * 0.50
else if context_window >= 256_000:
    compact_at = context_window * 0.70
else:
    compact_at = context_window * 0.75
```

---

## 数据来源

| Provider | 来源 |
|---|---|
| Anthropic | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows) |
| OpenAI | [API Pricing](https://openai.com/api/pricing/), [Platform Docs](https://platform.openai.com/docs/pricing) |
| Google | [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing), [Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/pricing) |
| DeepSeek | [Pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| xAI | [Models & Pricing](https://docs.x.ai/developers/models) |
| Groq | [Pricing](https://groq.com/pricing), [Models](https://console.groq.com/docs/models) |
| Mistral | [Models](https://mistral.ai/models), [Docs](https://docs.mistral.ai/) |
| Moonshot | [Pricing](https://platform.moonshot.ai/docs/pricing/chat) |
| Alibaba | [Model Studio Pricing](https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio) |
| Ollama | [Context Length Docs](https://docs.ollama.com/context-length) |
