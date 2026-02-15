# Sandbox Permissions Refactor

## 一、架构层面的移除
1. 移除 App 级别的 Safety 页面
2. 移除 "default sandbox" 概念 — 所有 sandbox 都是针对 project 一对一创建
3. 移除 project settings 中 "inherit from App settings" 的概念
4. 移除 preset 配置概念，只保留 "default configuration"
5. 移除 "allow git config" 选项
6. 移除 "enable python" 预设选项
7. 移除 "Bash Tool" 和 "MCP" 的命名，统一叫做 **Permissions**

## 二、Permissions 三级权限模型
8. 三个选项从左到右：**Restricted** → **Sandbox** → **Unrestricted**
9. 默认选中 **Sandbox**
10. **Restricted** = 仅使用 just bash（无 sandbox runtime）
11. **Unrestricted** = 不设置 sandbox
12. **Sandbox** = 使用 sandbox runtime，带有可配置项

## 三、Sandbox 默认配置内容
13. 允许写入：项目 workspace 目录
14. 拒绝读取：安全敏感文件
15. 拒绝写入：workspace 之外的所有地方
16. Allowed domains：默认全部允许
17. Denied domains：默认为空
18. Denied commands：保留（用户需禁用 python 则自行添加到 denied commands）

## 四、配置存储与管理
19. 配置以标题命名，保存到项目根目录下的 `permissions-config/` 文件夹中
20. 项目配置文件通过 ID 指向 `permissions-config/` 中的配置文件，而非内联存储
21. Settings Permissions 页面展示所有配置的名称和 ID
22. 系统级别有一个 **default** 配置，不可修改
23. 提供 **Duplicate** 功能，可复制已有的 permissions 配置

## 五、Windows 特殊处理
24. Windows 系统下不使用 sandbox runtime
25. Windows 系统下 Sandbox 模式只开放 denied commands 配置
26. Windows 下不展示 allowed domains / denied write / denied read 等配置项

## 六、MCP 集成
27. Sandbox 配置最下方增加 **"Apply to MCP"** 选项（checkbox/toggle）
28. 勾选后，所有 sandbox 配置同时作用于 MCP
29. 不勾选则 MCP 不受 sandbox 配置影响
30. 移除独立的 MCP Tab 页面
31. "Apply to MCP" 是 Sandbox 功能，Windows 系统下同样不显示此选项

## 七、MCP 沙箱化技术实现（记录，后续实现）
32. "Apply to MCP" 的实际机制：用 `srt`（sandbox runtime）包装 MCP server 的 command
33. 示例：原始 `npx -y @modelcontextprotocol/server-filesystem` → 包装为 `srt npx -y @modelcontextprotocol/server-filesystem`
34. `.mcp.json` 配置中，当 Apply to MCP 开启时，command 替换为 `srt`，原始 command 和 args 合并到 args 数组中
35. 之前可能存在的 MCP 沙箱实现是错误的，需要在后续按此方案重新实现
36. 本次改动仅做 UI 和配置层面的变更，MCP 沙箱化的运行时实现留待后续

## 八、代码质量要求
37. 实现过程中注重代码整洁性、架构清晰度和实现优雅度
38. 工程师在实现时需对架构进行适当探索，确保实现方案足够优雅
39. Code Review 阶段需额外检查实现是否优雅、架构是否清晰
40. 项目经理在验收每一步实现时，需对照 31 条功能需求逐条校验
41. 测试阶段需严格对照所有功能需求进行验证，确保全部实现
