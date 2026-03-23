import type { ProjectTemplate } from '../../types/template'

export const academicResearchTemplate: ProjectTemplate = {
  id: 'academic-research',
  category: 'research',
  icon: 'graduation',
  name: 'Academic Research',
  description: 'Literature search, paper analysis, hypothesis generation, experiment design, and writing assistance',
  tags: ['research', 'academic', 'literature', 'papers', 'science'],
  featured: false,

  skills: [
    {
      refId: 'arxiv-database',
      name: 'arXiv Database',
      description: 'Search and retrieve preprints from arXiv via the Atom API',
      instructions: `# arXiv Database

## Overview

This skill provides tools for searching and retrieving preprints from arXiv.org via its public Atom API. It supports keyword search, author search, category filtering, arXiv ID lookup, and PDF download. Results are returned as structured JSON with titles, abstracts, authors, categories, and links.

## When to Use This Skill

Use this skill when:
- Searching for preprints in CS, ML, AI, physics, math, statistics, q-bio, q-fin, or economics
- Looking up specific papers by arXiv ID (e.g., \`2309.10668\`)
- Tracking an author's recent preprints
- Filtering papers by arXiv category (e.g., \`cs.LG\`, \`cs.CL\`, \`stat.ML\`)
- Building literature review datasets for AI/ML research
- Monitoring new submissions in a subfield

Consider alternatives when:
- Searching for biomedical literature specifically → Use **pubmed-database**
- You need citation counts or impact metrics → Use **openalex-database**
- You need peer-reviewed journal articles only → Use **pubmed-database**

## Core Search Capabilities

### 1. Keyword Search

Search for papers by keywords in titles, abstracts, or all fields.

\`\`\`bash
python scripts/arxiv_search.py \\
  --keywords "sparse autoencoders" "mechanistic interpretability" \\
  --max-results 20 \\
  --output results.json
\`\`\`

With category filter:
\`\`\`bash
python scripts/arxiv_search.py \\
  --keywords "transformer" "attention mechanism" \\
  --category cs.LG \\
  --max-results 50 \\
  --output transformer_papers.json
\`\`\`

Search specific fields:
\`\`\`bash
# Title only
python scripts/arxiv_search.py \\
  --keywords "GRPO" \\
  --search-field ti \\
  --max-results 10

# Abstract only
python scripts/arxiv_search.py \\
  --keywords "reward model" "RLHF" \\
  --search-field abs \\
  --max-results 30
\`\`\`

### 2. Author Search

\`\`\`bash
python scripts/arxiv_search.py \\
  --author "Anthropic" \\
  --max-results 50 \\
  --output anthropic_papers.json
\`\`\`

### 3. arXiv ID Lookup

Retrieve metadata for specific papers:

\`\`\`bash
python scripts/arxiv_search.py \\
  --ids 2309.10668 2406.04093 2310.01405 \\
  --output sae_papers.json
\`\`\`

### 4. Category Browsing

List recent papers in a category:
\`\`\`bash
python scripts/arxiv_search.py \\
  --category cs.AI \\
  --max-results 100 \\
  --sort-by submittedDate \\
  --output recent_cs_ai.json
\`\`\`

## Query Syntax

The arXiv API uses prefix-based field searches combined with Boolean operators.

**Field prefixes:**
- \`ti:\` — Title
- \`au:\` — Author
- \`abs:\` — Abstract
- \`cat:\` — Category
- \`all:\` — All fields (default)

**Boolean operators** (must be UPPERCASE):
\`\`\`
ti:transformer AND abs:attention
au:bengio OR au:lecun
cat:cs.LG ANDNOT cat:cs.CV
\`\`\`

**Grouping with parentheses:**
\`\`\`
(ti:sparse AND ti:autoencoder) AND cat:cs.LG
au:anthropic AND (abs:interpretability OR abs:alignment)
\`\`\`

## arXiv Categories (Common)

| Category | Description |
|----------|-------------|
| \`cs.AI\` | Artificial Intelligence |
| \`cs.CL\` | Computation and Language (NLP) |
| \`cs.CV\` | Computer Vision |
| \`cs.LG\` | Machine Learning |
| \`stat.ML\` | Machine Learning (Statistics) |
| \`q-bio.QM\` | Quantitative Methods |
| \`q-bio.GN\` | Genomics |
| \`math.OC\` | Optimization and Control |
| \`physics.comp-ph\` | Computational Physics |

## Output Format

Searches return structured JSON with: arxiv_id, title, authors, abstract, categories, primary_category, published date, updated date, doi, pdf_url, abs_url.

## Best Practices

1. **Respect rate limits**: ~3-second delays between API calls
2. **Use category filters**: Dramatically reduces noise
3. **Cache results**: Save to JSON to avoid re-fetching
4. **Use \`sort_by=submittedDate\`** for recent papers, \`relevance\` for keyword searches
5. **Max 300 results per query**: Use pagination for larger sets
6. **Combine with other databases**: For citation counts and impact metrics arXiv doesn't provide

## Limitations

- No full-text search — only searches metadata (title, abstract, authors)
- No citation data — use other databases for citations
- Max 300 results per query
- Rate limited (~1 request per 3 seconds)
- New papers may take hours to appear in API results`,
    },
    {
      refId: 'pubmed-database',
      name: 'PubMed Database',
      description: 'Direct REST API access to PubMed for biomedical literature search',
      instructions: `# PubMed Database

## Overview

PubMed is the U.S. National Library of Medicine's comprehensive database providing free access to MEDLINE and life sciences literature. Construct advanced queries with Boolean operators, MeSH terms, and field tags, access data programmatically via E-utilities API for systematic reviews and literature analysis.

## When to Use This Skill

Use this skill when:
- Searching for biomedical or life sciences research articles
- Constructing complex search queries with Boolean operators, field tags, or MeSH terms
- Conducting systematic literature reviews or meta-analyses
- Accessing PubMed data programmatically via the E-utilities API
- Finding articles by specific criteria (author, journal, publication date, article type)
- Retrieving citation information, abstracts, or full-text articles
- Working with PMIDs or DOIs

## Core Capabilities

### 1. Advanced Search Query Construction

**Basic Search Strategies:**
- Combine concepts with Boolean operators (AND, OR, NOT)
- Use field tags to limit searches to specific record parts
- Employ phrase searching with double quotes for exact matches
- Apply wildcards for term variations

**Example Queries:**
\`\`\`
# Recent systematic reviews on diabetes treatment
diabetes mellitus[mh] AND treatment[tiab] AND systematic review[pt] AND 2023:2024[dp]

# Clinical trials comparing two drugs
(metformin[nm] OR insulin[nm]) AND diabetes mellitus, type 2[mh] AND randomized controlled trial[pt]

# Author-specific research
smith ja[au] AND cancer[tiab] AND 2023[dp] AND english[la]
\`\`\`

### 2. MeSH Terms and Controlled Vocabulary

Use Medical Subject Headings (MeSH) for precise, consistent searching.

- \`[mh]\` tag searches MeSH terms with automatic inclusion of narrower terms
- \`[majr]\` tag limits to articles where the topic is the main focus
- Combine MeSH terms with subheadings (e.g., \`diabetes mellitus/therapy[mh]\`)

**Common MeSH Subheadings:** /diagnosis, /drug therapy, /epidemiology, /etiology, /prevention & control, /therapy

### 3. Article Type and Publication Filtering

**Publication Types** (use [pt] field tag): Clinical Trial, Meta-Analysis, Randomized Controlled Trial, Review, Systematic Review, Case Reports, Guideline

**Date Filtering:** \`2024[dp]\`, \`2020:2024[dp]\`, \`2024/03/15[dp]\`

**Text Availability:** \`AND free full text[sb]\`, \`AND hasabstract[text]\`

### 4. Programmatic Access via E-utilities API

**Core API Endpoints:**
1. **ESearch** — Search database and retrieve PMIDs
2. **EFetch** — Download full records in various formats
3. **ESummary** — Get document summaries
4. **EPost** — Upload UIDs for batch processing
5. **ELink** — Find related articles and linked data

\`\`\`python
import requests

base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
search_url = f"{base_url}esearch.fcgi"
params = {
    "db": "pubmed",
    "term": "diabetes[tiab] AND 2024[dp]",
    "retmax": 100,
    "retmode": "json"
}
response = requests.get(search_url, params=params)
pmids = response.json()["esearchresult"]["idlist"]

fetch_url = f"{base_url}efetch.fcgi"
params = {
    "db": "pubmed",
    "id": ",".join(pmids),
    "rettype": "abstract",
    "retmode": "text"
}
response = requests.get(fetch_url, params=params)
\`\`\`

**Rate Limits:** Without API key: 3 req/sec. With API key: 10 req/sec.

### 5. Systematic Literature Reviews (PICO Framework)

Structure clinical research questions with Population, Intervention, Comparison, Outcome:

\`\`\`
# Example: Diabetes treatment effectiveness
diabetes mellitus, type 2[mh] AND
(metformin[nm] OR lifestyle modification[tiab]) AND
glycemic control[tiab] AND
randomized controlled trial[pt]
\`\`\`

### 6. Citation Matching

**By Identifier:**
\`\`\`
12345678[pmid]
10.1056/NEJMoa123456[doi]
PMC123456[pmc]
\`\`\`

## Best Practices

- Start broad, then narrow with field tags and filters
- Include synonyms and MeSH terms for comprehensive coverage
- Use quotation marks for exact phrases
- Prefer systematic reviews and meta-analyses for synthesized evidence
- Export early and often to avoid losing search results

## Limitations

- Primarily biomedical and life sciences literature
- Display limited to 10,000 results maximum
- PubMed provides citations and abstracts (not always full text)
- Full text access depends on publisher, institutional access, or open access status`,
    },
    {
      refId: 'scientific-writing',
      name: 'Scientific Writing',
      description: 'IMRAD structure, citations, figures/tables, and reporting guidelines for research papers',
      instructions: `# Scientific Writing

## Overview

Scientific writing is a process for communicating research with precision and clarity. Write manuscripts using IMRAD structure, citations (APA/AMA/Vancouver), figures/tables, and reporting guidelines (CONSORT/STROBE/PRISMA). Apply this skill for research papers and journal submissions.

**Critical Principle: Always write in full paragraphs with flowing prose. Never submit bullet points in the final manuscript.** Use a two-stage process: first create section outlines with key points, then convert those outlines into complete paragraphs.

## When to Use This Skill

- Writing or revising any section of a scientific manuscript
- Structuring a research paper using IMRAD or other standard formats
- Formatting citations and references in specific styles
- Creating figures, tables, and data visualizations
- Applying study-specific reporting guidelines
- Drafting abstracts that meet journal requirements
- Preparing manuscripts for submission to specific journals

## Core Capabilities

### 1. Manuscript Structure and Organization (IMRAD)

- **Introduction**: Establish research context, identify gaps, state objectives
- **Methods**: Detail study design, populations, procedures, and analysis approaches
- **Results**: Present findings objectively without interpretation
- **Discussion**: Interpret results, acknowledge limitations, propose future directions

**Alternative Structures**: Review articles, case reports, meta-analyses, theoretical/modeling papers, methods papers and protocols.

### 2. Section-Specific Writing Guidance

**Abstract Composition**: Craft concise, standalone summaries (100-250 words) capturing purpose, methods, results, and conclusions. Support both structured and unstructured formats.

**Introduction Development**: Build compelling introductions that establish the research problem's importance, review relevant literature, identify knowledge gaps, state clear research questions, and explain the study's novelty.

**Methods Documentation**: Ensure reproducibility through detailed participant/sample descriptions, clear procedural documentation, statistical methods with justification, equipment/materials specifications, and ethical approval statements.

**Results Presentation**: Present findings with logical flow, integration with figures and tables, statistical significance with effect sizes, and objective reporting without interpretation.

**Discussion Construction**: Relate results to research questions, compare with existing literature, acknowledge limitations, propose mechanistic explanations, and suggest practical implications.

### 3. Citation and Reference Management

**Major Citation Styles:**
- **AMA (American Medical Association)**: Numbered superscript citations, common in medicine
- **Vancouver**: Numbered citations in square brackets, biomedical standard
- **APA (American Psychological Association)**: Author-date in-text citations, social sciences
- **Chicago**: Notes-bibliography or author-date, humanities and sciences
- **IEEE**: Numbered square brackets, engineering and computer science

**Best Practices:** Cite primary sources when possible, include recent literature (last 5-10 years), balance citations across introduction and discussion, verify all citations against originals.

### 4. Figures and Tables

**When to Use Tables vs. Figures:**
- **Tables**: Precise numerical data, complex datasets, multiple variables requiring exact values
- **Figures**: Trends, patterns, relationships, comparisons best understood visually

**Design Principles:** Make each table/figure self-explanatory with complete captions, use consistent formatting, label all axes with units, include sample sizes and statistical annotations.

### 5. Reporting Guidelines by Study Type

- **CONSORT**: Randomized controlled trials
- **STROBE**: Observational studies (cohort, case-control, cross-sectional)
- **PRISMA**: Systematic reviews and meta-analyses
- **STARD**: Diagnostic accuracy studies
- **TRIPOD**: Prediction model studies
- **ARRIVE**: Animal research
- **CARE**: Case reports

### 6. Writing Process: From Outline to Full Paragraphs

**Stage 1: Create Section Outlines with Key Points**
1. Gather relevant literature and data
2. Create a structured outline with bullet points marking main arguments, key studies, data points, and logical flow
3. These bullet points serve as scaffolding — they are NOT the final manuscript

**Stage 2: Convert Key Points to Full Paragraphs**
1. Transform bullet points into complete sentences
2. Add transitions between sentences and ideas
3. Integrate citations naturally within sentences
4. Expand with context and explanation
5. Ensure logical flow from one sentence to the next
6. Vary sentence structure to maintain engagement

### 7. Common Pitfalls to Avoid

**Top Rejection Reasons:**
1. Inappropriate or insufficiently described statistics
2. Over-interpretation of results or unsupported conclusions
3. Poorly described methods affecting reproducibility
4. Small, biased, or inappropriate samples
5. Poor writing quality or difficult-to-follow text
6. Inadequate literature review or context
7. Figures and tables that are unclear or poorly designed
8. Failure to follow reporting guidelines`,
    },
    {
      refId: 'literature-review',
      name: 'Literature Review',
      description: 'Systematic literature reviews using multiple academic databases with verified citations',
      instructions: `# Literature Review

## Overview

Conduct systematic, comprehensive literature reviews following rigorous academic methodology. Search multiple literature databases, synthesize findings thematically, verify all citations for accuracy, and generate professional output documents.

## When to Use This Skill

- Conducting a systematic literature review for research or publication
- Synthesizing current knowledge on a specific topic across multiple sources
- Performing meta-analysis or scoping reviews
- Writing the literature review section of a research paper or thesis
- Investigating the state of the art in a research domain
- Identifying research gaps and future directions

## Core Workflow

### Phase 1: Planning and Scoping

1. **Define Research Question**: Use PICO framework (Population, Intervention, Comparison, Outcome) for clinical/biomedical reviews
2. **Establish Scope**: Define review type (narrative, systematic, scoping, meta-analysis), set boundaries (time period, geographic scope, study types)
3. **Develop Search Strategy**: Identify main concepts, list synonyms and related terms, plan Boolean operators, select databases
4. **Set Inclusion/Exclusion Criteria**: Date range, language, publication types, study designs

### Phase 2: Systematic Literature Search

Search multiple databases appropriate for the domain:

**Biomedical & Life Sciences:** PubMed/PMC, bioRxiv/medRxiv
**General Scientific Literature:** arXiv (physics, math, CS), Semantic Scholar, Google Scholar
**Specialized Databases:** ChEMBL, KEGG, UniProt, AlphaFold

Document all search parameters: database, date searched, date range, search string, result count.

### Phase 3: Screening and Selection

1. **Deduplication**: Remove duplicates by DOI (primary) or title (fallback)
2. **Title Screening**: Review all titles against inclusion/exclusion criteria
3. **Abstract Screening**: Read abstracts, apply criteria rigorously
4. **Full-Text Screening**: Detailed review, document reasons for exclusion
5. **Create PRISMA Flow Diagram**: Document the screening process

### Phase 4: Data Extraction and Quality Assessment

1. **Extract Key Data**: Study metadata, design and methods, sample size, key findings, limitations, funding
2. **Assess Study Quality**: Cochrane Risk of Bias (RCTs), Newcastle-Ottawa Scale (observational), AMSTAR 2 (systematic reviews)
3. **Organize by Themes**: Identify 3-5 major themes, group studies

### Phase 5: Synthesis and Analysis

Write thematic synthesis (NOT study-by-study summaries):
- Organize Results section by themes or research questions
- Synthesize findings across multiple studies within each theme
- Compare and contrast different approaches and results
- Identify consensus areas and points of controversy

### Phase 6: Citation Verification

All citations must be verified for accuracy:
- Verify all DOIs resolve correctly
- Check author names, titles, and publication details
- Format citations consistently in chosen style (APA, Nature, Vancouver, Chicago, IEEE)

## Citation Style Quick Reference

- **APA**: (Smith et al., 2023) — Author-date in-text
- **Nature**: Superscript numbers — Smith, J. D. et al. Title. *Nat. Rev.* **22**, 301-318 (2023).
- **Vancouver**: Superscript numbers — Smith JD, et al. Title. Nat Rev. 2023;22(4):301-18.

## Prioritizing High-Impact Papers

| Paper Age | Citation Threshold | Classification |
|-----------|-------------------|----------------|
| 0-3 years | 20+ citations | Noteworthy |
| 0-3 years | 100+ citations | Highly Influential |
| 3-7 years | 100+ citations | Significant |
| 3-7 years | 500+ citations | Landmark Paper |
| 7+ years | 500+ citations | Seminal Work |

**Journal Tiers:**
- **Tier 1**: Nature, Science, Cell, NEJM, Lancet, JAMA, PNAS
- **Tier 2**: High-impact specialized journals (IF>10), top conferences
- **Tier 3**: Respected specialized journals (IF 5-10)

## Best Practices

- Use multiple databases (minimum 3) for comprehensive coverage
- Include preprint servers for latest findings
- Document everything for reproducibility
- Organize thematically, NOT by individual studies
- Assess and report study quality
- Verify all citations before finalizing
- Follow PRISMA guidelines for systematic reviews`,
    },
    {
      refId: 'hypothesis-generation',
      name: 'Hypothesis Generation',
      description: 'Structured hypothesis formulation from observations with experiment design',
      instructions: `# Scientific Hypothesis Generation

## Overview

Hypothesis generation is a systematic process for developing testable explanations. Formulate evidence-based hypotheses from observations, design experiments, explore competing explanations, and develop predictions. Apply this skill for scientific inquiry across domains.

## When to Use This Skill

- Developing hypotheses from observations or preliminary data
- Designing experiments to test scientific questions
- Exploring competing explanations for phenomena
- Formulating testable predictions for research
- Conducting literature-based hypothesis generation
- Planning mechanistic studies across scientific domains

## Workflow

### 1. Understand the Phenomenon

- Identify the core observation or pattern that needs explanation
- Define the scope and boundaries of the phenomenon
- Clarify what is already known vs. what is uncertain
- Identify the relevant scientific domain(s)

### 2. Conduct Comprehensive Literature Search

Search existing scientific literature to ground hypotheses in current evidence:
- Search for recent reviews, meta-analyses, and primary research
- Look for similar phenomena, related mechanisms, or analogous systems
- Identify gaps in current understanding
- Begin with broad searches, then narrow to specific mechanisms

### 3. Synthesize Existing Evidence

- Summarize current understanding of the phenomenon
- Identify established mechanisms or theories that may apply
- Note conflicting evidence or alternative viewpoints
- Recognize gaps, limitations, or unanswered questions

### 4. Generate Competing Hypotheses

Develop 3-5 distinct hypotheses that could explain the phenomenon. Each should:
- Provide a mechanistic explanation (not just description)
- Be distinguishable from other hypotheses
- Draw on evidence from the literature synthesis
- Consider different levels of explanation (molecular, cellular, systemic, population)

**Strategies:**
- Apply known mechanisms from analogous systems
- Consider multiple causative pathways
- Explore different scales of explanation
- Question assumptions in existing explanations
- Combine mechanisms in novel ways

### 5. Evaluate Hypothesis Quality

Assess each hypothesis against criteria:
- **Testability**: Can it be empirically tested?
- **Falsifiability**: What observations would disprove it?
- **Parsimony**: Is it the simplest explanation that fits evidence?
- **Explanatory Power**: How much of the phenomenon does it explain?
- **Scope**: What range of observations does it cover?
- **Consistency**: Does it align with established principles?
- **Novelty**: Does it offer new insights beyond existing explanations?

### 6. Design Experimental Tests

For each viable hypothesis, propose specific experiments:
- What would be measured or observed?
- What comparisons or controls are needed?
- What methods or techniques would be used?
- What sample sizes or statistical approaches are appropriate?
- What are potential confounds and how to address them?

**Approaches:** Laboratory experiments (in vitro, in vivo, computational), observational studies, clinical trials, natural experiments.

### 7. Formulate Testable Predictions

For each hypothesis:
- State what should be observed if the hypothesis is correct
- Specify expected direction and magnitude of effects when possible
- Identify conditions under which predictions should hold
- Distinguish predictions between competing hypotheses
- Note predictions that would falsify the hypothesis

## Quality Standards

- **Evidence-based**: Grounded in existing literature with citations
- **Testable**: Include specific, measurable predictions
- **Mechanistic**: Explain how/why, not just what
- **Comprehensive**: Consider alternative explanations
- **Rigorous**: Include experimental designs to test predictions`,
    },
    {
      refId: 'statistical-analysis',
      name: 'Statistical Analysis',
      description: 'Hypothesis testing, assumption verification, and professional reporting',
      instructions: `# Statistical Analysis

## Overview

Conduct hypothesis tests (t-test, ANOVA, chi-square), regression, correlation, and Bayesian analyses. This skill guides through test selection, assumption verification, analysis execution, and APA-formatted reporting with effect sizes and confidence intervals.

## When to Use This Skill

- Choosing appropriate statistical tests based on research questions and data characteristics
- Verifying statistical assumptions before analysis
- Running parametric or non-parametric tests
- Performing regression, correlation, or Bayesian analysis
- Generating APA-formatted results with effect sizes
- Conducting power analysis for study planning

## Core Capabilities

### 1. Test Selection

Select the appropriate test based on research design:

**Comparing Groups:**
| Design | Parametric | Non-Parametric |
|--------|-----------|----------------|
| 2 independent groups | Independent t-test | Mann-Whitney U |
| 2 related groups | Paired t-test | Wilcoxon signed-rank |
| 3+ independent groups | One-way ANOVA | Kruskal-Wallis |
| 3+ related groups | Repeated measures ANOVA | Friedman |
| 2+ factors | Factorial ANOVA | — |

**Relationships:**
| Purpose | Parametric | Non-Parametric |
|---------|-----------|----------------|
| 2 continuous variables | Pearson r | Spearman rho |
| Predict continuous outcome | Linear regression | — |
| Predict binary outcome | Logistic regression | — |
| Predict count outcome | Poisson regression | — |

**Categorical Data:** Chi-square test of independence, Fisher's exact test (small samples), McNemar's test (paired categorical).

### 2. Assumption Verification

**ALWAYS check assumptions before interpreting test results.**

**Normality:**
- Visual: Q-Q plots, histograms
- Statistical: Shapiro-Wilk (n < 50), Kolmogorov-Smirnov (n >= 50)
- Robust to violations when n > 30 (Central Limit Theorem)

**Homogeneity of Variance:**
- Levene's test (preferred, robust to non-normality)
- If violated: Use Welch's t-test or Welch's ANOVA

**Independence:** Observations must be independent. Check study design, not a statistical test.

**Linearity (for regression):** Scatter plots, residual plots.

### 3. Analysis Execution

\`\`\`python
import scipy.stats as stats
import pingouin as pg
import statsmodels.api as sm

# Independent t-test
t, p = stats.ttest_ind(group1, group2)
d = pg.compute_effsize(group1, group2, eftype='cohen')

# One-way ANOVA with post-hoc
aov = pg.anova(data=df, dv='score', between='group')
posthoc = pg.pairwise_tukey(data=df, dv='score', between='group')

# Linear regression
model = sm.OLS(y, sm.add_constant(X)).fit()
print(model.summary())

# Chi-square test
chi2, p, dof, expected = stats.chi2_contingency(contingency_table)
\`\`\`

### 4. Effect Sizes

Effect sizes quantify magnitude, while p-values only indicate existence of an effect.

| Effect Size | Small | Medium | Large |
|------------|-------|--------|-------|
| Cohen's d | 0.2 | 0.5 | 0.8 |
| Pearson r | 0.1 | 0.3 | 0.5 |
| eta-squared | 0.01 | 0.06 | 0.14 |
| Odds ratio | 1.5 | 2.5 | 4.0 |

### 5. Reporting Standards (APA Format)

**t-test:** "An independent-samples t-test revealed a significant difference between groups, t(48) = 2.45, p = .018, d = 0.69, 95% CI [0.12, 1.26]."

**ANOVA:** "A one-way ANOVA showed a significant effect of treatment on outcome, F(2, 87) = 4.52, p = .014, eta-squared = .09."

**Correlation:** "There was a significant positive correlation between X and Y, r(98) = .42, p < .001, 95% CI [.24, .57]."

**Regression:** "The model significantly predicted Y, F(3, 96) = 12.34, p < .001, R-squared = .28, adjusted R-squared = .26."

### 6. Power Analysis

\`\`\`python
from statsmodels.stats.power import TTestIndPower

analysis = TTestIndPower()
# Sample size needed for d=0.5, alpha=0.05, power=0.80
n = analysis.solve_power(effect_size=0.5, alpha=0.05, power=0.80)
\`\`\`

### 7. Bayesian Analysis

When frequentist results are inconclusive or you need to quantify evidence for/against hypotheses:

\`\`\`python
import pingouin as pg

# Bayesian t-test
result = pg.bayesfactor_ttest(t_stat, nx, ny, paired=False)
# BF10 > 3: moderate evidence for H1
# BF10 > 10: strong evidence for H1
# BF10 < 1/3: moderate evidence for H0
\`\`\`

## Best Practices

- Always check assumptions before running tests
- Report effect sizes alongside p-values
- Use confidence intervals for parameter estimates
- Correct for multiple comparisons (Bonferroni, FDR)
- Report all planned analyses including non-significant findings
- Never present exploratory findings as confirmatory
- Conduct sensitivity analyses to check robustness
- Consider practical significance alongside statistical significance`,
    },
    {
      refId: 'scientific-visualization',
      name: 'Scientific Visualization',
      description: 'Publication-ready figures with proper formatting, colorblind-safe palettes, and journal specifications',
      instructions: `# Scientific Visualization

## Overview

Scientific visualization transforms data into clear, accurate figures for publication. Create journal-ready plots with multi-panel layouts, error bars, significance markers, and colorblind-safe palettes. Export as PDF/EPS/TIFF using matplotlib, seaborn, and plotly for manuscripts.

## When to Use This Skill

- Creating plots or visualizations for scientific manuscripts
- Preparing figures for journal submission (Nature, Science, Cell, PLOS, etc.)
- Ensuring figures are colorblind-friendly and accessible
- Making multi-panel figures with consistent styling
- Exporting figures at correct resolution and format
- Following specific publication guidelines

## Core Principles

### 1. Resolution and File Format

- **Raster images** (photos, microscopy): 300-600 DPI
- **Line art** (graphs, plots): 600-1200 DPI or vector format
- **Vector formats** (preferred): PDF, EPS, SVG
- **Raster formats**: TIFF, PNG (never JPEG for scientific data)

### 2. Color Selection — Colorblind Accessibility

**Always use colorblind-friendly palettes.**

**Recommended: Okabe-Ito palette** (distinguishable by all types of color blindness):
\`\`\`python
okabe_ito = ['#E69F00', '#56B4E9', '#009E73', '#F0E442',
             '#0072B2', '#D55E00', '#CC79A7', '#000000']
\`\`\`

**For heatmaps/continuous data:** Use perceptually uniform colormaps: \`viridis\`, \`plasma\`, \`cividis\`. Avoid \`jet\` or \`rainbow\` colormaps. For diverging data, use \`PuOr\`, \`RdBu\`, \`BrBG\`.

**Always test figures in grayscale** to ensure interpretability.

### 3. Typography and Text

- Sans-serif fonts: Arial, Helvetica, Calibri
- Minimum sizes at final print size: axis labels 7-9 pt, tick labels 6-8 pt, panel labels 8-12 pt (bold)
- Sentence case for labels: "Time (hours)" not "TIME (HOURS)"
- Always include units in parentheses

### 4. Figure Dimensions (Journal-Specific)

| Journal | Single Column | Double Column |
|---------|---------------|---------------|
| Nature | 89 mm | 183 mm |
| Science | 55 mm | 175 mm |
| Cell | 85 mm | 178 mm |

### 5. Multi-Panel Figures

- Label panels with bold letters: **A**, **B**, **C** (uppercase for most journals, lowercase for Nature)
- Maintain consistent styling across all panels
- Align panels along edges where possible
- Use adequate white space between panels

\`\`\`python
from string import ascii_uppercase

fig = plt.figure(figsize=(7, 4))
gs = fig.add_gridspec(2, 2, hspace=0.4, wspace=0.4)

for i, ax in enumerate(axes):
    ax.text(-0.15, 1.05, ascii_uppercase[i], transform=ax.transAxes,
            fontsize=10, fontweight='bold', va='top')
\`\`\`

## Statistical Rigor

**Always include:**
- Error bars (SD, SEM, or CI — specify which in caption)
- Sample size (n) in figure or caption
- Statistical significance markers (*, **, ***)
- Individual data points when possible (not just summary statistics)

## Common Plot Types

### Box Plot with Individual Points
\`\`\`python
import seaborn as sns
fig, ax = plt.subplots(figsize=(3.5, 3))
sns.boxplot(data=df, x='treatment', y='response', palette='Set2', ax=ax)
sns.stripplot(data=df, x='treatment', y='response',
              color='black', alpha=0.3, size=3, ax=ax)
ax.set_ylabel('Response (units)')
sns.despine()
\`\`\`

### Heatmap with Proper Colormap
\`\`\`python
fig, ax = plt.subplots(figsize=(5, 4))
corr = df.corr()
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt='.2f',
            cmap='RdBu_r', center=0, square=True,
            linewidths=1, cbar_kws={'shrink': 0.8}, ax=ax)
\`\`\`

### Time Series with Confidence Bands
\`\`\`python
fig, ax = plt.subplots(figsize=(5, 3))
sns.lineplot(data=timeseries, x='time', y='measurement',
             hue='treatment', errorbar=('ci', 95), markers=True, ax=ax)
ax.set_xlabel('Time (hours)')
ax.set_ylabel('Measurement (AU)')
sns.despine()
\`\`\`

## Common Pitfalls to Avoid

1. **Font too small**: Text unreadable when printed at final size
2. **JPEG format**: Never use JPEG for graphs/plots
3. **Red-green colors**: ~8% of males cannot distinguish
4. **Low resolution**: Pixelated figures in publication
5. **Missing units**: Always label axes with units
6. **3D effects**: Distorts perception, avoid completely
7. **Chart junk**: Remove unnecessary gridlines, decorations
8. **Truncated axes**: Start bar charts at zero unless scientifically justified
9. **Inconsistent styling**: Different fonts/colors across figures
10. **No error bars**: Always show uncertainty

## Final Checklist

- [ ] Resolution meets journal requirements (300+ DPI)
- [ ] File format is correct (vector for plots, TIFF for images)
- [ ] Figure size matches journal specifications
- [ ] All text readable at final size (>= 6 pt)
- [ ] Colors are colorblind-friendly
- [ ] Figure works in grayscale
- [ ] All axes labeled with units
- [ ] Error bars present with definition in caption
- [ ] Panel labels present and consistent
- [ ] Statistical significance clearly marked
- [ ] Legend is clear and complete`,
    },
  ],

  agents: [
    {
      refId: 'research-pi',
      name: 'Principal Investigator',
      description: 'Research direction, hypothesis generation, experiment design, paper structure',
      systemPrompt: `You are the Principal Investigator (PI) — a senior research scientist who leads the entire research process from conceptualization through publication.

## Your Role

- **Set research direction** — Formulate research questions and hypotheses from the literature landscape, identifying gaps worth investigating
- **Design experiments** — Create rigorous experimental methodologies with appropriate controls, sample sizes, and statistical plans
- **Structure papers** — Organize manuscripts following IMRAD (Introduction, Methods, Results, Discussion) format, ensuring a clear narrative thread
- **Synthesize findings** — Combine raw data, literature, and analysis into coherent scientific narratives
- **Maintain rigor** — Uphold scientific standards, ensure reproducibility, and be honest about limitations

## How You Work

1. **Assess the research landscape** — Before starting any project, survey the existing literature to understand what is known, what is debated, and where gaps exist. Use web search and paper retrieval to build a comprehensive picture.
2. **Formulate hypotheses** — Develop specific, testable hypotheses that address identified gaps. Clearly state the expected outcomes and the rationale behind each hypothesis. Consider alternative explanations from the outset.
3. **Design the study** — Select appropriate research designs (experimental, observational, computational), define variables, specify controls, determine sample sizes through power analysis, and pre-register analysis plans when applicable.
4. **Coordinate the team** — Delegate literature review tasks to the Literature Reviewer and data analysis tasks to the Data Scientist. Provide clear briefs with specific objectives, deadlines, and quality criteria.
5. **Write and revise** — Draft the manuscript following IMRAD structure. Write in full paragraphs with flowing prose — never submit bullet points. Integrate findings from all team members into a unified narrative.
6. **Review critically** — Evaluate all work product from the team for scientific accuracy, methodological soundness, and clarity of presentation. Push back on unsupported claims.

## Research Standards

- Every claim must be supported by evidence (experimental data or cited literature)
- Distinguish clearly between established facts, reasonable inferences, and speculation
- Report negative and null results alongside positive findings
- Use appropriate reporting guidelines based on study type:
  - **CONSORT** for randomized controlled trials
  - **STROBE** for observational studies (cohort, case-control, cross-sectional)
  - **PRISMA** for systematic reviews and meta-analyses
  - **STARD** for diagnostic accuracy studies
  - **ARRIVE** for animal research
- Pre-specify primary and secondary outcomes before analysis
- Address multiplicity and multiple comparisons appropriately

## Output Quality

Your manuscripts and reports should be:
- **Structured** — Clear IMRAD sections with logical flow from question to conclusion
- **Evidence-based** — Every key finding backed by data or literature with proper citations
- **Precise** — Use exact numbers, statistical results with effect sizes and confidence intervals, and field-appropriate terminology
- **Honest** — Acknowledge limitations, potential biases, alternative interpretations, and areas of uncertainty
- **Reproducible** — Methods described in sufficient detail for replication by independent researchers
- **Accessible** — Written clearly enough for researchers in adjacent fields to understand the core contributions`,
      skillRefs: ['scientific-writing', 'hypothesis-generation', 'statistical-analysis', 'scientific-visualization'],
      mcpRefs: ['open-websearch', 'fetch', 'sequential-thinking', 'memory', 'filesystem'],
      builtinTools: { memory: true, browser: true, bash: true },
    },
    {
      refId: 'literature-reviewer',
      name: 'Literature Reviewer',
      description: 'Literature search, paper summarization, systematic reviews, citation management',
      systemPrompt: `You are the Literature Reviewer — a specialist in finding, evaluating, and synthesizing scientific literature across academic databases.

## Your Role

- **Search comprehensively** — Query academic databases (PubMed, arXiv, Semantic Scholar, Google Scholar) to find all relevant papers on a topic
- **Summarize papers** — Extract key findings, methodologies, sample sizes, effect sizes, and limitations from each paper
- **Conduct systematic reviews** — Follow PRISMA guidelines for systematic literature reviews, documenting search strategies, screening processes, and inclusion/exclusion criteria
- **Manage citations** — Maintain accurate citation records in APA, AMA, and Vancouver formats, verify DOIs, and ensure all references are complete
- **Identify research gaps** — Synthesize across papers to find what has been studied, what has been contradicted, and what remains unknown

## How You Work

1. **Understand the brief** — Get clear direction from the PI on what topics to search, what time period to cover, what types of studies to prioritize, and what specific questions need answering.
2. **Design search strategy** — Develop comprehensive search queries using Boolean operators, MeSH terms (for PubMed), field-specific tags, and synonym expansion. Document the exact search strings used.
3. **Search multiple databases** — Never rely on a single database. Search at minimum PubMed (biomedical), arXiv (preprints), and one additional source. Record results from each.
4. **Screen systematically** — Apply title screening, then abstract screening, then full-text review. Document reasons for exclusion at each stage. Create a PRISMA flow diagram for systematic reviews.
5. **Extract and organize** — For each included paper, extract: authors, year, journal, study design, sample size, key findings, statistical results, limitations, and relevance to the research question. Organize findings thematically, not study-by-study.
6. **Synthesize** — Write narrative syntheses organized by theme. Compare and contrast findings across studies. Highlight areas of consensus, controversy, and gaps.
7. **Verify citations** — Check that all DOIs resolve, author names are correct, and citation formatting is consistent throughout.

## Literature Review Standards

- Always search at least 3 databases for systematic reviews
- Document every search query with database, date, and result count
- Prioritize high-impact papers: Tier 1 journals (Nature, Science, Cell, NEJM, Lancet), highly cited works, and papers from recognized research groups
- Flag seminal papers (foundational works with 500+ citations) vs. incremental contributions
- Distinguish between peer-reviewed articles and preprints — note the review status
- For each paper, assess quality using appropriate tools (Cochrane Risk of Bias, Newcastle-Ottawa Scale)
- Never fabricate or hallucinate citations — if you cannot verify a paper exists, say so
- Maintain a running reading list to avoid duplicating effort across review sessions
- When sources conflict, present both sides with context about sample sizes, methodology quality, and recency`,
      skillRefs: ['arxiv-database', 'pubmed-database', 'literature-review'],
      mcpRefs: ['open-websearch', 'fetch', 'memory'],
      builtinTools: { memory: true, browser: true },
    },
    {
      refId: 'data-scientist',
      name: 'Data Scientist',
      description: 'Data analysis, statistical testing, result visualization',
      systemPrompt: `You are the Data Scientist — a research data scientist who handles all quantitative analysis, from data cleaning through statistical testing to publication-quality visualization.

## Your Role

- **Analyze data** — Clean, transform, and analyze research datasets using appropriate statistical methods
- **Run statistical tests** — Select and execute the right tests based on data type, study design, and research questions
- **Create visualizations** — Produce publication-quality figures that clearly communicate findings
- **Write reproducible code** — All analyses documented in Python or R scripts that others can verify and reproduce
- **Interpret results** — Translate statistical output into plain-language findings with appropriate caveats

## How You Work

1. **Understand the data** — Before any analysis, explore the dataset: examine distributions, check for missing values, identify outliers, understand the data structure. Document data quality issues.
2. **Check assumptions** — Before running any statistical test, verify its assumptions are met:
   - Normality (Shapiro-Wilk test, Q-Q plots)
   - Homogeneity of variance (Levene's test)
   - Independence of observations
   - Linearity (for regression models)
   - If assumptions are violated, use non-parametric alternatives or robust methods.
3. **Select appropriate tests** — Match the statistical test to the research design:
   - Two independent groups → t-test (or Mann-Whitney U if non-normal)
   - Three or more groups → ANOVA (or Kruskal-Wallis)
   - Paired/repeated measures → Paired t-test / Repeated measures ANOVA (or Wilcoxon / Friedman)
   - Associations → Pearson correlation (or Spearman)
   - Prediction → Linear regression, logistic regression, survival analysis
4. **Run analyses** — Execute tests using established libraries (scipy, statsmodels, pingouin, scikit-learn). Always compute effect sizes alongside p-values.
5. **Handle multiple comparisons** — When running multiple tests, apply appropriate corrections (Bonferroni, Holm, Benjamini-Hochberg FDR). Report both corrected and uncorrected p-values.
6. **Create figures** — Build publication-quality visualizations following journal specifications:
   - Use colorblind-safe palettes (Okabe-Ito recommended)
   - Include error bars with clear labeling (SD, SEM, or 95% CI)
   - Show individual data points alongside summary statistics
   - Format for target journal (correct dimensions, DPI, font sizes)
7. **Report results** — Write APA-formatted statistical results with test statistic, degrees of freedom, p-value, effect size, and confidence intervals.

## Statistical Standards

- **Always report effect sizes** — p-values indicate statistical significance but not practical importance. Cohen's d for group comparisons, r or R-squared for correlations, odds ratios for logistic regression.
- **Use confidence intervals** — Report 95% CIs for all key estimates. These convey both effect size and precision.
- **Check for adequate power** — Before concluding a null result, verify the study had sufficient power to detect a meaningful effect. Report post-hoc power when relevant.
- **Be transparent about multiple comparisons** — Pre-specify primary analyses. Clearly label exploratory analyses. Apply corrections and report both adjusted and unadjusted values.
- **Flag questionable patterns** — If sample sizes seem underpowered, distributions violate assumptions severely, or analysis choices seem driven by results (p-hacking), flag these concerns to the PI.
- **Survival analysis** — For time-to-event data, use Kaplan-Meier curves, log-rank tests, and Cox proportional hazards models. Check the proportional hazards assumption.
- **Bayesian methods** — When frequentist results are inconclusive, supplement with Bayesian analysis. Report Bayes factors with interpretation (BF10 > 3: moderate evidence for H1, > 10: strong evidence).

## Output Quality

- All code must be commented and reproducible
- Figures must meet journal specifications for resolution, dimensions, and accessibility
- Results tables must include sample sizes, descriptive statistics, test statistics, p-values, effect sizes, and confidence intervals
- Save all analysis scripts and intermediate outputs for audit trail`,
      skillRefs: ['statistical-analysis', 'scientific-visualization'],
      mcpRefs: ['filesystem', 'memory', 'sequential-thinking'],
      builtinTools: { memory: true, bash: true },
    },
  ],

  teams: [
    {
      refId: 'academic-research-team',
      name: 'Academic Research Team',
      description: 'Principal Investigator leads Literature Reviewer and Data Scientist for comprehensive academic research',
      instruction: 'Principal Investigator sets research direction, designs experiments, and structures papers. Literature Reviewer searches and synthesizes the literature. Data Scientist handles quantitative analysis and visualization.',
      members: [
        { agentRef: 'research-pi' },
        { agentRef: 'literature-reviewer', parentAgentRef: 'research-pi' },
        { agentRef: 'data-scientist', parentAgentRef: 'research-pi' },
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
      refId: 'fetch',
      name: 'fetch',
      description: 'Web page fetch for paper access',
      transportType: 'stdio',
      command: 'uvx',
      args: ['mcp-server-fetch'],
    },
    {
      refId: 'sequential-thinking',
      name: 'sequential-thinking',
      description: 'Structured scientific reasoning',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent research knowledge',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    {
      refId: 'filesystem',
      name: 'filesystem',
      description: 'File system for papers and data',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{{workspaceDir}}'],
    },
  ],

  cronJobs: [],

  defaultTarget: { type: 'team', ref: 'academic-research-team' },
}
