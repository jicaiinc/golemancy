# LLM Provider 认证方式调研报告

> 调研来源：`_cai_python_202510` 项目中对 OpenClaw (moltbot) 代码库的逆向分析
> 调研日期：2026-03-06
> 调研者：Claude Opus 4.6（在 `_cai_python_202510` 项目的 Claude Code 会话中完成）
> 目标项目：Golemancy — 桌面 AI Agent 编排工具

---

## 一、认证协议基础

> 本章解释文档中反复出现的协议术语。如果你已熟悉 OAuth 2.0，可跳过。

### 1.1 三个层次

| 概念 | 是什么 | 层次 |
|------|--------|------|
| **OAuth 2.0** | 授权协议标准（RFC 6749）——定义"用户授权第三方访问资源"的流程 | 协议层 |
| **PKCE** | OAuth 2.0 的安全扩展（RFC 7636）——防止授权码被拦截 | 安全增强层 |
| **OAuth Portal** | 厂商对自家 OAuth 登录入口的产品命名（如 Qwen Portal、MiniMax Portal） | 产品层 |

PKCE 的原理：客户端先生成随机密钥（code_verifier），将其 SHA256 哈希（code_challenge）发给服务器；换 token 时再发原始密钥验证身份。这样即使授权码被拦截，没有 code_verifier 也无法换取 token。

### 1.2 两种主要 OAuth 子流程

| 流程 | 原理 | 适用场景 |
|------|------|---------|
| **Authorization Code Flow** | 打开浏览器 → 登录 → 重定向到 `localhost` 回调 → 拿 code → 换 token | 桌面应用、有浏览器的环境 |
| **Device Flow** | 向服务器请求设备码 → 用户自行在浏览器打开 URL 输入码 → 应用轮询等待授权 | CLI 工具、无浏览器环境、远程服务器 |

### 1.3 各 Provider 使用的协议

| Provider | 协议 | 子流程 | PKCE | 前置条件 |
|----------|------|--------|------|---------|
| **OpenAI Codex** | OAuth 2.0 | Authorization Code Flow | 是 | ChatGPT Plus 订阅（$20/月） |
| **Qwen Portal** | OAuth 2.0 | Device Flow | 是 | 免费注册 |
| **MiniMax Portal** | OAuth 2.0 | Device Flow | 是 | 免费注册 |
| **GitHub Copilot** | OAuth 2.0 | Device Flow | 否 | Copilot 订阅 |

---

## 二、认证方式分类与安全性总览

### 2.1 认证方式分类

| 类型 | 原理 | 封号风险 | 适用 Provider |
|------|------|---------|--------------|
| **API Key** | 用户在 provider 官网申请密钥，直接传入 | 无 | 所有 provider |
| **OAuth (Authorization Code)** | 浏览器登录 → 本地回调拿 token | 取决于 provider 政策 | OpenAI Codex |
| **OAuth (Device Flow)** | 设备码 → 用户在浏览器授权 → 轮询 | 取决于 provider 政策 | Qwen、MiniMax、GitHub Copilot |
| **CLI 凭证窃取** | 读取其他 CLI 工具本地存储的 token | **高** | Claude Code、Gemini CLI |
| **本地推理** | 连接本地运行的模型服务 | 无 | vLLM、Ollama |

### 2.2 安全的认证方式（无封号风险）

| Provider | 认证方式 | 备注 |
|----------|---------|------|
| **OpenAI (API Key)** | `OPENAI_API_KEY` | 按量计费，标准用法 |
| **OpenAI (Codex OAuth)** | Authorization Code + PKCE | 官方支持第三方集成，详见第三章 |
| **Anthropic (API Key)** | `ANTHROPIC_API_KEY` | 按量计费，标准用法 |
| **Google (Gemini API Key)** | `GEMINI_API_KEY` | 按量计费，标准用法 |
| **GitHub Copilot** | Device Flow | GitHub 标准 OAuth |
| **Qwen Portal** | Device Flow + PKCE | 阿里云官方 OAuth，免费层无封号报告 |
| **MiniMax Portal** | Device Flow + PKCE | MiniMax 官方 OAuth，免费层无封号报告 |
| **Mistral / xAI / DeepSeek / 等** | API Key | 按量计费 |
| **本地模型 (vLLM/Ollama)** | 无需认证 | 完全本地 |

