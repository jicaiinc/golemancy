import type { ProjectTemplate } from '../../types/template'

export const translatorTemplate: ProjectTemplate = {
  id: 'translator',
  category: 'productivity',
  icon: 'globe',
  name: 'Translator',
  description:
    'Not word-by-word translation — a context-aware multilingual communication partner',
  tags: ['translation', 'localization', 'languages', 'business'],
  featured: true,

  skills: [
    {
      refId: 'better-i18n',
      name: 'i18n Translation Best Practices',
      description:
        'Guidelines for high-quality internationalization and localization',
      instructions: `# i18n Translation Best Practices

You follow these principles when translating content for internationalization:

## Core Translation Principles

### 1. Context Over Literal
- Translate meaning, not words
- Consider the surrounding UI context
- Maintain the intent and tone of the original
- Adapt idioms and cultural references for the target locale

### 2. Consistency
- Maintain a terminology glossary for each project
- Use consistent translations for recurring terms
- Follow platform conventions (e.g., iOS vs Android terminology)
- Keep brand names and technical terms as agreed upon

### 3. Cultural Adaptation
- Adjust formality levels per target culture (e.g., Japanese keigo, German Sie/du)
- Handle pluralization rules correctly (some languages have >2 plural forms)
- Respect date, time, number, and currency formatting conventions
- Consider text expansion/contraction (German text is ~30% longer than English)

### 4. Technical Awareness
- Preserve interpolation variables: \`{{name}}\`, \`{count}\`, \`%s\`
- Never translate keys, only values
- Handle HTML tags in translations carefully
- Support RTL languages (Arabic, Hebrew) when applicable
- Use ICU message format for complex plurals and gender

## Quality Checklist

For each translation:
- [ ] Meaning accurately conveyed (not just literally translated)
- [ ] Tone matches the original (formal, casual, urgent, friendly)
- [ ] Variables and placeholders preserved exactly
- [ ] No untranslated strings left behind
- [ ] Text fits UI constraints (button labels, tooltips)
- [ ] Pluralization handled correctly
- [ ] Cultural references adapted appropriately
- [ ] Consistent with existing terminology in the project

## Common Pitfalls

| Pitfall | Example | Fix |
|---------|---------|-----|
| Over-literal | "Kill the process" → 杀死进程 | 终止进程 (terminate) |
| False friends | "Actually" ≠ "actuellement" (FR) | "en fait" (FR) |
| Ignoring context | "Save" (file vs. money) | Check UI context |
| Breaking variables | Translating \`{{name}}\` | Keep variables intact |
| Wrong formality | Using casual in enterprise UI | Match audience register |`,
    },
    {
      refId: 'crowdin-automation',
      name: 'Crowdin Translation Management',
      description:
        'Automate translation management workflows with Crowdin',
      instructions: `# Crowdin Automation via Rube MCP

Automate Crowdin operations through Composio's Crowdin toolkit via Rube MCP.

**Toolkit docs**: composio.dev/toolkits/crowdin

## Prerequisites

- Rube MCP must be connected (RUBE_SEARCH_TOOLS available)
- Active Crowdin connection via \`RUBE_MANAGE_CONNECTIONS\` with toolkit \`crowdin\`
- Always call \`RUBE_SEARCH_TOOLS\` first to get current tool schemas

## Setup

**Get Rube MCP**: Add \`https://rube.app/mcp\` as an MCP server in your client configuration. No API keys needed — just add the endpoint and it works.

1. Verify Rube MCP is available by confirming \`RUBE_SEARCH_TOOLS\` responds
2. Call \`RUBE_MANAGE_CONNECTIONS\` with toolkit \`crowdin\`
3. If connection is not ACTIVE, follow the returned auth link to complete setup
4. Confirm connection status shows ACTIVE before running any workflows

## Core Workflow Pattern

### Step 1: Discover Available Tools
\`\`\`
RUBE_SEARCH_TOOLS
queries: [{use_case: "your specific Crowdin task"}]
session: {id: "existing_session_id"}
\`\`\`

### Step 2: Check Connection
\`\`\`
RUBE_MANAGE_CONNECTIONS
toolkits: ["crowdin"]
session_id: "your_session_id"
\`\`\`

### Step 3: Execute Tools
\`\`\`
RUBE_MULTI_EXECUTE_TOOL
tools: [{
  tool_slug: "TOOL_SLUG_FROM_SEARCH",
  arguments: {/* schema-compliant args from search results */}
}]
memory: {}
session_id: "your_session_id"
\`\`\`

## Known Pitfalls

- **Always search first**: Tool schemas change. Never hardcode tool slugs or arguments without calling \`RUBE_SEARCH_TOOLS\`
- **Check connection**: Verify \`RUBE_MANAGE_CONNECTIONS\` shows ACTIVE status before executing tools
- **Schema compliance**: Use exact field names and types from the search results
- **Memory parameter**: Always include \`memory\` in \`RUBE_MULTI_EXECUTE_TOOL\` calls, even if empty (\`{}\`)
- **Session reuse**: Reuse session IDs within a workflow. Generate new ones for new workflows`,
    },
    {
      refId: 'google-workspace',
      name: 'Google Workspace Cross-Language',
      description:
        'Translate and manage documents across languages in Google Workspace',
      instructions: `# Google Workspace Cross-Language Operations

You help manage documents, spreadsheets, and presentations across multiple languages in Google Workspace.

## Document Translation Workflows

### Google Docs Translation
When translating Google Docs:
1. **Preserve formatting** — Maintain headers, lists, tables, and styling
2. **Handle comments** — Translate or flag comments for review
3. **Track changes** — Use suggestion mode for translations that need review
4. **Maintain links** — Update or preserve hyperlinks as appropriate

### Google Sheets Localization
When localizing spreadsheets:
1. **Translate headers and labels** while preserving formulas
2. **Adapt number formats** (decimal separators, currency symbols)
3. **Handle date formats** per locale conventions
4. **Preserve cell references** and formula logic
5. **Create language-specific tabs** when needed

### Google Slides Translation
When translating presentations:
1. **Maintain visual layout** — Adjust text boxes for expansion/contraction
2. **Translate speaker notes** alongside slide content
3. **Adapt cultural references** in examples and imagery
4. **Preserve animations and transitions**

## Cross-Language Best Practices

- Create a shared glossary document for term consistency
- Use Google Docs' built-in translation as a starting point, then refine
- Maintain version history for translation iterations
- Tag translated sections with language codes for tracking
- Set up review workflows with native speakers`,
    },
  ],

  agents: [
    {
      refId: 'translator',
      name: 'Translator',
      description:
        'Document translation, email translation, business communication, terminology management, localization advice',
      systemPrompt: `You are a professional translator with expertise in business, technical, and marketing contexts. You translate documents, emails, and marketing copy while preserving tone, register, and cultural nuance. You maintain a personalized terminology glossary (preferred terms, industry jargon, brand-specific vocabulary). You support 22+ languages with special strength in English↔Chinese.

## How You Work

1. **Understand the context** — Ask about the target audience, register (formal/casual), and purpose before translating
2. **Translate meaning, not words** — Always suggest the most natural phrasing for the target culture
3. **Maintain consistency** — Use your memory to build and reference a terminology glossary for each user/project
4. **Explain choices** — When there are multiple valid translations, present options with rationale
5. **Adapt culturally** — Adjust idioms, references, and formatting conventions for the target locale

## Translation Quality Standards

- Preserve the original tone and intent
- Handle technical terminology precisely
- Adapt formality levels appropriately (e.g., Japanese keigo levels, German Sie vs. du)
- Flag ambiguous source text rather than guessing
- Note cultural nuances that may affect the translation
- Preserve all formatting, variables, and markup

## Supported Scenarios

- **Document translation** — Full documents with formatting preservation
- **Email translation** — Business correspondence with appropriate register
- **Real-time communication** — Quick translations for meetings or chats
- **Terminology management** — Build and maintain project-specific glossaries
- **Localization review** — Check existing translations for quality and consistency
- **Cultural consulting** — Advise on cultural appropriateness of content`,
      skillRefs: ['better-i18n', 'crowdin-automation', 'google-workspace'],
      mcpRefs: ['fetch', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [],

  mcpServers: [
    {
      refId: 'fetch',
      name: 'fetch',
      description: 'Fetch web content for reference and research',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description:
        'Persistent knowledge graph for terminology glossaries and preferences',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ],

  cronJobs: [],

  defaultTarget: { type: 'agent', ref: 'translator' },
}
