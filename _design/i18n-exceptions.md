# i18n 例外说明 (Deferred Items)

## Electron 主进程菜单

**文件**: `apps/desktop/src/main/index.ts`

**涉及字符串**:
- 菜单标签: `'About Golemancy'`, `'Hide Golemancy'`, `'Quit Golemancy'`, `'Edit'`, `'Window'`, `'View'`
- About 对话框: `title: 'About Golemancy'`, `message: 'Golemancy'`, `detail: 'Version X.Y.Z\nCommand Your AI Golems'`
- Server Error 对话框: `'Server Error'`（title）、错误详情使用动态 `err.message`

**推迟原因**:
1. Electron 主进程无 React context，不能使用 `react-i18next`
2. 向主进程引入 `i18next` 需新增 dependency 并修改打包配置
3. 项目规范当前只维护 `en`，其他语言推迟支持（CLAUDE.md）
4. 部分标签含品牌名 `Golemancy`，品牌名本身不做翻译
5. `'Edit'`、`'Window'` 等标准 Electron 菜单项在 macOS 层面有原生处理
6. 总字符串数量少（约 8 条），当前收益低于复杂度

**后续实施方案**（多语言需要时）:
- 在 `apps/desktop/package.json` 中添加 `i18next` 依赖
- 创建 `apps/desktop/src/main/locales/{lang}/menu.json`
- 在 `buildAppMenu()` 调用前初始化 i18next（使用同步 `initSync` 或提前 await）
- 用 `i18next.t('menu.xxx')` 替换所有硬编码菜单标签和对话框字符串
- 语言跟随系统语言检测（`app.getLocale()` 或 `app.getPreferredSystemLanguages()`）

---

## Onboarding 模块

### SpeechStep — STT_LANGUAGES 语言列表

**文件**: `packages/ui/src/pages/onboarding/steps/SpeechStep.tsx`

**涉及内容**: `STT_LANGUAGES` 数组中的 `label` 字段（Auto-detect, English, 中文, 日本語, 한국어, Español, Français, Deutsch）

**不翻译原因**: 语言选项应以各自的原生文字呈现（如中文显示"中文"而非"Chinese"），方便用户识别自己的母语。i18n 准则明确规定语言名称保留原生字体形式。

### ProviderStep — SDK_TYPE_OPTIONS 提供商列表

**文件**: `packages/ui/src/pages/onboarding/steps/ProviderStep.tsx`

**涉及内容**: `SDK_TYPE_OPTIONS` 中的 label（OpenAI-Compatible, Anthropic, OpenAI, Google, DeepSeek, xAI (Grok), Groq, Mistral, Moonshot (Kimi), Alibaba (Qwen)）以及 Provider grid 中各 preset 的 `p.name` 和 `p.sdkType`

**不翻译原因**: 品牌名 / SDK 名，i18n 准则明确保留英文。

### CompleteStep — Discord 链接

**文件**: `packages/ui/src/pages/onboarding/steps/CompleteStep.tsx`

**涉及内容**: Discord 链接文字 `"Discord"`

**不翻译原因**: Discord 是品牌名。

---

## Dashboard 模块

### TokenBreakdownTable — title prop（当 inline=true 时）

**文件**: `packages/ui/src/pages/dashboard/components/TokenBreakdownTable.tsx`

**涉及内容**: `title` prop（如 "TOKEN BY AGENT"、"TOKEN BY MODEL"）

**说明**: 当前所有调用方均传入 `inline={true}`，此时 `title` 不渲染到 UI。父组件（DashboardPage, GlobalDashboardPage）已用 `t()` 生成翻译后的字符串传入，方便未来 `inline=false` 时直接使用。

### OverviewPanel — agent status badges

**文件**: `packages/ui/src/pages/dashboard/components/OverviewPanel.tsx`

**涉及内容**: Agent 状态文字（`agent.status`：running, idle, paused, error）

**不翻译原因**: 这些值来自服务器 API 数据，属于外部动态内容，非硬编码 UI 字符串，直接透传显示。
