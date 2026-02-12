# Fact Check: AI SDK v6 Message Persistence API

> AI SDK version: `ai@6.0.78`, `@ai-sdk/react@3.0.80`
> Source: actual `node_modules` type definitions + official docs

---

## 1. toUIMessageStreamResponse 的 onFinish 回调

### 验证结论

`toUIMessageStreamResponse` 是 `StreamTextResult` 上的方法，签名如下：

```ts
toUIMessageStreamResponse<UI_MESSAGE extends UIMessage>(
  options?: UIMessageStreamResponseInit & UIMessageStreamOptions<UI_MESSAGE>
): Response;
```

其中 `UIMessageStreamOptions` 包含的 `onFinish` 回调类型为：

```ts
type UIMessageStreamOnFinishCallback<UI_MESSAGE extends UIMessage> = (event: {
  /** 完整的消息列表（含本轮 AI 回复） */
  messages: UI_MESSAGE[];
  /** 是否是对已有 assistant message 的续写 */
  isContinuation: boolean;
  /** stream 是否被 abort */
  isAborted: boolean;
  /** 本轮 AI 的 response message（完整 UIMessage，含 parts 数组） */
  responseMessage: UI_MESSAGE;
  /** 生成结束原因 */
  finishReason?: FinishReason; // 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'
}) => PromiseLike<void> | void;
```

**关键结论**：
- `messages` 是 `UI_MESSAGE[]`（完整会话历史 + 本轮回复）
- `responseMessage` 是单个 `UI_MESSAGE`（本轮 AI 回复，含完整 parts 数组）
- 如果流被中断，`isAborted = true`，仍然会调用 onFinish（含部分内容）

### originalMessages 参数

```ts
originalMessages?: UI_MESSAGE[];
```

作用：传入客户端发来的原始消息列表。当提供时，SDK 进入 **persistence mode**，会为 response message 生成 message ID。如果不提供 originalMessages，response message 不会有 ID。

**这是实现持久化的关键参数** — 必须传入才能保证 onFinish 中的 messages 有正确的 ID。

### 验证来源
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L1916-1939, L1964-2016, L2228
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream

### 当前代码问题

**严重问题**：当前 `chat.ts` 使用的是 `streamText` 的 `onFinish`（L130），而不是 `toUIMessageStreamResponse` 的 `onFinish`。

```ts
// 当前代码（chat.ts L130-148）— 用的是 streamText.onFinish
const result = streamText({
  ...
  onFinish: async ({ text }) => {  // ← 这是 streamText 的 onFinish，只有 text
    if (conversationId && text) {
      await deps.conversationStorage.saveMessage(...)
    }
  },
})
return result.toUIMessageStreamResponse()  // ← 没有传 onFinish/originalMessages
```

应改为：

```ts
const result = streamText({ ... })  // 不需要 onFinish
return result.toUIMessageStreamResponse({
  originalMessages: messages,  // ← 启用 persistence mode
  onFinish: async ({ messages, responseMessage }) => {
    // 这里的 responseMessage 是完整的 UIMessage，含 tool parts
  },
})
```

---

## 2. UIMessage.parts 的所有可能类型

### 验证结论

`UIMessagePart` 的完整联合类型（来自源码 L1328）：

```ts
type UIMessagePart<DATA_TYPES, TOOLS> =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart<TOOLS>       // type: `tool-${NAME}`
  | DynamicToolUIPart       // type: 'dynamic-tool'
  | SourceUrlUIPart         // type: 'source-url'
  | SourceDocumentUIPart    // type: 'source-document'
  | FileUIPart              // type: 'file'
  | DataUIPart<DATA_TYPES>  // type: `data-${NAME}`
  | StepStartUIPart         // type: 'step-start'
```

各类型的完整字段：

#### TextUIPart
```ts
{ type: 'text'; text: string; state?: 'streaming' | 'done'; providerMetadata?: ProviderMetadata }
```

#### ReasoningUIPart
```ts
{ type: 'reasoning'; text: string; state?: 'streaming' | 'done'; providerMetadata?: ProviderMetadata }
```

#### ToolUIPart (静态工具)
```ts
{
  type: `tool-${NAME}`;
  toolCallId: string;
  title?: string;
  providerExecuted?: boolean;
  state: 'input-streaming' | 'input-available' | 'approval-requested' | 'approval-responded'
       | 'output-available' | 'output-error' | 'output-denied';
  input: ...; output: ...; errorText?: string;
  callProviderMetadata?: ProviderMetadata;
  approval?: { id: string; approved?: boolean; reason?: string };
  preliminary?: boolean;  // only on 'output-available'
}
```