### 2.3 危险的认证方式（已有封号案例）

| Provider | 认证方式 | 风险详情 |
|----------|---------|---------|
| **Anthropic (Claude Code OAuth)** | 读取 macOS Keychain 凭证 | 2026年1月：Anthropic 修改 ToS，明确禁止第三方使用 OAuth token。部署服务端检测，封禁违规账号 |
| **Google (Gemini CLI OAuth)** | 从本地 Gemini CLI 提取 Client ID/Secret | 2026年2月：Google 大规模封号。AI Ultra ($249/月) 用户突然收到 403。**连带影响 Gmail、Workspace 等关联服务**。第二次违规永久封号 |

> **注：Antigravity** 是 Google Cloud Code Assist 的内部代号。OpenClaw 曾通过提取 Gemini CLI 中硬编码的 Antigravity OAuth 凭证来调用 Google 的模型，该功能已在最新版本中被移除。

### 2.4 关键事件时间线

```
2026-01-09  Anthropic 部署服务端检测，封禁第三方 OAuth 工具
2026-01-15  OpenAI 与 Roo Code 合作，官方支持第三方 Codex OAuth
2026-02-12  Google 大规模封禁 Antigravity/Gemini CLI 第三方用户
2026-02-27  Google 发布官方声明，一次性解封，但警告二次违规永久封号
```

---

## 三、推荐集成的 Provider 详细分析

### 3.1 OpenAI Codex OAuth（P1）

#### 核心信息

| 项目 | 值 |
|------|-----|
| 认证协议 | OAuth 2.0 Authorization Code Flow + PKCE |
| Client ID | `app_EMoamEEZ73f0CkXaXp7hrann` |
| 授权端点 | `https://auth.openai.com/oauth/authorize` |
| Token 端点 | `https://auth.openai.com/oauth/token` |
| 回调地址 | `http://localhost:1455/auth/callback` |
| Responses API | `https://chatgpt.com/backend-api/codex/responses` |
| Usage API | `https://chatgpt.com/backend-api/wham/usage` |
| 凭证存储 | `~/.codex/auth.json` 或 macOS Keychain（Service: `"Codex Auth"`） |
| 前置条件 | ChatGPT Plus / Pro / Business / Enterprise 订阅 |

#### Client ID 来源

