# KB 技术事实验证报告

> 验证时间: 2026-03-03
> 验证师: Fact Checker
> 验证方法: WebSearch + Context7 + 源码确认（每项至少两种交叉验证）

---

## 1. sqlite-vec

### 版本
- npm 包: `sqlite-vec` ^0.1.6（当前最新稳定版 v0.1.6，alpha v0.1.7-alpha）
- 纯 C SQLite 扩展，作者 Alex Garcia
- 平台二进制通过 optional dependencies 分发（darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64）

### 正确用法

#### 加载方式：`sqliteVec.load(db)`，不是 `db.loadExtension()`

```typescript
import * as sqliteVec from 'sqlite-vec'
import Database from 'better-sqlite3'

const db = new Database(':memory:')
sqliteVec.load(db)  // 正确：使用 sqlite-vec 包的 load() 函数

// 验证加载成功
const { vec_version } = db.prepare('SELECT vec_version() AS vec_version').get()
// vec_version = 'v0.1.6'
```

> `load()` 内部自动检测驱动类型（支持 better-sqlite3, node:sqlite, bun:sqlite 等），调用对应的扩展加载机制。

#### vec0 虚拟表创建语法

```sql
-- 基本向量表
CREATE VIRTUAL TABLE vec_items USING vec0(
  embedding float[1536]
);

-- 带自定义主键 + cosine 距离
CREATE VIRTUAL TABLE vec_documents USING vec0(
  document_id TEXT PRIMARY KEY,
  embedding float[1536] distance_metric=cosine
);

-- 完整功能示例：主键 + 向量 + 元数据列 + 辅助列
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding float[1536] distance_metric=cosine,
  -- 元数据列（可在 KNN WHERE 中过滤，支持 =, !=, >, <, BETWEEN, IN）
  document_id TEXT,
  -- 辅助列（+ 前缀，存储在独立内部表，不可过滤，适合大文本）
  +content TEXT,
  +source_url TEXT
);
```

**向量类型选项：**
| 类型 | 字节/元素 | 说明 |
|------|----------|------|
| `float[N]` / `float32[N]` | 4 | 标准 float32 |
| `int8[N]` | 1 | 量化 int8 |
| `bit[N]` | 1/8 | 二进制向量 |

**distance_metric 选项：**
| 值 | 适用类型 | 说明 |
|----|---------|------|
| （省略，默认 L2） | float32, int8 | 欧氏距离 |
| `distance_metric=cosine` | float32, int8 | 余弦距离 |
| `distance_metric=L1` | float32, int8 | 曼哈顿距离 |
| `distance_metric=hamming` | bit | 汉明距离（bit 默认） |

#### 向量 INSERT 格式

**方式 A：JSON 字符串（SQL 友好）**
```sql
INSERT INTO vec_items(rowid, embedding)
VALUES (1, '[-0.200, 0.250, 0.341, -0.211]');
```

**方式 B：Float32Array（Node.js / better-sqlite3 推荐）**
```typescript
const stmt = db.prepare('INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)')
stmt.run(BigInt(1), new Float32Array([0.1, 0.2, 0.3, 0.4]))
//        ^ BigInt for rowid    ^ Float32Array 直接传入，better-sqlite3 自动处理 BLOB 转换
```

**批量插入（事务）：**
```typescript
const stmt = db.prepare('INSERT INTO vec_items(rowid, embedding) VALUES (?, ?)')
const insertBatch = db.transaction((items: Array<[number, number[]]>) => {
  for (const [id, vector] of items) {
    stmt.run(BigInt(id), new Float32Array(vector))
  }
})
insertBatch(items)
```

#### 向量搜索 MATCH 语法

