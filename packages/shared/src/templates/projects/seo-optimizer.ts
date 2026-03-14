import type { ProjectTemplate } from '../../types/template'

export const seoOptimizerTemplate: ProjectTemplate = {
  id: 'seo-optimizer',
  category: 'productivity',
  icon: 'search',
  name: 'SEO Optimizer',
  description: 'Technical SEO + Content SEO + AI Search Optimization (GEO/AEO)',
  tags: ['seo', 'search', 'keywords', 'technical-seo', 'geo'],
  featured: true,

  skills: [
    {
      refId: 'claude-seo',
      name: 'Claude SEO Suite',
      description: 'Comprehensive SEO analysis — technical audits, content quality, schema markup, images, sitemaps, GEO, programmatic SEO, competitor pages, and hreflang',
      instructions: `# Claude SEO Suite

Comprehensive SEO analysis across all industries (SaaS, local services, e-commerce, publishers, agencies). Covers 13 analysis domains: full-site audit, single-page analysis, technical SEO, content quality (E-E-A-T), schema markup, sitemap analysis, image optimization, AI search / GEO, strategic planning, programmatic SEO, competitor comparison pages, hreflang / international SEO, and live data via MCP integrations.

## SEO Health Score (0-100)

Weighted aggregate:
| Category | Weight |
|----------|--------|
| Technical SEO | 22% |
| Content Quality | 23% |
| On-Page SEO | 20% |
| Schema / Structured Data | 10% |
| Performance (CWV) | 10% |
| AI Search Readiness | 10% |
| Images | 5% |

Priority levels: Critical (blocks indexing), High (fix within 1 week), Medium (fix within 1 month), Low (backlog).

## Industry Detection

Detect business type from homepage signals:
- **SaaS**: pricing page, /features, /integrations, /docs, "free trial", "sign up"
- **Local Service**: phone number, address, service area, "serving [city]", Google Maps embed
- **E-commerce**: /products, /collections, /cart, "add to cart", product schema
- **Publisher**: /blog, /articles, /topics, article schema, author pages, publication dates
- **Agency**: /case-studies, /portfolio, /industries, "our work", client logos

---

## 1. Full Website Audit

Orchestrate parallel analysis across all domains. Process: fetch homepage → detect business type → crawl up to 500 pages (respect robots.txt, 30s timeout, 5 concurrent, 1s delay) → delegate to specialists → collect results → generate unified report with SEO Health Score → create prioritized action plan.

## 2. Technical SEO (9 Categories)

### Crawlability
- Robots.txt: check for unintentional blocks, verify important pages allowed, check sitemap reference
- XML Sitemap: exists, accessible, submitted to Search Console, contains only canonical indexable URLs, updated regularly
- Site Architecture: important pages within 3 clicks, logical hierarchy, internal linking, no orphan pages
- Crawl Budget: parameterized URLs, faceted navigation, infinite scroll with pagination fallback

### Indexation
- site:domain.com check, Search Console coverage, compare indexed vs expected
- Noindex on important pages, canonicals pointing wrong, redirect chains/loops, soft 404s, duplicate content
- Self-referencing canonicals, HTTP→HTTPS, www vs non-www, trailing slash consistency

### Core Web Vitals
- LCP < 2.5s, INP < 200ms (replaced FID March 2024), CLS < 0.1
- TTFB, image optimization, JS execution, CSS delivery, caching, CDN, font loading

### Mobile
- Responsive design, tap targets, viewport, no horizontal scroll, mobile-first indexing (all sites as of July 5, 2024)

### Security
- HTTPS, valid SSL, no mixed content, HTTP→HTTPS redirects, HSTS header

### URL Structure
- Readable, descriptive, keywords where natural, consistent, lowercase, hyphen-separated

### AI Crawler Management
- ~3-5% of websites now use AI-specific robots.txt rules
- Blocking Google-Extended doesn't affect Search rankings (only Gemini training)
- Allow GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot for AI search visibility

### JavaScript SEO
- Google may honor noindex from raw HTML even if JS removes it
- Google does NOT render JS on non-200 pages

### IndexNow Protocol
- Check support for instant indexing notifications

## 3. Content Quality & E-E-A-T

### E-E-A-T Framework (Sept 2025 QRG update)

**Experience**: Original research, case studies, first-hand results, process documentation, unique data
**Expertise**: Author credentials, certifications, technical depth, properly sourced claims
**Authoritativeness**: External citations, backlinks, brand mentions, industry recognition
**Trustworthiness**: Contact info, privacy policy, terms, HTTPS, transparent corrections

### Content Metrics
- Word count minimums: Homepage 500, Service 800, Blog 1500, Product 300+, Location 500-600
- Readability: Flesch 60-70 for general audience, avg 15-20 word sentences
- Keyword optimization: primary in title/H1/first 100 words, natural density 1-3%
- Structure: logical H1→H2→H3, scannable sections, lists, ToC for long-form
- Internal linking: 3-5 relevant links per 1000 words, descriptive anchors

### AI Content Assessment (Sept 2025 QRG)
- Acceptable: demonstrates E-E-A-T, unique value, human oversight, original insights
- Low-quality markers: generic phrasing, no original insight, repetitive structure, no attribution

### AI Citation Readiness (GEO signals)
- Clear, quotable statements with statistics
- Answer-first formatting, tables, lists
- Strong heading hierarchy, source citations
- Schema markup for data points

## 4. On-Page SEO

### Title Tags
- Unique per page, primary keyword near beginning, 50-60 characters, compelling, brand at end
- Issues: duplicate, truncated, too short, keyword stuffing, missing

### Meta Descriptions
- Unique, 150-160 characters, includes primary keyword, clear value proposition, CTA
- Issues: duplicate, auto-generated, too long/short, no compelling reason to click

### Heading Structure
- One H1 per page with primary keyword, logical H1→H2→H3, descriptive, not styling-only

### Image Optimization
- Descriptive file names, alt text on all images (10-125 chars), compressed sizes
- Format hierarchy: AVIF (93.8%) > WebP (95.3%) > JPEG/PNG
- Use \`<picture>\` with format fallbacks, \`loading="lazy"\` on below-fold, \`fetchpriority="high"\` on LCP
- \`decoding="async"\` on non-LCP, width/height for CLS prevention
- Thresholds: thumbnails <50KB, content <100KB, hero <200KB

### Internal Linking
- Important pages well-linked, descriptive anchors, logical relationships, no broken links
- Issues: orphan pages, over-optimized anchors, important pages buried

### Keyword Targeting
- Clear primary keyword per page, title/H1/URL aligned, satisfies search intent
- Site-wide: keyword mapping, no gaps, no cannibalization, topical clusters

## 5. Schema Markup

### Detection Limitation
\`web_fetch\` and \`curl\` cannot reliably detect JSON-LD (CMS plugins inject via JS). Use browser tool, Rich Results Test, or Screaming Frog.

### Active Schema Types (Feb 2026)
Organization, LocalBusiness, SoftwareApplication, Product, Article, BlogPosting, BreadcrumbList, WebSite, Person, ProfilePage, VideoObject, Event, JobPosting, Course, DiscussionForumPosting

### Restricted
- **FAQ**: ONLY for government and healthcare authority sites (Aug 2023)

### Deprecated — Never Recommend
- HowTo (Sept 2023), SpecialAnnouncement (July 2025), CourseInfo/EstimatedSalary/LearningVideo (June 2025), ClaimReview (June 2025), VehicleListing (June 2025)

### Implementation
- Always use JSON-LD format (Google's preference)
- Place in \`<head>\` or end of \`<body>\`
- Use \`@graph\` for multiple types on one page
- Validate with Rich Results Test before deploying
- All required + recommended properties included

## 6. Sitemap Analysis & Generation

### Validation
- Valid XML, <50k URLs per file, all URLs return 200, accurate lastmod dates
- No deprecated tags (priority, changefreq ignored by Google)
- Referenced in robots.txt, no non-canonical/noindexed/redirected URLs
- HTTPS only, split by content type

### Generation
- Auto-detect business type, interactive planning, quality gates
- WARNING at 30+ location pages (require 60%+ unique content)
- HARD STOP at 50+ location pages (require justification)
- Sitemap index for >50k URLs

## 7. AI Search / GEO Optimization

### Key Statistics
- AI Overviews: 1.5B users/month, 200+ countries, 50%+ queries
- AI-referred sessions growth: +527% (Jan-May 2025)
- ChatGPT: 900M+ weekly active users
- Perplexity: 500M+ monthly queries
- Brand mentions correlate 3x more strongly with AI visibility than backlinks

### GEO Analysis Criteria
1. **Citability Score (25%)**: Optimal passage 134-167 words, direct answer in first 40-60 words, "X is..." patterns, specific facts/statistics
2. **Structural Readability (20%)**: H1→H2→H3, question-based headings, short paragraphs, tables, lists
3. **Multi-Modal Content (15%)**: Text + images/video/infographics → 156% higher selection
4. **Authority & Brand Signals (20%)**: Author byline, publication dates, primary sources, entity presence
5. **Technical Accessibility (20%)**: SSR (AI crawlers don't execute JS), robots.txt, llms.txt

### Platform-Specific Optimization
| Platform | Key Sources | Focus |
|----------|-------------|-------|
| Google AI Overviews | Top-10 ranking pages (92%) | Traditional SEO + passage optimization |
| ChatGPT | Wikipedia (47.9%), Reddit (11.3%) | Entity presence, authoritative sources |
| Perplexity | Reddit (46.7%), Wikipedia | Community validation, discussions |
| Bing Copilot | Bing index, authoritative sites | Bing SEO, IndexNow |

Only 11% of domains are cited by both ChatGPT and Google AI Overviews for the same query.

### AI Crawlers
Allow: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot
Consider blocking: CCBot, anthropic-ai (training only, not search)

### llms.txt Standard
Location: /llms.txt — machine-readable site summary for AI crawlers. Include H1 title, blockquote description, H2 sections with 10-30 page entries. Less than 5% of websites currently have one.

### Quick Wins
1. "What is [topic]?" definition in first 60 words
2. 134-167 word self-contained answer blocks
3. Question-based H2/H3 headings
4. Specific statistics with sources
5. Publication/update dates
6. Person schema for authors
7. Allow key AI crawlers in robots.txt

## 8. Strategic SEO Planning

6 phases: discovery → competitive benchmarking → architecture → content strategy → technical foundation → 12-month roadmap.

Quarterly implementation:
- Q1 (weeks 1-4): Technical infrastructure, core pages, essential schema
- Q2 (weeks 5-12): Content expansion, initial blog
- Q3 (weeks 13-24): Advanced content, optimization
- Q4 (months 7-12): Authority building, thought leadership

Industry templates: SaaS, local service, e-commerce, publisher, agency, general.

## 9. Programmatic SEO

Build SEO pages at scale using templates and data. Core principles: unique value per page, proprietary data wins, subfolders not subdomains, genuine search intent match, quality over quantity.

### 12 Playbooks
Templates, Curation, Conversions, Comparisons, Examples, Locations, Personas, Integrations, Glossary, Translations, Directory, Profiles.

### Quality Gates
| Metric | Threshold | Action |
|--------|-----------|--------|
| Pages without review | 100+ | WARNING |
| Pages without justification | 500+ | HARD STOP |
| Unique content per page | <40% | Flag thin content |
| Word count per page | <300 | Flag for review |

Google's Scaled Content Abuse policy (March 2024) saw major enforcement in 2025. Require 30-40% genuinely unique content between pages, 5-10% sample human review, progressive rollout in batches of 50-100.

## 10. Competitor Comparison Pages

### Page Types
1. "X vs Y" — head-to-head comparison
2. "Alternatives to X" — list with pros/cons
3. "Best [Category] Tools" — curated roundup
4. Comparison Table — feature matrix

### Requirements
- All claims verifiable from public sources, pricing current with "as of [date]"
- Balanced: acknowledge competitor strengths honestly, disclose affiliation
- Schema: Product, SoftwareApplication, ItemList as appropriate
- Minimum 1500 words, CTAs at above fold + after table + bottom

## 11. Hreflang & International SEO

### Validation
- Self-referencing tags (every page must include hreflang to itself)
- Return tags (bidirectional: A→B and B→A)
- x-default for unmatched languages
- ISO 639-1 language codes, ISO 3166-1 Alpha-2 region codes
- Canonical URL alignment, protocol consistency

### Common Mistakes
- \`eng\` instead of \`en\`, \`jp\` instead of \`ja\`, \`en-uk\` instead of \`en-GB\`
- Missing self-referencing or return tags (invalidates entire set)
- Hreflang on non-canonical URLs (ignored by Google)

### Methods
- HTML link tags (small sites <50 variants)
- HTTP headers (non-HTML files)
- XML sitemap (large sites, cross-domain — recommended)

## Common Issues by Site Type

### SaaS: Thin product pages, blog not integrated, missing comparison pages
### E-commerce: Thin categories, duplicate descriptions, missing product schema, faceted nav duplicates
### Content/Blog: Outdated content, keyword cannibalization, poor internal linking
### Local: Inconsistent NAP, missing local schema, no Google Business Profile optimization`,
    },
    {
      refId: 'geo-seo',
      name: 'GEO/AEO Optimization',
      description: 'Generative Engine Optimization — AI search visibility, citability scoring, AI crawler analysis, brand authority, llms.txt, platform-specific optimization',
      instructions: `# GEO/AEO Optimization

GEO-first, SEO-supported. AI search is eating traditional search. This skill optimizes for where traffic is going, not where it was. Covers AI citability scoring, crawler access analysis, llms.txt standard, brand mention scanning, platform-specific optimization, and professional reporting.

## Market Context

| Metric | Value |
|--------|-------|
| GEO services market (2025) | $850M-$886M |
| Projected GEO market (2031) | $7.3B (34% CAGR) |
| AI-referred sessions growth | +527% (Jan-May 2025) |
| AI traffic conversion vs organic | 4.4x higher |
| Google AI Overviews reach | 1.5B users/month, 200+ countries |
| ChatGPT weekly active users | 900M+ |
| Perplexity monthly queries | 500M+ |
| Gartner: search traffic drop by 2028 | -50% |
| Marketers investing in GEO | Only 23% |
| Brand mentions vs backlinks for AI | 3x stronger correlation |

## GEO Scoring Methodology (0-100)

| Category | Weight |
|----------|--------|
| AI Citability & Visibility | 25% |
| Brand Authority Signals | 20% |
| Content Quality & E-E-A-T | 20% |
| Technical Foundations | 15% |
| Structured Data | 10% |
| Platform Optimization | 10% |

---

## 1. AI Citability Scoring

Based on 2024 research from Princeton, Georgia Tech, and IIT Delhi. AI systems preferentially extract and cite passages that are 134-167 words, self-contained, fact-rich, and directly answer a question in the first 1-2 sentences.

### Five Scoring Dimensions
1. **Answer Block Quality (30%)**: Opens with direct answer "X is..." or "X refers to...", specific facts in first 2 sentences
2. **Passage Self-Containment (25%)**: Sections understandable independently, no required context from elsewhere
3. **Structural Readability (20%)**: Clean heading hierarchy, short paragraphs, tables/lists
4. **Statistical Density (15%)**: Specific verifiable data points per 500 words, attributed sources
5. **Uniqueness & Original Data (10%)**: First-party research, proprietary insights, unique datasets

### High-Citability Patterns
- Definition patterns: "X is a..."
- Answer-first structure
- Quantified claims with sources
- Explicit subject naming (not "it" or "this")

### Low-Citability Patterns
- Answers buried in narrative
- Vague quantifiers ("many", "several")
- Heavy use of contextual pronouns
- No specific data points

### Procedure
1. Segment page into blocks at H2/H3 headings
2. Score each block on all 5 dimensions
3. Calculate weighted average
4. Generate rewrite recommendations for underperforming sections

## 2. AI Crawler Access Analysis

Blocking AI crawlers is the fastest way to become invisible in AI search.

### Crawler Tiers

**Tier 1 — Critical for AI Search (50% of score)**:
GPTBot (OpenAI), OAI-SearchBot (OpenAI), ChatGPT-User (OpenAI), ClaudeBot (Anthropic), PerplexityBot (Perplexity)

**Tier 2 — Broader Ecosystem (25%)**:
Google-Extended, GoogleOther, Applebot-Extended, Amazonbot, FacebookBot

**Tier 3 — Training Only (not search visibility)**:
CCBot, anthropic-ai, Bytespider, cohere-ai

### Analysis Procedure
1. Parse robots.txt for AI crawler directives
2. Check meta robots tags on sample pages
3. Examine HTTP headers for noindex/noai directives
4. Verify AI-specific files (llms.txt, ai.txt)
5. Assess JavaScript rendering requirements (AI crawlers don't execute JS)

### AI Visibility Score (0-100)
- Tier 1 access: 50%
- Tier 2 access: 25%
- No blanket AI blocks: 15%
- AI-specific files present: 10%

## 3. llms.txt Standard

Machine-readable site summary for AI crawlers. Less than 5% of websites currently have one — major competitive advantage.

### Benefits
- Accelerated AI comprehension without crawling many pages
- Narrative control: determine which pages AI surfaces
- Citation accuracy: AI references authoritative pages correctly
- Reduced misrepresentation and hallucination

### Format
Location: \`https://example.com/llms.txt\`

Required elements:
- H1 title with business name
- Blockquote description (under 200 characters)
- H2 section headers organizing content
- 10-30 page entries with absolute URLs and descriptions

Optional: /llms-full.txt for deeper analysis, Key Facts section (founding year, HQ, customer count), Contact section.

### Modes
- **Analyze**: Validate existing llms.txt against format standards
- **Generate**: Crawl site structure, prioritize pages, compile business info

## 4. Brand Mention Scanning

Brand mentions correlate ~3x more strongly with AI visibility than traditional backlinks (Ahrefs Dec 2025, 75k brands).

### Platform Importance (by AI citation correlation)
1. **YouTube (0.737)**: Transcripts, descriptions, video metadata
2. **Reddit**: Training data presence, user recommendations
3. **Wikipedia**: Entity recognition, knowledge graph
4. **LinkedIn**: Professional authority signals
5. **Other**: Quora, Stack Overflow, GitHub, news, podcasts

### Brand Authority Score (0-100)
YouTube (25%) + Reddit (25%) + Wikipedia (20%) + LinkedIn (15%) + Other (15%)

Ratings: Dominant (85-100), Strong (60-84), Moderate (30-59), Minimal (0-29)

### Key Insight
Platforms irrelevant to traditional SEO (YouTube, Reddit) now matter most for AI visibility, while traditional SEO signals show weak correlation.

## 5. Platform-Specific Optimization

Only 11% of domains are cited by both ChatGPT and Google AI Overviews for the same query. Platform-specific optimization is not optional.

### Google AI Overviews
- 92% of citations come from top-10 ranking pages (but 47% from below position 5)
- Focus: traditional SEO + passage optimization + structured data
- Featured snippets content is preferentially selected

### ChatGPT Web Search
- Top sources: Wikipedia (47.9%), Reddit (11.3%)
- Focus: entity presence, authoritative sources, Wikipedia mentions
- Prefers self-contained answer blocks over long-form

### Perplexity AI
- Top sources: Reddit (46.7%), Wikipedia
- Focus: community validation, discussions, original data
- Values recency and source diversity

### Google Gemini
- Leverages Google Knowledge Graph
- Focus: entity optimization, schema markup, brand authority

### Bing Copilot
- Bing index, authoritative sites
- Focus: Bing SEO, IndexNow protocol, structured data

## 6. RSL 1.0 (Really Simple Licensing)

New standard (December 2025) for machine-readable AI licensing terms.
Backed by: Reddit, Yahoo, Medium, Quora, Cloudflare, Akamai, Creative Commons.
Check for RSL implementation and appropriate licensing terms.

## Quick Wins
1. Add "What is [topic]?" definition in first 60 words
2. Create 134-167 word self-contained answer blocks
3. Question-based H2/H3 headings
4. Specific statistics with sources
5. Publication/update dates, Person schema for authors
6. Allow Tier 1 AI crawlers in robots.txt
7. Create /llms.txt file

## Medium Effort
1. Author bios with credentials + Wikipedia/LinkedIn links
2. Server-side rendering for key content
3. Build entity presence on Reddit, YouTube
4. Comparison tables with data
5. FAQ sections (structured, not schema for commercial sites)

## High Impact
1. Original research/surveys (unique citability)
2. Wikipedia presence for brand/key people
3. YouTube channel with content mentions
4. Comprehensive entity linking (sameAs across platforms)
5. Unique tools or calculators`,
    },
    {
      refId: 'seo-audit',
      name: 'SEO Audit',
      description: 'Full SEO audit framework — crawlability, indexation, technical foundations, on-page optimization, content quality, and authority assessment',
      instructions: `# SEO Audit

Identify SEO issues and provide actionable recommendations to improve organic search performance.

## Initial Assessment

Before auditing, understand:
1. **Site Context**: Type (SaaS, e-commerce, blog), primary business goal, priority keywords/topics
2. **Current State**: Known issues, current organic traffic, recent changes/migrations
3. **Scope**: Full site or specific pages, technical + on-page or one focus, Search Console access

## Schema Markup Detection Limitation

\`web_fetch\` and \`curl\` cannot reliably detect structured data. Many CMS plugins inject JSON-LD via JavaScript. Use browser tool (\`document.querySelectorAll('script[type="application/ld+json"]')\`), Google Rich Results Test, or Screaming Frog.

## Audit Framework (Priority Order)

1. **Crawlability & Indexation** — Can Google find and index it?
2. **Technical Foundations** — Is the site fast and functional?
3. **On-Page Optimization** — Is content optimized?
4. **Content Quality** — Does it deserve to rank?
5. **Authority & Links** — Does it have credibility?

## Technical SEO

### Crawlability
- Robots.txt: unintentional blocks, important pages allowed, sitemap reference
- XML Sitemap: exists, accessible, submitted, canonical/indexable URLs only, updated
- Architecture: important pages within 3 clicks, logical hierarchy, no orphans
- Crawl Budget: parameterized URLs, faceted navigation, infinite scroll, no session IDs in URLs

### Indexation
- site:domain.com check, Search Console coverage, indexed vs expected
- Noindex on important pages, wrong canonicals, redirect chains, soft 404s, duplicates
- Self-referencing canonicals, HTTP→HTTPS, www consistency, trailing slash consistency

### Core Web Vitals
- LCP < 2.5s, INP < 200ms, CLS < 0.1
- TTFB, images, JS, CSS, caching, CDN, fonts

### Mobile
- Responsive, tap targets, viewport, no horizontal scroll, same content as desktop

### Security & HTTPS
- HTTPS everywhere, valid SSL, no mixed content, HTTP redirects, HSTS

### URL Structure
- Readable, descriptive, keywords where natural, consistent, lowercase, hyphenated

## On-Page SEO

### Title Tags
- Unique, primary keyword near beginning, 50-60 chars, compelling, brand at end
- Issues: duplicate, truncated, too short, stuffed, missing

### Meta Descriptions
- Unique, 150-160 chars, includes keyword, value proposition, CTA

### Headings
- One H1 with primary keyword, logical hierarchy, descriptive, not just styling

### Content Optimization
- Keyword in first 100 words, related keywords natural, sufficient depth, answers intent
- Thin content: little unique content, empty tag/category pages, doorway pages, duplicates

### Images
- Descriptive filenames, alt text, compressed, modern formats (WebP), lazy loading, responsive

### Internal Linking
- Important pages well-linked, descriptive anchors, no broken links, reasonable count

### Keyword Targeting
- Clear primary keyword per page, title/H1/URL aligned, intent match, no cannibalization
- Site-wide: keyword mapping, no gaps, topical clusters

## Content Quality (E-E-A-T)

**Experience**: First-hand experience, original insights, real examples
**Expertise**: Author credentials, accurate info, properly sourced
**Authoritativeness**: Recognized in space, cited by others
**Trustworthiness**: Accurate, transparent, contact info, privacy policy, HTTPS

Content depth: comprehensive, answers follow-ups, better than competitors, updated

## Output Format

**Executive Summary**: Overall health, top 3-5 priority issues, quick wins

**Findings** (Technical, On-Page, Content): Each issue with Impact (High/Medium/Low), Evidence, Fix, Priority.

**Prioritized Action Plan**:
1. Critical fixes (blocking indexation/ranking)
2. High-impact improvements
3. Quick wins (easy, immediate benefit)
4. Long-term recommendations`,
    },
    {
      refId: 'programmatic-seo',
      name: 'Programmatic SEO',
      description: 'Build SEO-optimized pages at scale using templates and data — keyword patterns, data assessment, template design, quality gates',
      instructions: `# Programmatic SEO

Build SEO-optimized pages at scale using templates and data. Create pages that rank, provide value, and avoid thin content penalties.

## Core Principles

1. **Unique Value Per Page**: Every page must provide specific value, not just swapped variables
2. **Proprietary Data Wins**: Hierarchy — proprietary > product-derived > user-generated > licensed > public
3. **Subfolders Over Subdomains**: Subfolders consolidate domain authority
4. **Search Intent Match**: Pages must answer what people search for
5. **Quality Over Quantity**: 100 great pages beat 10,000 thin ones

## The 12 Playbooks

| Playbook | Pattern | Example |
|----------|---------|---------|
| Templates | "[Type] template" | "resume template" |
| Curation | "best [category]" | "best website builders" |
| Conversions | "[X] to [Y]" | "$10 USD to GBP" |
| Comparisons | "[X] vs [Y]" | "webflow vs wordpress" |
| Examples | "[type] examples" | "landing page examples" |
| Locations | "[service] in [location]" | "dentists in austin" |
| Personas | "[product] for [audience]" | "crm for real estate" |
| Integrations | "[A] [B] integration" | "slack asana integration" |
| Glossary | "what is [term]" | "what is pSEO" |
| Translations | Multi-language content | Localized content |
| Directory | "[category] tools" | "ai copywriting tools" |
| Profiles | "[entity name]" | "stripe ceo" |

Layer multiple playbooks: "Best coworking spaces in San Diego."

## Implementation

### 1. Keyword Pattern Research
- Identify repeating structure and variables
- Validate demand: aggregate volume, distribution, trend direction

### 2. Data Requirements
- Identify sources (first-party, scraped, licensed, public)
- Data freshness, update frequency

### 3. Template Design
- Header, unique intro, data-driven sections, related pages, CTAs
- Each page readable as standalone resource, no mad-libs patterns
- Conditional content based on data availability

### 4. Internal Linking
- Hub and spoke: category hub → individual pages
- Cross-links between related pages, breadcrumbs with schema
- No orphan pages, in XML sitemap

### 5. Indexation Strategy
- Prioritize high-volume patterns, noindex thin variations
- Manage crawl budget, separate sitemaps by type

## Quality Gates

| Metric | Threshold | Action |
|--------|-----------|--------|
| Pages without review | 100+ | WARNING |
| Pages without justification | 500+ | HARD STOP |
| Unique content per page | <40% | Flag thin content |
| Unique content per page | <30% | HARD STOP |
| Word count per page | <300 | Flag for review |

### Scaled Content Abuse (Google March 2024)
Major enforcement escalation in 2025:
- June 2025: wave of manual actions targeting AI-generated scale content
- August 2025: SpamBrain update enhanced pattern detection
- Result: 45% reduction in low-quality content in search results

**Requirements**: >=30-40% genuinely unique content between pages, 5-10% sample human review, progressive rollout (50-100 page batches, monitor 2-4 weeks before expanding), standalone value test per page.

### Safe at Scale
- Integration pages with real setup docs
- Template pages with downloadable content
- Glossary pages (200+ word definitions)
- Product pages with unique specs/reviews
- Data-driven pages with unique analysis

### Penalty Risk
- Location pages with only city name swapped
- "Best [tool] for [industry]" without specific value
- "[Competitor] alternative" without real comparison
- AI-generated without human review`,
    },
    {
      refId: 'ai-seo',
      name: 'AI SEO',
      description: 'Optimize content for AI search engines — AI Overviews, ChatGPT, Perplexity, Claude, Gemini citations and visibility',
      instructions: `# AI SEO — Answer Engine & Generative Engine Optimization

Optimize content for AI search engines: Google AI Overviews, ChatGPT, Perplexity, Claude, Gemini, and Copilot. Traditional SEO gets you ranked; AI SEO gets you cited.

## Key Statistics
- AI Overviews appear in ~45% of Google searches
- AI Overviews reduce clicks by up to 58%
- Brands 6.5x more likely to be cited via third-party sources than own domains
- Optimized content gets cited 3x more often

## Three Optimization Pillars

### 1. Structure — Make Content Extractable
- Definition blocks: clear "X is..." openers
- Comparison tables for competing options
- Step-by-step numbered formats
- Self-contained answer passages (40-60 words optimal)

### 2. Authority — Build Citation-Worthiness
Impact on citation rates:
- Adding sources: +40%
- Statistics: +37%
- Quotations: +30%
- Authoritative tone: +25%
- Clarity: +20%
- Technical terms: +18%
- Unique vocabulary: +15%

### 3. Presence — Appear Where AI Searches
- Wikipedia, Reddit, industry publications
- Review platforms, YouTube, Quora
- Stack Overflow, GitHub (for technical topics)

## Content Extractability Checklist
- Clear definition in opening paragraph
- Self-contained answer blocks
- Statistics with cited sources
- Comparison tables where applicable
- FAQ sections
- Schema markup (Article, Product, FAQ for gov/health)
- Expert attribution with credentials
- Recent update dates
- Logical heading structure
- AI bot access in robots.txt

## AI Bot Access (robots.txt)
Allow: GPTBot, ChatGPT-User, PerplexityBot, ClaudeBot, anthropic-ai, Google-Extended, Bingbot

## High-Citation Content Types
1. Comparison articles (~33%)
2. Definitive guides (~15%)
3. Original research (~12%)
4. Best-of/listicles (~10%)
5. Product pages (~10%)
6. How-to guides (~8%)
7. Opinion/analysis (~10%)

## Critical Mistakes to Avoid
- Writing for algorithms instead of humans
- Missing freshness signals / "last updated" dates
- Gating all premium content
- Ignoring third-party presence
- Omitting schema markup
- Keyword stuffing (reduces visibility by 10%)
- Blocking AI crawlers
- Generic claims without data

## Monitoring
Track: AI Overview presence, brand citation rates, share of AI voice vs competitors, citation sentiment, source attribution.
Tools: Otterly AI, Peec AI, ZipTie, or manual monthly audits of top 20 queries.`,
    },
    {
      refId: 'schema-markup',
      name: 'Schema Markup',
      description: 'Schema.org structured data implementation — JSON-LD generation, validation, rich results optimization',
      instructions: `# Schema Markup

Implement schema.org markup for search engine understanding and rich results.

## Core Principles
1. **Accuracy First**: Schema must represent actual page content, keep updated
2. **Use JSON-LD**: Google's recommended format, easier to maintain, place in <head> or end of <body>
3. **Follow Google's Guidelines**: Only supported markup, no spam
4. **Validate Everything**: Test before deploying, monitor Search Console

## Common Schema Types

| Type | Use For | Required Properties |
|------|---------|-------------------|
| Organization | Company homepage/about | name, url |
| WebSite | Homepage (search box) | name, url |
| Article | Blog posts, news | headline, image, datePublished, author |
| Product | Product pages | name, image, offers |
| SoftwareApplication | SaaS/app pages | name, offers |
| FAQPage | FAQ content (gov/health only) | mainEntity (Q&A array) |
| BreadcrumbList | Breadcrumb navigation | itemListElement |
| LocalBusiness | Local business | name, address |
| Event | Events, webinars | name, startDate, location |

## Key Properties

### Organization
Required: name, url. Recommended: logo, sameAs (social profiles), contactPoint

### Article/BlogPosting
Required: headline, image, datePublished, author. Recommended: dateModified, publisher, description

### Product
Required: name, image, offers (price + availability). Recommended: sku, brand, aggregateRating, review

### BreadcrumbList
Required: itemListElement (position, name, item)

## Multiple Types — Use @graph
\`\`\`json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "..." },
    { "@type": "WebSite", "..." },
    { "@type": "BreadcrumbList", "..." }
  ]
}
\`\`\`

## Deprecated Types — Never Recommend
- HowTo (Sept 2023)
- SpecialAnnouncement (July 2025)
- CourseInfo, EstimatedSalary, LearningVideo (June 2025)
- ClaimReview, VehicleListing (June 2025)
- Dataset, Practice Problem (late 2025)

## FAQPage Restriction (Aug 2023)
Google rich results: ONLY government and healthcare sites. Existing FAQ on commercial sites: Info priority (not Critical), note AI/LLM citation benefit. Adding new FAQ: not recommended for Google benefit, but other AI platforms may still use it.

## Validation Tools
- Google Rich Results Test (renders JS — best for schema validation)
- Schema.org Validator
- Search Console Enhancements reports

## Common Errors
- Missing required properties
- Invalid dates (must be ISO 8601), relative URLs (must be absolute)
- Mismatch with visible page content
- Placeholder text left in markup

## Implementation by Platform
- **Static sites**: JSON-LD directly in HTML templates
- **React/Next.js**: Component rendering schema, server-side rendered
- **CMS/WordPress**: Plugins (Yoast, Rank Math, Schema Pro) or theme modifications`,
    },
  ],

  agents: [
    {
      refId: 'seo-strategist',
      name: 'SEO Strategist',
      description: 'Keyword research, content strategy, technical audits, rank monitoring',
      systemPrompt: `You are a senior SEO strategist with expertise in both traditional SEO and AI search optimization (GEO/AEO). You conduct keyword research (seed → semantic clusters), technical SEO audits (Core Web Vitals, crawlability, schema), competitive gap analysis, and ranking monitoring. You understand how to optimize for Google AI Overviews, Perplexity, and other AI search engines. You produce data-backed strategies with clear prioritization.

## Your Role
- Design SEO strategies — keyword research, content gap analysis, technical audit planning
- Monitor rankings — track keyword positions, identify drops and opportunities
- Coordinate the team — assign content briefs to SEO Writer with target keywords and intent
- Analyze competitors — reverse-engineer competitor SEO strategies and identify gaps

## How You Work
1. Audit the current state — crawl issues, Core Web Vitals, indexation, schema coverage
2. Research keywords — seed keywords → semantic clusters → search intent mapping → difficulty/opportunity scoring
3. Create content briefs — target keyword, secondary keywords, search intent, suggested structure, competitor benchmarks
4. Monitor and iterate — track rankings weekly, adjust strategy based on performance data
5. Stay current — AI search (GEO/AEO) is evolving rapidly; continuously update optimization approaches

## SEO Standards
- Every recommendation must be data-backed (search volume, difficulty, current ranking)
- Distinguish between quick wins (< 1 month), medium-term (1-3 months), and long-term (3-6 months) strategies
- Always consider search intent: informational, navigational, transactional, commercial investigation
- Technical recommendations include specific implementation steps, not just "fix this"`,
      skillRefs: ['claude-seo', 'geo-seo', 'seo-audit', 'programmatic-seo', 'ai-seo', 'schema-markup'],
      mcpRefs: ['open-websearch', 'mcp-server-fetch', 'playwright', 'sequential-thinking', 'memory'],
      builtinTools: { memory: true, browser: true, bash: true },
    },
    {
      refId: 'seo-writer',
      name: 'SEO Writer',
      description: 'SEO-optimized content creation, meta tag optimization, Schema markup',
      systemPrompt: `You are an SEO content writer who executes keyword-optimized content based on the strategist's briefs. You write articles, landing pages, and meta descriptions that rank. You implement schema markup (Article, FAQ, HowTo, Product) and optimize for featured snippets. You naturally weave in primary and semantic keywords without stuffing. Every piece includes title tag, meta description, H1, and suggested internal link anchors.

## Your Role
- Write SEO content — articles, landing pages, product descriptions optimized for target keywords
- Implement on-page SEO — title tags, meta descriptions, header hierarchy, internal linking
- Create schema markup — JSON-LD for Article, FAQ, HowTo, Product, Organization
- Optimize for featured snippets — concise definitions, numbered lists, comparison tables

## How You Work
1. Review the brief — target keyword, search intent, competitor benchmarks, word count target
2. Research the topic — gather information from authoritative sources
3. Write the content — natural keyword integration, clear structure, engaging hooks
4. Optimize on-page — meta tags, headers, image alt text, internal links
5. Add schema markup — appropriate structured data for the content type`,
      skillRefs: ['claude-seo', 'seo-audit', 'schema-markup'],
      mcpRefs: ['open-websearch', 'mcp-server-fetch'],
      builtinTools: { memory: true, browser: true },
    },
  ],

  teams: [
    {
      refId: 'seo-optimizer-team',
      name: 'SEO Team',
      description: 'SEO Strategist leads keyword research and audits while SEO Writer creates optimized content',
      instruction: 'SEO Strategist conducts keyword research, technical audits, and creates content briefs. SEO Writer executes content creation based on the strategist\'s briefs.',
      members: [
        { agentRef: 'seo-strategist' },
        { agentRef: 'seo-writer', parentAgentRef: 'seo-strategist' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'open-websearch',
      name: 'open-websearch',
      description: 'Free web search without API keys',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'open-websearch'],
    },
    {
      refId: 'mcp-server-fetch',
      name: 'mcp-server-fetch',
      description: 'Fetch and parse web page content',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
    },
    {
      refId: 'playwright',
      name: 'playwright',
      description: 'Browser automation for web scraping and rendering',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp', '--headless'],
    },
    {
      refId: 'sequential-thinking',
      name: 'sequential-thinking',
      description: 'Structured step-by-step reasoning',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent memory storage for knowledge management',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ],

  cronJobs: [
    {
      refId: 'weekly-keyword-report',
      name: 'Weekly Keyword Report',
      description: 'Generate weekly keyword ranking changes highlighting significant position movements',
      schedule: '0 9 * * 1',
      targetType: 'team',
      targetRef: 'seo-optimizer-team',
      prompt: 'Generate a weekly keyword ranking change report, highlighting keywords that moved up or down more than 5 positions',
      enabled: true,
    },
    {
      refId: 'monthly-competitor-analysis',
      name: 'Monthly Competitor Analysis',
      description: 'Execute monthly competitor SEO analysis comparing target competitors on core keyword gaps',
      schedule: '0 9 1 * *',
      targetType: 'team',
      targetRef: 'seo-optimizer-team',
      prompt: 'Execute monthly competitor SEO analysis, comparing target competitors on core keyword gaps',
      enabled: false,
    },
  ],

  defaultTarget: { type: 'team', ref: 'seo-optimizer-team' },
}
