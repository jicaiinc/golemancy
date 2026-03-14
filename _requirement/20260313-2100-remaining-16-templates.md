# Remaining 16 Project Templates — Implementation + i18n

> Date: 2026-03-13
> Status: Approved

## Goal

Implement all 16 remaining project templates and complete i18n for all 22 languages.

## Two Parallel Workstreams

### Line A: Code Implementation (16 templates)

For each template:
1. Create `packages/shared/src/templates/projects/{id}.ts`
2. Pull skills content from open-source repos (don't hand-write), inline into `instructions`
3. Register in `packages/shared/src/templates/index.ts`
4. Map to existing TemplateCategory (no new categories):
   - smart-secretary → productivity
   - translator → productivity
   - knowledge-explorer → research
   - life-manager → starter
   - doc-hub → productivity
   - content-marketing → creative
   - social-media-ops → creative
   - seo-optimizer → productivity
   - sales-pipeline → productivity
   - customer-service → starter
   - financial-mgmt → productivity
   - legal-compliance → starter
   - data-analytics → research
   - product-mgmt → development
   - recruitment → starter
   - academic-research → research
5. Large skills bundles: merge into single instructions per skill entry
6. MCP: all zero-config (npx/uvx only)
7. Final: `pnpm lint` must pass

### Line B: i18n (22 languages)

1. Add 16 template entries to `en/templates.json` (name + description)
2. Translate to all 21 other languages
3. Follow `__guidelines/i18n-20260302/` translation standards
4. Final: `pnpm check:i18n` must pass

## Quality Requirements

- Team Lead verifies every deliverable personally
- Code reviewer checks: skills content correctness, type matching, MCP config
- i18n reviewer checks: `pnpm check:i18n` + translation quality audit
- No task is "done" until verified by reviewer

## Reference Documents

- `_design/20260313-1800-template-system/remaining-templates.md` — Full config for all 16
- `_design/20260313-1800-template-system/skills-source-map.md` — Skills source mapping
- `packages/shared/src/templates/projects/writing-assistant.ts` — Reference implementation
- `packages/shared/src/templates/projects/deep-research.ts` — Reference implementation
- `__guidelines/i18n-20260302/` — i18n translation guidelines
