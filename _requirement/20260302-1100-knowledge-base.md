# 需求清单：Knowledge Base（知识库）
> 创建时间：2026-03-02 11:00
> 最后更新：2026-03-03
> 状态：已确认

## 背景

将现有 Memory 功能完全替换为 Knowledge Base。当前 Memory 是一个基于文件的纯 CRUD 备忘录，没有语义搜索、没有 Agent 集成，对项目来说完全没必要。

新的 Knowledge Base 基于 RAG 技术，使用 sqlite-vec 做向量存储，支持 Collection 分组和 Hot/Warm/Cold/Archive 四层分级存储，作为 built-in tool 暴露给 Agent。

Agent level 的 Memory（类似 Claude Code 的 MEMORY.md，短文本记忆）不在本次范围内，后续另行设计。

## 功能需求

### 1. 删除现有 Memory 功能

完全移除现有 Memory 系统，不保留任何代码。包括类型定义、服务接口、文件存储、路由、UI 页面、Store slice、i18n、测试等所有相关代码。确保无死代码。

### 2. Knowledge Base 核心功能

Knowledge Base 是项目级的知识存储，基于 RAG 技术。

#### 2.1 Collection（集合）

- Knowledge Base 下分多个 Collection，每个 Collection 有独立的主题/用途
- Collection 属性：name, description, tier
- 支持 CRUD：创建、查看、修改（含 tier 变更）、删除

#### 2.2 Tiered Storage（分层存储）

每个 Collection 有一个 tier 属性，分四个层级：

| 层级 | 索引 | Agent 注入方式 | 说明 |
|------|------|---------------|------|
| **Hot** | FTS5 关键词索引 | 全量注入 Agent system prompt | 高频核心知识，不做向量化 |
| **Warm** | sqlite-vec 向量 + FTS5 | Agent 通过 `kb_search` 按需检索 | 一般知识，hybrid search |
| **Cold** | sqlite-vec 向量 | Agent 通过 `kb_search`，优先级低于 Warm | 低活跃知识 |
| **Archive** | 无索引 | 不参与检索 | 封存归档，仅存储和查看 |

#### 2.3 Document（文档）

- 一个完整的知识来源单元，属于某个 Collection
- 属性：title, content（原始完整文本）, sourceType, sourceName, metadata, tags, charCount
- Document 保留原始完整文本（可查看），Chunk 是衍生物

#### 2.4 Chunk（分块）+ Embedding（向量）

- 仅 Warm 和 Cold 层的 Document 会被切割为 Chunk
- 每个 Chunk 有对应的 Embedding 向量
- Hot 层不分块不向量化（内容直接全量注入）
- Archive 层不分块不向量化（不参与检索）

#### 2.5 多种知识来源

| 来源 | sourceType | 默认 tier | 说明 |
|------|-----------|-----------|------|
| 用户手动输入短文本 | `manual` | Hot | 用户在 UI 里写的 |
| 文件上传 | `upload` | Warm | PDF、Markdown、TXT、DOCX 等 |
| Agent 通过 `kb_store` 写入 | `agent` | Hot | Agent 在对话中主动存储 |

> **注**：网页 URL 导入不在本次范围内，后续迭代。

#### 2.6 文件上传解析

服务端需支持 multipart file upload，根据文件类型提取纯文本：

| 文件类型 | 解析方案 |
|---------|---------|
| PDF | `unpdf`（1K+ stars，基于 Mozilla pdf.js） |
| DOCX | `mammoth`（6.1K+ stars） |
| TXT / Markdown | 直接 `fs.readFile()` 读取原文 |

提取纯文本后进入正常 ingest 流程（分块、embedding 等）。

### 3. Built-in Tools

`kb_search` + `kb_store` 作为 Agent 内置工具，默认启用。

#### 3.1 kb_search

- 输入：query, collection?（可选，指定搜索范围）, limit?
- 检索流程：先搜 Hot（FTS5 关键词），再搜 Warm（向量语义），Cold 仅在结果不足时搜，Archive 不参与
- 返回：相关知识片段 + 相似度分数 + 来源信息

#### 3.2 kb_store

