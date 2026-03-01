<p align="center">
  <img src="packages/ui/src/assets/logo.png" alt="Golemancy" width="128" height="128">
</p>

<h1 align="center">Golemancy</h1>

<p align="center">
  <strong>Command Your AI Golems</strong><br>
  Orchestrate autonomous AI agents from your desktop.
</p>

<p align="center">
  <a href="https://github.com/jicaiinc/golemancy/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/jicaiinc/golemancy?style=flat-square&color=4ADE80"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/jicaiinc/golemancy?style=flat-square&color=4ADE80"></a>
  <a href="https://discord.gg/xksGkxd6SV"><img alt="Discord" src="https://img.shields.io/discord/1234567890?style=flat-square&label=Discord&color=5865F2"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-333?style=flat-square">
</p>

<p align="center">
  <a href="https://golemancy.ai">Website</a> &middot;
  <a href="https://discord.gg/xksGkxd6SV">Discord</a> &middot;
  <a href="https://x.com/golemancyai">Twitter</a> &middot;
  <a href="https://github.com/jicaiinc/golemancy/releases/latest">Download</a>
</p>

---

<!-- TODO: Replace with actual screenshot -->
<!-- <p align="center">
  <img src="docs/screenshot.png" alt="Golemancy Screenshot" width="800">
</p> -->

One person. Infinite golems.

Golemancy is a free, open-source desktop app for orchestrating autonomous AI agents. Summon multiple agents, equip them with tools and skills, and let them work in parallel — all running locally on your machine.

Built for one-person teams.

## Features

**Multi-Agent Orchestration** — Summon multiple AI agents in isolated projects. Each agent runs independently with its own context, tools, and mission.

**Recursive Sub-Agents** — Agents spawn sub-agents with unlimited nesting. One command triggers an entire autonomous workforce, streaming results in real-time.

**9+ LLM Providers** — Claude, GPT, Gemini, DeepSeek, Groq, Mistral, and more. Switch models per agent. Use the right brain for every task.

**MCP Protocol** — Native Model Context Protocol support with connection pooling. Plug into the expanding MCP ecosystem out of the box.

**Browser Automation** — 16 built-in tools and 80+ operations powered by Playwright. Your agents don't just think — they browse, click, and extract.

**Skill System** — Equip agents with reusable prompt templates. Create, share, and import skill packs like equipping items in an RPG.

**Cron Scheduling** — Set it and forget it. Schedule agents to run on autopilot — daily reports, periodic scraping, recurring workflows.

**Local-First Security** — Your data never leaves your machine. Loopback-only server, per-session auth tokens, three-tier sandboxed permissions.

## Quick Start

### Download

Grab the latest release for your platform:

**[Download Golemancy](https://github.com/jicaiinc/golemancy/releases/latest)** — available for macOS, Windows, and Linux.

### Build from Source

Prerequisites: [Node.js](https://nodejs.org/) (v22+) and [pnpm](https://pnpm.io/) (v10+).

```bash
# Clone the repository
git clone https://github.com/jicaiinc/golemancy.git
cd golemancy

# Install dependencies
pnpm install

# Start development
pnpm dev

# Or build for distribution
pnpm dist
```

## Architecture

Golemancy is a monorepo with a clear one-way dependency chain:

```
apps/desktop/      Electron shell — forks server as child process
packages/ui/       React UI, business logic, Zustand store
packages/server/   Hono HTTP server, SQLite, AI agent runtime
packages/shared/   Pure TypeScript types (zero runtime)
packages/tools/    Browser automation (Playwright-based)
```

```
desktop → ui → shared ← server ← tools
```

The Electron main process forks the server as a child process on a random port. All communication flows over HTTP to `localhost` with per-session Bearer token auth. Each project gets its own SQLite database.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Frontend | React, Tailwind CSS v4, Zustand v5 |
| Backend | Hono, better-sqlite3, drizzle-orm |
| AI | Vercel AI SDK (multi-provider) |
| Tools | Playwright, MCP |
| Build | Turborepo, pnpm workspaces, electron-vite |

## Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`) and type-check (`pnpm lint`)
5. Submit a pull request

For bugs and feature requests, [open an issue](https://github.com/jicaiinc/golemancy/issues).

## Community

- [Discord](https://discord.gg/xksGkxd6SV) — Chat, get help, share what you build
- [Twitter](https://x.com/golemancyai) — Updates and announcements
- [Email](mailto:hi@golemancy.ai) — hi@golemancy.ai

## License

[Apache License 2.0](LICENSE)

---

<p align="center">
  Built for One-Person Teams.<br>
  <sub>&copy; 2026 <a href="https://golemancy.ai">Jicai, Inc.</a></sub>
</p>
