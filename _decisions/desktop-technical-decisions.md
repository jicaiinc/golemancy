# Desktop Technical Decisions

Status: pending confirmation  
Scope: desktop client only  
Date: 2026-05-11

This document records technical stack decisions for the Golemancy desktop client rebuild. It intentionally excludes website, hosted API, billing, account system, and cloud runtime decisions.

## Scope

In scope:

- Tauri desktop shell.
- React desktop UI.
- Local Node sidecar runtime.
- Local API between UI, sidecar, and local integrations.
- Local SQLite persistence.
- Local secrets storage.
- Agent runtime, provider transport, MCP, skills, shell tools, CLI agents, and browser extension bridge.
- Desktop packaging and local verification.

Out of scope for this document:

- Official website.
- Hosted API service.
- Account, billing, pricing, and licensing.
- Cloud long-running agents.
- Marketing site deployment.

## Runtime Topology

- Desktop shell: Tauri.
- UI: React + Vite running inside the Tauri WebView.
- Runtime backend: dedicated Node.js sidecar.
- Node runtime version: fixed Node 24 bundled with the app.
- Local API: Hono server in the Node sidecar.
- UI transport: authenticated local HTTP on `127.0.0.1:{port}`.
- Primary run streaming: SSE.
- Bidirectional realtime transport: WebSocket where needed.
- Business persistence: SQLite owned by the Node sidecar.
- Secret persistence: OS secure storage accessed through Tauri/Rust bridge.

## Technology Choices

| Area | Decision |
|---|---|
| Desktop shell | Tauri |
| UI framework | React |
| UI build tool | Vite |
| Local backend | Node.js sidecar |
| Node version | Node 24, bundled and fixed |
| Local API framework | Hono |
| Database | SQLite |
| SQLite driver | `node:sqlite` |
| DB access layer | Drizzle + repository layer |
| Secret storage | Tauri/Rust bridge to OS secure storage |
| Main run streaming | SSE |
| Bidirectional realtime | WebSocket |
| Agent runtime engine | OpenAI Agents SDK |
| Provider default path | OpenAI-compatible Chat Completions via `baseURL` |
| OpenAI official path | Responses API where supported |
| AI SDK role | Secondary compatibility path |
| CLI agent runtime | Dedicated `cli-agent` runtime |
| Shell execution | Dedicated shell tool runtime |
| PTY | Not part of the default baseline; evaluate later if needed |
| MCP | Node sidecar MCP client and lifecycle management |
| Skills | Local skill package runtime managed by the sidecar |
| Browser extension | MV3 extension, preferred implementation with WXT |
| Browser bridge | Native Messaging for app identity/bootstrap, WebSocket for realtime operations |
| Unit tests | Vitest |
| UI/browser tests | Playwright |
| Desktop validation | Real packaged Tauri app smoke tests |

## Desktop Shell

Tauri is responsible for:

- Window and app lifecycle.
- Starting, monitoring, and stopping the Node sidecar.
- App packaging and updater integration.
- OS secure storage bridge.
- Native Messaging host registration support.
- Native OS integration where required.

Tauri is not responsible for:

- Agent run loop execution.
- Provider SDK calls.
- Business database reads or writes.
- MCP tool orchestration.
- Shell or CLI agent execution logic.

## Node Sidecar

The Node sidecar is the desktop client's local runtime backend.

It is responsible for:

- Hono local API server.
- Agent runtime engines.
- Provider registry and model configuration.
- Tool registry.
- MCP client lifecycle.
- Skills runtime.
- Shell tool runtime.
- CLI agent runtime.
- Browser bridge coordination.
- SQLite access and migrations.
- Streaming event emission.
- Cancellation, timeout, and execution logs.

The app must bundle a fixed Node 24 runtime so `node:sqlite` behavior is controlled and does not depend on the user's system Node installation.

## SQLite And Persistence

Use SQLite through Node's built-in `node:sqlite` module.

DB layer decision:

- Use Drizzle with `drizzle-orm/node-sqlite`.
- Wrap DB access behind repository/service modules.
- Keep SQL schema and migrations explicit.
- Avoid direct DB access from UI.
- Avoid direct business DB writes from Tauri/Rust.

SQLite stores:

- Projects.
- Threads.
- Runs.
- Messages.
- Run events.
- Tool calls.
- Tool results.
- Provider configs.
- Model configs.
- Provider capability test results.
- MCP server configs.
- Skills metadata.
- Browser profile records.
- Settings.
- Secret references.

SQLite must not store raw API keys, OAuth refresh tokens, or local bridge secrets.

## Secure Storage

Use OS secure storage through a Tauri/Rust bridge.

Target platform mapping:

- macOS: Keychain.
- Windows: Credential Manager or DPAPI-backed storage.
- Linux: Secret Service where available, with a defined fallback.

Secure storage keeps:

- API keys.
- OAuth tokens.
- Local bridge tokens.
- Sensitive provider credentials.

SQLite keeps only stable secret references and non-sensitive metadata.

## Local API And Streaming

Use Hono as the local API layer in the Node sidecar.

Expected API groups:

- Health and runtime status.
- Run creation and cancellation.
- Run event streaming.
- Tool approval.
- Provider listing, configuration, and testing.
- MCP server management.
- Skills management.
- Browser profile and browser action bridge.
- Settings.

