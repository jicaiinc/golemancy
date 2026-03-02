# Knowledge Base 实施计划

> 基准文档：`_requirement/20260302-1100-knowledge-base.md`
> 创建时间：2026-03-02
> 最后更新：2026-03-03

---

## 总览

### 改动规模

| 操作 | 文件数 | 说明 |
|------|--------|------|
| **删除** | ~45 | Memory 系统全部代码 + 22 个 i18n 文件 + 3 个 E2E 测试 |
| **新建** | ~20 | KB 类型/存储/路由/工具/embedding/chunker/UI 页面/设置/i18n |
| **修改** | ~35 | 共享类型/接口/Store/Service/路由/导航/app 入口/i18n config/测试 |

### 依赖关系总览

```
Phase 0: 安装 sqlite-vec
    │
Phase 1: Shared 类型 + 接口（基础，阻塞一切）
    │
    ├──→ Phase 2: Server 后端（DB/Storage/Routes/Tools/Embedding）
    │
    ├──→ Phase 3: UI 层（Services/Store/Pages/Settings）
    │
    ├──→ Phase 4: i18n（可与 Phase 2/3 并行）
    │
    └──→ Phase 5: 测试 + 清理（最后）
```

---

## Phase 0: 安装依赖

### 0.1 安装 sqlite-vec + 文件解析库

**修改** `packages/server/package.json`
- 添加 `"sqlite-vec": "^0.1.6"` 到 dependencies
- 添加 `"unpdf": "^0.12"` 到 dependencies（PDF 解析，基于 Mozilla pdf.js）
- 添加 `"mammoth": "^1.8"` 到 dependencies（DOCX 解析）
- 运行 `pnpm install`

---

## Phase 1: Shared 类型与接口

### 1.1 创建 KB 类型文件

**创建** `packages/shared/src/types/knowledge-base.ts`

新增类型：
- `KBCollectionId` = Brand<string, 'KBCollectionId'>
- `KBDocumentId` = Brand<string, 'KBDocumentId'>
- `KBCollectionTier` = 'hot' | 'warm' | 'cold' | 'archive'
- `KBSourceType` = 'manual' | 'upload' | 'agent'
- `KBCollection` = { id, name, description, tier, documentCount, totalChars, createdAt, updatedAt }
- `KBDocument` = { id, collectionId, title, content, sourceType, sourceName, metadata?, tags?, charCount, chunkCount, createdAt, updatedAt }
- `KBSearchResult` = { documentId, collectionName, chunkContent, chunkIndex, score, sourceType, sourceName }
- `EmbeddingSettings` = { enabled, model, apiKey? }
- `ProjectEmbeddingConfig` = { model?, apiKey? } — 项目级覆盖

### 1.2 更新 branded types

**修改** `packages/shared/src/types/common.ts`
- 删除 `MemoryId`
- 新增 `KBCollectionId`, `KBDocumentId`

### 1.3 更新 barrel export

**修改** `packages/shared/src/types/index.ts`
- `'./memory'` → `'./knowledge-base'`

### 1.4 删除旧类型

**删除** `packages/shared/src/types/memory.ts`

### 1.5 GlobalSettings + ProjectConfig 加 embedding 配置

**修改** `packages/shared/src/types/settings.ts`
- import `EmbeddingSettings`, `ProjectEmbeddingConfig` from `'./knowledge-base'`
- `GlobalSettings` 新增 `embedding?: EmbeddingSettings`
- `ProjectConfig` 新增 `embedding?: ProjectEmbeddingConfig`（项目级覆盖）

### 1.6 BuiltinToolId 加 knowledge_base

**修改** `packages/shared/src/types/agent.ts`（如果有 BuiltinToolId 类型）
- 添加 `'knowledge_base'`

### 1.7 替换 IMemoryService → IKnowledgeBaseService

**修改** `packages/shared/src/services/interfaces.ts`
- 删除 `IMemoryService` 及其 MemoryEntry/MemoryId 导入
- 新增 `IKnowledgeBaseService`:
  ```typescript
  interface IKnowledgeBaseService {
    // Collections
    listCollections(projectId): Promise<KBCollection[]>
    createCollection(projectId, data: { name, description?, tier }): Promise<KBCollection>
    updateCollection(projectId, id, data: Partial<{ name, description, tier }>): Promise<KBCollection>
    deleteCollection(projectId, id): Promise<void>

    // Documents
    listDocuments(projectId, collectionId): Promise<KBDocument[]>
    ingestDocument(projectId, collectionId, data: { title?, content, sourceType, sourceName? }): Promise<KBDocument>
    getDocument(projectId, documentId): Promise<KBDocument>
    deleteDocument(projectId, documentId): Promise<void>

    // Search
    search(projectId, query, options?: { collectionId?, limit? }): Promise<KBSearchResult[]>
  }
  ```

