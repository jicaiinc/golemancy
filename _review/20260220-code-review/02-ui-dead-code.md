# UI 死代码与未引用导出审查报告

> 审查范围：`packages/ui/src/`
> 审查日期：2026-02-20
> 审查员：UI Dead Code Hunter

---

## 分类说明

- 🔴 **确认死代码**：导出存在但整个代码库内无消费者
- 🟡 **可能未使用**：被导出但仅有间接引用，或 runtime 中始终为 undefined
- 🟢 **低使用率但已引用**：有测试覆盖或条件使用，无需清理

---

## 🔴 确认死代码

### 1. `ProjectDashboardPage` — 完整的死页面

**文件**：`pages/project/ProjectDashboardPage.tsx`
**桶导出**：`pages/project/index.ts:3`

```
export { ProjectDashboardPage } from './ProjectDashboardPage'
```

**问题**：
- 未在 `routes.tsx` 中注册任何路由
- 未在 `pages/index.tsx` 中重新导出
- 全库搜索只在自身定义和桶导出文件中出现
- 该文件 181 行，包含完整的 Agent/Task/Conversation 汇总页面逻辑，但**永远无法被用户访问**

**附带问题**：
- 文件内 `import type { ConversationTaskStatus } from '@golemancy/shared'`（第5行）在整个文件中从未使用（无类型注解引用此类型）

---

### 2. `useProjectAgents` — 零消费者的 Hook

**文件**：`hooks/index.ts:27`
**桶导出链**：`hooks/index.ts` → `src/index.ts:3`

```ts
export function useProjectAgents() {
  return useAppStore(s => s.agents)
}
```

**全库搜索结果**：仅在定义文件和桶导出两处出现。没有任何页面、组件或服务调用此 hook。

---

### 3. `clearWorkspace()` — 从未调用的 Store Action

**文件**：`stores/useAppStore.ts`
- 接口定义：第 155 行 (`WorkspaceActions`)
- 实现：第 549 行

```ts
clearWorkspace() {
  set({ workspaceEntries: [], workspaceCurrentPath: '', workspacePreview: null })
}
```

**全库搜索**：仅在自身定义和接口中出现。没有组件、页面或测试调用过此 action。

---

### 4. `markDashboardStale()` — 从未调用的 Store Action

**文件**：`stores/useAppStore.ts`
- 接口定义：第 205 行 (`DashboardActions`)
- 实现：第 832 行

```ts
markDashboardStale() {
  set({ dashboardStale: true })
}
```

**全库搜索**：仅在自身定义和接口中出现。没有任何消费者。

---

### 5. `lib/motion.ts` — 4 个从未使用的动画预设

**文件**：`lib/motion.ts`

| 导出标识符 | 类型 | 使用状态 |
|---|---|---|
| `pixelTransition` | 动画配置 | 🔴 从未导入 |
| `pixelSpring` | 动画配置 | 🔴 从未导入 |
| `fadeInUp` | 动画变体 | 🔴 从未导入 |
| `pageTransition` | 动画变体 | 🔴 从未导入 |

正在使用的导出：`staggerContainer`, `staggerItem`（多处使用），`modalTransition`（PixelModal），`dropdownTransition`（PixelDropdown）。

---

### 6. `HttpError` — 导出但从未被外部 catch

**文件**：`services/http/base.ts:1`

```ts
export class HttpError extends Error {
  constructor(public status: number, message: string) { ... }
}
```

**问题**：整个 `packages/ui/src` 中没有任何文件 `import { HttpError }` 来捕获或检查此错误类型。它在 `base.ts` 内部被 `throw` 但没有文件通过类型检查来 catch。

---

### 7. `getAuthToken()` — 从未被外部调用的导出函数

**文件**：`services/http/base.ts:15`
**桶导出**：`services/http/index.ts:37`

```ts
export function getAuthToken(): string | null {
  return authToken
}
```

**问题**：`authToken` 模块变量在 `fetchJson` 内部直接访问，不需要通过此函数。全库搜索：无任何外部消费者 import 或调用此函数。

---

### 8. `topology-types.ts` — 两个死类型导出

**文件**：`pages/agent/topology/topology-types.ts`

```ts
export interface TopologyNodePosition { x: number; y: number }
export type TopologyLayout = Record<AgentId, TopologyNodePosition>
```

**问题**：全库无任何文件 import 这两个类型。Store 中使用的是内联类型 `Record<string, { x: number; y: number }>`，而非此处的具名类型。

---

## 🟡 可能未使用 / 运行时为死代码

### 9. `PixelProgress` — 仅测试文件引用

**文件**：`components/base/PixelProgress.tsx`
**桶导出**：`components/base/index.ts:11`

**状态**：全库只在 `PixelProgress.test.tsx` 中被引用。没有任何页面或组件实际渲染 `<PixelProgress>`。

---

### 10. `PixelTooltip` — 仅测试文件引用

**文件**：`components/base/PixelTooltip.tsx`
**桶导出**：`components/base/index.ts:12`

**状态**：全库只在 `PixelTooltip.test.tsx` 中被引用。没有任何页面或组件实际渲染 `<PixelTooltip>`。

---

### 11. `actualMode` prop in `StatusBar` — 永远未被传入

**文件**：`components/layout/StatusBar.tsx:13`

```ts
interface StatusBarProps {
  actualMode?: PermissionMode   // 声明了，有逻辑，但从未传入
  ...
}
```

**问题**：`ChatPage.tsx`（唯一调用者）中有明确 TODO 注释：
```tsx
{/* TODO: Pass actualMode from WS mode_degraded events once WebSocket integration is wired up */}
```

该 prop 在运行时始终为 `undefined`，相应的 UI 分支（降级提示）永远不会被渲染。

