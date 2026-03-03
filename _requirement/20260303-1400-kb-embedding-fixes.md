# 需求文档：Knowledge Base Embedding 配置修复

> 创建时间：2026-03-03 14:00
> 状态：已确认

## 用户原话

> 第一，我们只有在这个全局设置的 embedding API key test 通过之后，然后才算做 enabled，否则的话，这个 embedding 的话就不算配置好的。
>
> 第二，在项目中的这个设置中的这个 embedding，我们默认 global 是什么 key，我们就填写什么 key，不用写 from OpenAI。
>
> 然后这个 API key 的这个列名的话，我们就给它叫做 OpenAI API key，它没有第二个 provider 的名字。
>
> 然后还有一点就是 agent 的 build-in tools 的列表中的 Knowledge Base，如果 embedding 的配置没有 test 通过的话，或者没有开通的话，或者说它的项目中没有相关的 embedding 的配置的话，那么它的这个 enable 之后是应该有提示的，就是它是不可用的这个状态。
>
> 然后还有就是，如果这个 API key 相关的东西没有配置好的话，然后我去 Knowledge Base 是类似一个引导页面来配置 embedding key 的。
>
> 然后还有就是 embedding key 如果有问题的时候，就是我新建 warm up 的 collection，然后再 upload 这个 file 的时候，它竟然不报错。

---

## 提炼的关键修复点

### FIX-1：Embedding "enabled" 的判定逻辑

**现状问题**：当前 `embeddingConfigured` 仅判断 `embedding.enabled === true && apiKey 存在`，没有考虑 API key 是否 test 通过。
**期望行为**：全局设置中，Embedding 只有在 API key test 通过后才算"已配置/已启用"。需要在 settings 中持久化 test 结果状态（如 `testPassed: boolean`），所有依赖 `embeddingConfigured` 的地方都应基于此判断。
**影响范围**：
- `EmbeddingTab.tsx`：Save 时记录 test 状态
- `KnowledgeBasePage.tsx`（L52-54）：`embeddingConfigured` 判断
- `AgentDetailPage.tsx`（L373-375）：`embeddingConfigured` 判断
- `ProjectSettingsPage.tsx`（L276,334）：`globalEmbedding.enabled` 判断
- `packages/shared/src/types/knowledge-base.ts`：`EmbeddingSettings` 类型需增加 `testPassed` 字段

### FIX-2：Project Settings Embedding — 默认填充全局 key 的实际值

**现状问题**：API key 输入框为空时，placeholder 显示 `(from OpenAI)` 文本。
**期望行为**：直接用全局 key 的实际值作为输入框的默认值（不是 placeholder），让用户看到真实的 key 值。用户可以修改覆盖。
**影响文件**：
- `ProjectSettingsPage.tsx`（L286,367）：`apiKey` 初始化 + placeholder 逻辑
- `project.json`（L56）：删除 `fromOpenAI` i18n key

### FIX-3：API Key 列名改为 "OpenAI API Key"

**现状问题**：全局和项目级 Embedding 设置中，API key 的 label 都是通用的 "API KEY"。
**期望行为**：改为 "OpenAI API Key"，因为 Embedding 只有 OpenAI 一个 provider，无需通用名称。
**影响文件**：
- `settings.json`（L90）：`embedding.apiKeyLabel` → `"OpenAI API Key"`
- `project.json`（L55）：`settings.embedding.apiKeyLabel` → `"OpenAI API Key"`

### FIX-4：Agent Built-in Tools — Knowledge Base 不可用状态提示

**现状问题**：当 embedding 未配置时，KB tool 会显示为半透明 + "CONFIGURE EMBEDDING" 标签，toggle 按钮被禁用。但如果 KB tool 之前已被 enable（`builtinTools.knowledge_base: true`），切换到 embedding 未配置状态后，用户看到的是 enabled 但不可用的混乱状态。
**期望行为**：
1. 当 embedding 未通过 test，KB tool 即使 toggle 开启，也要有明确的"不可用"视觉提示（如警告 badge 或文字说明）
2. 提示文案应引导用户去配置 embedding
**影响文件**：
- `AgentDetailPage.tsx`（L373-382,401-427）：embeddingConfigured 判断逻辑 + UI 展示

### FIX-5：Knowledge Base 页面 — 无配置时的引导页面

**现状问题**：只有在 KB 为空（`collections.length === 0`）且 embedding 未配置时才显示 amber 提示条。如果已有 Hot/Archive 类型的 collection，即使 embedding 未配置也不显示提示。
**期望行为**：如果 embedding API key 没有配置好（test 未通过），Knowledge Base 页面应该始终显示引导/提示区域，引导用户去配置 embedding key。不仅限于 KB 为空的场景。
**影响文件**：
- `KnowledgeBasePage.tsx`（L59,77-84）：showEmbeddingPrompt 条件 + UI

### FIX-6：文件上传错误不报错

**现状问题**：当 embedding key 有问题（无效/缺失）时，向 Warm/Cold collection 上传文件，UI 不显示错误。Server 端 `ingestDocument()` 会 throw error，但 `UploadFileModal.tsx` 的 `handleSubmit()` catch 了错误却只执行 `finally { setSubmitting(false) }`，没有展示错误信息给用户。
**期望行为**：上传失败时，应该在 modal 中显示明确的错误信息，告知用户 embedding 配置有问题。
**影响文件**：
- `UploadFileModal.tsx`（L23-31）：添加 error state 和展示
- `IngestTextModal.tsx`：同理检查是否有相同问题
- `CollectionDetailModal.tsx`：tier 切换时的 error handling

---