---

## Phase 2: Server 后端

### 2.1 DB Schema

**修改** `packages/server/src/db/schema.ts`
- 新增 drizzle schema: `kbCollections`, `kbDocuments`, `kbChunks` 表定义
- `vec_kb_chunks` 和 FTS5 虚拟表不在 drizzle schema 中定义（用 raw SQL）

### 2.2 DB Migration

**修改** `packages/server/src/db/migrate.ts`
- 新增 migration: CREATE TABLE IF NOT EXISTS `kb_collections`, `kb_documents`, `kb_chunks`
- 新增 INDEX: `idx_kb_docs_collection` on kb_documents(collection_id)
- 新增 INDEX: `idx_kb_chunks_doc` on kb_chunks(document_id)
- `vec_kb_chunks` 虚拟表延迟到 KnowledgeBaseStorage 中创建（需 sqlite-vec 先加载 + 维度根据模型动态决定）
- `kb_documents_fts` FTS5 虚拟表在 migration 中创建，**使用普通模式**：
  ```sql
  CREATE VIRTUAL TABLE IF NOT EXISTS kb_documents_fts USING fts5(
    document_id UNINDEXED,
    title,
    content
  );
  ```
  不用 `content=` 外部内容模式，避免手动同步和 rowid 不匹配问题。代价是多存一份文本，但 Hot 层 20K 上限完全可接受。

### 2.3 加载 sqlite-vec 扩展

**修改** `packages/server/src/db/project-db.ts`
- 在 `getProjectDb()` 中 createDatabase() 之后、migrateDatabase() 之前
- `sqliteVec.load(rawDb)` 加载 sqlite-vec 扩展到 better-sqlite3 连接

### 2.4 Embedding 模块

**创建** `packages/server/src/agent/embedding.ts`

功能：
- `embedText(text, apiKey, model)` → number[] — 单文本向量化
- `embedTexts(texts, apiKey, model)` → number[][] — 批量向量化
- `getEmbeddingDimensions(model)` → number — 根据模型返回维度（small=1536, large=3072）
- `resolveEmbeddingConfig(globalSettings, projectConfig)` → 解析项目级 > 全局配置
- 使用 `@ai-sdk/openai` 的 `createOpenAI({ apiKey })` + Vercel AI SDK `embed()` / `embedMany()`
- 无 fallback 逻辑，apiKey 由调用方传入

### 2.5 文本分块

**创建** `packages/server/src/agent/chunker.ts`

功能：
- `chunkText(text)` → TextChunk[] — 将长文本分块
- 策略：Recursive（先按 `\n\n`，再按 `\n`，再按 `.`）+ Overlap
- 目标 ~500 token/chunk，~50 token overlap
- 短文本（< 600 token）不分块，作为单个 chunk

### 2.6 文件解析模块

**创建** `packages/server/src/agent/file-parser.ts`

功能：
- `parseFile(buffer: Buffer, filename: string)` → `{ text: string, metadata?: Record<string, unknown> }`
- 根据文件扩展名分发：
  - `.pdf` → `unpdf` 提取文本
  - `.docx` → `mammoth` 提取文本（`mammoth.extractRawText()`）
  - `.txt` / `.md` → `buffer.toString('utf-8')` 直接读取
  - 其他 → 抛错 "Unsupported file type"
- 纯函数，无状态

### 2.7 KnowledgeBaseStorage

**创建** `packages/server/src/storage/knowledge-base.ts`

核心存储类，构造函数接收 `getProjectDb` + `getSettings`：

**Collection 操作**：
- `listCollections(projectId)` — 查询所有 collection + 聚合 doc count / char count
- `createCollection(projectId, data)` — 创建 collection
- `updateCollection(projectId, id, data)` — 更新 collection（含 tier 变更处理）
- `deleteCollection(projectId, id)` — 删除 collection + 级联删除 documents/chunks/vectors

**Document 操作**：
- `listDocuments(projectId, collectionId)` — 查询 collection 下所有 document
- `ingestDocument(projectId, collectionId, data)` — 根据 collection tier:
  - Hot/Archive: 只存 document 原文，Hot 还同步插入 FTS5（`INSERT INTO kb_documents_fts`）
  - Warm/Cold: 分块 → embedding → 存 document + chunks + vectors + FTS5(仅 Warm)
