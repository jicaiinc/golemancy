---
name: research-outline
description: "Conduct preliminary research on a topic and generate a structured research outline. First phase of the two-phase deep research workflow."
metadata:
  version: 1.0.0
  source: Weizhena/Deep-Research-skills
---

# Research Outline

Conduct preliminary research on a topic and generate a structured research framework with items to investigate and fields to analyze.

## Workflow

### Step 1: Generate Initial Framework

Based on the research topic, use existing knowledge to generate:
- Main research objects/items list in this domain
- Suggested research field framework (dimensions to analyze)

Present the framework and confirm with the user:
- Need to add/remove items?
- Does field framework meet requirements?

### Step 2: Web Search Supplement

Ask for time range (e.g., last 6 months, since 2024, unlimited).

Search the web to:
1. Verify if existing items are missing important objects
2. Supplement items based on missing objects
3. Search for topic-related items within time range
4. Supplement new research dimensions/fields

### Step 3: Merge Existing Knowledge

If the user has existing field definitions or prior research, merge them with the generated framework.

### Step 4: Generate Research Outline

Produce two structured outputs:

**Items List:**
- Topic name
- Complete list of research objects
- Execution configuration (batch size, items per batch)

**Field Definitions:**
- Field categories with descriptions
- Detail level for each field (brief / moderate / detailed)
- Uncertain fields marked for verification

### Step 5: Confirm and Save

Present the complete outline for user confirmation before proceeding to deep research phase.

## Research Types Supported

- **Academic**: Paper surveys, benchmark reviews, literature analysis
- **Technical**: Technology comparison, framework evaluation, tool selection
- **Market**: Competitor analysis, industry trends, product comparison
- **Due Diligence**: Company research, investment analysis, risk assessment

## Best Practices

- Always verify claims with multiple sources
- Mark uncertain or unverified information clearly
- Structure the outline to enable parallel deep-dive research
- Include source URLs for all supplementary findings
- Design fields that are measurable and comparable across items
