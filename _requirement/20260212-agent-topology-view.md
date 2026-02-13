# 需求清单：Agent Topology View

> 创建时间：2026-02-12
> 状态：已确认

## 功能需求

1. 在 Agents 页面新增视图切换功能，支持两种视图模式：**Grid**（现有卡片网格）和 **Topology**（拓扑图）
2. Topology 视图展示 **Agent → Sub-Agent** 的树形拓扑关系，节点只有 Agent（不包含 Skills/Tools/MCP 节点）
3. 节点交互：
   - 点击节点 — 展开侧面板，显示 Agent 摘要信息
   - 双击节点 — 跳转到 Agent Detail 页
   - 拖拽连线 — 建立 Sub-Agent 关系（连线后输入 role）
   - 删除连线 — 解除 Sub-Agent 关系
   - 右键节点 — 快捷菜单（编辑、删除、设为 Main Agent）
   - 画布空白处双击 — 新建 Agent
   - 节点可拖拽调整位置
4. 连线上显示 role 标签（对应 `SubAgentRef.role` 字段）
5. 支持画布缩放、平移、Minimap

## 技术约束

1. 使用 **React Flow** 作为拓扑图引擎
2. 使用 **dagre** 进行自动布局
3. Custom Node 和 Custom Edge 做像素风适配
4. **不需要**循环依赖校验

## 风格要求

1. 节点使用像素风卡片样式，与现有 `PixelCard` 设计语言一致
2. 连线使用直角折线（step edge），非曲线
3. 节点展示信息：Agent 名称、状态、Model 名称、Skills/Tools/Sub-Agents 计数
4. 深色主题，配合现有设计 token

## 布局持久化

1. 首次进入 / 新增 agent 时 → dagre 自动布局计算位置
2. 用户拖拽调整节点位置后 → 保存位置到服务端
3. 再次进入时 → 有保存的位置用保存的，没有的走 dagre 计算
4. 提供「Reset Layout」按钮 → 清除保存的位置，重新 dagre 自动布局
5. 存储方式：JSON 文件 `data/projects/{projectId}/topology-layout.json`
6. 数据结构：`{ [agentId]: { x: number, y: number } }`

## 注意事项

1. 视图切换不影响现有 Grid 视图的任何功能
2. 两种视图共享同一份 `agents[]` 数据源
3. 布局数据属于低频项目级配置，用 JSON 文件存储（与 agents、settings 等配置一致）