- `getDocument(projectId, documentId)` — 获取单个 document 详情
- `deleteDocument(projectId, documentId)` — 删除 document + 级联删除 chunks + **手动 DELETE FROM vec_kb_chunks**（虚拟表无 CASCADE）+ DELETE FROM kb_documents_fts

**搜索**：
- `search(projectId, query, options?)` — 分层检索:
  1. Hot: FTS5 SNIPPET 查询
  2. Warm: embed(query) → vec MATCH → JOIN chunks/documents
  3. Cold: 同 Warm（仅在结果不足时）
  4. 合并排序返回 top-K

**Tier 变更**：
- `changeTier(projectId, collectionId, newTier)` — 处理索引增删:
  - → Warm/Cold: 生成 chunks + embedding + vectors
  - → Hot: 删除 chunks + vectors，添加 FTS
  - → Archive: 删除 chunks + vectors + FTS

**vec 表动态创建**：
- `ensureVecTable(projectId)` — 首次 ingest Warm/Cold 文档时创建 vec_kb_chunks 虚拟表
- 维度根据当前 resolved embedding model 决定：`float[{getEmbeddingDimensions(model)}]`
- 创建后维度固定，模型不可切换

**Embedding 锁定检查**：
- `hasVectorData(projectId)` → boolean — 检查 vec_kb_chunks 是否有数据
- 供 UI 和 settings 路由调用，决定模型选择器是否置灰

**Hot 层注入**：
- `getHotContent(projectId)` — 返回所有 Hot collection + documents 的拼接内容

### 2.8 删除旧 Memory 存储

**删除** `packages/server/src/storage/memories.ts`
**删除** `packages/server/src/storage/memories.test.ts`

### 2.9 KB 路由

**创建** `packages/server/src/routes/knowledge-base.ts`

```
GET    /                           → listCollections
POST   /                           → createCollection
PATCH  /:collectionId              → updateCollection (含 tier 变更)
DELETE /:collectionId              → deleteCollection

GET    /:collectionId/documents    → listDocuments
POST   /:collectionId/documents    → ingestDocument (JSON body: manual/agent)
POST   /:collectionId/documents/upload → uploadDocument (multipart: file upload)
GET    /:collectionId/documents/:docId → getDocument
DELETE /:collectionId/documents/:docId → deleteDocument

POST   /search                     → search (跨 collection)
GET    /hot-content                → getHotContent (system prompt 注入用)
GET    /has-vector-data            → hasVectorData (embedding 锁定检查用)
```

文件上传端点使用 Hono 的 `c.req.parseBody()` 处理 multipart，
调用 `parseFile()` 提取文本后走正常 ingest 流程。

### 2.10 删除旧 Memory 路由

**删除** `packages/server/src/routes/memories.ts`
**删除** `packages/server/src/routes/memories.test.ts`

### 2.11 KB Built-in Tools

**创建** `packages/server/src/agent/kb-tools.ts`

仿照 `task-tools.ts` 模式：

```typescript
createKBTools(ctx: KBToolsContext) → ToolSet {
  kb_search: tool({
    description: 'Search the project knowledge base...',
    inputSchema: z.object({
      query: z.string(),
      collection: z.string().optional(),
      limit: z.number().optional().default(5),
    }),
    execute: async ({ query, collection, limit }) => { ... }
  }),

  kb_store: tool({
    description: 'Store new knowledge...',
    inputSchema: z.object({
      content: z.string(),
      collection: z.string().optional(),
      source: z.string().optional().default('agent'),
    }),
    execute: async ({ content, collection, source }) => { ... }
  }),
}
```

### 2.12 注册到工具系统

**修改** `packages/server/src/agent/builtin-tools.ts`
- BUILTIN_TOOL_REGISTRY 新增 `{ id: 'knowledge_base', name: 'Knowledge Base', defaultEnabled: true, available: true }`

**修改** `packages/server/src/agent/tools.ts`
- `LoadAgentToolsParams` 新增 `kbStorage?: KnowledgeBaseStorage`
- 在 tool loading pipeline 中添加 KB tools 加载：
  ```
  if (agent.builtinTools?.knowledge_base !== false && kbStorage) { ... }
  ```

### 2.13 Hot 层注入到 Agent System Prompt

