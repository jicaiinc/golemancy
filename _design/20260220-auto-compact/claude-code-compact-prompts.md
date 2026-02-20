# Claude Code Compact Prompts Reference

> Extracted from `@anthropic-ai/claude-code@2.1.47` (`cli.js`) on 2026-02-20.
> These prompts are used by Claude Code's auto-compact system to summarize conversations
> when they approach the context window limit.

---

## 1. Main Compact Summary Prompt (Full Conversation)

Used when compacting the entire conversation history into a summary.

```
Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
  - Errors that you ran into and how you fixed them
  - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
6. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
7. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
8. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages:
    - [Detailed non tool use user message]
    - [...]

7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>

IMPORTANT: Do NOT use any tools. You MUST respond with ONLY the <summary>...</summary> block as your text output.
```

### Dynamic Suffix

If the user provides custom compact instructions (via `Additional Instructions` parameter or PreCompact hook), they are appended:

```
Additional Instructions:
${customInstructions}
```

---

## 2. Partial Compact Summary Prompt (Recent Messages Only)

Used when compacting only the recent portion of the conversation, while preserving earlier retained context intact.

```
Your task is to create a detailed summary of the RECENT portion of the conversation — the messages that follow earlier retained context. The earlier messages are being kept intact and do NOT need to be summarized. Focus your summary on what was discussed, learned, and accomplished in the recent messages only.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Analyze the recent messages chronologically. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
  - Errors that you ran into and how you fixed them
  - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture the user's explicit requests and intents from the recent messages
2. Key Technical Concepts: List important technical concepts, technologies, and frameworks discussed recently.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List errors encountered and how they were fixed.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages from the recent portion that are not tool results.
7. Pending Tasks: Outline any pending tasks from the recent messages.
8. Current Work: Describe precisely what was being worked on immediately before this summary request.
9. Optional Next Step: List the next step related to the most recent work. Include direct quotes from the most recent conversation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Important Code Snippet]

4. Errors and fixes:
    - [Error description]:
      - [How you fixed it]

5. Problem Solving:
   [Description]

6. All user messages:
    - [Detailed non tool use user message]

7. Pending Tasks:
   - [Task 1]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the RECENT messages only (after the retained earlier context), following this structure and ensuring precision and thoroughness in your response.

IMPORTANT: Do NOT use any tools. You MUST respond with ONLY the <summary>...</summary> block as your text output.
```

---

## 3. Summary Injection Prompt (Post-Compact Context)

After compaction, this prompt is injected at the beginning of the conversation to provide the model with the compacted context.

```
This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${summary}
```

### Conditional additions:

If a transcript file path is available:
```
If you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}
```

If recent messages are preserved:
```
Recent messages are preserved verbatim.
```

If auto-compact (not manual), append:
```
Please continue the conversation from where we left off without asking the user any further questions. Continue with the last task that you were asked to work on.
```

---

## 4. Tool Use Summary Prompt

Used to generate brief summaries of tool execution results (not directly part of compact, but used for context compression of tool call blocks).

```
You summarize what was accomplished by a coding assistant.
Given the tools executed and their results, provide a brief summary.

Rules:
- Use past tense (e.g., "Read package.json", "Fixed type error in utils.ts")
- Be specific about what was done
- Keep under 8 words
- Do not include phrases like "I did" or "The assistant" - just describe what happened
- Focus on the user-visible outcome, not implementation details

Examples:
- "Searched codebase for authentication code"
- "Read and analyzed Message.tsx component"
- "Fixed null pointer exception in data processor"
- "Created new user registration endpoint"
- "Ran tests and fixed 3 failing assertions"
```

---

## 5. Summary Response Parsing

The model's response is parsed using XML tag extraction:

- `<analysis>...</analysis>` — The model's thought process (stripped or reformatted in final output)
- `<summary>...</summary>` — The actual summary content used for context continuation

The parser (`g49` function) converts XML tags to plain text headers:
- `<analysis>` → `Analysis:\n{content}`
- `<summary>` → `Summary:\n{content}`

---

## 6. Compact Boundary Marker Structure

When a compact occurs, a boundary marker message is created:

```typescript
{
  type: "system",
  subtype: "compact_boundary",
  content: "Conversation compacted",
  isMeta: false,
  timestamp: new Date().toISOString(),
  uuid: generateUUID(),
  level: "info",
  compactMetadata: {
    trigger: "auto" | "manual",
    preTokens: number,          // token count before compaction
    userContext?: string,       // user-provided context for partial compact
    messagesSummarized?: string // UUID of last summarized message
  }
}
```

---

## 7. Auto-Compact Threshold Calculation

Key constants and logic:

