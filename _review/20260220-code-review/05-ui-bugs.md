# UI Bug 审查报告

**审查员**: UI Bug Hunter
**日期**: 2026-02-20
**范围**: `packages/ui/src/` — stores、pages、hooks、providers

---

## 🔴 确认 Bug

### BUG-01：ProjectLayout 初始化竞态 → 黑屏 / 重定向循环

**文件**: `packages/ui/src/app/layouts/ProjectLayout.tsx:34-45`

**问题描述**:
`projects` 初始状态为空数组（`projectsLoading` 初始值为 `false`）。`DataLoader` 调用 `loadProjects()` 是异步的，而 `ProjectLayout` 的 `useEffect` 会在第一次渲染后立即执行。此时 `projects = []`，`exists` 为 `undefined`，触发 `navigate('/', { replace: true })`。

当应用以 `--project-id` 标志（`openNewWindow`）启动时：
1. `RootRedirect` 根据 `getInitialProjectId()` 重定向至 `/projects/:id`
2. `ProjectLayout` 渲染，`projects = []` → `navigate('/')`
3. `RootRedirect` 再次读取 `getInitialProjectId()`（始终返回同一 ID）→ 再次重定向至 `/projects/:id`
4. **潜在无限循环**，直到 `loadProjects()` 的网络请求完成

```tsx
// ProjectLayout.tsx:34-45
useEffect(() => {
  if (!projectId) return

  const exists = projects.find(p => p.id === projectId)
  if (!exists) {
    navigate('/', { replace: true })  // ← BUG: projects 可能还未加载完
    return
  }
  // ...
}, [projectId, projects, currentProjectId, selectProject, navigate])
```

**影响**: 使用"在新窗口打开"功能时，可能导致黑屏或循环重定向直到数据加载完成。

**建议修复**: 在 `ProjectLayout` 中读取 `projectsLoading` 状态，若正在加载则提前返回，不执行导航判断：
```tsx
const projectsLoading = useAppStore(s => s.projectsLoading)
// ...
if (!exists) {
  if (!projectsLoading) {  // 只有确认加载完毕后才视为"不存在"
    navigate('/', { replace: true })
  }
  return
}
```

---

## 🟡 可疑 Bug

### BUG-02：TopologyView prevAgentCountRef 未更新 → 重复触发高亮

**文件**: `packages/ui/src/pages/agent/topology/TopologyView.tsx:61-71`

**问题描述**:
`useEffect` 内 `if (agents.length > prevAgentCountRef.current)` 分支执行时，通过 `return () => clearTimeout(timer)` 提前返回，导致后面的 `prevAgentCountRef.current = agents.length` 语句**永远不会执行**。一旦添加了第一个 agent，`prevAgentCountRef.current` 永久停留在旧值，此后每次 `agents` 引用变化（如后台数据刷新），都会满足 `agents.length > prevAgentCountRef.current` 条件，重复触发高亮动画。

```tsx
// TopologyView.tsx:61-71
useEffect(() => {
  if (agents.length > prevAgentCountRef.current) {
    const newAgent = agents[agents.length - 1]
    setHighlightedNodeId(newAgent.id)
    const timer = setTimeout(() => setHighlightedNodeId(null), 2000)
    return () => clearTimeout(timer)  // ← 提前返回，下面的 ref 更新被跳过
  }
  prevAgentCountRef.current = agents.length  // ← 仅在 if 不成立时才执行
}, [agents])
```

**建议修复**: 将 `prevAgentCountRef.current = agents.length` 移入 if 分支：
```tsx
if (agents.length > prevAgentCountRef.current) {
  prevAgentCountRef.current = agents.length  // 先更新 ref
  const newAgent = agents[agents.length - 1]
  setHighlightedNodeId(newAgent.id)
  const timer = setTimeout(() => setHighlightedNodeId(null), 2000)
  return () => clearTimeout(timer)
}
prevAgentCountRef.current = agents.length
```

---

### BUG-03：usePermissionMode / usePermissionConfig 缺少 async 清理 → 竞态 + 内存泄漏

**文件**: `packages/ui/src/hooks/index.ts:48-65` 和 `82-99`

**问题描述**:
两个 hook 均在 `useEffect` 中发起异步请求，但未在 cleanup 函数中取消或忽略已过期的请求结果。

```tsx
// hooks/index.ts:57-62
service.getById(projectId, effectiveId).then(config => {
  setMode(config?.mode ?? 'sandbox')  // ← 组件已卸载时仍会 setState（React 18 warning）
}).catch(() => {
  setMode('sandbox')
})
// 没有 cleanup / ignore flag
```

**影响**:
1. 快速切换项目时（projectId 变化），旧请求可能在新请求之后 resolve，覆盖正确的权限模式
2. 组件卸载后 setState 触发 React 18 warning
3. `ChatPage` 中依赖此 hook 的 `StatusBar` 可能短暂显示错误的权限模式

---

### BUG-04：GeneralAgentTab useEffect 依赖不完整 → 使用陈旧 availableProviders

**文件**: `packages/ui/src/pages/agent/AgentDetailPage.tsx:148-154`

