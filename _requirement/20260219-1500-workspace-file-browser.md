# 需求清单：Workspace 文件浏览器（替换 Artifacts）
> 创建时间：2026-02-19 15:00
> 状态：已确认

## 功能需求
1. 将 Artifacts 页面重构为 Workspace 文件浏览器 — 当前 Artifacts 系统是死代码（没有创建机制），替换为直接浏览 `~/.golemancy/projects/{id}/workspace/` 目录的文件浏览器
2. 左侧目录树 — 可折叠的递归目录结构，显示文件夹和文件
3. 右侧文件预览区 — 根据文件类型展示不同的预览内容
4. Tier 1 内联预览（零新依赖）：
   - 代码/文本文件（`.py .js .ts .json .yaml .xml .html .css .sh .md .txt .log` 等）→ `<pre>` 等宽字体
   - 图片（`.png .jpg .gif .svg .webp .ico`）→ `<img>` 标签
   - CSV/TSV → 简单 `<table>` 渲染
5. Tier 2 仅显示元信息 + 操作按钮（PDF、Office、压缩包、二进制、音视频等）→ 显示文件名/大小/类型 +「用系统应用打开」按钮
6. 文件下载功能
7. 文件删除功能（带确认）
8. Electron `shell.openPath()` 集成 — 通过 preload 暴露，用于 Tier 2 文件的系统默认程序打开

## 技术约束
1. 零新依赖（或接近零）— 全部基于已有技术栈（Node.js fs、React、Hono、Tailwind）
2. 不加语法高亮 — 保持和聊天消息一致的 `<pre>` 渲染风格
3. 文件类型判断用扩展名映射（~30 行代码），不引入 `file-type` 之类的库
4. 路径安全 — 复用已有的 `validateFilePath` 防止路径穿越

## 流程要求
1. Server 新增 workspace 路由：列出目录树、读取文件内容、删除文件
2. UI 新增 workspace slice（store）、IWorkspaceService（service interface）
3. 现有 Artifact 相关代码（类型、接口、存储、路由、UI、mock）需清理/替换
4. 侧边栏导航从 "Artifacts" 改为 "Workspace" 或 "Files"

## 风格要求
1. 保持像素风（Pixel Art / Minecraft 风格）、暗色主题
2. 使用现有 Pixel* 组件（PixelCard、PixelButton 等）
3. 保持与项目整体 UI 一致

## 注意事项
1. 跨平台兼容（macOS/Windows/Linux）— 使用 `path.join()`，路径展示统一用 `/`
2. 当前 Artifacts 相关的 branded type（`ArtifactId`）、service interface（`IArtifactService`）、store slice 需要清理替换
3. Team Lead 必须对每个实现任务进行二次验证（亲自阅读代码），不能仅凭工程师报告就标记完成