```typescript
const MAX_OUTPUT_BUFFER = 20_000    // Reserved for model output
const AUTOCOMPACT_BUFFER = 13_000   // Buffer between effective window and compact trigger
const WARNING_THRESHOLD = 20_000    // Tokens before effective limit to show warning
const ERROR_THRESHOLD = 20_000      // Tokens before effective limit to show error
const BLOCKING_RESERVE = 3_000      // Absolute minimum free space

// Effective context window (available for conversation)
function effectiveWindow(model) {
  return contextWindowSize(model) - min(maxOutputTokens(model), 20_000)
}

// Auto-compact trigger threshold
function autoCompactThreshold(model) {
  const effective = effectiveWindow(model)
  const threshold = effective - AUTOCOMPACT_BUFFER  // 13K buffer

  // Support override via environment variable
  if (CLAUDE_AUTOCOMPACT_PCT_OVERRIDE) {
    const pctThreshold = Math.floor(effective * (pct / 100))
    return Math.min(pctThreshold, threshold)
  }

  return threshold
}

// Context status check
function checkContextStatus(currentTokens, model) {
  const threshold = autoCompactThreshold(model)
  return {
    percentLeft: Math.max(0, Math.round((effectiveWindow - currentTokens) / effectiveWindow * 100)),
    isAboveWarningThreshold: currentTokens >= effectiveWindow - WARNING_THRESHOLD,
    isAboveErrorThreshold: currentTokens >= effectiveWindow - ERROR_THRESHOLD,
    isAboveAutoCompactThreshold: autoCompactEnabled && currentTokens >= threshold,
    isAtBlockingLimit: currentTokens >= contextWindowSize - BLOCKING_RESERVE,
  }
}
```

### Auto-Compact Trigger Conditions:
1. Auto-compact must be enabled in settings (`autoCompactEnabled`)
2. Not already in a compact or session_memory operation
3. Current token count exceeds `autoCompactThreshold(model)`

---

## 8. Post-Compact Message Array Structure

After compaction, the conversation messages are restructured:

```typescript
function buildCompactedMessages(compactionResult) {
  return [
    compactionResult.boundaryMarker,     // System message: "Conversation compacted"
    ...compactionResult.summaryMessages,  // The AI-generated summary (marked isCompactSummary: true)
    ...compactionResult.messagesToKeep ?? [],  // Recent messages preserved verbatim
    ...compactionResult.attachments,      // Re-read file states, environment info
    ...compactionResult.hookResults,      // Session start hook results
  ]
}
```

- `summaryMessages` are marked with `isCompactSummary: true` and `isVisibleInTranscriptOnly: true`
- The summary is injected as a user message using the **Summary Injection Prompt** (Section 3)
- Old messages before the boundary are completely replaced — they exist only in the transcript file

---

## 9. Compact Execution Flow

```
1. Check: currentTokens >= autoCompactThreshold
2. Try session-memory compact first (if enabled)
3. If no session-memory result, run full compact:
   a. Count pre-compact tokens
   b. Run PreCompact hook (can inject custom instructions or block)
   c. Build summarization prompt (Section 1 or 2)
   d. Call model with generateText (system: "You are a helpful AI assistant tasked with summarizing conversations")
   e. Parse <summary> from response
   f. Clear read-file state cache
   g. Rebuild environment attachments (re-read relevant files, env info)
   h. Create boundary marker
   i. Construct new message array
   j. Run SessionStart hooks
   k. Emit telemetry (pre/post token counts, cache hit rates)
4. Replace conversation messages with compacted array
5. Continue conversation with reduced context
```

---

## 10. Compact API Parameters

The summarization API call uses:
- **System prompt**: `"You are a helpful AI assistant tasked with summarizing conversations."`
- **Thinking**: Disabled (`thinkingConfig: { type: "disabled" }`)
- **Max output tokens**: Special override (`maxOutputTokensOverride: sc8`, exact value obfuscated)
- **Tools**: Includes Read and Grep tools but with `toolChoice: undefined` (model decides)
- **Query source**: `"compact"`

---

## 11. Microcompact (Session Memory)

A lighter-weight alternative using session memory notes:
- Maintains a structured notes file with sections (Key Results, Current State, etc.)
- Updates incrementally rather than full re-summarization
- Tried first before falling back to full compact
- Has constraints: `minTokens: 10_000`, `minTextBlockMessages: 5`, `maxTokens: 40_000`

---

## 12. User-Facing Compact Instructions Examples

Users can customize compact behavior through CLAUDE.md or similar config:

```markdown
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
```

```markdown
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
```

These instructions are appended to the summarization prompt as "Additional Instructions".