- 输入：content, collection?（可选）, source?
- 存入指定 collection（遵循该 collection 的 tier 决定存储方式）
- 如果未指定 collection，存入默认 collection（或 Hot 层的第一个 collection）

### 4. Hot 层 System Prompt 注入

- 每次 Agent 对话开始时，自动查询所有 tier=hot 的 Collection
- 将所有 Hot Document 的内容拼接后注入 system prompt
- 格式：`<knowledge><collection name="xxx">...</collection></knowledge>`

### 5. Settings > Embedding 配置

#### 5.1 Global Settings（全局默认）

- 位于 Global Settings，新增 Embedding tab
- 配置项：enabled 开关、model 选择（text-embedding-3-small / text-embedding-3-large）、独立 API Key
- **API Key 预填充逻辑**：如果 OpenAI Provider 已配置且 API Key 不为空，Embedding 的 API Key 字段在 UI 上预填充该值。用户可覆盖修改。每个功能独立存储自己的 API Key，运行时使用自己存储的 key，**无 fallback**。
- **Speech-to-Text 同理**：本次一并修改，Speech 的 API Key 也改为预填充 OpenAI Provider 的 API Key，但独立存储、可覆盖。
- 如果 Embedding 未配置（enabled=false 或无 API Key），Knowledge Base 的 Warm/Cold 功能不可用（Hot 和 Archive 不依赖 Embedding，仍可使用）

#### 5.2 Project Config（项目级覆盖）

- 在 Project Settings 中新增 Embedding 配置区域
- 可覆盖全局默认的 model 和 API Key
- 运行时解析优先级：Project Config > Global Settings（与现有的三层 resolve 模式一致）

#### 5.3 Embedding 锁定机制

- **Embedding 模型与项目的 Knowledge Base 绑定**
- 新项目 KB 为空时，embedding 模型可自由选择/切换
- 一旦项目中出现 Warm/Cold 层的 chunk + vector 数据，embedding 模型**锁定不可切换**
- 判断条件：`vec_kb_chunks` 表中是否有数据
- 锁定后 UI 上模型选择器置灰，显示锁定提示
- 如需切换模型，必须先删除所有 Warm/Cold 层的 Collection（或提供 "清空所有向量并重选模型" 操作）
- `vec_kb_chunks` 虚拟表的维度在创建时根据当前模型动态决定（small=1536, large=3072）

### 6. 层级变更处理

| 变更方向 | 自动操作 |
|---------|---------|
| Hot → Warm | 对文档进行分块 + embedding，创建 chunks + 向量索引 |
| Warm → Hot | 检查 Hot 总量是否超限，超限则 UI 警告 |
| Warm → Cold | 无额外操作（已有向量，仅检索优先级降低） |
| Cold → Archive | 删除 chunks + 向量索引，只保留原始文本 |
| Archive → Warm | 重新分块 + embedding |
| 其他方向 | 类推 |

### 7. Hot 层容量限制

- 软限制 ~20,000 字
- UI 上显示用量指示（如 "12K/20K"）
- 超出时 UI 提示，不强制阻断

## 技术约束

1. **向量存储**：sqlite-vec，加载到现有 better-sqlite3
2. **Embedding**：仅支持 OpenAI（`text-embedding-3-small` / `text-embedding-3-large`），通过 Vercel AI SDK `embed()` / `embedMany()`
3. **数据库**：复用现有 per-project SQLite（通过 ProjectDbManager）
4. **分块策略**：Recursive + Overlap，~500 token/chunk，~50 token overlap
5. **全文搜索**：FTS5（SQLite 内置），**普通模式**（不用 `content=` 外部内容模式），避免手动同步和 rowid 不匹配问题
6. **无死代码**：旧 Memory 系统的所有代码必须清理干净
7. **文件解析**：`unpdf`（PDF）+ `mammoth`（DOCX）+ 原生读取（TXT/MD）

## UI 设计要求

### 主页面：四栏看板（Kanban 风格）

- 四个 tier 横向并排：Hot、Warm、Cold、Archive
- 每列有独立的背景颜色区分（红/橙、黄、蓝、灰）
- 列标题栏固定在顶部不随滚动，包含 tier 名称 + `[+]` 新建 Collection 按钮
- Hot 列标题栏显示容量指示（如 "12K/20K"）
- 每列内纵向排列 Collection 卡片，卡片显示：名称、文档数、字符数/chunk 数
- Collection 卡片区域可独立滚动
- 整体布局规整、整齐

