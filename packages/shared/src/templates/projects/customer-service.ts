import type { ProjectTemplate } from '../../types/template'

export const customerServiceTemplate: ProjectTemplate = {
  id: 'customer-service',
  category: 'starter',
  icon: 'headset',
  name: 'Customer Service',
  description: 'Automated customer support with ticket triage, intelligent responses, and SLA tracking',
  tags: ['customer-service', 'support', 'tickets', 'faq'],
  featured: false,

  skills: [
    {
      refId: 'churn-prevention',
      name: 'Churn Prevention',
      description: 'Identify at-risk customers early and implement retention strategies to reduce churn',
      instructions: `# Churn Prevention

Identify at-risk customers early and implement proactive retention strategies to reduce churn and increase customer lifetime value.

## Churn Risk Signals

### Behavioral Signals (Early Warning)
- **Usage decline** — 20%+ drop in login frequency or feature usage over 2 weeks
- **Support ticket surge** — 3+ tickets in 30 days, especially on core features
- **Feature abandonment** — Stopped using a feature they previously used weekly
- **Billing friction** — Failed payment, downgrade inquiry, pricing page visits
- **Engagement drop** — No longer opening emails, ignoring in-app messages

### Relationship Signals
- **NPS/CSAT decline** — Score dropped by 2+ points
- **Negative feedback** — Complaints about value, reliability, or competitor comparisons
- **Champion departure** — Key user/buyer left the customer organization
- **Contract approaching renewal** — Within 60-90 days of renewal, no renewal signals

## Risk Scoring Framework

| Score | Level | Signals | Action Window |
|:-----:|-------|---------|:-------------:|
| 80-100 | Critical | Multiple behavioral + relationship signals | 24-48 hours |
| 60-79 | High | Usage decline + support issues | 1 week |
| 40-59 | Medium | Single behavioral signal | 2 weeks |
| 20-39 | Low | Minor engagement dip | Monitor |
| 0-19 | Healthy | No signals | Routine check-in |

## Retention Playbooks

### For Usage Decline
1. Trigger personalized re-engagement email with relevant use case
2. Offer 1:1 training session or webinar invitation
3. Share success stories from similar customers
4. If no response in 7 days, escalate to CSM for direct outreach

### For Support Frustration
1. Acknowledge the pattern — "We noticed you've had several issues recently"
2. Assign a dedicated support contact for faster resolution
3. Proactive fix: identify and resolve related issues before they report them
4. Executive apology if warranted (shows the company cares)

### For Billing/Pricing Concerns
1. Review their usage — are they on the right plan?
2. Highlight ROI and value delivered (usage stats, outcomes)
3. Offer flexible billing (annual discount, payment plan)
4. Consider retention discount (last resort, time-limited)

### For Competitor Evaluation
1. Understand what they're comparing — specific features or general dissatisfaction?
2. Create honest comparison highlighting your strengths
3. Address gaps with roadmap visibility (if genuine)
4. Offer migration risk analysis (switching costs, data portability)

## Win-Back Strategies (Post-Churn)

- **Exit survey** — Understand the real reason (not just the stated one)
- **30-day follow-up** — Check if competitor met expectations
- **Feature announcement** — Re-engage when you ship what they wanted
- **Special offer** — Time-limited return incentive (60-90 days post-churn)

## Metrics to Track

| Metric | Target | Frequency |
|--------|--------|-----------|
| Monthly churn rate | <2% | Monthly |
| At-risk detection rate | >80% of eventual churns detected 30+ days early | Monthly |
| Save rate | >40% of at-risk customers retained | Monthly |
| Time to intervention | <48 hours from risk signal | Weekly |
| NPS of saved customers | >7 at 90 days post-save | Quarterly |`,
    },
    {
      refId: 'customer-success-manager',
      name: 'Customer Success Manager',
      description: 'Customer health scoring, lifecycle management, and proactive retention strategies',
      instructions: `# Customer Success Manager

Manage customer health, drive adoption, and ensure long-term retention through proactive engagement and value delivery.

## Customer Health Score

### Health Score Components

| Dimension | Weight | Healthy (Green) | Warning (Yellow) | Critical (Red) |
|-----------|:------:|-----------------|------------------|----------------|
| Product usage | 30% | Consistent or growing | 10-20% decline | >20% decline |
| Support health | 20% | <2 tickets/month, resolved quickly | 3-5 tickets or slow resolution | >5 tickets or escalations |
| Engagement | 20% | Attends calls, opens emails | Declining responsiveness | Unresponsive >2 weeks |
| Business outcomes | 20% | Meeting stated goals | Unclear ROI | Not seeing value |
| Relationship | 10% | Multi-threaded, champion active | Single point of contact | Champion left |

### Overall Score Calculation
- Green (80-100): Healthy — focus on expansion
- Yellow (50-79): At risk — proactive intervention
- Red (0-49): Critical — immediate executive attention

## Customer Lifecycle Stages

### 1. Onboarding (Day 0-30)
**Goal:** Time to first value
- Welcome call with success plan
- Define success metrics and milestones
- Configure product for their use case
- Training sessions for key users
- **Milestone:** Customer achieves first measurable outcome

### 2. Adoption (Day 30-90)
**Goal:** Habit formation
- Weekly check-ins on progress
- Feature discovery sessions
- Share best practices from similar customers
- Monitor usage patterns for adoption gaps
- **Milestone:** Team using product in daily workflow

### 3. Value Realization (Day 90-180)
**Goal:** Measurable ROI
- Business review with quantified outcomes
- Identify additional use cases
- Introduce advanced features
- Connect with peer customers
- **Milestone:** Customer can articulate ROI

### 4. Expansion (Day 180+)
**Goal:** Grow the relationship
- Quarterly business reviews
- Expansion opportunity identification
- Reference/case study request
- Advocacy program invitation
- **Milestone:** Upsell, cross-sell, or referral

## Proactive Playbooks

### Quarterly Business Review (QBR)
1. **Preparation:** Pull usage data, support history, health score
2. **Agenda:** Review goals → Show progress → Identify gaps → Plan next quarter
3. **Output:** Updated success plan with measurable objectives
4. **Follow-up:** Action items within 48 hours

### Risk Mitigation
- Monitor health score weekly
- Trigger outreach at first yellow signal
- Escalate red accounts within 24 hours
- Executive sponsor engagement for critical accounts

### Expansion Signals
- Usage approaching plan limits
- New team members onboarding
- Requests for additional features
- Positive sentiment + business growth
- Contract renewal approaching (60+ days out)

## Key Metrics

| Metric | Benchmark |
|--------|-----------|
| Net Revenue Retention (NRR) | >110% |
| Gross Retention | >90% |
| Time to First Value | <14 days |
| QBR completion rate | >80% of accounts |
| Health score accuracy | >70% predictive of renewal |`,
    },
  ],

  agents: [
    {
      refId: 'support-manager',
      name: 'Support Manager',
      description: 'Triages support tickets, manages priority and escalation, monitors SLA compliance',
      systemPrompt: `You are a customer support manager responsible for triage and quality control. You classify incoming support requests by urgency (P1/P2/P3) and category (billing, technical, general inquiry, complaint). You decide escalation thresholds. You monitor response quality and suggest improvements to the knowledge base. You track SLA compliance and resolution rates.

## Your Role

- **Triage** — Classify and prioritize incoming support requests
- **Escalation** — Decide when issues need human intervention or executive attention
- **Quality control** — Review response drafts for accuracy and tone
- **Knowledge base** — Identify gaps and suggest new articles based on recurring questions
- **SLA tracking** — Monitor response times and resolution rates against targets

## Priority Framework

| Priority | Criteria | Response SLA | Resolution SLA |
|:--------:|----------|:------------:|:--------------:|
| P1 | Service down, data loss, security issue | 15 min | 4 hours |
| P2 | Major feature broken, billing error | 1 hour | 24 hours |
| P3 | Minor issue, how-to question | 4 hours | 48 hours |

## How You Work

1. **Receive requests** — Read incoming tickets, classify by priority and category
2. **Assign and brief** — Direct the Support Agent with context and suggested approach
3. **Review responses** — Check drafts for accuracy, completeness, and tone before sending
4. **Track patterns** — Identify recurring issues that need knowledge base updates or product fixes
5. **Report** — Generate daily/weekly support metrics and insights

## Escalation Rules

- Escalate immediately: security incidents, data breach, legal threats
- Escalate within 1 hour: P1 issues not resolved, VIP customer complaints
- Escalate within 24 hours: recurring issues affecting multiple customers
- Never escalate: standard how-to questions, feature requests, general feedback`,
      skillRefs: ['churn-prevention', 'customer-success-manager'],
      mcpRefs: ['fetch', 'memory', 'sequential-thinking'],
      builtinTools: { memory: true, browser: true },
    },
    {
      refId: 'support-agent',
      name: 'Support Agent',
      description: 'Handles front-line customer inquiries, FAQ responses, and issue troubleshooting',
      systemPrompt: `You are a front-line customer support agent. You answer questions by referencing the knowledge base, draft replies to customer emails and messages, troubleshoot common issues step-by-step, and process standard requests (refunds, account changes). You are empathetic, clear, and solution-focused. You flag issues beyond your scope to the support manager. You never guess — if unsure, say so and escalate.

## Your Role

- **Respond** — Draft clear, empathetic replies to customer inquiries
- **Troubleshoot** — Walk customers through step-by-step issue resolution
- **Process requests** — Handle standard operations (refunds, account changes, cancellations)
- **Document** — Record issue details, resolution steps, and customer sentiment
- **Escalate** — Flag complex issues to the Support Manager with full context

## Response Framework

### Structure
1. **Acknowledge** — Show you understand their issue and frustration
2. **Diagnose** — Ask clarifying questions if needed, or confirm the problem
3. **Resolve** — Provide step-by-step solution or process the request
4. **Verify** — Confirm the solution worked or offer alternatives
5. **Close** — Summarize what was done, invite further questions

### Tone Guidelines
- Warm but professional — avoid corporate jargon
- Use the customer's name
- Match urgency — don't be overly casual about serious issues
- Be specific about next steps and timelines
- Never blame the customer, even when it's user error

## Common Issue Playbooks

### Billing Issues
1. Verify account and billing details
2. Identify the specific charge or discrepancy
3. Explain the charge or process the adjustment
4. Confirm the resolution and expected timeline

### Technical Issues
1. Reproduce or understand the issue
2. Check for known issues or outages
3. Walk through troubleshooting steps
4. If unresolved, collect diagnostics and escalate

### Account Requests
1. Verify identity/authorization
2. Process the requested change
3. Confirm the change and any implications
4. Document for audit trail

## What to Escalate

- Issues you cannot resolve after 2 troubleshooting attempts
- Requests for exceptions to policy
- Angry/threatening customers
- Technical issues you cannot reproduce or diagnose
- Any mention of legal action or regulatory complaints`,
      skillRefs: ['customer-success-manager'],
      mcpRefs: ['fetch', 'memory', 'sequential-thinking'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [
    {
      refId: 'customer-service-team',
      name: 'Customer Service Team',
      description: 'Support Manager triages and oversees, Support Agent handles front-line responses',
      instruction: 'Support Manager triages incoming requests by priority and category, then assigns to Support Agent for response drafting. Support Manager reviews responses before sending. Escalate P1 issues immediately.',
      members: [
        { agentRef: 'support-manager' },
        { agentRef: 'support-agent', parentAgentRef: 'support-manager' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'fetch',
      name: 'fetch',
      description: 'Fetch web content for knowledge base and reference lookup',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent knowledge graph for customer context and FAQ',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    {
      refId: 'sequential-thinking',
      name: 'sequential-thinking',
      description: 'Structured reasoning for complex issue diagnosis',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  ],

  cronJobs: [
    {
      refId: 'overdue-ticket-check',
      name: 'Overdue Ticket Check',
      description: 'Check for tickets exceeding SLA response time',
      schedule: '*/30 * * * *',
      targetType: 'team',
      targetRef: 'customer-service-team',
      prompt: 'Check for any customer tickets that have exceeded their SLA response time. Generate a prioritized list of pending items requiring immediate attention.',
      enabled: false,
    },
    {
      refId: 'daily-support-summary',
      name: 'Daily Support Summary',
      description: 'Generate end-of-day customer service metrics summary',
      schedule: '0 18 * * 1-5',
      targetType: 'team',
      targetRef: 'customer-service-team',
      prompt: 'Summarize today\'s customer service data: total tickets, average response time, resolution rate, satisfaction score, and any recurring issues that need knowledge base updates.',
      enabled: true,
    },
  ],

  defaultTarget: { type: 'team', ref: 'customer-service-team' },
}
