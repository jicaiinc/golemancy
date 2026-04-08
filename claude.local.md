## Sub-agent Preference

Prefer handling tasks yourself rather than delegating to sub-agents. Sub-agents run with thinking disabled and reduced context, which limits their reasoning depth. The user prioritizes deep thinking and thoroughness over speed or cost — delegate only when the task genuinely does not require deep thinking.

## Thinking Depth & Output Quality

These rules override the default "Output efficiency" and "Tone and style" sections:

- Do not default to "short and concise". Scale response depth to task complexity — simple questions deserve short answers, complex tasks require thorough analysis with full reasoning visible.
- Do not lead with the answer while hiding the thought process. On non-trivial tasks, show the reasoning chain before the conclusion.
- Do not default to the simplest approach without comparison. Evaluate trade-offs between approaches, then choose the best one.
- Do not compress explanations when depth aids understanding. Use as many sentences as correctness and clarity demand.
- Do not reduce analysis depth, investigation thoroughness, or reasoning steps in the name of "avoiding over-engineering". That principle applies strictly to code structure (no speculative abstractions).
- Do not jump to the first guess without checking, nor keep searching after the answer is clear. Follow evidence systematically — verify before concluding, but commit once evidence is conclusive.

# User-level Notes

## 语音输入纠错

- 用户说"艺人"（演艺圈的艺人）时，实际意思是"一人"（一个人的一人）。这是语音识别/口误造成的错误，需自动理解为"一人"。

## LAN Windows Machine (Lenovo)

- IP: `192.168.1.6`
- User: `caiyo` (Microsoft Account, full name: Yongji Cai)
- SSH: 免密登录已配置 (`ssh caiyo@192.168.1.6`)
- SMB 共享: `C:\Users\caiyo\Shared` ↔ `~/Shared-Win`
- SMB 认证: 本地账号 `share` / `112233`（微软账号无法直接用于 SMB）
- 挂载脚本: `~/bin/mount-win.sh`（检测连接、清理僵尸挂载、自动重连）
- 网络: BOYU406 已设为 Private，WiFi（Realtek 8822BE），SMB 防火墙规则已启用
- Wake-on-LAN: MAC `E8:6F:38:3C:CC:AF`，唤醒脚本 `~/bin/wake-win.sh`（仅睡眠状态可唤醒，关机不行）
- 开发环境: Node.js v24.14.0, pnpm 10.19.0, Python 3.12.10, VS Build Tools 2022 (VC++ v143 + Win11 SDK 22621), Git Bash in PATH
- Golemancy 仓库: `C:\Users\caiyo\developer\github\golemancy`（E2E 测试已验证可跑）
- E2E 测试命令: `ssh caiyo@192.168.1.6 "cd C:\Users\caiyo\developer\github\golemancy\apps\desktop && pnpm exec playwright test --config=e2e/playwright.config.ts --project=smoke"`
- 注意: Windows 上 `pnpm --filter ... test:e2e:only -- --project=smoke` 的参数引号有问题，需用 `pnpm exec playwright test` 直接调用

## Apple Developer Account

- **Account type**: Organization (Apple Developer Program, $99/year)
- **Company**: Jicai, Inc.
- **Team ID**: `NDX2ZZ8U2R`
- **macOS 签名证书**: Developer ID Application (G2 Sub-CA)
- **Signing identity**: `"Developer ID Application: Jicai, Inc. (NDX2ZZ8U2R)"`
- **Apple ID**: `hi@jicai.us`
- 证书已安装到本地 login keychain
- **Notarization 命令**（均需 `--apple-id "hi@jicai.us" --password "cbeb-vtny-vlli-wqnh" --team-id "NDX2ZZ8U2R"`）:
  - 查历史: `xcrun notarytool history ... --output-format json`
  - 查单条: `xcrun notarytool info <id> ...`
  - 查失败日志: `xcrun notarytool log <id> ...`（可追加文件名保存，如 `... invalid.json`）

## Claude Code MCP 配置存储

- `claude mcp add` 添加的 MCP server 配置存储在 **`~/.claude.json`** 的 `mcpServers` 字段中
- 无论 `-s` scope 是 `local`、`user` 还是 `project`，都写入这个文件
- 不在 `~/.claude/settings.json`、`.mcp.json`、`.claude/settings.local.json` 中
- Plugin 系统的 MCP 配置在 `~/.claude/plugins/marketplaces/` 下的 `.mcp.json` 中，与 `claude mcp add` 是独立的

## Codex Code Review

- 用户更信赖 Codex 的代码 Review 能力，认为其看待问题的全面性优于 Claude
- 当用户明确提及让 Codex Review 代码时，通过 MCP（`codex` / `codex-reply` tool）调用 Codex 执行 Review
- 同一轮 Review 中必须保持 Session 一致：首次调用 `codex` 获取 `threadId`，后续追问使用 `codex-reply` + 同一个 `threadId`
- 调用时默认不传 `model` 参数（使用默认模型），或传入 `gpt-5.4` 等高级模型，绝不传入低级模型
- **必须使用 TeamCreate**：通过 `TeamCreate` 工具创建后台 agent 执行 Codex review，避免阻断主对话。后台 agent 完成后通过 SendMessage 回传结果。`TeamCreate` 是 deferred tool，需先通过 `ToolSearch` 搜索 "team create" 加载 schema 后才能调用
- **二次确认**：Codex review 结果不可直接采信，只列出给用户参考，由用户决定是否采纳