7 种状态（完整）：
1. `input-streaming` — input 还在流式生成
2. `input-available` — input 完整可用
3. `approval-requested` — 等待用户审批
4. `approval-responded` — 用户已回应审批
5. `output-available` — 执行成功，有 output
6. `output-error` — 执行失败，有 errorText
7. `output-denied` — 审批被拒绝

#### DynamicToolUIPart
```ts
{ type: 'dynamic-tool'; toolName: string; toolCallId: string; title?: string;
  providerExecuted?: boolean; state: ...; /* 同上 7 种状态 */ }
```

#### SourceUrlUIPart
```ts
{ type: 'source-url'; sourceId: string; url: string; title?: string; providerMetadata?: ProviderMetadata }
```

#### SourceDocumentUIPart
```ts
{ type: 'source-document'; sourceId: string; mediaType: string; title: string;
  filename?: string; providerMetadata?: ProviderMetadata }
```

#### FileUIPart
```ts
{ type: 'file'; mediaType: string; filename?: string; url: string; providerMetadata?: ProviderMetadata }
```

#### StepStartUIPart
```ts
{ type: 'step-start' }
```

#### DataUIPart (自定义)
```ts
{ type: `data-${NAME}`; id?: string; data: DATA_TYPES[NAME] }
```

### 验证来源
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L1328-1520
- https://ai-sdk.dev/docs/reference/ai-sdk-core/ui-message

---

## 3. UIMessage 序列化/反序列化

### 验证结论

**可以直接 JSON.stringify / JSON.parse**。官方示例直接使用：

```ts
// 保存
const content = JSON.stringify(messages, null, 2);
await writeFile(getChatFile(chatId), content);

// 加载
return JSON.parse(await readFile(getChatFile(id), 'utf8'));
```

**需要注意的字段**：

1. **无 Date 对象** — UIMessage 中没有 Date 类型字段，全部是 string/number/boolean/object
2. **无函数引用** — 所有字段都是纯数据
3. **ProviderMetadata** — 是 `Record<string, Record<string, JSONValue>>` 类型，天然可序列化
4. **state 字段** — 纯字符串枚举，可序列化
5. **tool input/output** — 都是 JSON-compatible 的值

**Tool invocation 的 state 在 onFinish 时的值**：

在 `toUIMessageStreamResponse` 的 `onFinish` 中，tool parts 的 state 应该是：
- 正常执行完成：`output-available`（含 input + output）
- 执行出错：`output-error`（含 input + errorText）
- 等待审批的工具：`approval-requested`（如果流结束时还没审批）

**注意**：不会出现 `input-streaming` 状态 — onFinish 只在流完成后调用。

### 验证来源
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence （官方示例直接 JSON.stringify）
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L1434-1515

### 当前代码问题

当前 `toUIMessages()` 函数（chat-instances.ts L19-27）只转换 text content，丢失了 tool parts、reasoning parts 等。改用完整 UIMessage 持久化后，反序列化可以直接使用，不需要手动构建 parts。

---

## 4. Chat class 初始化

### 验证结论

Chat 构造函数签名（来自 `@ai-sdk/react` 源码）：

```ts
class Chat<UI_MESSAGE extends UIMessage> extends AbstractChat<UI_MESSAGE> {
  constructor({ messages, ...init }: ChatInit<UI_MESSAGE>);
}
```

其中 `ChatInit` 的 `messages` 字段类型：

```ts
interface ChatInit<UI_MESSAGE extends UIMessage> {
  id?: string;
  messages?: UI_MESSAGE[];          // ← 直接接受 UIMessage[]
  generateId?: IdGenerator;
  transport?: ChatTransport<UI_MESSAGE>;
  onError?: ChatOnErrorCallback;
  onToolCall?: ChatOnToolCallCallback<UI_MESSAGE>;
  onFinish?: ChatOnFinishCallback<UI_MESSAGE>;
  onData?: ChatOnDataCallback<UI_MESSAGE>;
  // ...其他可选字段
}
```

**关键结论**：
- `messages` 参数直接接受 `UIMessage[]`
- 从 DB 反序列化的 `UIMessage[]`（通过 JSON.parse）可以直接传入
- 无需转换格式 — 只要结构符合 UIMessage 接口即可

### 验证来源
- `node_modules/.pnpm/@ai-sdk+react@3.0.80_react@19.2.4_zod@3.25.76/node_modules/@ai-sdk/react/dist/index.d.ts` L5-7
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L3299-3343

### 当前代码状态

当前 `chat-instances.ts` 使用 `toUIMessages(config.initialMessages)` 手动转换，只保留了 text parts。改用完整 UIMessage 持久化后，可以直接传入反序列化的 UIMessage[]，保留所有 parts。

---

## 5. convertToModelMessages