### Collection 详情弹窗

- 点击 Collection 卡片打开大弹窗（约 80% 视口宽度、70% 高度）
- 弹窗内容：
  - 标题栏：Collection 名称、tier 标识、文档数/chunk 数统计
  - Actions 区：[+ Add Text]、[↑ Upload File]
  - Search Test 区：输入查询 → 显示结果 + 相似度分数
  - Documents 列表：每个文档显示标题、来源类型、大小、chunk 数、时间、[View] [Delete] 操作
  - Settings 区：Tier 选择（可变更）、Delete Collection 按钮

### 新建 Collection

- 可以通过每列标题栏的 `[+]` 按钮创建，tier 自动设为对应列
- 也可以通过右上角全局按钮创建，手动选择 tier
- 弹窗表单：Name、Description、Tier 选择

## 风格要求

1. 遵循现有像素艺术风格（Pixel Art / Minecraft 美学）
2. 无 border-radius
3. 使用现有 shadow-pixel-* 阴影系统
4. 四列配色方案需和暗色主题协调
5. i18n：英文为标杆语言，其他语言后续补齐

## 数据模型

### SQLite 表结构（per-project DB）

```sql
-- 集合
CREATE TABLE kb_collections (
  id            TEXT PRIMARY KEY,         -- 'kbc-xxxx'
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  tier          TEXT NOT NULL DEFAULT 'warm',  -- hot|warm|cold|archive
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 文档
CREATE TABLE kb_documents (
  id            TEXT PRIMARY KEY,         -- 'kbd-xxxx'
  collection_id TEXT NOT NULL REFERENCES kb_collections(id),
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL,            -- 原始完整文本
  source_type   TEXT NOT NULL DEFAULT 'manual',  -- manual|upload|web|agent
  source_name   TEXT DEFAULT '',          -- 文件名 / URL / Agent 名
  metadata      TEXT,                     -- JSON
  tags          TEXT,                     -- JSON array
  char_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 分块（仅 warm/cold 层有）
CREATE TABLE kb_chunks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- 向量索引（sqlite-vec 虚拟表，仅 warm/cold 层有）
-- 维度根据当前 embedding 模型动态决定：small=1536, large=3072
CREATE VIRTUAL TABLE vec_kb_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[{dimensions}] distance_metric=cosine
);

-- 全文索引（FTS5，普通模式，自动同步）
CREATE VIRTUAL TABLE kb_documents_fts USING fts5(
  document_id UNINDEXED,
  title,
  content
);
```

### 实体层级

```
Project
  └── KB Collection（tier: hot|warm|cold|archive）
        └── KB Document（content, sourceType, metadata, tags）
              └── KB Chunk（仅 warm/cold 层）
                    └── Embedding 向量（仅 warm/cold 层）
```

### Agent 检索流程

```
kb_search(query)
  1. Hot 层 → FTS5 关键词搜索（SNIPPET）
  2. Warm 层 → embed(query) → vec MATCH → 返回 chunks + score
  3. Cold 层 → 仅在 1+2 结果不足时搜
  4. 合并排序 → 返回 top-K
```

### Hot 层注入

```
Agent 对话开始
  → 查询 tier=hot 的所有 collections + documents
  → 拼接注入 system prompt:
    <knowledge>
    <collection name="xxx">{documents}</collection>
    </knowledge>
```

## 注意事项

1. Agent level 的 Memory（短文本记忆）**不在本次范围**，后续另行设计
2. 网页 URL 导入 **不在本次范围**，后续迭代
3. 不要动 git — 可以查看但绝对不允许提交代码
4. 中文讨论，英文写代码
5. API Key 的预填充是 UI 行为，不是运行时 fallback。每个功能（Provider、Speech、Embedding）独立存储和使用自己的 API Key
6. Speech-to-Text 的 API Key 预填充改动也在本次范围内
7. Embedding 模型一旦项目有向量数据就锁定，不可切换（除非清空向量）
8. 删除 document/collection 时必须手动清理 `vec_kb_chunks` 中对应行（虚拟表无 CASCADE）