**问题描述**:
自动回退 Provider 的 `useEffect` 依赖数组为 `[availableProviders.length, providerSlug, settings?.providers]`，但 effect 内部访问了 `availableProviders[0]`（闭包变量）。若 providers 数量不变但第一个 provider 被替换为不同的 provider，effect 不会重新运行，将用陈旧的 `availableProviders[0]` 设置 providerSlug 和 model。

```tsx
// AgentDetailPage.tsx:148-154
useEffect(() => {
  if (availableProviders.length > 0 && !settings?.providers[providerSlug]) {
    const [slug, entry] = availableProviders[0]  // ← 可能是陈旧闭包值
    setProviderSlug(slug)
    setModel(entry.models[0] ?? '')
  }
}, [availableProviders.length, providerSlug, settings?.providers])  // ← 缺少 availableProviders
```

**建议**: 将 `availableProviders` memoize（`useMemo`）并加入依赖数组，或重构 effect 使其仅依赖稳定的原始值。

---

### BUG-05：selectProject AbortController 创建但 signal 未使用

**文件**: `packages/ui/src/stores/useAppStore.ts:237-238`

**问题描述**:
注释声称"取消进行中的请求"，实际创建的 `AbortController` signal 从未传递给任何服务调用。所有 `svc.xxx.list(id)` 调用均不接收 signal 参数，请求不会被取消。

```ts
// useAppStore.ts:237-238
projectAbort?.abort()        // abort 被调用，但没有任何请求监听它
projectAbort = new AbortController()
// ...
const [agents, conversations, ...] = await Promise.all([
  safe(svc.agents.list(id)),         // ← 没有传入 signal
  safe(svc.conversations.list(id)),  // ← 同上
  // ...
])
```

**实际影响**: 快速切换项目时，旧请求仍会完成执行并触发服务端逻辑（如数据库查询），但因有 `if (get().currentProjectId !== id) return` 守卫，数据不会被错误写入 UI 状态。属于性能浪费而非数据错误 Bug。

---

## 🟢 轻微问题

### MINOR-01：toolWarnings / MessageBubble parts 使用 index 作为 key

**文件**:
- `packages/ui/src/pages/chat/ChatWindow.tsx:300` — `toolWarnings.map((warning, i) => <p key={i}>`
- `packages/ui/src/pages/chat/MessageBubble.tsx:195` — `message.parts.map((part, i) => ... key={i})`

列表仅追加不重排，实际影响极小，但不符合 key 应稳定唯一的最佳实践。若消息部分被删除/重排（如 AI SDK 版本升级），可能导致渲染错误。

---

### MINOR-02：MemoryPage 删除无二次确认

**文件**: `packages/ui/src/pages/memory/MemoryPage.tsx:149`

```tsx
<PixelButton size="sm" variant="ghost" onClick={() => deleteMemory(entry.id)}>
  &times;
</PixelButton>
```

点击 × 直接删除，无确认对话框。与 `CronJobsPage`（有 `PixelModal` 确认）、`WorkspacePage`（有删除确认 Modal）不一致，用户误点无法撤销。

---

### MINOR-03：TopologyView 系统主题切换不响应

**文件**: `packages/ui/src/pages/agent/topology/TopologyView.tsx:41-49`

```tsx
const colorMode = useMemo<'light' | 'dark'>(() => {
  // ...
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}, [themeMode])  // ← media query 结果被缓存，OS 换主题不触发更新
```

当 `themeMode === 'system'` 时，ReactFlow 的颜色模式在初次计算后被 memo 缓存。用户在 OS 层切换深/浅色主题时，topology 视图不会跟随更新，直到用户手动切换 App 主题后再切回。

---

## 路由分析

路由定义（`packages/ui/src/app/routes.tsx`）路径设置正确：
- `chat?conv=...` URL 参数同步逻辑在 `ChatPage.tsx` 中实现正确
- Cron 导航已在 part 3 修复（使用 `cron` 而非 `automations/${cronJobId}`）
- AgentDetailPage 返回按钮正确携带 `{ state: { fromView } }` 参数

---

## 状态管理分析

- `selectConversation` 加载时先获取全量消息再 set，避免 ChatWindow mount 时消息为空 — ✅ 正确
- `deleteConversation` 调用 `destroyChat(id)` 清理 Chat 实例 — ✅ 正确
- `selectProject` 使用 `Promise.all` + 单独 projectId 守卫防止陈旧数据 — ✅ 逻辑正确（但见 BUG-05）
- `persist` 只序列化 `sidebarCollapsed`、`chatHistoryExpanded`、`themeMode` — ✅ 正确，避免持久化动态数据

---

## 总结

| 级别 | 数量 | 说明 |
|------|------|------|
| 🔴 确认 Bug | 1 | ProjectLayout 竞态重定向 |
| 🟡 可疑 Bug | 4 | TopologyView ref 遗漏、hooks 竞态、依赖缺失、AbortController 虚设 |
| 🟢 轻微问题 | 3 | key=index、删除无确认、系统主题响应 |

最高优先级：**BUG-01**（影响新窗口打开项目的核心功能）和 **BUG-02**（可能在后台数据刷新时反复触发不期望的动画）。