### FIX-7：英文 i18n 深度校验

**要求**：英文是国际化的根基，所有 Knowledge Base / Embedding 相关的英文 i18n key 必须准确无误。需进行深层次检查：
- 所有 namespace（settings, project, knowledgeBase, agent, common）中 KB/Embedding 相关 key 的英文文案准确性
- 占位符 `{{}}` 一致性
- 新增/修改的 key 命名规范
- 无拼写错误、无语法错误
- 文案风格与现有 key 一致（简洁、大写标题风格等）

### FIX-8（用户第二轮反馈追加）：Embedding 检查必须基于 Project Resolved Config

**用户原话**：
> 所有的这个 embedding 的配置都是根据 project level 进行判断，而不是根据 global 进行判断。而 global 的话，只是对于 project level 来说的话，它只是一个默认的选项。
> 如果我们在 global level 配置了的话，那么我们就不需要在 project level 进行配置。或者说，我们在 global level 配置了的话，那么在 project level 的配置就是一种默认的配置，当然我们可以对它进行更改。

**核心语义**：
- `embeddingConfigured` 的判定必须使用 **resolved config**（Project override → Global default）
- Global 配置 = 所有 project 的默认值
- Project 可以覆盖 Global 的 model 和 apiKey
- 如果 Global 已配好且 Project 没有覆盖，则 Project 直接继承 Global 的配置
- 判定函数：`resolveEmbeddingConfig(globalSettings, projectConfig)` — 返回 null 则为"未配置"

**影响范围**：所有 UI 中的 `embeddingConfigured` 判断都必须改为使用 resolved config。

### FIX-9（用户第二轮反馈追加）：KB Warm/Cold 操作必须前置拦截

**用户原话**：
> 我们的 embedding API key 没有设置的时候，我们可以进入 knowledge base。我们进入了 knowledge base 之后，我们还可以 new collection。我们 new 了 collection 之后，还可以进行 add text 和 upload files，所有的这些东西全都没有被限制住。

**期望行为**：当 resolved embedding config 为 null 时：
1. **KB 页面**：可以进入，但显示引导提示（已有 FIX-5）
2. **New Collection**：Hot/Archive 始终可创建；Warm/Cold 创建按钮 disabled + 警告
3. **Add Text（IngestTextModal）**：对 Warm/Cold collection，按钮 disabled + 警告
4. **Upload File（UploadFileModal）**：对 Warm/Cold collection，按钮 disabled + 警告
5. **CollectionDetailModal 中的 Add Text / Upload File 按钮**：对 Warm/Cold collection，disabled + 警告
6. Hot/Archive tier 的所有操作不受 embedding 限制

---

## 极致业务场景确认

以下是每个场景的预期行为，所有实现必须逐条满足：

### 场景 A：全局 embedding 未配置（enabled=false 或 testPassed=false）
| 操作 | 预期行为 |
|------|---------|
| 进入 KB 页面 | 显示 embedding 引导提示 |
| 创建 Hot collection | ✅ 允许 |
| 创建 Warm collection | ❌ 禁止（按钮 disabled + 警告） |
| 创建 Cold collection | ❌ 禁止（按钮 disabled + 警告） |
| 创建 Archive collection | ✅ 允许 |
| 向 Hot collection 添加文本 | ✅ 允许 |
| 向 Warm collection 添加文本 | ❌ 禁止（按钮 disabled + 警告） |
| 向 Hot collection 上传文件 | ✅ 允许 |
| 向 Warm collection 上传文件 | ❌ 禁止（按钮 disabled + 警告） |
| Agent Tools 中 KB tool | 显示"不可用"状态 + 警告 |

### 场景 B：全局 embedding 已配置（enabled + testPassed），项目未覆盖
| 操作 | 预期行为 |
|------|---------|
| 进入 KB 页面 | 正常显示，无引导提示 |
| 创建 Warm/Cold collection | ✅ 允许 |
| 向 Warm collection 添加文本/上传 | ✅ 允许 |
| Agent Tools 中 KB tool | 正常可用 |
| 项目 Embedding 设置 | 显示全局 key 的实际值（可覆盖） |

### 场景 C：全局 embedding 已配置，项目覆盖了 apiKey
| 操作 | 预期行为 |
|------|---------|
| resolved config | 使用 project 的 apiKey + resolved model |
| KB 页面和所有操作 | 基于 resolved config 判定 |
| 项目 Embedding 设置 | 显示项目覆盖的 key 值 |

### 场景 D：Embedding key 有问题（server 端调用失败）
| 操作 | 预期行为 |
|------|---------|
| 向 Warm collection 上传文件 | 显示具体错误信息（不是静默失败） |
| 向 Warm collection 添加文本 | 显示具体错误信息 |
| 切换 collection tier 到 Warm | 如果失败，显示错误信息 |

---

## 审查清单

除以上 7 个修复点外，团队还需审查：

- [ ] FIX-1 实施后，所有 `embeddingConfigured` 判断是否一致使用 `testPassed`
- [ ] `resolveEmbeddingConfig()` 服务端函数是否需要同步更新判断逻辑
- [ ] 项目级 embedding test 的行为是否也需要影响项目级的 "已配置" 判断
- [ ] KB 的 `kb_search` / `kb_store` 内置 tool 在 agent runtime 中，embedding 未配置时是否有恰当的错误信息
- [ ] 所有 i18n key 的变更是否完整且无遗漏（英文为标杆，不可出错）
- [ ] Mock services 中相关测试数据是否需要更新
- [ ] 现有测试用例是否覆盖了以上场景
- [ ] `pnpm check:i18n` 通过