`app_EMoamEEZ73f0CkXaXp7hrann` 是 **OpenAI Codex CLI 官方的 Client ID**，硬编码在 OpenAI 的开源仓库 [openai/codex](https://github.com/openai/codex) 中。这不是任何第三方工具的专属 ID，所有第三方工具共用同一个：

- Codex CLI（OpenAI 官方）
- Roo Code（OpenAI 官方合作伙伴）
- OpenCode、OpenClaw

#### 为什么安全？

1. **OpenAI 官方文档明确支持第三方集成**
   - 提供 `@openai/codex-sdk`（npm 包）给开发者嵌入
   - 提供 `chatgptAuthTokens` 模式让宿主应用直接传入 token
   - App Server 文档明确写 "Use it when you want a deep integration inside **your own product**"
   - 官方文档：https://developers.openai.com/codex/auth/

2. **无封号案例** — 截至 2026-03-06，无任何因使用 Codex OAuth Client ID 被封号的公开报告

3. **商业逻辑支撑** — OpenAI 策略是开放生态：更多工具支持 Codex → 更多人订阅 Plus/Pro

#### OAuth 流程

```
1. 生成 PKCE code_verifier + code_challenge
2. 构建授权 URL:
   https://auth.openai.com/oauth/authorize?
     client_id=app_EMoamEEZ73f0CkXaXp7hrann
     &response_type=code
     &redirect_uri=http://localhost:1455/auth/callback
     &code_challenge={challenge}
     &code_challenge_method=S256
3. 打开浏览器，用户用 ChatGPT 账号登录
4. 回调到 localhost:1455，拿到 authorization code
5. 用 code + code_verifier 换取 access_token + refresh_token
6. 后续请求: Authorization: Bearer {access_token}
7. Token 过期时用 refresh_token 自动刷新（有效期约 1 小时）
```

#### API 调用

```
POST https://chatgpt.com/backend-api/codex/responses
Headers:
  Authorization: Bearer {access_token}
  ChatGPT-Account-Id: {account_id}  (可选，Team/Enterprise 场景)
  Content-Type: application/json
Body:
  { "model": "gpt-5.3-codex", "store": false, ... }
```

注意：Codex Responses API 要求 `store=false`。

#### Usage 查询

```
GET https://chatgpt.com/backend-api/wham/usage
Headers:
  Authorization: Bearer {access_token}
  ChatGPT-Account-Id: {account_id}
Response:
  {
    "rate_limit": {
      "primary_window": { "limit_window_seconds": 10800, "used_percent": 45.2, "reset_at": 1709726400 },
      "secondary_window": { "limit_window_seconds": 86400, "used_percent": 22.1, "reset_at": 1709769600 }
    },
    "plan_type": "plus",
    "credits": { "balance": 150.00 }
  }
```

#### 凭证存储格式

`~/.codex/auth.json`:
```json
{
  "tokens": {
    "access_token": "eyJ...",
    "refresh_token": "rt_...",
    "account_id": "acct_..."
  },
  "last_refresh": "2026-03-06T10:00:00Z"
}
```

macOS Keychain: Service = `"Codex Auth"`, Account = `cli|{sha256(CODEX_HOME)[:16]}`

---

### 3.2 Qwen Portal（P1）

#### 核心信息

| 项目 | 值 |
|------|-----|
| 认证协议 | OAuth 2.0 Device Flow + PKCE |
| Client ID | `f0304373b74a44d2b584a3fb70ca9e56` |
| 设备码端点 | `https://chat.qwen.ai/api/v1/oauth2/device/code` |
| Token 端点 | `https://chat.qwen.ai/api/v1/oauth2/token` |
| API 基地址 | `https://portal.qwen.ai/v1` |
| API 兼容性 | OpenAI Completions API |
| 可用模型 | Qwen3.5-Plus、Qwen3-Coder（1M 上下文、65K 输出） |
| 凭证存储 | `~/.qwen/oauth_creds.json` |
| 前置条件 | **无**，注册即可使用 |

#### OAuth 流程

```
1. 生成 PKCE code_verifier + code_challenge
2. POST 设备码端点，带 client_id + code_challenge
3. 获得 device_code + user_code + verification_uri
4. 提示用户打开 verification_uri 并输入 user_code
5. 轮询 Token 端点（间隔 2s，指数退避），带 device_code + code_verifier
6. 用户授权后获得 access_token + refresh_token
7. Token 过期时用 refresh_token 自动刷新
```

---

### 3.3 MiniMax Portal（P1）

#### 核心信息

| 项目 | 值 |
|------|-----|
| 认证协议 | OAuth 2.0 Device Flow + PKCE + state（CSRF 防护） |
| Client ID | `78257093-7e40-4613-99e0-527b14b39113`（Global/CN 共用） |
| OAuth 端点（Global） | `https://api.minimax.io/oauth/code`, `/oauth/token` |
| OAuth 端点（CN） | `https://api.minimaxi.com/oauth/code`, `/oauth/token` |
| API 基地址（Global） | `https://api.minimax.io/anthropic` |
| API 基地址（CN） | `https://api.minimaxi.com/anthropic` |
| API 兼容性 | Anthropic Messages API |
| 可用模型 | MiniMax-M2.5, M2.5-highspeed, M2.5-Lightning |
| 凭证存储 | `~/.minimax/oauth_creds.json` |
| 前置条件 | **无**，注册即可使用 |

#### OAuth 流程

与 Qwen Portal 相同的 Device Flow + PKCE 模式，额外增加了 state 参数做 CSRF 防护。支持 Global 和 CN 两个区域端点。

---

### 3.4 GitHub Copilot（P1）

#### 核心信息

| 项目 | 值 |
|------|-----|
| 认证协议 | OAuth 2.0 Device Flow（无 PKCE） |
| 默认模型 | `gpt-4o` |
| 前置条件 | GitHub Copilot 订阅（Individual $10/月，Business $19/月） |

GitHub Copilot 使用标准的 GitHub OAuth Device Flow：生成设备码 → 用户在 github.com/login/device 输入 → 授权完成。这是 GitHub 官方支持的认证方式，无任何封号风险。

---

### 3.5 API Key（P0）

所有 provider 都支持 API Key 认证。用户在 provider 官网申请密钥，在 Golemancy 中填入即可。这是最基础、最安全、最通用的认证方式，必须作为 P0 优先实现。

支持的 provider 包括：OpenAI、Anthropic、Google Gemini、Mistral、xAI (Grok)、DeepSeek、Moonshot、Z.AI、火山引擎等。

---

### 3.6 本地模型（P2）

连接本地运行的 vLLM、Ollama 等推理服务，通常使用 OpenAI 兼容 API，不需要认证。零成本、完全隐私，但需要用户自行部署和管理。

---

## 四、费用对比

### 4.1 OAuth 免费层 vs API Key 按量计费

OAuth 登录和 API Key 的**计费模式完全不同**。OAuth 通常提供按请求次数计量的免费额度或订阅额度；API Key 则按 token 数计费。

| Provider | OAuth 费用 | OAuth 额度 | API Key 费用（参考） |
|----------|-----------|-----------|-------------------|
| **OpenAI Codex** | 需 Plus 订阅 $20/月 | 3h/24h 窗口限额 | gpt-4o: $2.50/M input, $10/M output |
| **Qwen Portal** | **免费** | 1,000~2,000 次/天，60次/分钟，**不限 token** | Qwen-Plus: $0.40/M input, $1.20/M output |
| **MiniMax Portal** | **免费** | 1,000 次/天，100次/分钟 | M2.5: $0.30/M input, $1.20/M output |
| **GitHub Copilot** | 订阅 $10/月起 | 订阅内无限制 | N/A（无独立 API） |

### 4.2 Qwen 付费升级方案

| 接入方式 | 费用 | 额度 |
|----------|------|------|
| OAuth 免费层 | 免费 | 1,000~2,000 次/天 |
| Coding Plan Lite | ~$10/月（¥40/月） | 18,000 次/月 |
| Coding Plan Pro | ~$50/月（¥200/月） | 90,000 次/月 |

Coding Plan 包含多个模型：Qwen3.5-Plus、Qwen3-Coder-Next、GLM-4.7、Kimi-K2.5。

### 4.3 MiniMax 付费升级方案

| 接入方式 | 费用 | 额度 |
|----------|------|------|
| OAuth 免费层 | 免费 | 1,000 次/天 |
| Coding Plan Starter | $10/月 | 40次/5小时窗口 |
| Coding Plan Plus | $20/月 | 更多额度 |
| Coding Plan Max | $50/月 | 1000次/5小时窗口 |

### 4.4 结论

Qwen 和 MiniMax 的 OAuth 免费层**不需要任何付费订阅**，注册即用。对于不愿付费的用户，这是零成本使用 AI 模型的最佳途径。免费额度耗尽后，请求会被 rate limit 拒绝（返回 429），用户需等待次日额度重置或升级到 Coding Plan。

---

## 五、Golemancy 集成建议

### 5.1 优先级总览

| 优先级 | 方式 | 理由 |
|--------|------|------|
| **P0** | API Key（所有 provider） | 基础能力，必须有 |
| **P1** | OpenAI Codex OAuth | ChatGPT Plus 用户无需额外 API 费用 |
| **P1** | Qwen Portal Device Flow | 完全免费，1,000~2,000次/天，不限 token |
| **P1** | MiniMax Portal Device Flow | 完全免费，1,000次/天，Global/CN 双端点 |
| **P1** | GitHub Copilot Device Flow | Copilot 订阅用户直接使用 |
| **P2** | 本地模型 (vLLM/Ollama) | 零成本、完全隐私 |
| **不推荐** | Google Gemini CLI OAuth | 封号风险极高，连带影响 Gmail 等服务 |
| **不推荐** | Claude Code 凭证窃取 | 违反 Anthropic ToS，会被检测封号 |

### 5.2 各 P1 Provider 的实现注意事项

#### OpenAI Codex

- **不需要本地安装 Codex CLI** — Golemancy 自己做 OAuth 客户端即可
- **使用公开的 Client ID** `app_EMoamEEZ73f0CkXaXp7hrann`，所有第三方工具的通用做法
- **Token 自动刷新** — access_token 有效期约 1 小时，必须用 refresh_token 自动续期
- **Usage 监控** — 可接入 `wham/usage` API 向用户展示剩余用量
- **TLS 预检** — OpenClaw 在 OAuth 前会检查 `auth.openai.com` 证书链是否可信，建议参考
- **政策风险** — 虽然目前安全，建议代码架构上做好 API Key fallback

#### Qwen Portal

- **标准 Device Flow** — 实现比 Authorization Code Flow 简单（不需要启动本地 HTTP 服务器）
- **Token 刷新** — 使用 `https://chat.qwen.ai/api/v1/oauth2/token` + `grant_type=refresh_token`
- **API 兼容 OpenAI** — 基地址 `https://portal.qwen.ai/v1`，可复用 OpenAI 的请求格式
- **模型 ID 注意** — OAuth 层使用 `coder-model`、`vision-model` 等通用 ID，非具体版本号

#### MiniMax Portal

- **双区域支持** — Global (`api.minimax.io`) 和 CN (`api.minimaxi.com`)，需让用户选择
- **CSRF 防护** — MiniMax 额外使用 state 参数，Token 响应时需校验 state 一致性
- **API 兼容 Anthropic** — 基地址是 `/anthropic`，使用 Anthropic Messages API 格式（非 OpenAI）
- **Token 刷新** — 机制与 Qwen 类似

#### GitHub Copilot

- **GitHub 标准 Device Flow** — 成熟的协议实现，可参考 GitHub 官方文档
- **模型有限** — 默认只有 `gpt-4o`，模型选择较少

### 5.3 通用建议

1. **统一 OAuth 抽象层** — Codex 用 Authorization Code Flow，Qwen/MiniMax/Copilot 用 Device Flow，建议在 Golemancy 中抽象出统一的 OAuth 管理接口
2. **凭证加密存储** — 参考 OpenClaw 的 macOS Keychain 方案或使用系统级凭证管理
3. **Token 刷新机制** — 所有 OAuth provider 都需要自动刷新，建议统一处理
4. **优雅降级** — OAuth token 失效时自动提示用户重新登录，而非静默失败

---

## 六、OpenClaw 源代码参考

> 以下文件路径来自 OpenClaw (moltbot) 代码库，是本文档的分析来源，也是 Golemancy 实现时值得参考的代码。

### 6.1 OpenAI Codex OAuth

| 文件 | 说明 |
|------|------|
| `src/commands/openai-codex-oauth.ts` | Codex OAuth 主流程：TLS 预检、VPS 远程支持、调用 `loginOpenAICodex` |
| `src/commands/auth-choice.apply.openai.ts` | OpenAI 认证选择处理：API Key 和 Codex OAuth 两种路径，凭证写入+跨 agent 同步 |
| `src/commands/openai-codex-model-default.ts` | 默认模型定义：`openai-codex/gpt-5.3-codex` |
| `src/infra/provider-usage.fetch.codex.ts` | Usage API 实现：解析 primary/secondary 限额窗口、plan 类型、credits 余额 |
| `src/agents/auth-profiles/oauth.ts` | OAuth 凭证生命周期：token 刷新、跨 agent 继承、bearer auth 模式兼容 |
| `src/commands/oauth-flow.ts` | 统一 OAuth 处理器：本地浏览器/VPS 远程两种模式 |
| `src/commands/oauth-tls-preflight.ts` | TLS 预检：确保 `auth.openai.com` 证书链可信 |

### 6.2 Qwen Portal

| 文件 | 说明 |
|------|------|
| `extensions/qwen-portal-auth/oauth.ts` | Device Flow 完整实现：PKCE 生成、设备码请求、轮询等待授权 |
| `extensions/qwen-portal-auth/index.ts` | 插件注册：provider 配置、模型定义（coder-model, vision-model）、base URL |
| `src/providers/qwen-portal-oauth.ts` | Token 刷新逻辑 |

### 6.3 MiniMax Portal

| 文件 | 说明 |
|------|------|
| `extensions/minimax-portal-auth/oauth.ts` | Device Flow 实现：Global/CN 双端点、PKCE + state CSRF 校验 |
| `extensions/minimax-portal-auth/index.ts` | 插件注册：Global/CN handler、Anthropic Messages API 兼容、3 个模型 |
| `src/commands/auth-choice.apply.minimax.ts` | MiniMax 认证选择：Portal OAuth / Cloud API / CN API / Lightning 多种路径 |

### 6.4 GitHub Copilot

| 文件 | 说明 |
|------|------|
| `src/commands/auth-choice.apply.github-copilot.ts` | GitHub Device Flow：`githubCopilotLoginCommand`，默认模型 `gpt-4o` |

### 6.5 凭证管理

| 文件 | 说明 |
|------|------|
| `src/agents/cli-credentials.ts` | 多 provider 凭证读取：Claude Code Keychain、Codex CLI Keychain（SHA256 账户名）、Qwen/MiniMax 本地文件 |

### 6.6 Google Gemini CLI（反面教材）

| 文件 | 说明 |
|------|------|
| `extensions/google-gemini-cli-auth/oauth.ts` | **危险实现**：用正则从本地 Gemini CLI 的 `oauth2.js` 中提取 Client ID/Secret |
| `src/commands/auth-choice.apply.google-gemini-cli.ts` | 包含封号风险警告：`"Some users have reported account restrictions"` |

### 6.7 通用架构

| 文件 | 说明 |
|------|------|
| `src/commands/auth-choice-options.ts` | 全部 47 个认证选项定义，按 30+ 分组组织 |
| `src/commands/onboard-types.ts` | `AuthChoice` 联合类型定义（47 个成员） |
| `src/commands/auth-choice.apply.ts` | Handler 链：13 个处理器的注册和分发 |
| `src/commands/auth-choice.apply.api-providers.ts` | 15+ API Key provider 的通用处理模式 |

---

## 七、参考资料

### 官方文档

- [OpenAI Codex 认证文档](https://developers.openai.com/codex/auth/)
- [OpenAI Codex SDK](https://developers.openai.com/codex/sdk/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [@openai/codex-sdk (npm)](https://www.npmjs.com/package/@openai/codex-sdk)
- [Qwen Code 认证文档](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/)
- [Qwen Coding Plan (阿里云)](https://www.alibabacloud.com/help/en/model-studio/coding-plan)
- [MiniMax Coding Plan](https://platform.minimax.io/docs/coding-plan/intro)
- [MiniMax API 定价](https://platform.minimax.io/docs/pricing/overview)
- [阿里云百炼模型定价](https://help.aliyun.com/zh/model-studio/model-pricing)

### 社区与讨论

- [Roo Code 3.41.0 发布说明 (OpenAI 合作)](https://docs.roocode.com/update-notes/v3.41.0)
- [OpenAI 社区：Client ID 最佳实践讨论](https://community.openai.com/t/best-practice-for-clientid-when-using-codex-oauth/1371778)
- [Google Gemini CLI 封号讨论](https://github.com/google-gemini/gemini-cli/discussions/20632)
- [Google AI 论坛：Mass 403 Bans](https://discuss.ai.google.dev/t/urgent-mass-403-tos-bans-on-gemini-api-antigravity-for-open-source-cli-users-paid-tier/124508)