**修改** `packages/server/src/agent/tools.ts`
- 在 `loadAgentTools()` 返回的 `instructions` 字段中注入 Hot 层内容
- 调用 `kbStorage.getHotContent(projectId)` 获取所有 Hot collection + documents
- 拼接 `<knowledge>...</knowledge>` 到 instructions
- 上游已有模式：`agent.systemPrompt + '\n\n' + agentToolsResult.instructions`（sub-agent.ts）
- **不修改 runtime.ts**（它只是 pass-through）

### 2.14 穿透 kbStorage 依赖

**修改** `packages/server/src/routes/chat.ts`
- `ChatRouteDeps` 新增 `kbStorage`
- 传入 `loadAgentTools()`

**修改** `packages/server/src/scheduler/executor.ts`
- `ExecutorDeps` 新增 `kbStorage`
- `loadAgentTools()` 调用传入 `kbStorage`

**修改** `packages/server/src/app.ts`
- `ServerDependencies`: `memoryStorage: IMemoryService` → `kbStorage: KnowledgeBaseStorage`
- 路由: 删除 `/memories`，新增 `/knowledge-base`
- `createChatRoutes(deps)` 传入 kbStorage
- executor 创建时传入 kbStorage

**修改** `packages/server/src/index.ts`
- 删除 `FileMemoryStorage` 实例化
- 新增 `KnowledgeBaseStorage` 实例化

---

## Phase 3: UI 层

### 3.1 Service 层替换

**修改** `packages/ui/src/services/container.ts`
- `memory: IMemoryService` → `knowledgeBase: IKnowledgeBaseService`

**修改** `packages/ui/src/services/http/services.ts`
- 删除 `HttpMemoryService`
- 新增 `HttpKnowledgeBaseService`（实现 IKnowledgeBaseService 全部方法）
- 端点: `/api/projects/{projectId}/knowledge-base/...`

**修改** `packages/ui/src/services/http/index.ts`
- 替换 factory

**修改** `packages/ui/src/services/mock/services.ts`
- 删除 `MockMemoryService`
- 新增 `MockKnowledgeBaseService`（内存 Map 实现）

**修改** `packages/ui/src/services/mock/data.ts`
- 删除 `SEED_MEMORIES`
- 新增 `SEED_KB_COLLECTIONS` + `SEED_KB_DOCUMENTS`

**修改** `packages/ui/src/services/mock/index.ts`
- 替换 factory

### 3.2 Zustand Store

**修改** `packages/ui/src/stores/useAppStore.ts`

删除 Memory slice，新增 KB slice：

**State**:
- `kbCollections: KBCollection[]`
- `kbCollectionsLoading: boolean`
- `kbDocuments: Record<KBCollectionId, KBDocument[]>` — 按 collection 缓存
- `kbDocumentsLoading: boolean`

**Actions**:
- `loadKBCollections(projectId)` — 加载所有 collection
- `createKBCollection(data)` — 创建 collection
- `updateKBCollection(id, data)` — 更新 collection（含 tier 变更）
- `deleteKBCollection(id)` — 删除 collection
- `loadKBDocuments(collectionId)` — 加载 collection 下的 documents
- `ingestKBDocument(collectionId, data)` — 写入 document
- `deleteKBDocument(documentId)` — 删除 document
- `searchKB(query, options?)` — 搜索

在 `selectProject` 中替换 `svc.memory.list` 为 `svc.knowledgeBase.listCollections`。

### 3.3 Knowledge Base 主页面（四栏看板）

**创建** `packages/ui/src/pages/knowledge-base/KnowledgeBasePage.tsx`