Use SSE for primary run streams:

- Text deltas.
- Tool requests.
- Tool results.
- Approval-required events.
- Usage events.
- Errors.
- Completion events.

Use WebSocket for:

- Browser extension realtime communication.
- Bidirectional control flows.
- Live event subscriptions across multiple UI panels.

## Agent Runtime And Provider Transport

Use OpenAI Agents SDK as the default agent runtime engine where it fits native tool-calling workflows.

Provider transport categories:

```ts
type ProviderTransport =
  | "openai-responses"
  | "openai-chat-compatible"
  | "ai-sdk-adapter"
  | "custom-model"
  | "cli-agent";
```

Provider routing baseline:

| Provider class | Transport |
|---|---|
| OpenAI official Responses-capable models | `openai-responses` |
| OpenAI-compatible providers | `openai-chat-compatible` |
| Providers with better AI SDK support than direct compatibility | `ai-sdk-adapter` |
| Special SDK, OAuth, or non-standard protocol providers | `custom-model` |
| Local subscription CLI agents | `cli-agent` |

OpenAI-compatible providers should default to Chat Completions through `baseURL`.

## Provider Capability Tests

Each provider/model should have capability tests for:

- Streaming support.
- Native tool calling.
- Tool argument stability.
- JSON schema or JSON mode behavior.
- Vision support.
- File support.
- Parallel tool calls.
- Unknown field tolerance.
- Context length.
- Error shape.
- Rate limit and retry behavior.

Capability test results should be stored locally and used by runtime selection.

## Tool Mode

Use this tool mode model:

```ts
type ToolMode = "auto" | "native" | "prompted" | "disabled";
```

Meaning:

- `auto`: choose from capability test results.
- `native`: use provider-native tool calling.
- `prompted`: use prompted JSON action protocol.
- `disabled`: disable tool execution for the run.

## CLI Agent Runtime

CLI agents use a dedicated runtime separate from shell tools.

Target CLI agents:

- Claude Code CLI.
- Codex CLI.
- Other local AI CLIs with user-managed auth or subscription state.

Required runtime capabilities:

- Configurable command and args.
- Configurable cwd.
- Environment allowlist.
- stdin support where needed.
- stdout streaming.
- stderr streaming.
- Timeout.
- Cancellation.
- Cross-platform process tree kill.
- Exit code and signal capture.
- Raw log persistence.
- Auth/setup error detection.
- User-provided executable path.

Optional later capability:

- PTY mode.

## Shell Tool Runtime

Shell tool execution is separate from CLI agent execution.

Required capabilities:

- Command timeout.
- Cancellation.
- Cross-platform process tree kill.
- cwd control.
- Environment allowlist.
- stdout/stderr separation.
- Exit code capture.
- Duration tracking.
- Output size limit.
- Output truncation.
- Audit log.
- Risk-based approval integration.

Baseline implementation should use `child_process.spawn`.

## MCP

MCP support lives in the Node sidecar.

Required capabilities:

- Local stdio MCP servers.
- Streamable HTTP/SSE MCP servers where useful.
- MCP server lifecycle management.
- Tool list caching.
- Tool allowlist and denylist.
- Local MCP config persistence.
- Tool call/result mapping into local run events.

## Skills

Skills are local capability packages managed by the sidecar.

Supported skill contents may include:

- Instructions.
- Scripts.
- Templates.
- Tool wrappers.
- MCP configuration.
- Shell integrations.
- Browser integrations.
- Filesystem integrations.

Skills should be installable, enableable, disableable, and updateable through local product state.

## Browser Extension

Use a browser extension for browser integration.

Technical baseline:

- Manifest V3.
- WXT preferred as implementation framework.
- Native Messaging for trusted app identity/bootstrap.
- WebSocket for realtime operation streams.

Required extension capabilities:

- Browser profile/session discovery.
- Active tab state.
- Page context extraction.
- DOM extraction.
- Click.
- Scroll.
- Type.
- Navigate.
- Screenshot where allowed.
- Error reporting.

Browser actions should be represented as tool events in the sidecar runtime.

## Packaging And Verification

Desktop packaging must validate the real packaged app, not only dev mode.

Required validation:

- Tauri app launches.
- Node 24 sidecar starts.
- Hono health endpoint works.
- SQLite opens and migrations run through `node:sqlite`.
- Secure storage read/write works.
- Run streaming works through SSE.
- WebSocket channel works where enabled.
- Shell timeout and cancellation work.
- CLI agent spawn and cancellation work.
- Browser extension bridge connects.
- Native Messaging registration works where enabled.

Target platforms:

- macOS.
- Windows.
- Linux.

## Initial Monorepo Layout

Recommended initial layout:

```text
apps/
  desktop/
  extension/

packages/
  ui/
  sidecar/
  runtime/
  db/
  shared/
  tools/
  protocol/
```

Notes:

- `apps/desktop` owns the Tauri app.
- `apps/extension` owns the browser extension.
- `packages/sidecar` owns the local backend entrypoint.
- `packages/runtime` owns agent runtime engines and provider routing.
- `packages/db` owns schema, migrations, and repositories.
- `packages/shared` owns shared domain types.
- `packages/tools` owns shell, MCP, skills, CLI agent, and browser tool implementations.
- `packages/protocol` owns API contracts and run event types if not merged into `shared`.