```sql
-- KNN 搜索（ORDER BY + LIMIT 方式，需 SQLite >= 3.41）
SELECT rowid, distance
FROM vec_items
WHERE embedding MATCH '[0.3, 0.3, 0.3, 0.3]'
ORDER BY distance
LIMIT 10;

-- KNN 搜索（AND k = N 方式，兼容所有 SQLite 版本）
SELECT rowid, distance
FROM vec_items
WHERE embedding MATCH '[0.3, 0.3, 0.3, 0.3]'
  AND k = 10;

-- 带元数据过滤的 KNN
SELECT chunk_id, distance
FROM vec_chunks
WHERE embedding MATCH ?
  AND k = 10
  AND document_id = 'doc-123';
```

**Node.js 中使用：**
```typescript
const rows = db.prepare(`
  SELECT rowid, distance
  FROM vec_items
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT ?
`).all(new Float32Array(queryVector), 10)
// 返回: [{ rowid: 3, distance: 0.123 }, ...]
```

**结果格式：** 每行包含 `rowid`（或自定义主键列）和 `distance`（根据建表时指定的 metric 计算）。

#### 独立距离函数
```sql
SELECT vec_distance_L2(vec_a, vec_b);
SELECT vec_distance_cosine(vec_a, vec_b);
```

### 关键注意事项
1. **必须用 `sqliteVec.load(db)`**，不要用 `db.loadExtension()` — load() 封装了跨驱动的兼容逻辑
2. **rowid 用 BigInt**: better-sqlite3 中传 `BigInt(id)` 作为 rowid 参数
3. **向量用 Float32Array**: 直接传 `new Float32Array(vector)`，不需要 `.buffer`
4. **TEXT 主键**: 如果用 `TEXT PRIMARY KEY`，INSERT 时主键列不用 BigInt
5. **平台覆盖**: npm 包含 macOS (arm64/x64), Linux (x64/arm64), Windows (x64) — 覆盖 Electron 所有目标平台
6. **sqlite-vec 是原生模块**: 打包时需要 externalize（类似 better-sqlite3），参考 `bundle-server.mjs` 中的原生包检测逻辑

