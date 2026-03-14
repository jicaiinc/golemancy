import type { ProjectTemplate } from '../../types/template'

export const productMgmtTemplate: ProjectTemplate = {
  id: 'product-mgmt',
  category: 'development',
  icon: 'map',
  name: 'Product Management',
  description: 'Requirements analysis, PRD writing, roadmap planning, and project progress tracking',
  tags: ['product', 'prd', 'roadmap', 'agile', 'sprint'],
  featured: false,

  skills: [
    {
      refId: 'product-manager-skills',
      name: 'Product Manager Toolkit',
      description: 'Comprehensive product management skill set covering discovery, PRD, roadmap, user stories, positioning, and validation',
      instructions: `# Product Manager Toolkit

Comprehensive product management framework covering the full product lifecycle from discovery through delivery.

## Discovery & Research

### Problem Discovery
1. **Customer interviews** — Ask open-ended questions about workflows, pain points, and current solutions
2. **Data analysis** — Identify usage patterns, drop-off points, and underused features
3. **Support mining** — Extract common themes from support tickets, NPS comments, and feature requests
4. **Competitive landscape** — Map competitor features, pricing, and positioning

### Opportunity Assessment (RICE Framework)
| Factor | Scoring |
|--------|---------|
| **Reach** | How many users affected per quarter? |
| **Impact** | 3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal |
| **Confidence** | 100%=high, 80%=medium, 50%=low |
| **Effort** | Person-months required |

**RICE Score = (Reach × Impact × Confidence) / Effort**

## PRD (Product Requirements Document)

### PRD Template

#### 1. Overview
- **Problem statement** — What user problem are we solving? (1-2 sentences)
- **Business context** — Why now? What's the strategic driver?
- **Success metrics** — How will we measure success? (2-3 specific KPIs)

#### 2. User Stories
Format: "As a [persona], I want to [action] so that [outcome]."

For each story:
- Acceptance criteria (Given/When/Then)
- Edge cases and error states
- Priority (P0=must-have, P1=should-have, P2=nice-to-have)

#### 3. Scope
- **In scope** — Specific features and behaviors included
- **Out of scope** — Explicitly excluded items (prevents scope creep)
- **Future considerations** — Items deferred to later phases

#### 4. Design Requirements
- User flow diagrams
- Wireframe references
- Interaction specifications
- Accessibility requirements

#### 5. Technical Requirements
- API contracts or data model changes
- Performance requirements (latency, throughput)
- Security and privacy considerations
- Migration/backward compatibility needs

#### 6. Launch Plan
- Feature flag strategy
- Rollout plan (% rollout, geography, user segments)
- Rollback criteria and procedure
- Documentation and training needs

## Roadmap Planning

### Quarterly Roadmap Structure
| Theme | Objective | Key Results | Features | Status |
|-------|-----------|-------------|----------|--------|
| Growth | Increase activation | +15% day-1 retention | Onboarding v2, Templates | In progress |
| Quality | Reduce churn | <2% monthly churn | Performance, Bug blitz | Planned |
| Platform | Enable integrations | 5 new integrations | API v2, Webhooks | Discovery |

### Roadmap Communication
- **Executive** — Themes and business outcomes (quarterly)
- **Engineering** — Features and technical requirements (sprint-level)
- **Sales/CS** — Customer-facing changes and timeline (monthly)
- **Customers** — High-level direction without specific dates

## User Story Best Practices

- One user action per story — break down compound stories
- Include negative cases — "user cannot access another user's data"
- Define done — acceptance criteria are the contract between PM and engineering
- Size appropriately — each story should fit in one sprint
- Validate with real users — do user stories match actual workflows?

## Prioritization Techniques

| Method | Best For | Process |
|--------|----------|---------|
| RICE | Quantitative comparison | Score each opportunity |
| MoSCoW | Release scoping | Must/Should/Could/Won't |
| Impact/Effort | Quick triage | 2×2 matrix plot |
| Kano Model | Feature categorization | Must-be/Performance/Delighters |
| Story Mapping | User journey | Map stories along user flow |

## Stakeholder Management

- **Weekly**: Engineering standup sync
- **Bi-weekly**: Design review
- **Monthly**: Stakeholder roadmap update
- **Quarterly**: Strategy alignment with leadership`,
    },
    {
      refId: 'agile-product-owner',
      name: 'Agile Product Owner',
      description: 'Manage product backlog, sprint planning, and stakeholder alignment in agile teams',
      instructions: `# Agile Product Owner

Manage the product backlog effectively, ensure sprint goals are achievable, and maintain alignment between stakeholders and the development team.

## Backlog Management

### Backlog Structure
- **Epics** — Large bodies of work (1-3 month scope)
- **Features** — Deliverable capabilities within an epic (1-4 sprints)
- **User Stories** — Individual units of work (fits in 1 sprint)
- **Tasks** — Technical subtasks within a story

### Backlog Grooming (Refinement)

**Frequency:** Weekly, 1 hour, with engineering leads

**Process:**
1. Review upcoming sprint candidates (top 10-15 stories)
2. Clarify acceptance criteria and edge cases
3. Size stories (story points or t-shirt sizing)
4. Identify dependencies and blockers
5. Re-prioritize based on new information
6. Ensure 2 sprints of ready-to-develop stories at all times

### Definition of Ready (DoR)
A story is ready for sprint when:
- [ ] User story follows standard format
- [ ] Acceptance criteria are specific and testable
- [ ] Dependencies identified and resolved (or planned)
- [ ] Design assets available (if applicable)
- [ ] Story sized by the team
- [ ] No open questions blocking development

### Definition of Done (DoD)
A story is done when:
- [ ] Code complete and reviewed
- [ ] Unit tests passing
- [ ] Acceptance criteria verified
- [ ] Documentation updated
- [ ] No known defects
- [ ] Product Owner accepted

## Sprint Planning

### Sprint Goal
- One clear, achievable objective per sprint
- Ties to current roadmap theme
- Team can explain it in one sentence

### Capacity Planning
- Account for holidays, PTO, meetings
- Reserve 20% for bugs and tech debt
- Don't plan to 100% capacity — aim for 70-80%

### Sprint Review/Demo
- Demo working software, not slides
- Collect stakeholder feedback
- Update backlog based on learnings
- Celebrate completed work

## Stakeholder Communication

### Status Reporting
- **Daily**: Attend standup (listen, unblock, don't direct)
- **Sprint end**: Demo + velocity report
- **Monthly**: Roadmap progress update
- **Quarterly**: Strategy alignment review

### Managing Requests
- All requests go through the backlog — no side-channel commitments
- Prioritize based on data, not loudest voice
- Say "not yet" instead of "no" — provide timeline context
- Transparent about trade-offs: "We can do X, but it means delaying Y"`,
    },
    {
      refId: 'scrum-master',
      name: 'Scrum Master',
      description: 'Facilitate agile ceremonies, remove impediments, and coach teams on agile practices',
      instructions: `# Scrum Master

Facilitate agile ceremonies, remove impediments, and coach teams toward continuous improvement and high performance.

## Scrum Ceremonies

### Daily Standup (15 min)
**Purpose:** Synchronize the team, surface blockers

**Format per person (< 2 min):**
1. What I completed yesterday
2. What I'm working on today
3. Any blockers or risks

**Facilitation tips:**
- Start on time, every time — don't wait for latecomers
- Keep it standing (literally) to maintain energy
- Park detailed discussions for after standup
- Track blockers on a visible board
- Rotate facilitator to build team ownership

### Sprint Planning (2-4 hours)
**Purpose:** Commit to sprint goal and select stories

**Agenda:**
1. Review sprint goal (Product Owner presents)
2. Review team capacity (account for PTO, holidays)
3. Select stories from refined backlog
4. Break stories into tasks (optional)
5. Confirm sprint commitment

### Sprint Review/Demo (1-2 hours)
**Purpose:** Inspect the increment, gather feedback

**Agenda:**
1. Sprint goal recap (achieved/partial/missed)
2. Demo completed stories (working software)
3. Stakeholder feedback and questions
4. Backlog impact discussion
5. Updated roadmap view

### Sprint Retrospective (1-1.5 hours)
**Purpose:** Inspect and adapt the process

**Formats (rotate):**
- **Start/Stop/Continue** — Simple, effective for new teams
- **4Ls** — Liked, Learned, Lacked, Longed for
- **Sailboat** — Wind (helps), Anchor (slows), Rocks (risks), Island (goal)
- **Mad/Sad/Glad** — Emotional check-in

**Key rules:**
- Focus on process, not people
- Maximum 3 action items (with owners and deadlines)
- Review last retro's action items first
- Create psychological safety — Vegas rule applies

## Impediment Management

### Impediment Response Framework
| Type | Examples | Resolution |
|------|---------|------------|
| Technical | Environment issues, dependency bugs | Pair with engineer, escalate to lead |
| Process | Unclear requirements, slow reviews | Facilitate discussion with PO/team |
| Organizational | Cross-team dependency, policy blocker | Escalate to management |
| External | Vendor delay, API outage | Communicate impact, find workaround |

### Escalation Path
1. Team self-resolves (same day)
2. Scrum Master facilitates (within 24 hours)
3. Engineering manager escalation (within 48 hours)
4. Director/VP escalation (persistent blockers only)

## Team Health Metrics

| Metric | Healthy | Warning |
|--------|---------|---------|
| Velocity trend | Stable ±10% | >20% variance |
| Sprint completion rate | >80% stories done | <70% |
| Bug escape rate | <5% of stories | >10% |
| Retro action completion | >80% | <50% |
| Team happiness | Trending up or stable | Declining 2+ sprints |

## Coaching Tips

- **Don't solve problems for the team** — ask questions that lead them to solutions
- **Protect the team** — shield from scope creep, meeting overload, and external pressure
- **Model vulnerability** — admit mistakes to build psychological safety
- **Celebrate progress** — recognize improvements, not just outcomes
- **Measure what matters** — velocity is a planning tool, not a performance metric`,
    },
  ],

  agents: [
    {
      refId: 'product-manager',
      name: 'Product Manager',
      description: 'Translates user needs into PRDs, creates roadmaps, and prioritizes features',
      systemPrompt: `You are an experienced product manager who translates user needs into clear product specifications. You write PRDs with background, goals, user stories (As a... I want... So that...), acceptance criteria, and edge cases. You create roadmaps using impact/effort prioritization (RICE framework). You conduct user research synthesis, competitive feature analysis, and define success metrics. You know when to say no to scope creep and articulate product decisions clearly.

## Your Role

- **Requirements** — Translate user needs and business goals into clear, actionable specifications
- **Prioritization** — Use data-driven frameworks (RICE, MoSCoW) to decide what to build next
- **Roadmap** — Maintain a living roadmap that balances short-term wins with long-term vision
- **Communication** — Align stakeholders with transparent status updates and trade-off explanations
- **Quality** — Define acceptance criteria and success metrics for every feature

## How You Work

1. **Understand the problem** — Before writing solutions, deeply understand the user pain point and business context
2. **Write the PRD** — Clear problem statement, user stories, acceptance criteria, scope boundaries, success metrics
3. **Prioritize ruthlessly** — Score opportunities with RICE, stack rank, and make trade-offs explicit
4. **Coordinate with Project Tracker** — Ensure features are broken into trackable tasks with clear acceptance criteria
5. **Review and iterate** — Continuously refine based on feedback, data, and market changes

## Decision Principles

- Ship the smallest thing that delivers value — don't over-scope
- Data informs, intuition decides — neither alone is sufficient
- Say "not yet" instead of "no" — everything has a priority, not everything has a now
- One metric per feature — if you can't measure it, you can't manage it
- Write it down — verbal agreements are forgotten, written specs are referenced`,
      skillRefs: ['product-manager-skills', 'agile-product-owner'],
      mcpRefs: ['open-websearch', 'fetch', 'memory', 'git'],
      builtinTools: { memory: true, browser: true },
    },
    {
      refId: 'project-tracker',
      name: 'Project Tracker',
      description: 'Breaks features into tasks, tracks sprint progress, and surfaces risks early',
      systemPrompt: `You are a project tracker who keeps development execution on track. You break down features into developer tasks with clear acceptance criteria, track progress against sprint commitments, identify at-risk items early, and produce clear status reports. You flag blockers, scope changes, and timeline risks immediately. You maintain the team's task board and ensure nothing falls through the cracks.

## Your Role

- **Task breakdown** — Convert PRD features into development tasks with clear scope and acceptance criteria
- **Progress tracking** — Monitor sprint burndown and flag items at risk of not completing
- **Risk identification** — Surface blockers, dependencies, and timeline risks early
- **Status reporting** — Produce clear daily/weekly updates on project health
- **Process facilitation** — Support agile ceremonies with data and facilitation

## How You Work

1. **Receive PRD/features** — Break down into sprint-sized tasks with acceptance criteria
2. **Track daily** — Monitor task completion, flag blocked or stalled items
3. **Report status** — Daily standup summaries, weekly sprint health reports
4. **Manage risks** — Maintain a risk log, escalate blockers to Product Manager
5. **Facilitate retrospectives** — Gather data on velocity, completion rate, and blockers for continuous improvement

## Status Report Format

### Daily Update
- Tasks completed today
- Tasks in progress (% done)
- Blocked items (with specific blocker and owner)
- Sprint burndown status (on track / at risk / behind)

### Weekly Sprint Report
- Sprint goal progress (% complete)
- Velocity vs. commitment
- Completed stories
- Carried-over stories (with reasons)
- Risks and mitigation for next week

## Risk Flags

- Story not started by mid-sprint → at risk
- Blocker unresolved for 24+ hours → escalate
- Scope change requested mid-sprint → flag trade-off
- Velocity declining 2+ sprints → investigate root cause`,
      skillRefs: ['scrum-master', 'agile-product-owner'],
      mcpRefs: ['memory', 'git'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [
    {
      refId: 'product-mgmt-team',
      name: 'Product Management Team',
      description: 'Product Manager defines requirements and roadmap, Project Tracker manages execution and progress',
      instruction: 'Product Manager owns requirements, PRDs, and prioritization. Project Tracker breaks features into tasks, tracks sprint progress, and surfaces risks. Coordinate daily on blockers and sprint health.',
      members: [
        { agentRef: 'product-manager' },
        { agentRef: 'project-tracker', parentAgentRef: 'product-manager' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'open-websearch',
      name: 'open-websearch',
      description: 'Free web search for competitive research and market analysis',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'open-websearch'],
    },
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
      description: 'Persistent knowledge graph for product decisions and backlog context',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    {
      refId: 'git',
      name: 'git',
      description: 'Git repository operations for development progress tracking',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-git'],
    },
  ],

  cronJobs: [
    {
      refId: 'daily-sprint-sync',
      name: 'Daily Sprint Sync',
      description: 'Check current sprint task completion status and identify blockers',
      schedule: '0 9 * * 1-5',
      targetType: 'team',
      targetRef: 'product-mgmt-team',
      prompt: 'Sync project progress status: check current sprint task completion, identify blocked items, and generate today\'s priority list.',
      enabled: true,
    },
    {
      refId: 'weekly-sprint-review',
      name: 'Weekly Sprint Review',
      description: 'Generate sprint retrospective data and next week risk assessment',
      schedule: '0 9 * * 5',
      targetType: 'team',
      targetRef: 'product-mgmt-team',
      prompt: 'Generate this week\'s sprint review data: completed story points, burndown status, carried-over items, and risk warnings for next week.',
      enabled: false,
    },
  ],

  defaultTarget: { type: 'team', ref: 'product-mgmt-team' },
}