### 验证结论

函数签名（v6 是 async）：

```ts
declare function convertToModelMessages<UI_MESSAGE extends UIMessage>(
  messages: Array<Omit<UI_MESSAGE, 'id'>>,
  options?: {
    tools?: ToolSet;
    ignoreIncompleteToolCalls?: boolean;
    convertDataPart?: (part: DataUIPart<...>) => TextPart | FilePart | undefined;
  }
): Promise<ModelMessage[]>;
```

**关键结论**：
- **是 async**（v6 变更，为了支持 async `Tool.toModelOutput()`）
- **可以处理含 tool-invocation parts 的 UIMessage** — 不仅仅是 text parts
- `ignoreIncompleteToolCalls` 选项可以跳过未完成的 tool calls（默认 false）
- 输入类型是 `Array<Omit<UI_MESSAGE, 'id'>>`，不需要 id 字段

**tool invocation 的处理**：
- `input-available` / `output-available` → 转为 ModelMessage 中的 tool-call + tool-result
- `input-streaming` / 不完整状态 → 如果 `ignoreIncompleteToolCalls: true` 则跳过

### 验证来源
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L3464-3468
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/convert-to-model-messages
- https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0 （确认 v6 async 变更）

### 当前代码状态

当前 `chat.ts` L119 已经正确使用 `await convertToModelMessages(messages)`。✅

---

## 6. generateMessageId

### 验证结论

`toUIMessageStreamResponse` 通过 `UIMessageStreamOptions` 接受 `generateMessageId` 参数：

```ts
type UIMessageStreamOptions<UI_MESSAGE extends UIMessage> = {
  originalMessages?: UI_MESSAGE[];
  generateMessageId?: IdGenerator;  // ← 自定义 message ID 生成
  onFinish?: UIMessageStreamOnFinishCallback<UI_MESSAGE>;
  sendReasoning?: boolean;   // 默认 true
  sendSources?: boolean;     // 默认 false
  sendFinish?: boolean;      // 默认 true
  sendStart?: boolean;       // 默认 true
  onError?: (error: unknown) => string;
  messageMetadata?: (options: { part: TextStreamPart<ToolSet> }) => METADATA | undefined;
};
```

**关键结论**：
- 参数名是 `generateMessageId`（不是 `generateId`，与 `createUIMessageStream` 的 `generateId` 不同）
- 类型是 `IdGenerator`（`() => string`）
- **仅在传了 `originalMessages` 时才生效**（persistence mode）
- 如果不提供但传了 `originalMessages`，SDK 会使用内置 ID 生成器
- 如果最后一条 original message 是 assistant 且被续写（continuation），则复用该 message 的 ID

**自定义 message ID 的方式**：

```ts
import { createIdGenerator } from 'ai'

return result.toUIMessageStreamResponse({
  originalMessages: messages,
  generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
  onFinish: ({ messages, responseMessage }) => { ... },
})
```

或直接使用自定义函数：

```ts
generateMessageId: () => `msg_${nanoid()}`
```

### 验证来源
- `node_modules/.pnpm/ai@6.0.78_zod@3.25.76/node_modules/ai/dist/index.d.ts` L1976
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence

### 当前代码建议

当前项目使用 `generateId('msg')` 作为 message ID 格式。可以在 `toUIMessageStreamResponse` 中传入自定义 `generateMessageId` 保持一致格式：

```ts
import { generateId } from '../utils/ids'

return result.toUIMessageStreamResponse({
  originalMessages: messages,
  generateMessageId: () => generateId('msg'),
  onFinish: async ({ responseMessage }) => { ... },
})
```

---

## 总结：当前代码 vs 最佳实践

| 项目 | 当前状态 | 最佳实践 | 差距 |
|------|----------|----------|------|
| 消息保存位置 | `streamText.onFinish` 只存 text | `toUIMessageStreamResponse.onFinish` 存完整 UIMessage | **需修改** |
| originalMessages | 未传入 | 必须传入以启用 persistence mode | **需修改** |
| 保存内容 | 只存 `{ role, content: text }` | 存完整 UIMessage（含 parts 数组） | **需修改** |
| Chat 初始化 | `toUIMessages()` 手动构建简单 parts | 直接传入反序列化的 UIMessage[] | **需修改** |
| convertToModelMessages | 已正确使用 await | 已正确使用 await | ✅ 正确 |
| generateMessageId | 未传入（SDK 生成随机 ID） | 传入自定义生成器保持 ID 格式一致 | 建议改进 |
| sendReasoning | 未设置（默认 true） | 设为 true 以支持 reasoning 模型 | ✅ 默认正确 |
| sendSources | 未设置（默认 false） | 视需求决定 | 可选 |