### 验证来源
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) — 官方 README
- [Node.js 官方文档](https://alexgarcia.xyz/sqlite-vec/js.html) — 加载方式、API
- [官方 demo.mjs](https://github.com/asg017/sqlite-vec/blob/main/examples/simple-node/demo.mjs) — better-sqlite3 完整示例
- [KNN 查询文档](https://alexgarcia.xyz/sqlite-vec/features/knn.html)
- [vec0 feature docs](https://github.com/asg017/sqlite-vec/blob/main/site/features/vec0.md) — 元数据列、辅助列、分区键
- [sqlite-vec metadata release 博客](https://alexgarcia.xyz/blog/2024/sqlite-vec-metadata-release/index.html)

---

## 2. Vercel AI SDK embed/embedMany

### 版本
- 项目安装: `ai` v6.0.82（Vercel AI SDK v6）
- `@ai-sdk/openai` 已在项目中使用

### 正确用法

#### Import 路径

```typescript
import { embed, embedMany } from 'ai'  // 直接从 'ai' 包导入
```

> 已通过项目 `node_modules/.pnpm/ai@6.0.82/node_modules/ai/dist/index.d.ts` 确认导出存在。

#### embed() 签名和返回值

```typescript
const result = await embed({
  model: embeddingModel,          // 必填：EmbeddingModel 实例
  value: 'text to embed',         // 必填：要嵌入的文本
  maxRetries?: number,            // 可选：默认 2，设 0 禁用重试
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
  providerOptions?: ProviderOptions,
})

// 返回值
result.embedding   // number[] — 嵌入向量
result.value       // 原始输入值
result.usage       // { tokens: number } — token 消耗
```

#### embedMany() 签名和返回值

```typescript
const result = await embedMany({
  model: embeddingModel,           // 必填
  values: ['text1', 'text2', ...], // 必填：字符串数组
  maxRetries?: number,             // 可选：默认 2
  maxParallelCalls?: number,       // 可选：默认 Infinity
  abortSignal?: AbortSignal,
  headers?: Record<string, string>,
})

// 返回值
result.embeddings  // number[][] — 向量数组（与 values 同序）
result.values      // 原始输入数组
result.usage       // { tokens: number }
```

#### 创建 OpenAI Embedding Model

```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'

const openai = createOpenAI({
  apiKey: entry.apiKey,
  baseURL: entry.baseUrl,
})

// 使用 .embedding() 方法（v6 中从 .textEmbedding() 改名）
const embeddingModel = openai.embedding('text-embedding-3-small')

// 单条嵌入
const { embedding } = await embed({
  model: embeddingModel,
  value: 'document text to embed',
})
// embedding: number[] (1536 维)

// 批量嵌入
const { embeddings } = await embedMany({
  model: embeddingModel,
  values: ['chunk 1', 'chunk 2', 'chunk 3'],
  maxParallelCalls: 10,
})
// embeddings: number[][] (与 values 同序)
```

#### 模型 ID 字符串

| 模型 ID | 默认维度 | 支持自定义维度 |
|---------|---------|-------------|
| `'text-embedding-3-small'` | 1536 | Yes |
| `'text-embedding-3-large'` | 3072 | Yes |
| `'text-embedding-ada-002'` | 1536 | No |

自定义维度：
```typescript
const { embedding } = await embed({
  model: openai.embedding('text-embedding-3-small'),
  value: 'text',
  providerOptions: {
    openai: { dimensions: 512 },
  },
})
```

### 关键注意事项
1. **v6 Breaking Change**: `textEmbedding()` 改名为 `embedding()`，`textEmbeddingModel()` 改名为 `embeddingModel()`
2. **v6 Breaking Change**: 泛型已从 `EmbeddingModel`、`embed`、`embedMany` 移除
3. **embedMany 自动分块**: 超过模型单次上限时自动拆分请求，无需手动 batch
4. **OpenAI 限制**: `text-embedding-3-*` 每次请求最多 2048 条输入
5. **结果顺序保证**: embeddings 与 values 保持相同顺序
6. **应复用项目现有 resolveModel 模式**: 参考 `packages/server/src/agent/model.ts` 的动态 import + provider 查找逻辑

### 验证来源
- [AI SDK Core: embed 参考](https://ai-sdk.dev/docs/reference/ai-sdk-core/embed)
- [AI SDK Core: embedMany 参考](https://ai-sdk.dev/docs/reference/ai-sdk-core/embed-many)
- [AI SDK Providers: OpenAI](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [AI SDK v5 到 v6 迁移指南](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)
- 项目源码确认: `node_modules/.pnpm/ai@6.0.82/node_modules/ai/dist/index.d.ts` 导出验证

---

## 3. FTS5（SQLite 内置全文搜索）

### 版本
- SQLite 内置扩展，项目已在使用（`packages/server/src/db/fts.ts`）

### 正确用法

#### 普通模式 CREATE VIRTUAL TABLE

```sql
-- 普通模式（不指定 content= 即为普通模式，FTS5 自行存储数据副本）
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title,
  content,
  source_id UNINDEXED,       -- 存储但不索引（不可搜索）
  file_hash UNINDEXED,       -- 存储但不索引
  tokenize = 'porter unicode61',  -- 分词器：porter 词干 + unicode61
  prefix = '2 3'                   -- 前缀索引（加速前缀查询）
);
```

**列定义约束：**
- 不允许类型声明、约束、PRIMARY KEY
- 列名不能是 `rowid` 或 `rank`（保留隐式列）
- `UNINDEXED` 列：存储但不加入 FTS 索引，MATCH 查询中无可匹配 token

#### INSERT / DELETE / UPDATE（普通模式 = 普通表操作）

```sql
-- INSERT（和普通表完全一样）
INSERT INTO knowledge_fts(title, content, source_id, file_hash)
VALUES ('My Title', 'Document content here...', 'src-123', 'abc123');

-- 带 rowid
INSERT INTO knowledge_fts(rowid, title, content, source_id, file_hash)
VALUES (1, 'My Title', 'Content', 'src-123', 'abc123');

-- DELETE（普通语法）
DELETE FROM knowledge_fts WHERE rowid = 1;

-- UPDATE（普通语法）
UPDATE knowledge_fts SET title = 'New Title' WHERE rowid = 1;
```

> **重要区别**: 普通模式不需要 content= 触发器同步机制（当前项目 `fts.ts` 用的是 external content 模式）。普通模式 FTS5 自行存储数据，INSERT/UPDATE/DELETE 直接操作即可。

#### MATCH 搜索语法

```sql
-- 基本搜索
SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'search term';

-- 等价写法
SELECT * FROM knowledge_fts WHERE knowledge_fts = 'search term';
SELECT * FROM knowledge_fts('search term');

-- 指定列搜索
SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'title : sqlite';
SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH '{title content} : database';

-- 布尔操作
WHERE knowledge_fts MATCH 'sqlite AND database'
WHERE knowledge_fts MATCH 'sqlite OR postgres'
WHERE knowledge_fts MATCH 'sqlite NOT legacy'
WHERE knowledge_fts MATCH '(sqlite OR postgres) AND NOT legacy'

-- 短语匹配
WHERE knowledge_fts MATCH '"exact phrase"'

-- 前缀查询
WHERE knowledge_fts MATCH 'data*'

-- NEAR 查询（proximity）
WHERE knowledge_fts MATCH 'NEAR(sqlite database, 10)'
```

#### rank 排序

```sql
-- rank 是隐式列，默认等于 bm25() 的结果
-- 值越小（越负）= 匹配度越高
SELECT rowid, title, rank
FROM knowledge_fts
WHERE knowledge_fts MATCH 'database'
ORDER BY rank;  -- 升序 = 最佳匹配在前

-- 带列权重的 bm25（title 权重 10, content 权重 1）
SELECT rowid, title, rank
FROM knowledge_fts
WHERE knowledge_fts MATCH 'database'
  AND rank MATCH 'bm25(10.0, 1.0)'
ORDER BY rank;
```

> **性能提示**: `ORDER BY rank` 比 `ORDER BY bm25(table)` 快，因为 rank 缓存结果。

#### SNIPPET 函数

```sql
SELECT
  title,
  snippet(knowledge_fts, 1, '<mark>', '</mark>', '...', 32) AS excerpt
FROM knowledge_fts
WHERE knowledge_fts MATCH 'database'
ORDER BY rank;
```

**参数（5 个必填，表名后）：**
| # | 参数 | 说明 |
|---|------|------|
| 1 | col_index | 列索引（0 起始），**-1 = 自动选择最佳列** |
| 2 | open_text | 匹配前标记，如 `'<mark>'` |
| 3 | close_text | 匹配后标记，如 `'</mark>'` |
| 4 | ellipsis_text | 截断提示，如 `'...'` |
| 5 | max_tokens | 最大返回 token 数（1-64） |

#### highlight 函数（返回整列内容带标记）

```sql
SELECT highlight(knowledge_fts, 0, '<b>', '</b>') AS highlighted_title
FROM knowledge_fts
WHERE knowledge_fts MATCH 'database';
```

#### 维护命令

```sql
INSERT INTO knowledge_fts(knowledge_fts) VALUES('optimize');      -- 优化索引
INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild');       -- 重建索引
INSERT INTO knowledge_fts(knowledge_fts) VALUES('integrity-check');  -- 验证索引
```

### 关键注意事项
1. **普通模式 vs 外部内容模式**: KB 用普通模式（自存数据，无需触发器），现有 messages_fts 用外部内容模式
2. **UNINDEXED 列不可搜索**: 只是存储，MATCH 不会匹配到
3. **rank 值为负数**: 越小越好，用 `ORDER BY rank` 升序排列
4. **bm25 内部常数**: k1=1.2, b=0.75，不可配置
5. **snippet max_tokens 上限 64**: 超过无效

### 验证来源
- [SQLite FTS5 官方文档](https://www.sqlite.org/fts5.html) — 权威来源
- 项目源码: `packages/server/src/db/fts.ts` — 现有 FTS5 使用模式
- 项目源码: `packages/server/src/db/db.test.ts` — FTS5 查询测试

---

## 4. unpdf

### 版本
- npm: `unpdf` ^0.12（最新 v1.4.0，^0.12 解析到 0.12.x）
- 基于 Mozilla PDF.js 的服务端 PDF 解析
- 零运行时依赖（PDF.js 引擎已 bundled）
- 纯 JavaScript，无原生模块

### 正确用法

#### 导入方式（ESM + CJS 双支持）

```typescript
// ESM（推荐）
import { extractText, getDocumentProxy } from 'unpdf'

// CJS（也可用）
const { extractText, getDocumentProxy } = require('unpdf')
```

#### extractText 函数签名

```typescript
// 按页返回（默认）
function extractText(
  data: Uint8Array | PDFDocumentProxy,
  options?: { mergePages?: false }
): Promise<{ totalPages: number; text: string[] }>

// 合并返回
function extractText(
  data: Uint8Array | PDFDocumentProxy,
  options: { mergePages: true }
): Promise<{ totalPages: number; text: string }>
```

#### 输入类型
- `Uint8Array` — Node.js Buffer 需先 `new Uint8Array(buffer)` 包装
- `PDFDocumentProxy` — 通过 `getDocumentProxy()` 预加载

#### 完整示例

```typescript
import { readFile } from 'node:fs/promises'
import { extractText, getDocumentProxy } from 'unpdf'

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: true })
    return text  // string — 所有页面文本合并
  } finally {
    pdf.destroy()  // 清理资源
  }
}
```

直接传 Uint8Array（不创建 proxy）:
```typescript
const buffer = await readFile('./report.pdf')
const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
```

### 关键注意事项
1. **必须 `new Uint8Array(buffer)`**: 不能直接传 Node.js Buffer
2. **mergePages: true**: KB 场景通常需要全文，记得设置
3. **无原生模块**: 纯 JS，打包时不需要 externalize
4. **可选依赖 `@napi-rs/canvas`**: 只用于图片提取/渲染，文本提取不需要

### 验证来源
- [unjs/unpdf GitHub](https://github.com/unjs/unpdf) — 官方 README
- [unpdf npm](https://www.npmjs.com/package/unpdf) — 版本信息
- [unpdf UnJS 文档](https://unjs.io/packages/unpdf/)

---

## 5. mammoth

### 版本
- npm: `mammoth` ^1.8（最新 v1.11.0）
- .docx 转文本/HTML 提取
- 纯 JavaScript，无原生模块
- TypeScript 类型内置，不需要 @types/mammoth

### 正确用法

#### 导入方式

```typescript
// ESM
import mammoth from 'mammoth'

// CJS
const mammoth = require('mammoth')
```

> **注意**: 不支持 named export，必须 default import 后调用 `.extractRawText()`。

#### extractRawText 调用

```typescript
// 方式 A：文件路径
const result = await mammoth.extractRawText({ path: './document.docx' })

// 方式 B：Buffer（文件已在内存中时）
import { readFile } from 'node:fs/promises'
const buffer = await readFile('./document.docx')
const result = await mammoth.extractRawText({ buffer })
```

**输入格式（对象，必须有以下属性之一）：**
- Node.js: `{ path: string }` 或 `{ buffer: Buffer }`
- Browser: `{ arrayBuffer: ArrayBuffer }`

#### 输出格式

```typescript
{
  value: string,    // 提取的纯文本（段落间以 \n\n 分隔）
  messages: Array<{ type: string; message: string }>  // 警告/错误
}
```

#### 完整示例

```typescript
import mammoth from 'mammoth'
import { readFile } from 'node:fs/promises'

async function extractDocxText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return result.value  // 纯文本，段落间 \n\n 分隔
}
```

### 关键注意事项
1. **段落间双换行**: 输出中每个段落后跟 `\n\n`，如需单换行需后处理
2. **不做输入消毒**: 官方 README 警告 untrusted input 需要谨慎处理（主要针对 HTML 转换，文本提取影响较小）
3. **Node.js >= 12.0**: 最低版本要求
4. **default import only**: `import mammoth from 'mammoth'`，不支持 `import { extractRawText } from 'mammoth'`

### 验证来源
- [mwilliamson/mammoth.js GitHub](https://github.com/mwilliamson/mammoth.js) — 官方 README
- [mammoth npm](https://www.npmjs.com/package/mammoth) — 版本信息

---

## 6. better-sqlite3 + drizzle-orm 原始 SQL 执行

### 版本
- `drizzle-orm`: v0.45.1（项目已安装）
- `better-sqlite3`: 项目已使用

### 正确用法

#### Raw SQL 执行方法

```typescript
import { sql } from 'drizzle-orm'

// DDL（CREATE / ALTER / DROP）
db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS ...`)

// DML（INSERT / UPDATE / DELETE）— 返回 RunResult
const result = db.run(sql`INSERT INTO tbl (col) VALUES (${'value'})`)
// result.changes, result.lastInsertRowid

// SELECT 全部行
const rows = db.all<{ name: string }>(sql`PRAGMA table_info(messages)`)

// SELECT 单行
const row = db.get<{ count: number }>(sql`SELECT count(*) AS count FROM messages`)

// SELECT 原始数组
const raw = db.values(sql`SELECT * FROM tbl`)
```

**`sql` 模板 vs `sql.raw()`:**
```typescript
// sql`` — 参数化（安全，防注入）
sql`SELECT * FROM tbl WHERE id = ${id}`
// 生成: SELECT * FROM tbl WHERE id = ?  --> [id]

// sql.raw() — 无参数化（仅用于受信任的静态 SQL）
sql.raw(`SELECT * FROM tbl WHERE id = ${id}`)
// 生成: SELECT * FROM tbl WHERE id = 42  （字面替换）
```

#### 获取底层 better-sqlite3 实例

```typescript
// 官方公开 API（drizzle-orm 0.45.1+）
const sqlite = db.$client  // 类型: better-sqlite3.Database

// 项目当前用法（私有 API，可能在未来版本 break）
;(db as any)._.session.client
```

> 已通过 `node_modules/.pnpm/drizzle-orm@0.45.1/.../better-sqlite3/driver.d.ts` 第 23 行确认 `$client: Database` 导出。

#### 加载 SQLite 扩展

**方式 A：drizzle 实例创建后**
```typescript
db.$client.loadExtension('/path/to/extension')
```

**方式 B：drizzle 实例创建前（推荐，与项目现有模式一致）**
```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
// 在这里加载扩展
import * as sqliteVec from 'sqlite-vec'
sqliteVec.load(sqlite)

const db = drizzle(sqlite, { schema })
// 此后 db.run(sql`...`) 和 db.$client 都可用扩展功能
```

#### 高性能批量操作

```typescript
// 直接用 better-sqlite3 的 prepare + transaction（比 drizzle 的 sql`` 更快）
const sqlite = db.$client
const insert = sqlite.prepare('INSERT INTO tbl (id, embedding) VALUES (?, ?)')
const insertMany = sqlite.transaction((items: Array<[string, Float32Array]>) => {
  for (const [id, vec] of items) {
    insert.run(id, vec)
  }
})
insertMany(items)
```

#### 多语句执行

```typescript
// db.run() 只支持单条语句，多语句用底层 exec()
db.$client.exec(`
  CREATE TABLE IF NOT EXISTS foo (id TEXT);
  CREATE TABLE IF NOT EXISTS bar (id TEXT);
`)
```

### 关键注意事项
1. **优先用 `db.$client`** 而非 `(db as any)._.session.client` — 前者是公开 typed API
2. **sqlite-vec 用 `sqliteVec.load(sqlite)`** 而非 `sqlite.loadExtension()` — 见第 1 节
3. **虚拟表操作必须用 raw SQL**: FTS5 和 vec0 都不通过 drizzle schema 管理
4. **批量向量插入**: 用 `db.$client.prepare().run()` + `transaction()`，性能优于 drizzle `sql``
5. **项目 project-db.ts L35 建议更新**: `(db as any)._.session.client.close()` 改为 `db.$client.close()`

### 验证来源
- [Drizzle ORM 连接概述](https://orm.drizzle.team/docs/connect-overview) — `$client` 文档
- [Drizzle ORM raw SQL](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/goodies.mdx) — run/all/get/values
- [Drizzle ORM sql 模板](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/sql.mdx)
- 项目源码: `packages/server/src/db/client.ts` — createDatabase 模式
- 项目源码: `packages/server/src/db/fts.ts` — db.run(sql`...`) 用法
- 项目源码: `packages/server/src/db/project-db.ts` — 底层实例访问
- 类型确认: `node_modules/.pnpm/drizzle-orm@0.45.1/.../better-sqlite3/driver.d.ts:23`

---

## 7. 完整集成示例：sqlite-vec + drizzle + better-sqlite3

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sql } from 'drizzle-orm'
import * as sqliteVec from 'sqlite-vec'

// 1. 创建数据库并加载扩展
function createKBDatabase(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqliteVec.load(sqlite)  // 加载 sqlite-vec 扩展

  const db = drizzle(sqlite, { schema })
  return db
}

// 2. 创建 FTS5 + vec0 虚拟表
function setupKBTables(db: AppDatabase) {
  // FTS5 普通模式
  db.run(sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
      title,
      content,
      chunk_id UNINDEXED,
      tokenize = 'porter unicode61'
    )
  `)

  // vec0 向量表
  db.run(sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_vec USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding float[1536] distance_metric=cosine
    )
  `)
}

// 3. 插入文档块
function insertChunk(db: AppDatabase, chunk: {
  id: string; title: string; content: string; embedding: number[]
}) {
  // FTS5 插入
  db.run(sql`
    INSERT INTO kb_fts(chunk_id, title, content)
    VALUES (${chunk.id}, ${chunk.title}, ${chunk.content})
  `)

  // 向量插入（用底层连接提高性能）
  db.$client
    .prepare('INSERT INTO kb_vec(chunk_id, embedding) VALUES (?, ?)')
    .run(chunk.id, new Float32Array(chunk.embedding))
}

// 4. 混合搜索
function hybridSearch(db: AppDatabase, query: string, queryVec: number[], limit: number) {
  // FTS5 文本搜索
  const ftsResults = db.all<{ chunk_id: string; rank: number }>(sql`
    SELECT chunk_id, rank
    FROM kb_fts
    WHERE kb_fts MATCH ${query}
    ORDER BY rank
    LIMIT ${limit}
  `)

  // 向量相似度搜索
  const vecResults = db.$client.prepare(`
    SELECT chunk_id, distance
    FROM kb_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(new Float32Array(queryVec), limit)

  return { ftsResults, vecResults }
}
```

---

## 总结：各技术一览表

| 技术 | 版本 | 关键 API | 注意事项 |
|------|------|---------|---------|
| sqlite-vec | ^0.1.6 | `sqliteVec.load(db)`, `vec0`, `MATCH` | Float32Array, BigInt rowid, 原生模块需 externalize |
| AI SDK embed | v6.0.82 | `embed()`, `embedMany()` from `'ai'` | `.embedding()` 不是 `.textEmbedding()` (v6) |
| FTS5 | SQLite 内置 | `MATCH`, `rank`, `snippet()`, `bm25()` | 普通模式无需触发器，rank 越小越好 |
| unpdf | ^0.12 | `extractText()`, `getDocumentProxy()` | `new Uint8Array(buffer)`, 纯 JS |
| mammoth | ^1.8 | `mammoth.extractRawText({ buffer })` | default import only, \n\n 段落分隔 |
| drizzle raw SQL | v0.45.1 | `db.run(sql`...`)`, `db.$client` | 虚拟表用 raw SQL, 批量用 $client.prepare |
