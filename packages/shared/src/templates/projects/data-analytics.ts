import type { ProjectTemplate } from '../../types/template'

export const dataAnalyticsTemplate: ProjectTemplate = {
  id: 'data-analytics',
  category: 'research',
  icon: 'chart',
  name: 'Data Analytics',
  description: 'Full-pipeline analytics from raw data to visualized insights',
  tags: ['data', 'analytics', 'visualization', 'statistics', 'reporting'],
  featured: false,

  skills: [
    {
      refId: 'exploratory-data-analysis',
      name: 'Exploratory Data Analysis',
      description: 'Perform comprehensive exploratory data analysis on data files with automatic format detection, quality assessment, and report generation',
      instructions: `# Exploratory Data Analysis

Perform comprehensive exploratory data analysis (EDA) on data files across multiple domains. Provide automated file type detection, format-specific analysis, data quality assessment, and generate detailed markdown reports suitable for documentation and downstream analysis planning.

## Key Capabilities

- Automatic detection and analysis of 200+ file formats (CSV, JSON, Parquet, Excel, HDF5, scientific formats, etc.)
- Comprehensive format-specific metadata extraction
- Data quality and integrity assessment
- Statistical summaries and distributions
- Visualization recommendations
- Downstream analysis suggestions
- Markdown report generation

## When to Use This Skill

Use this skill when:
- User provides a data file for analysis
- User asks to "explore", "analyze", or "summarize" a dataset
- User wants to understand the structure and content of data
- User needs a comprehensive report of a dataset before deeper analysis
- User wants to assess data quality or completeness
- User asks what type of analysis is appropriate for a dataset

## Workflow

### Step 1: File Type Detection

When a user provides a file path, identify the file type:

1. Extract the file extension
2. Identify the format category (tabular, time series, hierarchical, scientific, etc.)
3. Load format-specific information for analysis approach

### Step 2: Perform Data Analysis

Based on the format, perform appropriate analysis:

**For tabular data (CSV, TSV, Excel, Parquet):**
- Load with pandas
- Check dimensions, data types, memory usage
- Analyze missing values (count, percentage, pattern)
- Calculate summary statistics (mean, median, std, quartiles)
- Identify outliers using IQR and z-score methods
- Check for duplicates
- Analyze correlations between numeric columns
- Examine categorical column distributions

**For time series data:**
- Detect datetime columns and parse them
- Analyze temporal range and resolution
- Check for gaps and irregular intervals
- Calculate rolling statistics
- Identify trends and seasonality
- Detect anomalies

**For JSON/hierarchical data:**
- Map the schema structure
- Count records and nesting depth
- Identify data types at each level
- Check for schema inconsistencies

**For scientific/specialized formats (HDF5, NetCDF, FITS):**
- Extract metadata and attributes
- Analyze array shapes and data types
- Calculate statistical summaries per variable
- Check for missing/invalid values (NaN, Inf)

### Step 3: Generate Comprehensive Report

Create a markdown report with these sections:

1. **File Overview** — Filename, size, format, timestamp
2. **Structure** — Dimensions, columns/variables, data types
3. **Data Quality** — Missing values, duplicates, inconsistencies, outliers
4. **Statistical Summary** — Descriptive statistics for all variables
5. **Key Findings** — Notable patterns, anomalies, distributions
6. **Recommendations** — Preprocessing steps, appropriate analyses, visualization approaches, tools and methods

### Step 4: Save Report

Save the markdown report as \`{original_filename}_eda_report.md\`.

## Best Practices

- **Sample large files** — For datasets with millions of rows, analyze a representative sample first
- **Handle errors gracefully** — Provide clear installation instructions when libraries are missing
- **Validate metadata** — Cross-check stated dimensions vs actual data
- **Be specific** — Provide concrete recommendations based on the actual data characteristics
- **Include code examples** — Show how to load and work with the data in Python`,
    },
    {
      refId: 'statistical-analysis',
      name: 'Statistical Analysis',
      description: 'Guided statistical analysis with test selection, assumption checking, and APA-formatted reporting',
      instructions: `# Statistical Analysis

Conduct hypothesis tests (t-test, ANOVA, chi-square), regression, correlation, and Bayesian analyses with assumption checks and professional reporting.

## When to Use This Skill

- Conducting statistical hypothesis tests (t-tests, ANOVA, chi-square)
- Performing regression or correlation analyses
- Running Bayesian statistical analyses
- Checking statistical assumptions and diagnostics
- Calculating effect sizes and conducting power analyses
- Reporting statistical results in APA format
- Analyzing experimental or observational data

## Core Capabilities

### 1. Test Selection and Planning
- Choose appropriate statistical tests based on research questions and data characteristics
- Conduct a priori power analyses to determine required sample sizes
- Plan analysis strategies including multiple comparison corrections

### 2. Assumption Checking
- Verify all relevant assumptions before running tests
- Provide diagnostic visualizations (Q-Q plots, residual plots, box plots)
- Recommend remedial actions when assumptions are violated

### 3. Statistical Testing
- Hypothesis testing: t-tests, ANOVA, chi-square, non-parametric alternatives
- Regression: linear, multiple, logistic, with diagnostics
- Correlations: Pearson, Spearman, with confidence intervals
- Bayesian alternatives: Bayesian t-tests, ANOVA, regression with Bayes Factors

### 4. Effect Sizes and Interpretation
- Calculate and interpret appropriate effect sizes for all analyses
- Provide confidence intervals for effect estimates
- Distinguish statistical from practical significance

### 5. Professional Reporting
- Generate APA-style statistical reports
- Create publication-ready figures and tables
- Provide complete interpretation with all required statistics

## Test Selection Quick Reference

**Comparing Two Groups:**
- Independent, continuous, normal → Independent t-test
- Independent, continuous, non-normal → Mann-Whitney U test
- Paired, continuous, normal → Paired t-test
- Paired, continuous, non-normal → Wilcoxon signed-rank test
- Binary outcome → Chi-square or Fisher's exact test

**Comparing 3+ Groups:**
- Independent, continuous, normal → One-way ANOVA
- Independent, continuous, non-normal → Kruskal-Wallis test
- Paired, continuous, normal → Repeated measures ANOVA
- Paired, continuous, non-normal → Friedman test

**Relationships:**
- Two continuous variables → Pearson (normal) or Spearman correlation (non-normal)
- Continuous outcome with predictor(s) → Linear regression
- Binary outcome with predictor(s) → Logistic regression

## Assumption Checking

**ALWAYS check assumptions before interpreting test results.**

\`\`\`python
import scipy.stats as stats
import pingouin as pg

# Normality: Shapiro-Wilk test + Q-Q plots
stat, p = stats.shapiro(data)

# Homogeneity of variance: Levene's test
stat, p = stats.levene(group_a, group_b)

# Linearity: residual plots for regression
\`\`\`

**When assumptions are violated:**
- Normality violated + n > 30 → Proceed (Central Limit Theorem)
- Normality violated + small n → Use non-parametric alternative
- Variance homogeneity violated → Use Welch's t-test or Welch's ANOVA
- Linearity violated → Add polynomial terms or use non-linear models

## Workflow

1. **Select test** — Match research question to appropriate statistical test
2. **Check assumptions** — Run all relevant assumption checks with diagnostics
3. **Run analysis** — Execute the test using scipy, statsmodels, or pingouin
4. **Calculate effect size** — Cohen's d, eta-squared, R-squared, odds ratio as appropriate
5. **Report results** — APA format with test statistic, df, p-value, effect size, CI

## Python Libraries

- **scipy.stats** — Core statistical tests
- **statsmodels** — Advanced regression and diagnostics
- **pingouin** — User-friendly testing with automatic effect sizes
- **pymc** — Bayesian statistical modeling
- **arviz** — Bayesian visualization and diagnostics

## Critical Best Practices

- Always check assumptions before interpretation
- Report effect sizes alongside p-values
- Distinguish statistical from practical significance
- Maintain transparency about analytical decisions
- Use multiple comparison corrections when running many tests
- Present confidence intervals, not just point estimates`,
    },
    {
      refId: 'scientific-visualization',
      name: 'Scientific Visualization',
      description: 'Create publication-ready figures with multi-panel layouts, colorblind-safe palettes, and journal formatting',
      instructions: `# Scientific Visualization

Create publication-ready plots with multi-panel layouts, error bars, significance markers, and colorblind-safe palettes. Export as PDF/EPS/PNG using matplotlib, seaborn, and plotly.

## When to Use This Skill

- Creating plots or visualizations for reports and presentations
- Preparing figures for publication or journal submission
- Ensuring figures are colorblind-friendly and accessible
- Making multi-panel figures with consistent styling
- Exporting figures at correct resolution and format
- Creating figures that work in both color and grayscale

## Core Principles

### 1. Resolution and File Format
- **Raster images** (photos, heatmaps): 300-600 DPI
- **Line art** (graphs, plots): 600-1200 DPI or vector format
- **Vector formats** (preferred): PDF, EPS, SVG
- **Raster formats**: PNG, TIFF (never JPEG for data visualizations)

### 2. Color Selection — Colorblind Accessibility
**Always use colorblind-friendly palettes.**

Recommended — Okabe-Ito palette:
\`\`\`python
okabe_ito = ['#E69F00', '#56B4E9', '#009E73', '#F0E442',
             '#0072B2', '#D55E00', '#CC79A7', '#000000']
\`\`\`

For heatmaps/continuous data:
- Use perceptually uniform colormaps: viridis, plasma, cividis
- Avoid red-green diverging maps (use PuOr, RdBu, BrBG instead)
- Never use jet or rainbow colormaps

### 3. Typography
- Sans-serif fonts: Arial, Helvetica, Calibri
- Axis labels: 7-9 pt minimum at final size
- Tick labels: 6-8 pt minimum
- Panel labels: 8-12 pt, bold
- Always include units in parentheses

### 4. Figure Dimensions
Standard widths:
- Single column: 3.5 inches (89 mm)
- Double column: 7 inches (178 mm)
- Full page: 7 × 9 inches

### 5. Multi-Panel Figures
- Label panels with bold letters: A, B, C
- Maintain consistent styling across all panels
- Use GridSpec for flexible layouts
- Adequate white space between panels

## Quick Start

\`\`\`python
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

# Apply clean style
sns.set_theme(style='ticks', context='paper', font_scale=1.1)
sns.set_palette('colorblind')

# Single column figure
fig, ax = plt.subplots(figsize=(3.5, 2.5))
ax.plot(x, y, label='Series A')
ax.set_xlabel('Time (seconds)')
ax.set_ylabel('Amplitude (mV)')
ax.legend(frameon=False)
sns.despine()

plt.savefig('figure.pdf', dpi=300, bbox_inches='tight')
plt.savefig('figure.png', dpi=300, bbox_inches='tight')
\`\`\`

## Common Visualization Types

### Statistical Comparisons
\`\`\`python
fig, ax = plt.subplots(figsize=(3.5, 3))
sns.boxplot(data=df, x='group', y='value', palette='Set2', ax=ax)
sns.stripplot(data=df, x='group', y='value', color='black', alpha=0.3, size=3, ax=ax)
sns.despine()
\`\`\`

### Heatmaps with Proper Colormaps
\`\`\`python
fig, ax = plt.subplots(figsize=(5, 4))
corr = df.corr()
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt='.2f',
            cmap='RdBu_r', center=0, square=True, ax=ax)
\`\`\`

### Time Series with Confidence Intervals
\`\`\`python
fig, ax = plt.subplots(figsize=(5, 3))
sns.lineplot(data=df, x='time', y='value', hue='group',
             errorbar=('ci', 95), markers=True, ax=ax)
sns.despine()
\`\`\`

### Multi-Panel Layout
\`\`\`python
from string import ascii_uppercase

fig = plt.figure(figsize=(7, 4))
gs = fig.add_gridspec(2, 2, hspace=0.4, wspace=0.4)

axes = [fig.add_subplot(gs[i, j]) for i in range(2) for j in range(2)]
for i, ax in enumerate(axes):
    ax.text(-0.15, 1.05, ascii_uppercase[i], transform=ax.transAxes,
            fontsize=10, fontweight='bold', va='top')
\`\`\`

## Final Checklist

- [ ] Resolution meets requirements (300+ DPI)
- [ ] Saved in vector format (PDF) and raster (PNG)
- [ ] Colors are colorblind-safe
- [ ] All axes labeled with units
- [ ] Text readable at final print size
- [ ] Error bars/bands clearly defined in legend
- [ ] Figure works in grayscale
- [ ] Panel labels present if multi-panel`,
    },
    {
      refId: 'analytics-specialist',
      name: 'Analytics Specialist',
      description: 'Define, track, and interpret product and business metrics with framework selection, dashboard design, and cohort analysis',
      instructions: `# Analytics Specialist

Define, track, and interpret product and business metrics across discovery, growth, and mature stages. Covers metric framework selection, KPI definition, dashboard design, cohort analysis, and retention interpretation.

## When to Use

- Metric framework selection (AARRR, North Star, HEART)
- KPI definition by product or business stage
- Dashboard design and metric hierarchy
- Cohort and retention analysis
- Feature adoption and funnel interpretation
- Business performance reporting

## Workflow

### 1. Select Metric Framework
- **AARRR** — For growth loops and funnel visibility (Acquisition, Activation, Retention, Revenue, Referral)
- **North Star** — For cross-functional strategic alignment around one key metric
- **HEART** — For UX quality measurement (Happiness, Engagement, Adoption, Retention, Task success)

### 2. Define Stage-Appropriate KPIs

**Early Stage / Pre-PMF:**
- Activation rate
- Week-1 retention
- Time-to-first-value
- Problem-solution fit score

**Growth Stage:**
- Funnel conversion by stage
- Monthly retained users
- Feature adoption among new cohorts
- Expansion / upsell proxy metrics

**Mature Stage:**
- Net revenue retention aligned metrics
- Power-user share and depth of use
- Churn risk indicators by segment
- Reliability and support-deflection metrics

### 3. Design Dashboard Layers

**Executive Layer (5-7 metrics):**
- Directional KPIs that answer "are we winning?"

**Operational Layer:**
- Acquisition, activation, retention, engagement breakdowns

**Feature Layer:**
- Adoption rate, usage depth, repeat usage, outcome correlation

**Dashboard Principles:**
- Show trends, not isolated point estimates
- Keep one owner per KPI
- Pair each KPI with target, threshold, and decision rule
- Use cohort and segment filters by default
- Prefer comparable time windows (weekly vs weekly, monthly vs monthly)

### 4. Run Cohort and Retention Analysis

1. Define cohort anchor event (signup, activation, first purchase)
2. Define retained behavior (active day, key action, repeat session)
3. Build retention matrix by cohort period and age
4. Compare curve shapes across cohorts
5. Flag early drop points and investigate journey friction

### 5. Interpret Retention Curves

- **Sharp early drop, low plateau** → Onboarding mismatch or weak initial value
- **Moderate drop, stable plateau** → Healthy core audience with predictable churn
- **Flattening at low level** → Product used occasionally, revisit value proposition
- **Improving newer cohorts** → Onboarding or positioning improvements working

### 6. Act on Insights

- Connect metric movement to product changes and release timeline
- Distinguish signal from noise using period-over-period context
- Propose one clear action per major metric risk or opportunity

## Funnel Analysis

For any conversion funnel:
1. Map the complete user journey stages
2. Calculate conversion rate between each stage
3. Identify the largest drop-off points
4. Segment by user attributes to find patterns
5. Prioritize improvements by impact × feasibility

## Reporting Best Practices

- Lead with the insight, then the evidence
- Always include time comparison (vs last period)
- Segment by meaningful dimensions (cohort, channel, plan)
- Separate leading indicators from lagging ones
- Include confidence level and data quality notes`,
    },
    {
      refId: 'xlsx-skill',
      name: 'XLSX Processing',
      description: 'Spreadsheet creation, editing, and analysis with formulas, formatting, and data visualization',
      instructions: `# XLSX Processing

Comprehensive spreadsheet creation, editing, and analysis with support for formulas, formatting, data analysis, and visualization.

## When to Use

Use when working with spreadsheets (.xlsx, .xlsm, .csv, .tsv) for:
- Creating new spreadsheets with formulas and formatting
- Reading or analyzing existing data
- Modifying spreadsheets while preserving formulas
- Data analysis and visualization in spreadsheet format
- Recalculating formulas

## Requirements for All Excel Files

### Zero Formula Errors
Every Excel model MUST be delivered with ZERO formula errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?).

### Use Formulas, Not Hardcoded Values
Always use Excel formulas instead of calculating values in Python and hardcoding them. This ensures the spreadsheet remains dynamic and updateable.

\`\`\`python
# WRONG — hardcoding calculated values
total = df['Sales'].sum()
sheet['B10'] = total

# CORRECT — using Excel formulas
sheet['B10'] = '=SUM(B2:B9)'
\`\`\`

### Preserve Existing Templates
When modifying files, match established formatting and conventions exactly. Existing template conventions always override defaults.

## Data Analysis with pandas

\`\`\`python
import pandas as pd

# Read Excel
df = pd.read_excel('file.xlsx')
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)

# Analyze
df.head()
df.info()
df.describe()

# Write
df.to_excel('output.xlsx', index=False)
\`\`\`

## Creating Excel Files with openpyxl

\`\`\`python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active

# Add data and formulas
sheet['A1'] = 'Revenue'
sheet['B1'] = '=SUM(B2:B13)'

# Formatting
sheet['A1'].font = Font(bold=True)
sheet.column_dimensions['A'].width = 20

wb.save('output.xlsx')
\`\`\`

## Editing Existing Files

\`\`\`python
from openpyxl import load_workbook

wb = load_workbook('existing.xlsx')
sheet = wb.active

# Modify cells
sheet['A1'] = 'New Value'
sheet.insert_rows(2)

wb.save('modified.xlsx')
\`\`\`

## Number Formatting Standards

- **Years**: Text strings ("2024" not "2,024")
- **Currency**: $#,##0 format with units in headers
- **Zeros**: Display as "-" including percentages
- **Percentages**: 0.0% format (one decimal)
- **Negatives**: Use parentheses, not minus signs

## Financial Model Color Coding

- **Blue text** — Hardcoded inputs and scenario values
- **Black text** — All formulas and calculations
- **Green text** — Cross-sheet links within same workbook
- **Red text** — External file references
- **Yellow background** — Key assumptions needing attention

## Best Practices

- **pandas** for data analysis and bulk operations
- **openpyxl** for formulas, formatting, and Excel-specific features
- Always place assumptions in separate cells; use cell references in formulas
- Document hardcoded values with source citations
- Verify all cell references are correct before saving
- Test with edge cases (zero values, negative numbers)`,
    },
  ],

  agents: [
    {
      refId: 'data-analyst',
      name: 'Data Analyst',
      description: 'Statistical analysis, trend identification, visualization, business insight reports',
      systemPrompt: `You are a senior data analyst who transforms raw data into actionable business insights. You perform exploratory data analysis, identify trends and anomalies, run statistical tests, and produce clear visualizations. You write Python (pandas, matplotlib, seaborn, plotly) for complex analysis. You communicate findings in plain language tied to business outcomes, not just numbers. You know what metrics matter for different business models (e-commerce, SaaS, media).

## Your Role

- **Explore data** — Conduct thorough exploratory data analysis to understand structure, quality, and characteristics before diving into specific questions
- **Analyze trends** — Identify patterns, correlations, anomalies, and seasonality in datasets using appropriate statistical methods
- **Visualize insights** — Produce clear, publication-quality charts and dashboards that tell a story with the data
- **Deliver business insights** — Translate statistical findings into plain-language recommendations tied to business outcomes
- **Define metrics** — Help stakeholders identify the right KPIs and measurement frameworks for their business model

## How You Work

1. **Understand the question** — Clarify what business question needs answering, what decisions the analysis will inform, and what data is available
2. **Assess data quality** — Profile the dataset: check for missing values, outliers, duplicates, encoding issues, and structural problems before analysis
3. **Explore broadly** — Run EDA to understand distributions, relationships, and anomalies. Let the data reveal patterns before testing specific hypotheses
4. **Analyze rigorously** — Apply appropriate statistical methods: descriptive statistics, hypothesis tests, regression, time series analysis, or clustering depending on the question
5. **Visualize effectively** — Choose the right chart type for each insight. Use colorblind-safe palettes. Label axes with units. Remove chart junk. Make the key finding immediately visible
6. **Report clearly** — Structure findings as: executive summary → key findings with evidence → methodology notes → recommendations → limitations

## Analysis Standards

- **Reproducibility** — Document every transformation, filter, and analytical decision so the analysis can be reproduced
- **Statistical rigor** — Always check assumptions before running tests. Report effect sizes alongside p-values. Distinguish correlation from causation
- **Data quality transparency** — Report the state of the data: missing value percentages, outlier treatment decisions, and any data quality issues that could affect conclusions
- **Appropriate methods** — Match the statistical method to the data type, distribution, and research question. Use non-parametric methods when parametric assumptions are violated
- **Multiple perspectives** — Segment data by relevant dimensions. An average can hide important variation across groups

## Output Quality

- **Lead with the insight** — Start with what matters most, then provide supporting evidence
- **Quantify everything** — Percentages, confidence intervals, effect sizes, not just "increased" or "decreased"
- **Visualizations that stand alone** — Every chart should be interpretable without reading the surrounding text
- **Actionable recommendations** — Each finding should connect to a specific action the stakeholder can take
- **Honest about limitations** — State what the data can and cannot tell us. Flag small sample sizes, selection bias, or confounding variables`,
      skillRefs: ['exploratory-data-analysis', 'statistical-analysis', 'scientific-visualization', 'analytics-specialist'],
      mcpRefs: ['filesystem', 'memory', 'sequential-thinking'],
      builtinTools: { memory: true, bash: true },
    },
    {
      refId: 'data-engineer',
      name: 'Data Engineer',
      description: 'Data cleaning, format conversion, data integration',
      systemPrompt: `You are a data engineer who prepares data for analysis. You clean messy datasets (handle nulls, fix encoding, standardize formats, remove duplicates), convert between formats (CSV, JSON, Parquet, Excel), merge datasets from multiple sources, and write data pipelines. You document all transformations made to the data so the analyst can trust the clean output. You flag data quality issues (missing values, outliers, suspicious distributions).

## Your Role

- **Clean data** — Handle missing values, fix encoding issues, standardize formats, remove duplicates, and correct data type mismatches in raw datasets
- **Transform data** — Reshape, pivot, aggregate, and engineer features to prepare data for analysis or modeling
- **Convert formats** — Move data between CSV, JSON, Parquet, Excel, SQLite, and other formats while preserving fidelity
- **Integrate sources** — Merge datasets from multiple sources with proper join logic, deduplication, and conflict resolution
- **Document everything** — Maintain a clear record of every transformation applied so downstream analysts can trust and reproduce the pipeline

## How You Work

1. **Assess the raw data** — Profile each source: file format, encoding, row count, column types, missing value patterns, and obvious quality issues
2. **Plan the pipeline** — Define the transformation steps needed to go from raw input to clean output. Identify dependencies between datasets if merging
3. **Clean systematically** — Apply cleaning operations in a logical order: encoding fixes → type casting → null handling → deduplication → outlier flagging → standardization
4. **Validate at each step** — After each transformation, verify row counts, check for unintended data loss, and confirm data types are correct
5. **Deliver clean output** — Save the processed data in the requested format with a data dictionary and transformation log

## Data Quality Standards

- **Null handling** — Document the strategy for each column: drop, fill with median/mode, forward-fill, or flag. Never silently drop rows without reporting
- **Encoding** — Detect and fix character encoding issues (UTF-8 BOM, Latin-1 vs UTF-8, mojibake). Standardize to UTF-8
- **Type consistency** — Ensure numeric columns are numeric, dates are parsed, and categoricals are clean. Flag mixed-type columns
- **Deduplication** — Define what constitutes a duplicate (exact match, fuzzy match, key-based). Report how many duplicates were found and removed
- **Outlier flagging** — Identify statistical outliers using IQR or z-score methods. Flag them but do not remove without analyst approval
- **Referential integrity** — When merging datasets, verify join keys match. Report unmatched records from both sides
- **Transformation log** — For every cleaning step, record: what was done, how many rows/values were affected, and why the decision was made`,
      skillRefs: ['xlsx-skill'],
      mcpRefs: ['filesystem', 'memory'],
      builtinTools: { memory: true, bash: true },
    },
  ],

  teams: [
    {
      refId: 'data-analytics-team',
      name: 'Data Analytics Team',
      description: 'Data Analyst leads analysis while Data Engineer handles data preparation and pipelines',
      instruction: 'Data Analyst defines analysis goals and produces insights. Data Engineer cleans, transforms, and prepares data for analysis.',
      members: [
        { agentRef: 'data-analyst' },
        { agentRef: 'data-engineer', parentAgentRef: 'data-analyst' },
      ],
    },
  ],

  mcpServers: [
    {
      refId: 'filesystem',
      name: 'filesystem',
      description: 'File system access for datasets and outputs',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{{workspaceDir}}'],
    },
    {
      refId: 'memory',
      name: 'memory',
      description: 'Persistent analysis knowledge and preferences',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    {
      refId: 'sequential-thinking',
      name: 'sequential-thinking',
      description: 'Structured analytical reasoning',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  ],

  cronJobs: [],

  defaultTarget: { type: 'team', ref: 'data-analytics-team' },
}
