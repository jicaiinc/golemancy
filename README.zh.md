<p align="center">
  <img src="packages/ui/src/assets/logo.png" alt="Golemancy" width="128" height="128">
</p>

<h1 align="center">Golemancy</h1>

<p align="center">
  <strong>召唤一支为你效力的 AI 团队</strong>
</p>

<p align="center">
  <a href="https://github.com/jicaiinc/golemancy/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/jicaiinc/golemancy?style=flat-square&color=2D7A4F"></a>
  <a href="LICENSE"><img alt="开源协议" src="https://img.shields.io/github/license/jicaiinc/golemancy?style=flat-square&color=2D7A4F&cacheSeconds=1"></a>
  <a href="https://discord.gg/xksGkxd6SV"><img alt="Discord" src="https://img.shields.io/discord/1476526765848662108?style=flat-square&label=Discord&color=5865F2"></a>
  <img alt="平台" src="https://img.shields.io/badge/平台-macOS%20%7C%20Windows%20%7C%20Linux-333?style=flat-square">
</p>

<p align="center">
  <a href="https://golemancy.ai">官网</a> &middot;
  <a href="https://discord.gg/xksGkxd6SV">Discord</a> &middot;
  <a href="https://x.com/golemancyai">Twitter</a> &middot;
  <a href="https://github.com/jicaiinc/golemancy/releases/latest">下载</a>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---


Golemancy 是一款免费开源的桌面应用，让一个人也能拥有一整支 AI 团队的力量。创建不同角色的 AI Agent，完成调研、写作、翻译、数据分析、营销和报告——为它们配备工具和技能，让它们并行工作、相互协作。所有数据都在你自己的机器上，不出本地。

## 核心功能

**多 Agent 编排** — 在隔离的项目环境中创建多个 AI Agent，每个 Agent 拥有独立的上下文、工具权限和任务目标，互不干扰。

**递归子 Agent** — Agent 可以在执行过程中动态派遣子 Agent，支持无限嵌套。发出一条指令，就能启动整个自主工作流，结果实时流式返回。

**团队协作** — 用可视化拓扑图编排 Agent 组织架构，定义主导者与成员的层级关系，分配角色职责。一次对话即可调度整个团队协同完成任务。

**10+ 大模型提供商** — 支持 Claude、GPT、Gemini、DeepSeek、Kimi（Moonshot）、通义千问（Qwen）、Groq、Mistral、Grok 等，也可接入任意 OpenAI 兼容的本地模型（Ollama、LM Studio 等）。每个 Agent 可以独立选模型。

**MCP 协议** — 原生支持 Model Context Protocol，内置连接池管理。接入 MCP 生态，让 Agent 调用任意外部能力。

**浏览器自动化** — 基于 Playwright，内置 16 类工具、80+ 操作。Agent 不只是"思考"，还能打开浏览器、点击按钮、抓取数据。

**技能系统** — 把常用提示词封装为可复用的技能卡，为 Agent 装备。像 RPG 游戏一样搭配技能组合，快速复用最佳实践。

**Agent 记忆** — Agent 能记住重要信息。记忆数据存在本地 SQLite，按优先级和时效自动调度——置顶记忆始终加载，其余按权重排序。Agent 通过内置工具自主增删改查。

**工作区文件浏览器** — 内置文件树和文件预览，在应用内直接浏览、查看项目工作区的文件，无需切换窗口。

**语音输入** — 用说话代替打字。内置语音转文字，支持多语言，完整转录历史随时查阅。

**定时任务** — 配置 Cron 任务，让 Agent 按计划自动执行——定时生成报告、周期性抓取数据、循环工作流一键搞定。

**本地优先 · 安全沙箱** — 数据不上云。服务仅监听本机回环地址，每次会话独立鉴权。三档权限模式（受限 / 沙箱 / 无限制）+ 文件路径白名单 + 网络域名过滤 + 命令黑名单，灵活可控。

## 快速开始

### 直接下载

**[前往 Releases 页面下载](https://github.com/jicaiinc/golemancy/releases/latest)**，支持 macOS、Windows、Linux。

> [!IMPORTANT]
> **安装遇到问题？**
>
> **macOS**：首次打开提示"无法验证开发者"时，在终端执行以下命令后重新打开：
> ```bash
> xattr -cr /Applications/Golemancy.app
> ```
> **Windows**：SmartScreen 拦截时点击「仍要运行」即可。
>
> **Linux**：若无法启动，请先赋予可执行权限：
> ```bash
> chmod +x Golemancy.AppImage
> ```

安装完成后，首次启动会引导你配置 AI 提供商的 API Key，填完即可开始使用。

### 从源码构建

需要：[Node.js](https://nodejs.org/)（v22+）和 [pnpm](https://pnpm.io/)（v10+）。

```bash
# 克隆仓库
git clone https://github.com/jicaiinc/golemancy.git
cd golemancy

# 安装依赖
pnpm install

# 启动开发模式（Electron + 本地服务 + 热更新）
pnpm dev

# 打包为可分发的安装包
pnpm dist
```

## 架构

Golemancy 是一个 monorepo，依赖方向严格单向：

```
apps/desktop/      Electron 主进程 — 将 server 作为子进程 fork
packages/ui/       React 界面、Zustand 状态管理、业务逻辑
packages/server/   Hono HTTP 服务、SQLite 数据库、AI Agent 运行时
packages/shared/   纯 TypeScript 类型定义（无运行时依赖）
packages/tools/    浏览器自动化工具（基于 Playwright）
```

```
desktop → ui → shared ← server ← tools
```

Electron 主进程将 server 以子进程方式启动，随机端口绑定。所有 UI 与后端的通信通过 HTTP 发往本机，使用每会话独立的 Bearer Token 鉴权。每个项目拥有独立的 SQLite 数据库文件。

## 技术栈

| 层级 | 技术选型 |
|------|---------|
| 桌面端 | Electron |
| 前端 | React、Tailwind CSS v4、Zustand v5 |
| 后端 | Hono、better-sqlite3、drizzle-orm |
| AI | Vercel AI SDK（多提供商统一接口）|
| 工具 | Playwright、MCP |
| 构建 | Turborepo、pnpm workspaces、electron-vite |

## 参与贡献

欢迎提交 PR 和 Issue！

1. Fork 本仓库
2. 新建功能分支（`git checkout -b feature/your-feature`）
3. 完成修改
4. 运行测试（`pnpm test`）和类型检查（`pnpm lint`）
5. 提交 Pull Request

Bug 反馈和功能建议请[提交 Issue](https://github.com/jicaiinc/golemancy/issues)。

## 联系我们

- [Discord](https://discord.gg/xksGkxd6SV) — 社区交流、答疑、分享你的用法
- [Twitter](https://x.com/golemancyai) — 版本动态与公告
- [邮件](mailto:hi@golemancy.ai) — hi@golemancy.ai

**微信交流群**

<img src=".github/wechat-group-qr.jpg" alt="微信群二维码" width="200">

## Star 趋势

<a href="https://star-history.com/#jicaiinc/golemancy&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=jicaiinc/golemancy&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=jicaiinc/golemancy&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=jicaiinc/golemancy&type=Date" />
 </picture>
</a>

## 开源协议

[Apache License 2.0](LICENSE)

---

<p align="center">
  为一人团队打造。<br>
  <sub>&copy; 2026 <a href="https://golemancy.ai">Jicai, Inc.</a></sub>
</p>
