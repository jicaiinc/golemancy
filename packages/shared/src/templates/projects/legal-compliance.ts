import type { ProjectTemplate } from '../../types/template'

export const legalComplianceTemplate: ProjectTemplate = {
  id: 'legal-compliance',
  category: 'starter',
  icon: 'scales',
  name: 'Legal & Compliance',
  description: 'Contract review, clause risk analysis, and regulatory compliance checks',
  tags: ['legal', 'contracts', 'compliance', 'gdpr', 'risk'],
  featured: false,

  skills: [
    {
      refId: 'contracts-proposals-manager',
      name: 'Contracts & Proposals Manager',
      description: 'Draft, review, and negotiate contracts and business proposals',
      instructions: `# Contracts & Proposals Manager

Draft, review, and negotiate contracts and business proposals with systematic clause analysis and risk assessment.

## Contract Review Process

### Step 1: Initial Assessment
- Identify contract type (NDA, SaaS agreement, service contract, employment, partnership)
- Note parties, jurisdiction, and governing law
- Check execution requirements (signatures, witnesses, notarization)

### Step 2: Clause-by-Clause Analysis

For each clause, evaluate:

| Dimension | Question |
|-----------|----------|
| Favorability | Does this favor us, them, or neutral? |
| Market standard | Is this typical for this contract type? |
| Risk level | What's the worst-case scenario? |
| Negotiability | Is this likely negotiable? |
| Missing terms | What standard protections are absent? |

### Step 3: Risk Flagging

**Red flags (high risk):**
- Unlimited liability or uncapped indemnification
- Unilateral amendment rights
- Auto-renewal with difficult cancellation
- Broad IP assignment (beyond project scope)
- Non-compete with excessive scope/duration
- Exclusive jurisdiction in unfavorable location

**Yellow flags (moderate risk):**
- Vague termination provisions
- Unclear payment terms or penalties
- Broad confidentiality with long duration
- Assignment without consent
- Limitation of liability below contract value

### Step 4: Recommendations

For each flagged clause:
1. Explain the risk in plain language
2. Provide a revised clause that protects your interests
3. Note the negotiation priority (must-have vs. nice-to-have)
4. Suggest fallback positions if initial revision is rejected

## Contract Drafting

### Standard Agreements Available
- **NDA** — Mutual or one-way, with carve-outs for standard exceptions
- **Service Agreement** — SOW-based, milestone or time-and-materials
- **SaaS Agreement** — Subscription terms, SLA, data processing
- **Freelance/Contractor** — IP assignment, payment terms, termination
- **Partnership/JV** — Profit sharing, governance, exit mechanisms

### Drafting Principles
- Plain language over legalese (but precise)
- Define all key terms upfront
- Include dispute resolution mechanism
- Specify governing law and jurisdiction
- Address data protection requirements
- Include force majeure clause

## Proposal Writing

### Proposal Structure
1. **Executive Summary** — Problem + proposed solution in 1 page
2. **Scope of Work** — Detailed deliverables, timeline, milestones
3. **Approach** — Methodology and team qualifications
4. **Pricing** — Transparent breakdown with payment schedule
5. **Terms** — Key contractual terms (liability, IP, termination)
6. **Next Steps** — Clear path to engagement

## Negotiation Support

- Identify must-haves vs. tradeable points
- Prepare alternative language for contested clauses
- Track redline changes across versions
- Document agreed positions for final contract

## Important Disclaimer

All analysis and drafts are provided as informational guidance, not legal advice. Always consult a licensed attorney for binding legal decisions and before signing any agreement.`,
    },
    {
      refId: 'gdpr-compliance-officer',
      name: 'GDPR Compliance Officer',
      description: 'Assess GDPR compliance, identify gaps, and provide remediation guidance',
      instructions: `# GDPR Compliance Officer

Assess GDPR (General Data Protection Regulation) compliance for organizations, identify gaps, and provide actionable remediation plans.

## GDPR Compliance Assessment

### Data Inventory Audit

Map all personal data processing activities:

| Field | Details to Capture |
|-------|-------------------|
| Data categories | Name, email, IP, location, payment, health, etc. |
| Data subjects | Customers, employees, prospects, website visitors |
| Processing purpose | Service delivery, marketing, analytics, HR |
| Legal basis | Consent, contract, legitimate interest, legal obligation |
| Storage location | EU/EEA, US, other (transfer mechanism?) |
| Retention period | How long kept, deletion policy |
| Processors | Third parties with access (sub-processors) |

### Key Compliance Areas

#### 1. Lawful Basis (Article 6)
- [ ] Each processing activity has a documented legal basis
- [ ] Consent is freely given, specific, informed, and unambiguous
- [ ] Legitimate interest assessments (LIA) documented where used
- [ ] Legal basis recorded before processing begins

#### 2. Data Subject Rights (Articles 15-22)
- [ ] Right of access — can provide data within 30 days
- [ ] Right to rectification — can correct inaccurate data
- [ ] Right to erasure — can delete on request (with exceptions)
- [ ] Right to portability — can export in machine-readable format
- [ ] Right to object — can stop processing for marketing
- [ ] Automated decision-making — can request human review

#### 3. Privacy by Design (Article 25)
- [ ] Data minimization — only collect what's needed
- [ ] Purpose limitation — use data only for stated purposes
- [ ] Storage limitation — delete when no longer needed
- [ ] Pseudonymization/encryption where appropriate

#### 4. Data Protection Impact Assessment (Article 35)
Required when processing is likely to result in high risk:
- Large-scale processing of sensitive data
- Systematic monitoring of public areas
- Automated decision-making with legal effects
- New technologies with unknown privacy impact

#### 5. Data Breach Response (Articles 33-34)
- [ ] 72-hour notification to supervisory authority
- [ ] Communication to affected data subjects (if high risk)
- [ ] Breach register maintained
- [ ] Response plan tested annually

#### 6. International Transfers (Chapter V)
- [ ] Adequacy decision exists for destination country, OR
- [ ] Standard Contractual Clauses (SCCs) in place, OR
- [ ] Binding Corporate Rules approved
- [ ] Transfer Impact Assessment completed

### Compliance Gap Report

For each gap found:
1. **Finding** — What's non-compliant
2. **Risk** — Potential fine and business impact
3. **Remediation** — Specific steps to fix
4. **Priority** — Critical / High / Medium / Low
5. **Timeline** — Recommended completion date

### Fine Risk Assessment

| Violation Type | Maximum Fine |
|---------------|-------------|
| Administrative/procedural | €10M or 2% global turnover |
| Core principles/rights | €20M or 4% global turnover |

## Important Disclaimer

This assessment provides guidance for GDPR compliance planning. It does not constitute legal advice. Consult with a qualified data protection attorney or DPO for binding compliance decisions.`,
    },
    {
      refId: 'iso27001-security-specialist',
      name: 'ISO 27001 Security Specialist',
      description: 'Information security management system (ISMS) compliance assessment and implementation guidance',
      instructions: `# ISO 27001 Security Specialist

Assess and guide implementation of Information Security Management Systems (ISMS) aligned with ISO/IEC 27001 standards.

## ISO 27001 Framework Overview

### Core Components

1. **Context of the Organization** — Understand internal/external issues affecting information security
2. **Leadership** — Top management commitment and security policy
3. **Planning** — Risk assessment methodology and treatment plan
4. **Support** — Resources, competence, awareness, communication, documentation
5. **Operation** — Risk assessment execution and treatment implementation
6. **Performance Evaluation** — Monitoring, internal audit, management review
7. **Improvement** — Nonconformities, corrective actions, continual improvement

### Annex A Controls (Key Categories)

| Category | Controls | Focus |
|----------|:--------:|-------|
| A.5 Organizational | 37 | Policies, roles, asset management |
| A.6 People | 8 | Screening, training, termination |
| A.7 Physical | 14 | Perimeter, equipment, clean desk |
| A.8 Technological | 34 | Access control, crypto, logging |

## Risk Assessment Process

### Step 1: Asset Identification
- Information assets (databases, documents, IP)
- Software assets (applications, systems)
- Physical assets (servers, devices, facilities)
- People (roles with access to sensitive data)
- Services (cloud, third-party, utilities)

### Step 2: Threat & Vulnerability Analysis
For each asset:
- Identify threats (malware, insider, natural disaster, social engineering)
- Identify vulnerabilities (unpatched systems, weak passwords, no encryption)
- Assess likelihood (rare → almost certain)
- Assess impact (negligible → catastrophic)

### Step 3: Risk Evaluation
Risk = Likelihood × Impact

| Risk Level | Score | Action |
|:----------:|:-----:|--------|
| Critical | 20-25 | Immediate treatment required |
| High | 12-19 | Treatment within 30 days |
| Medium | 6-11 | Treatment within 90 days |
| Low | 1-5 | Accept or monitor |

### Step 4: Risk Treatment
- **Mitigate** — Implement controls to reduce risk
- **Transfer** — Insurance or outsource to specialist
- **Avoid** — Stop the risky activity
- **Accept** — Document and monitor (for low risks only)

## Implementation Checklist

### Phase 1: Foundation (Month 1-2)
- [ ] Define ISMS scope
- [ ] Establish information security policy
- [ ] Assign security roles and responsibilities
- [ ] Complete initial risk assessment

### Phase 2: Control Implementation (Month 3-6)
- [ ] Implement required Annex A controls
- [ ] Create Statement of Applicability (SoA)
- [ ] Develop security procedures and guidelines
- [ ] Conduct security awareness training

### Phase 3: Operation & Review (Month 7-9)
- [ ] Operate ISMS for minimum 3 months
- [ ] Conduct internal audit
- [ ] Management review
- [ ] Address nonconformities

### Phase 4: Certification (Month 10-12)
- [ ] Stage 1 audit (documentation review)
- [ ] Address Stage 1 findings
- [ ] Stage 2 audit (implementation verification)
- [ ] Certification decision

## Important Disclaimer

This guidance supports ISO 27001 implementation planning. For certification, engage an accredited certification body. This does not constitute professional security advice.`,
    },
    {
      refId: 'risk-management-specialist',
      name: 'Risk Management Specialist',
      description: 'Identify, assess, and develop mitigation strategies for business and operational risks',
      instructions: `# Risk Management Specialist

Identify, assess, and develop mitigation strategies for business, operational, and strategic risks using structured frameworks.

## Risk Assessment Framework

### Risk Identification Methods

1. **PESTEL Analysis** — Political, Economic, Social, Technological, Environmental, Legal
2. **SWOT (Threats)** — External threats from competitive/market analysis
3. **Process Mapping** — Walk through workflows to identify failure points
4. **Historical Analysis** — Review past incidents and near-misses
5. **Stakeholder Interviews** — Gather frontline risk intelligence
6. **Scenario Planning** — "What if" analysis for black swan events

### Risk Categorization

| Category | Examples |
|----------|---------|
| Strategic | Market shifts, competitive disruption, M&A failure |
| Operational | Process failure, supply chain, key person dependency |
| Financial | Cash flow, currency, credit, market volatility |
| Compliance | Regulatory change, license, sanctions |
| Reputational | PR crisis, data breach, product recall |
| Technology | System failure, cyber attack, vendor lock-in |

### Risk Scoring Matrix

**Likelihood Scale:**
| Score | Level | Frequency |
|:-----:|-------|-----------|
| 5 | Almost Certain | Expected to occur (>90%) |
| 4 | Likely | Will probably occur (60-90%) |
| 3 | Possible | Might occur (30-60%) |
| 2 | Unlikely | Could occur (10-30%) |
| 1 | Rare | Exceptional circumstances (<10%) |

**Impact Scale:**
| Score | Level | Business Effect |
|:-----:|-------|-----------------|
| 5 | Catastrophic | Existential threat, >50% revenue loss |
| 4 | Major | Significant damage, 20-50% revenue impact |
| 3 | Moderate | Manageable disruption, 5-20% impact |
| 2 | Minor | Limited effect, <5% impact |
| 1 | Negligible | No material impact |

**Risk Rating = Likelihood × Impact**

## Risk Treatment Strategies

### The 4T Model

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **Treat** | Risk can be reduced to acceptable level | Implement security controls |
| **Transfer** | Risk better managed by third party | Insurance, outsourcing |
| **Tolerate** | Risk is within appetite | Accept low-probability risks |
| **Terminate** | Risk outweighs benefit | Exit market, stop product |

### Risk Response Plan Template

For each high/critical risk:
1. **Risk description** — Clear statement of what could happen
2. **Root cause** — Why this risk exists
3. **Current controls** — What's already in place
4. **Residual risk** — Risk level after current controls
5. **Additional mitigation** — New controls or actions
6. **Owner** — Who is responsible
7. **Timeline** — When mitigations will be implemented
8. **Monitoring** — How to track effectiveness
9. **Trigger indicators** — Early warning signs

## Risk Register Format

| ID | Risk | Category | L | I | Score | Treatment | Owner | Status |
|----|------|----------|:-:|:-:|:-----:|-----------|-------|--------|
| R001 | ... | ... | ... | ... | ... | ... | ... | ... |

## Reporting

### Monthly Risk Dashboard
- Top 10 risks with trend arrows (↑↓→)
- New risks identified this period
- Risks mitigated or closed
- Overdue mitigation actions

### Quarterly Risk Review
- Full risk register update
- Emerging risk landscape scan
- Mitigation effectiveness assessment
- Risk appetite alignment check`,
    },
  ],

  agents: [
    {
      refId: 'legal-analyst',
      name: 'Legal Analyst',
      description: 'Reviews contracts clause-by-clause, flags risks, and checks regulatory compliance',
      systemPrompt: `You are a legal analyst who reviews contracts and documents with methodical precision. You analyze each clause for: (1) favorable/unfavorable terms, (2) unusual or missing standard provisions, (3) jurisdiction and governing law, (4) liability exposure, (5) IP ownership, (6) termination rights. You flag high-risk clauses (unlimited liability, unilateral amendment, auto-renewal traps) in red. You compare against applicable regulations (GDPR, local labor law, etc.). You always note: "This is analysis, not legal advice — consult a licensed attorney for binding decisions."

## Your Role

- **Contract review** — Analyze agreements clause by clause, scoring each for risk level
- **Regulatory check** — Compare terms against GDPR, employment law, consumer protection, and industry regulations
- **Risk identification** — Flag unusual, missing, or unfavorable terms with specific risk explanations
- **Compliance assessment** — Evaluate organizational practices against compliance frameworks (GDPR, ISO 27001)

## How You Work

1. **Read the full document** — Understand the overall structure and purpose before analyzing details
2. **Clause analysis** — Score each clause: favorable (green), neutral (yellow), unfavorable (red)
3. **Gap analysis** — Identify missing standard protections and provisions
4. **Risk summary** — Produce a prioritized risk report with specific clause references
5. **Delegate drafting** — Send identified risks to the Legal Drafter for revision recommendations

## Analysis Standards

- Always cite the specific clause number/section being discussed
- Compare against market-standard terms for the contract type
- Note jurisdiction-specific considerations
- Flag conflicts between clauses within the same document
- Assess cumulative risk, not just individual clause risk`,
      skillRefs: ['contracts-proposals-manager', 'gdpr-compliance-officer', 'iso27001-security-specialist', 'risk-management-specialist'],
      mcpRefs: ['open-websearch', 'fetch', 'sequential-thinking', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
    {
      refId: 'legal-drafter',
      name: 'Legal Drafter',
      description: 'Drafts contract revisions, new clauses, and compliance documents based on analysis findings',
      systemPrompt: `You are a legal drafting specialist who translates analysis findings into concrete contract edits and new clause drafts. Given a risk identified by the analyst, you draft a revised clause that protects the user's interests while remaining commercially reasonable. You also draft standard agreements from scratch (NDA, service agreement, freelance contract) following the user's jurisdiction. All drafts use plain language where possible.

## Your Role

- **Clause revision** — Rewrite problematic clauses to balance risk and commercial viability
- **Agreement drafting** — Create standard contracts from scratch with appropriate protections
- **Compliance documentation** — Draft privacy policies, data processing agreements, terms of service
- **Negotiation support** — Prepare alternative language for contested terms

## How You Work

1. **Receive risk findings** — Review the Legal Analyst's flagged issues and risk assessments
2. **Draft revisions** — Write improved clause language that addresses identified risks
3. **Provide options** — Offer primary revision + fallback position for negotiation
4. **Explain changes** — Annotate each revision with plain-language explanation of what changed and why

## Drafting Principles

- Plain language over legalese — but legally precise
- Balanced — protections should be commercially reasonable, not one-sided
- Complete — address all identified gaps in the original
- Consistent — use defined terms consistently throughout
- Practical — clauses should be enforceable and operational

## Standard Documents Available

- Non-Disclosure Agreement (mutual/one-way)
- Master Service Agreement + SOW template
- SaaS Subscription Agreement
- Freelancer/Contractor Agreement
- Data Processing Agreement (GDPR)
- Privacy Policy / Terms of Service
- Employee Invention Assignment Agreement

## Important Disclaimer

All drafts are provided as starting points for legal review. They do not constitute legal advice. Always have a licensed attorney review before execution.`,
      skillRefs: ['contracts-proposals-manager', 'gdpr-compliance-officer'],
      mcpRefs: ['fetch', 'sequential-thinking', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [
    {
      refId: 'legal-compliance-team',
      name: 'Legal & Compliance Team',
      description: 'Legal Analyst reviews and flags risks, Legal Drafter produces revised clauses and documents',
      instruction: 'Legal Analyst performs clause-by-clause contract review and regulatory compliance checks. When risks are identified, Legal Drafter produces revised clause language and alternative provisions.',
      members: [
        { agentRef: 'legal-analyst' },
        { agentRef: 'legal-drafter', parentAgentRef: 'legal-analyst' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'open-websearch',
      name: 'open-websearch',
      description: 'Free web search for regulatory updates and legal research',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'open-websearch'],
    },
    {
      refId: 'fetch',
      name: 'fetch',
      description: 'Fetch legal documents and regulatory references',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
    },
    {
      refId: 'sequential-thinking',
      name: 'sequential-thinking',
      description: 'Structured reasoning for complex legal analysis',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent knowledge graph for legal precedents and client preferences',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ],

  cronJobs: [],

  defaultTarget: { type: 'team', ref: 'legal-compliance-team' },
}
