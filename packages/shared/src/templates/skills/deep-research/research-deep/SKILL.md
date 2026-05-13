---
name: research-deep
description: "Execute deep research on individual items from a research outline. Second phase of the two-phase deep research workflow."
metadata:
  version: 1.0.0
  source: Weizhena/Deep-Research-skills
---

# Deep Research Execution

Execute deep research on individual items from a research outline, producing structured findings for each item.

## Workflow

### Step 1: Load Research Outline

Read the research outline produced in the first phase:
- Items list with descriptions
- Field definitions with detail levels
- Execution configuration

### Step 2: Resume Check

Check for previously completed research items. Skip already-completed items to support incremental research.

### Step 3: Batch Execution

For each research item:
1. Search the web for comprehensive information
2. Fill in all defined fields from the outline
3. Mark uncertain values with [uncertain] tag
4. List all uncertain fields at the end
5. Validate completeness against field definitions

### Step 4: Monitor Progress

After each batch:
- Report completion status
- Surface any items requiring manual verification
- Proceed to next batch with user approval

### Step 5: Summary Report

After all items are researched:
- Total completion count
- Items with uncertain fields flagged
- Key findings and patterns observed
- Recommendations for follow-up

## Research Quality Standards

- Every factual claim must have a source URL
- Distinguish between verified facts and inferences
- Use multiple independent sources for critical data points
- Record the date of information retrieval
- Flag contradictory information from different sources

## Output Format

For each research item, produce structured data containing:
- All fields defined in the research outline
- Source URLs for each data point
- Confidence level (verified / likely / uncertain)
- Date of last verification
- Notes on conflicting information

## Best Practices

- Prioritize primary sources over aggregators
- Cross-reference data across at least 2 sources
- Note when information may be outdated
- Include both quantitative and qualitative findings
- Maintain consistent formatting across all items
