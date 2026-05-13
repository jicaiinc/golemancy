import type { ProjectTemplate } from '../../types/template'

export const docHubTemplate: ProjectTemplate = {
  id: 'doc-hub',
  category: 'productivity',
  icon: 'page',
  name: 'Doc Hub',
  description:
    'AI processing center for PDF, Word, Excel, and PowerPoint documents',
  tags: ['documents', 'pdf', 'excel', 'word', 'powerpoint'],
  featured: true,

  skills: [
    {
      refId: 'pdf-skill',
      name: 'PDF Processing',
      description:
        'Extract text and tables, create PDFs, merge/split documents, and handle forms',
      instructions: `# PDF Processing Guide

## Overview
Essential PDF processing operations using Python libraries and command-line tools.

## Python Libraries

### pypdf — Basic Operations

**Merge PDFs:**
\`\`\`python
from pypdf import PdfWriter, PdfReader
writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)
with open("merged.pdf", "wb") as output:
    writer.write(output)
\`\`\`

**Split PDF:**
\`\`\`python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
\`\`\`

**Rotate Pages:** \`page.rotate(90)\` — 90 degrees clockwise

**Password Protection:**
\`\`\`python
writer.encrypt("userpassword", "ownerpassword")
\`\`\`

### pdfplumber — Text and Table Extraction

**Extract Text:**
\`\`\`python
import pdfplumber
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
\`\`\`

**Extract Tables:**
\`\`\`python
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            for row in table:
                print(row)
\`\`\`

**Tables to DataFrame:**
\`\`\`python
import pandas as pd
with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:
                df = pd.DataFrame(table[1:], columns=table[0])
\`\`\`

### reportlab — Create PDFs

\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = [Paragraph("Title", styles['Title']), Spacer(1, 12), Paragraph("Body text", styles['Normal'])]
doc.build(story)
\`\`\`

## Command-Line Tools

\`\`\`bash
# Extract text (poppler-utils)
pdftotext input.pdf output.txt
pdftotext -layout input.pdf output.txt  # preserve layout

# Merge (qpdf)
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf

# Extract images
pdfimages -j input.pdf output_prefix
\`\`\`

## OCR for Scanned PDFs
\`\`\`python
import pytesseract
from pdf2image import convert_from_path
images = convert_from_path('scanned.pdf')
for image in images:
    text = pytesseract.image_to_string(image)
\`\`\`

## Quick Reference

| Task | Tool | Key Method |
|------|------|-----------|
| Merge | pypdf | \`writer.add_page(page)\` |
| Split | pypdf | One page per file |
| Extract text | pdfplumber | \`page.extract_text()\` |
| Extract tables | pdfplumber | \`page.extract_tables()\` |
| Create PDFs | reportlab | Canvas or Platypus |
| OCR | pytesseract | Convert to image first |`,
    },
    {
      refId: 'docx-skill',
      name: 'DOCX Processing',
      description:
        'Create, edit, and analyze Word documents with tracked changes and comments',
      instructions: `# DOCX Creation, Editing, and Analysis

## Overview
A .docx file is a ZIP archive containing XML files. Different tools handle different tasks.

## Workflow Decision Tree

- **Reading/Analyzing** → pandoc or raw XML
- **Creating New Document** → docx-js (JavaScript/TypeScript)
- **Editing Existing** → Python OOXML manipulation
- **Document Review** → Redlining workflow with tracked changes

## Reading Content

### Text Extraction
\`\`\`bash
# Convert to markdown with tracked changes
pandoc --track-changes=all path-to-file.docx -o output.md
# Options: --track-changes=accept/reject/all
\`\`\`

### Raw XML Access
Unpack the docx to inspect XML:
- \`word/document.xml\` — Main content
- \`word/comments.xml\` — Comments
- \`word/media/\` — Embedded images
- Tracked changes use \`<w:ins>\` (insertions) and \`<w:del>\` (deletions)

## Creating New Documents
Use **docx-js** (JavaScript/TypeScript):
\`\`\`typescript
import { Document, Paragraph, TextRun, Packer } from 'docx'
const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ children: [new TextRun({ text: "Hello World", bold: true })] })
    ]
  }]
})
const buffer = await Packer.toBuffer(doc)
\`\`\`

## Editing Existing Documents
1. Unpack the docx (it's a ZIP)
2. Edit the XML files directly
3. Repack into .docx

## Tracked Changes (Redlining)
For document review with tracked changes:
1. Convert to markdown to understand current content
2. Identify changes needed
3. Edit XML to add \`<w:ins>\` and \`<w:del>\` elements
4. Only mark text that actually changes — preserve original runs for unchanged text

**Principle: Minimal, Precise Edits** — Don't replace entire sentences when only one word changes.

## Converting to Images
\`\`\`bash
soffice --headless --convert-to pdf document.docx
pdftoppm -jpeg -r 150 document.pdf page
\`\`\``,
    },
    {
      refId: 'xlsx-skill',
      name: 'XLSX Processing',
      description:
        'Spreadsheet operations with formulas, formatting, data analysis, and visualization',
      instructions: `# XLSX Creation, Editing, and Analysis

## CRITICAL: Use Formulas, Not Hardcoded Values
Always use Excel formulas instead of calculating in Python and hardcoding results.
\`\`\`python
# WRONG: sheet['B10'] = total_calculated_in_python
# RIGHT: sheet['B10'] = '=SUM(B2:B9)'
\`\`\`

## Reading Data with pandas
\`\`\`python
import pandas as pd
df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict
df.describe()  # Statistics
\`\`\`

## Creating/Editing with openpyxl
\`\`\`python
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment

# Create new
wb = Workbook()
sheet = wb.active
sheet['A1'] = 'Revenue'
sheet['B2'] = '=SUM(B3:B14)'
sheet['A1'].font = Font(bold=True)
sheet.column_dimensions['A'].width = 20
wb.save('output.xlsx')

# Edit existing
wb = load_workbook('existing.xlsx')
sheet = wb.active
sheet['A1'] = 'New Value'
wb.save('modified.xlsx')
\`\`\`

## Financial Model Standards

### Color Coding
- **Blue text**: Hardcoded inputs
- **Black text**: Formulas and calculations
- **Green text**: Links from other worksheets
- **Red text**: External links
- **Yellow background**: Key assumptions

### Number Formatting
- Years as text ("2024" not "2,024")
- Currency: $#,##0 with units in headers
- Negatives in parentheses: (123) not -123
- Percentages: 0.0% format

## Workflow
1. Choose tool: pandas for data analysis, openpyxl for formulas/formatting
2. Create/Load workbook
3. Add data, formulas, formatting
4. Save
5. Recalculate formulas if using LibreOffice

## Best Practices
- Cell indices are 1-based in openpyxl
- \`data_only=True\` reads calculated values (WARNING: saving loses formulas)
- Use \`read_only=True\` for large files
- Document sources for hardcoded values in comments`,
    },
    {
      refId: 'pptx-skill',
      name: 'PPTX Processing',
      description:
        'Create, edit, and analyze PowerPoint presentations',
      instructions: `# PPTX Creation, Editing, and Analysis

## Overview
A .pptx file is a ZIP archive containing XML files for slides, layouts, themes, and media.

## Reading Content

### Text Extraction
\`\`\`bash
python -m markitdown path-to-file.pptx
\`\`\`

### Key File Structure
- \`ppt/slides/slide{N}.xml\` — Individual slide contents
- \`ppt/notesSlides/notesSlide{N}.xml\` — Speaker notes
- \`ppt/slideLayouts/\` — Layout templates
- \`ppt/slideMasters/\` — Master templates
- \`ppt/theme/\` — Theme and styling
- \`ppt/media/\` — Images and media

## Creating Presentations

### Design Principles
1. Consider the subject matter and choose appropriate design elements
2. Use web-safe fonts: Arial, Helvetica, Georgia, Verdana, Tahoma
3. Create clear visual hierarchy through size, weight, and color
4. Ensure readability with strong contrast and appropriate text sizes
5. Be consistent with patterns, spacing, and visual language

### Color Palette Tips
- Pick 3-5 colors that work together
- Ensure text contrast against backgrounds
- Match palette to topic mood and audience
- Consider brand identity if applicable

### Layout Tips
- **Two-column layout (preferred)**: Header spanning full width, then two columns below
- **Full-slide layout**: Let featured content take entire slide for impact
- **Never vertically stack**: Don't place charts/tables below text in single column

## Editing Existing Presentations
1. Unpack the .pptx (ZIP archive)
2. Edit the XML files (primarily \`ppt/slides/slide{N}.xml\`)
3. Validate changes
4. Repack into .pptx

## Converting to Images
\`\`\`bash
soffice --headless --convert-to pdf presentation.pptx
pdftoppm -jpeg -r 150 presentation.pdf slide
\`\`\``,
    },
    {
      refId: 'invoice-organizer',
      name: 'Invoice Organizer',
      description:
        'Automatically organize invoices and receipts for tax preparation',
      instructions: `# Invoice Organizer

Transform chaotic folders of invoices and receipts into a clean, tax-ready filing system.

## What This Skill Does

1. **Reads Invoice Content**: Extract vendor, date, amount, description from PDFs/images
2. **Renames Consistently**: Format: \`YYYY-MM-DD Vendor - Invoice - Description.ext\`
3. **Organizes by Category**: Sort by vendor, expense category, time period, or tax category
4. **Generates Summary**: Create CSV spreadsheet with all invoice details

## Workflow

### 1. Scan the Folder
Identify all invoice files (PDF, JPG, PNG). Report total count, types, and date range.

### 2. Extract Information
For each invoice, extract:
- Vendor/company name
- Invoice number and date
- Amount and description
- Payment method

**Fallback**: Use filename clues or file modification date if content is unclear.

### 3. Determine Organization Strategy
Ask user preference if not specified:
- By Vendor (Adobe/, Amazon/, etc.)
- By Category (Software/, Office Supplies/, Travel/)
- By Date (2024/Q1/, 2024/Q2/)
- By Tax Category (Deductible/, Personal/)
- Custom: Year/Category/Vendor (default)

### 4. Create Standardized Filenames
\`\`\`
YYYY-MM-DD Vendor - Invoice - Description.ext
\`\`\`
Examples:
- \`2024-03-15 Adobe - Invoice - Creative Cloud.pdf\`
- \`2024-01-10 Amazon - Receipt - Office Supplies.pdf\`

### 5. Execute (with approval)
- Show the plan before making changes
- Copy files (preserve originals) unless user prefers moving
- Create folder structure automatically

### 6. Generate Summary CSV
\`\`\`csv
Date,Vendor,Invoice Number,Description,Amount,Category,File Path
2024-03-15,Adobe,INV-12345,Creative Cloud,52.99,Software,...
\`\`\`

## Special Cases
- **Duplicates**: Compare file hashes, keep highest quality
- **Missing info**: Flag for manual review in "Needs-Review/" folder
- **Multi-page invoices**: Merge PDFs if needed`,
    },
    {
      refId: 'file-organizer',
      name: 'File Organizer',
      description:
        'Intelligently organize files and folders by understanding context and finding duplicates',
      instructions: `# File Organizer

Act as a personal organization assistant to maintain clean, logical file structures.

## Capabilities

1. **Analyze Structure**: Review folders and files to understand what exists
2. **Find Duplicates**: Identify duplicate files by hash or name
3. **Suggest Organization**: Propose logical folder structures based on content
4. **Automate Cleanup**: Move, rename, and organize with user approval
5. **Reduce Clutter**: Identify old files that may no longer be needed

## Workflow

### 1. Understand Scope
- Which directory? (Downloads, Documents, entire home folder?)
- What's the problem? (Can't find things, duplicates, no structure?)
- Files to avoid? (Current projects, sensitive data?)
- How aggressive? (Conservative vs. comprehensive)

### 2. Analyze Current State
\`\`\`bash
ls -la [target]
du -sh [target]/* | sort -rh | head -20
find [target] -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn
\`\`\`
Summarize: total files, type breakdown, size distribution, obvious issues.

### 3. Identify Patterns
**By Type**: Documents, Images, Videos, Archives, Code, Spreadsheets
**By Purpose**: Work vs. Personal, Active vs. Archive, Project-specific
**By Date**: Current year, previous years, archive candidates

### 4. Find Duplicates
\`\`\`bash
find [dir] -type f -exec md5 {} \\; | sort | uniq -d
\`\`\`
For each set: show all paths, sizes, dates. Recommend which to keep.

### 5. Propose Plan (before making changes)
Show proposed folder structure, list of moves/renames, files to delete.

### 6. Execute (with confirmation)
- Log all moves for potential undo
- Preserve original modification dates
- Handle filename conflicts gracefully

### 7. Provide Summary
- Files organized, space freed, new structure created
- Maintenance tips: weekly sort, monthly archive, quarterly duplicate check

## Best Practices
- Always confirm before deleting
- Start small (one folder) to build trust
- Use consistent naming: "YYYY-MM-DD - Description"
- Archive rather than delete when unsure
- Separate active from completed work`,
    },
  ],

  agents: [
    {
      refId: 'doc-processor',
      name: 'Doc Processor',
      description:
        'Read, generate, convert, and analyze PDF, DOCX, XLSX, and PPTX documents',
      systemPrompt: `You are a document processing specialist who can read, analyze, generate, and convert any office document format. For PDFs: extract text, tables, fill forms, merge/split. For DOCX: create structured documents, edit content, apply formatting, track changes. For XLSX: process data, write formulas, generate charts, analyze datasets. For PPTX: create presentations, modify slide content, extract information. Remember the user's preferred templates, company letterhead details, and report structures.

## How You Work

1. **Identify the task** — Understand what document operation is needed
2. **Choose the right tool** — Select the appropriate library/approach for the format
3. **Execute precisely** — Process the document with attention to formatting and accuracy
4. **Verify results** — Check output for correctness and completeness
5. **Remember patterns** — Learn the user's preferred document templates and styles

## Document Capabilities

- **PDF**: Text/table extraction, creation, merge/split, form filling, OCR, watermarks, encryption
- **DOCX**: Create from scratch, edit existing, tracked changes, comments, formatting, template-based
- **XLSX**: Data analysis, formulas, formatting, charts, pivot tables, financial models, CSV import/export
- **PPTX**: Create presentations, edit slides, extract content, apply themes, speaker notes

## Principles

- Preserve original formatting when editing
- Use formulas (not hardcoded values) in spreadsheets
- Always show the plan before modifying documents
- Back up originals before destructive operations
- Handle large files efficiently (streaming, pagination)
- Flag potential data quality issues (missing values, encoding problems)`,
      skillRefs: [
        'pdf-skill',
        'docx-skill',
        'xlsx-skill',
        'pptx-skill',
        'invoice-organizer',
        'file-organizer',
      ],
      mcpRefs: ['filesystem', 'memory'],
      builtinTools: { memory: true, bash: true },
    },
  ],

  teams: [],

  mcpServers: [
    {
      refId: 'filesystem',
      name: 'filesystem',
      description: 'File read/write for document processing workflows',
      transportType: 'stdio',
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '{{workspaceDir}}',
      ],
    },
    {
      refId: 'memory',
      name: 'memory',
      description:
        'Persistent knowledge graph for user templates and preferences',
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  ],

  cronJobs: [],

  defaultTarget: { type: 'agent', ref: 'doc-processor' },
}