布局结构：
```
┌─────────────────────────────────────────────────────────────┐
│ Header: "Knowledge Base"                   [+ New Collection]│
├──────────────┬──────────────┬──────────────┬────────────────┤
│ HOT [+]      │ WARM [+]     │ COLD [+]     │ ARCHIVE [+]    │
│ 12K/20K      │              │              │                │
│ (标题栏固定)  │              │              │                │
│──────────────│──────────────│──────────────│────────────────│
│ (滚动区域)    │ (滚动区域)    │ (滚动区域)    │ (滚动区域)     │
│ Collection   │ Collection   │ Collection   │ Collection     │
│ cards...     │ cards...     │ cards...     │ cards...       │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

- 四列等宽，每列独立的背景色（深红/深黄/深蓝/深灰 配合暗色主题）
- 列标题栏 sticky/固定，包含 tier 名 + [+] 按钮 + Hot 列容量指示
- Collection 卡片区域独立垂直滚动
- 空列显示 placeholder

### 3.4 Collection 详情弹窗

**创建** `packages/ui/src/pages/knowledge-base/CollectionDetailModal.tsx`

大弹窗（~80% 宽 x 70% 高），内容：
- 标题栏：Collection 名 + tier badge + 统计
- Actions: [+ Add Text] [↑ Upload File]
- Search Test: 输入框 + 搜索按钮 → 结果列表（score + content + source）
- Documents 列表：标题、来源类型图标、大小、chunk 数、时间、[View] [Delete]
- Settings: Tier 下拉选择（变更触发重新索引）+ [Delete Collection]

### 3.5 其他 KB 组件

**创建** `packages/ui/src/pages/knowledge-base/NewCollectionModal.tsx`
- Name、Description、Tier 选择（如果从列标题 [+] 触发，tier 自动预选）

**创建** `packages/ui/src/pages/knowledge-base/AddTextModal.tsx`
- Title、Content textarea

**创建** `packages/ui/src/pages/knowledge-base/DocumentViewModal.tsx`
- 查看 document 完整内容 + 元数据

**创建** `packages/ui/src/pages/knowledge-base/index.ts`
- barrel export

### 3.6 删除旧 Memory 页面

**删除** `packages/ui/src/pages/memory/MemoryPage.tsx`
**删除** `packages/ui/src/pages/memory/index.ts`

### 3.7 路由 + 导航

**修改** `packages/ui/src/pages/index.tsx`
- `MemoryPage` → `KnowledgeBasePage`

**修改** `packages/ui/src/app/routes.tsx`
- `<Route path="memory">` → `<Route path="knowledge-base" element={<KnowledgeBasePage />} />`

**修改** `packages/ui/src/components/layout/ProjectSidebar.tsx`
- nav item: key → 'item.knowledgeBase', path → '/knowledge-base', testId → 'knowledge-base'

### 3.8 文件上传组件

**创建** `packages/ui/src/pages/knowledge-base/UploadFileModal.tsx`
- 文件选择器（accept: .pdf, .docx, .txt, .md）
- 上传后调用 multipart upload 端点
- 显示上传进度 / 解析状态

### 3.9 Embedding Settings — Global

**创建** `packages/ui/src/pages/settings/EmbeddingTab.tsx`

内容：
- Enabled 开关
- Model 选择（text-embedding-3-small / text-embedding-3-large）+ 显示维度和价格
- API Key 输入（预填充 OpenAI Provider 的 key，可覆盖）
- 提示文案

**修改** `packages/ui/src/pages/settings/GlobalSettingsPage.tsx`
- 新增 'embedding' tab

### 3.10 Embedding Settings — Project

**修改** Project Settings 页面（需确认具体文件）
- 新增 Embedding 配置区域：
  - Model 下拉（可选覆盖全局默认，留空=使用全局）
  - API Key 输入（可选覆盖，预填充同全局规则）
  - **锁定状态**：调用 `/has-vector-data` 检查，若有数据则 Model 下拉置灰 + 显示锁定提示
  - "清空向量并解锁" 操作按钮（可选，需确认后执行）

### 3.11 Speech API Key 预填充

**修改** `packages/ui/src/pages/settings/SpeechTab.tsx`
- API Key 字段：如果当前为空，预填充 OpenAI Provider 的 API Key
- 读取 `settings.providers['openai']?.apiKey`
- 保存时存到 `speechToText.apiKey`（独立存储）

---

## Phase 4: i18n

### 4.1 创建英文 KB namespace

**创建** `packages/ui/src/locales/en/knowledgeBase.json`

Key 结构：
```json
{
  "page.title": "Knowledge Base",
  "tier.hot": "Hot",
  "tier.warm": "Warm",
  "tier.cold": "Cold",
  "tier.archive": "Archive",
  "tier.hotUsage": "{{used}}/{{limit}}",
  "collection.documents_one": "{{count}} document",
  "collection.documents_other": "{{count}} documents",
  "collection.chunks_one": "{{count}} chunk",
  "collection.chunks_other": "{{count}} chunks",
  "collection.new": "New Collection",
  "collection.delete": "Delete Collection",
  "collection.deleteConfirm": "Delete \"{{name}}\"? This will remove all documents and cannot be undone.",
  "document.add": "Add Text",
  "document.upload": "Upload File",
  "document.delete": "Delete",
  "document.view": "View",
  "search.placeholder": "Search this collection...",
  "search.testTitle": "Search Test",
  "search.noResults": "No results found",
  "search.score": "Score: {{score}}",
  "form.nameLabel": "NAME",
  "form.descriptionLabel": "DESCRIPTION",
  "form.tierLabel": "TIER",
  "form.titleLabel": "TITLE",
  "form.contentLabel": "CONTENT",
  "empty.noCollections": "No collections in this tier",
  "empty.noDocuments": "No documents yet",
  "embedding.locked": "Embedding model locked (vector data exists)",
  "embedding.unlockWarning": "This will delete all vector data. Continue?",
  "embedding.projectOverride": "Override global embedding model for this project",
  "upload.supportedFormats": "Supported: PDF, DOCX, TXT, Markdown",
  "upload.parsing": "Parsing file...",
  "loading": "Loading knowledge base..."
}
```

### 4.2 删除所有 memory.json

**删除** 22 个 `packages/ui/src/locales/*/memory.json`

### 4.3 创建非英语 knowledgeBase.json

**创建** 21 个 `packages/ui/src/locales/{lang}/knowledgeBase.json`（空对象 `{}`，英文 only 策略）

### 4.4 更新 i18n config

**修改** `packages/ui/src/i18n/config.ts`
- 22 处 `import memoryXx` → `import knowledgeBaseXx`
- 22 处 resources 中 `memory: memoryXx` → `knowledgeBase: knowledgeBaseXx`

### 4.5 更新 nav.json

**修改** 22 个 `packages/ui/src/locales/*/nav.json`
- key `"memory"` → `"knowledgeBase"`

### 4.6 更新 settings.json

**修改** `packages/ui/src/locales/en/settings.json`
- `"tabs"` 下新增 `"embedding": "Embedding"`

### 4.7 更新测试 setup

**修改** `packages/ui/src/test/setup.ts`
- namespace 替换

---

## Phase 5: 测试 + 清理

### 5.1 删除旧 Memory E2E 测试

**删除**:
- `apps/desktop/e2e/server/memory-api.spec.ts`
- `apps/desktop/e2e/smoke/memory-page.spec.ts`
- `apps/desktop/e2e/smoke/memory-crud.spec.ts`

### 5.2 创建新 KB E2E 测试

**创建**:
- `apps/desktop/e2e/smoke/kb-page.spec.ts` — 导航、四栏展示、空状态
- `apps/desktop/e2e/smoke/kb-crud.spec.ts` — 创建 collection、添加 document、删除
- `apps/desktop/e2e/server/kb-api.spec.ts` — collection + document REST API 测试

### 5.3 更新 E2E constants

**修改** `apps/desktop/e2e/constants.ts`
- 删除 MEMORY_* selectors
- 新增 KB_* selectors

### 5.4 更新引用 memory 的测试文件

**修改** ~8 个测试文件中的 memory mock → knowledgeBase mock：
- `packages/ui/src/stores/useAppStore.test.ts`
- `packages/ui/src/app/routes.test.tsx`
- `packages/ui/src/services/mock/services.test.ts`
- `packages/ui/src/services/http/services.test.ts`
- `packages/ui/src/services/ServiceProvider.test.tsx`
- 其他引用 `memory` 的测试文件

### 5.5 验证构建

- `pnpm lint` — 类型检查通过
- `pnpm test` — 单元测试通过
- `pnpm build` — 构建通过
- 验证 sqlite-vec 被 `bundle-server.mjs` 自动检测为 native module

---

## 团队分工建议

### Design 阶段角色

| 角色 | 职责 |
|------|------|
| Team Lead | 协调、审查 |
| Architect | 确认数据模型、存储架构、工具接口设计 |
| Fact Checker | 验证 sqlite-vec API、Vercel AI SDK embed 用法、FTS5 语法 |
| UI/UX Designer | 四栏看板配色、卡片样式、弹窗布局 |
| Requirements Analyst | 对照需求清单审视设计完整性 |
| Abstraction Strategist | 审查 IKnowledgeBaseService 接口、分层存储抽象 |

### Implement 阶段并行策略

```
Phase 1 完成后：
  ├── 全栈工程师 A: Phase 2（Server 后端）
  ├── 全栈工程师 B: Phase 3（UI 层）
  └── 全栈工程师 C: Phase 4（i18n）← 可由 A 或 B 兼做

Phase 2+3+4 完成后：
  └── 测试工程师: Phase 5（测试）
```

### Review 阶段

- CR-Quality + CR-Security + CR-Performance 三者并行