---

### 12. `components/project/index.ts` — 空桶文件

**文件**：`components/project/index.ts`

```ts
export {}
```

**问题**：仅包含一个空导出语句。`components/index.ts` 引用了 `export * from './project'`，但这个桶什么也不导出，是纯死文件。

---

### 13. `useWebSocket` 返回值中的 `send` — 被丢弃

**文件**：`hooks/useWebSocket.ts:14`

```ts
interface UseWebSocketReturn {
  status: WsStatus
  send: (data: string) => void   // 被返回但从未被 WebSocketProvider 暴露
  subscribe: ...
  unsubscribe: ...
}
```

**问题**：`WebSocketProvider.tsx` 解构时丢弃 `send`：
```ts
const { status, subscribe, unsubscribe } = useWebSocket({ url, onMessage })
// send 被丢弃
```

Context 类型 `WsContextValue` 也不包含 `send`。`send` 实际上只在内部 ping 心跳中被 `subscribe`/`unsubscribe` 间接调用。

---

### 14. `UseWebSocketOptions` 中的 `onOpen` 和 `onClose` — 从未传入

**文件**：`hooks/useWebSocket.ts:6`

```ts
interface UseWebSocketOptions {
  onOpen?: () => void    // 从未传入
  onClose?: () => void   // 从未传入
}
```

**问题**：`WebSocketProvider` 在调用 `useWebSocket` 时只传入 `{ url, onMessage }`，从未使用 `onOpen` / `onClose`。

---

### 15. `AgentCreateModal` 的桶导出 — 超范围暴露

**文件**：`pages/agent/index.ts:3`

```ts
export { AgentCreateModal } from './AgentCreateModal'
```

**问题**：`AgentCreateModal` 仅在 `AgentListPage.tsx` 中通过相对路径直接 import，未被 `pages/index.tsx` 重新导出到外层。这个桶导出是多余的公开接口。

---

### 16. `ProjectCreateModal` 的桶导出 — 超范围暴露

**文件**：`pages/project/index.ts:2`

```ts
export { ProjectCreateModal } from './ProjectCreateModal'
```

**问题**：同上，`ProjectCreateModal` 仅在 `ProjectListPage.tsx` 中相对路径引用，`pages/index.tsx` 未转发此导出。

---

### 17. `relativeTime` 重复实现 — 6 个副本

**中心定义**：`pages/dashboard/utils.ts:7`（支持 `null` 输入）

**局部重复实现**（各自定义了相同逻辑，但不支持 `null`）：

| 文件 | 行号 |
|---|---|
| `pages/workspace/FilePreview.tsx` | 19 |
| `pages/chat/ChatSidebar.tsx` | 15 |
| `pages/project/ProjectListPage.tsx` | 10 |
| `pages/task/TaskListPage.tsx` | 12 |
| `pages/memory/MemoryPage.tsx` | 12 |
| `pages/project/ProjectDashboardPage.tsx` | 9（死页面）|

**问题**：代码复制导致维护风险，中心版本未被充分利用。

---

### 18. `formatDuration` 重复实现

**中心定义**：`pages/dashboard/utils.ts:27`

**局部重复**：`pages/cron/CronJobRunsModal.tsx:14`（局部函数，逻辑相同）

---

### 19. `AppState` 类型 — 孤立导出

**文件**：`stores/index.ts:1`

```ts
export { useAppStore, type AppState } from './useAppStore'
```

**问题**：`AppState` 未被 `packages/ui/src/index.ts` 重新导出到包外部，在 `packages/ui/src` 内部也没有其他文件 import 此类型（只有 store 内部自用）。

---

### 20. `http/index.ts` — 13 个 HTTP 服务类的冗余公开导出

**文件**：`services/http/index.ts:36`

```ts
export { HttpProjectService, HttpAgentService, ... HttpPermissionsConfigService } from './services'
```

**问题**：全库中这些类只被 `services.test.ts` 直接 import 用于测试（mocking）。真实消费者只使用 `createHttpServices()` 工厂。这13个类的公开导出是无必要的 API 表面积暴露。

---

## 🟢 低使用率但已有效引用（不需要删除）

以下项目引用较少但确实被使用：

| 标识符 | 引用来源 |
|---|---|
| `GlobalNavDropdown` | `TopBar.tsx` 内部使用 |
| `ErrorBoundary` | `App.tsx` 使用 |
| `PixelDropZone` | `MCPServersPage`, `SkillsPage` 使用 |
| `StatusBar` | `ChatPage.tsx` 使用 |
| `WebSocketProvider` / `useWs` | `providers.tsx` 和多个页面使用 |
| `computeDagreLayout` | `useTopologyData.ts` 使用 |
| `createMockServices` | `ServiceProvider.tsx` 使用（mock 模式） |
| `SkillFormModal` | `SkillsPage.tsx` 内部使用 |

---

## 汇总统计

| 分类 | 数量 |
|---|---|
| 🔴 确认死代码 | 8 项（含 1 整页、2 store action、4 动画预设、2 类型、2 函数） |
| 🟡 可能未使用 | 12 项 |
| 合计需关注 | 20 项 |

---

## 优先级建议

1. **立即清理**：`ProjectDashboardPage`（整文件）、`useProjectAgents`、4个motion预设
2. **短期清理**：`clearWorkspace`、`markDashboardStale`、`HttpError`、`getAuthToken`、topology类型
3. **中期重构**：合并 `relativeTime` / `formatDuration` 重复实现；清理 `PixelProgress` / `PixelTooltip`（如无计划添加用途）
4. **待跟踪**：`actualMode` prop — 等待 WebSocket mode_degraded 事件实现后补齐
