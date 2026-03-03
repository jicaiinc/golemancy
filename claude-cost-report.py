#!/usr/bin/env python3
"""
Claude Code Session Cost Report

Scans all session .jsonl files under ~/.claude/projects/,
calculates token usage and estimated costs,
aggregates by project and date, then generates an HTML report.
"""

import json
import os
import sys
import webbrowser
import tempfile
from pathlib import Path
from collections import defaultdict
from datetime import datetime

# Pricing per 1M tokens (USD) — https://docs.anthropic.com/en/docs/about-claude/models
# As of 2025-06, using latest known pricing
PRICING = {
    # model_prefix: (input, output, cache_write, cache_read)
    "claude-opus-4":     (15.0, 75.0, 18.75, 1.50),
    "claude-sonnet-4":   (3.0, 15.0, 3.75, 0.30),
    "claude-haiku-4":    (0.80, 4.0, 1.0, 0.08),
    # Older models
    "claude-3-7-sonnet": (3.0, 15.0, 3.75, 0.30),
    "claude-3-5-sonnet": (3.0, 15.0, 3.75, 0.30),
    "claude-3-5-haiku":  (0.80, 4.0, 1.0, 0.08),
    "claude-3-opus":     (15.0, 75.0, 18.75, 1.50),
    "claude-3-sonnet":   (3.0, 15.0, 3.75, 0.30),
    "claude-3-haiku":    (0.25, 1.25, 0.3125, 0.025),
}

def get_pricing(model_id: str):
    """Match model ID to pricing. Returns (input, output, cache_write, cache_read) per 1M tokens."""
    if not model_id:
        # Default to sonnet pricing
        return (3.0, 15.0, 3.75, 0.30)
    for prefix, pricing in PRICING.items():
        if model_id.startswith(prefix):
            return pricing
    # Unknown model, default to sonnet
    return (3.0, 15.0, 3.75, 0.30)

def calc_cost(input_tokens, output_tokens, cache_create_tokens, cache_read_tokens, pricing):
    """Calculate cost in USD from token counts and pricing tuple."""
    inp_price, out_price, cache_w_price, cache_r_price = pricing
    cost = (
        input_tokens * inp_price / 1_000_000
        + output_tokens * out_price / 1_000_000
        + cache_create_tokens * cache_w_price / 1_000_000
        + cache_read_tokens * cache_r_price / 1_000_000
    )
    return cost

def parse_session(filepath: str):
    """Parse a single session .jsonl file. Returns session info dict or None."""
    try:
        total_input = 0
        total_output = 0
        total_cache_create = 0
        total_cache_read = 0
        model = None
        session_id = None
        first_ts = None
        last_ts = None
        project_dir = None

        with open(filepath, 'r', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                ts = data.get('timestamp')
                if ts and not first_ts:
                    first_ts = ts
                if ts:
                    last_ts = ts

                if not session_id:
                    session_id = data.get('sessionId')
                if not project_dir and data.get('cwd'):
                    project_dir = data['cwd']

                msg = data.get('message', {})
                if isinstance(msg, dict):
                    if msg.get('model'):
                        model = msg['model']
                    usage = msg.get('usage', {})
                    if usage:
                        total_input += usage.get('input_tokens', 0)
                        total_output += usage.get('output_tokens', 0)
                        total_cache_create += usage.get('cache_creation_input_tokens', 0)
                        total_cache_read += usage.get('cache_read_input_tokens', 0)

        if not first_ts:
            return None

        pricing = get_pricing(model)
        cost = calc_cost(total_input, total_output, total_cache_create, total_cache_read, pricing)

        # Extract date from timestamp
        try:
            dt = datetime.fromisoformat(first_ts.replace('Z', '+00:00'))
            date_str = dt.strftime('%Y-%m-%d')
        except Exception:
            date_str = 'unknown'

        # Derive project name from directory
        project_name = project_dir or 'unknown'
        # Shorten to last 2 path components
        parts = project_name.rstrip('/').split('/')
        if len(parts) >= 2:
            project_name = '/'.join(parts[-2:])
        elif parts:
            project_name = parts[-1]

        return {
            'session_id': session_id or Path(filepath).stem,
            'model': model or 'unknown',
            'project': project_name,
            'project_full': project_dir or 'unknown',
            'date': date_str,
            'first_ts': first_ts,
            'last_ts': last_ts,
            'input_tokens': total_input,
            'output_tokens': total_output,
            'cache_create_tokens': total_cache_create,
            'cache_read_tokens': total_cache_read,
            'cost': cost,
        }
    except Exception as e:
        return None

def generate_html(sessions, by_project, by_date, by_model, total_cost):
    """Generate the HTML report."""

    # Sort by_project by cost descending
    project_rows = sorted(by_project.items(), key=lambda x: x[1]['cost'], reverse=True)
    # Sort by_date chronologically
    date_rows = sorted(by_date.items(), key=lambda x: x[0], reverse=True)
    # Sort by_model by cost descending
    model_rows = sorted(by_model.items(), key=lambda x: x[1]['cost'], reverse=True)
    # Top sessions by cost
    top_sessions = sorted(sessions, key=lambda x: x['cost'], reverse=True)[:30]

    def fmt_cost(c):
        return f"${c:,.2f}"

    def fmt_tokens(t):
        if t >= 1_000_000:
            return f"{t/1_000_000:,.1f}M"
        elif t >= 1_000:
            return f"{t/1_000:,.1f}K"
        return str(t)

    # Project rows HTML
    project_html = ""
    for name, d in project_rows:
        project_html += f"""<tr>
            <td title="{d.get('full', name)}">{name}</td>
            <td class="num">{d['sessions']}</td>
            <td class="num">{fmt_tokens(d['input'])}</td>
            <td class="num">{fmt_tokens(d['output'])}</td>
            <td class="num">{fmt_tokens(d['cache_create'])}</td>
            <td class="num">{fmt_tokens(d['cache_read'])}</td>
            <td class="num cost">{fmt_cost(d['cost'])}</td>
        </tr>"""

    # Date rows HTML
    date_html = ""
    for date, d in date_rows:
        date_html += f"""<tr>
            <td>{date}</td>
            <td class="num">{d['sessions']}</td>
            <td class="num">{fmt_tokens(d['input'])}</td>
            <td class="num">{fmt_tokens(d['output'])}</td>
            <td class="num cost">{fmt_cost(d['cost'])}</td>
        </tr>"""

    # Model rows HTML
    model_html = ""
    for model, d in model_rows:
        model_html += f"""<tr>
            <td>{model}</td>
            <td class="num">{d['sessions']}</td>
            <td class="num">{fmt_tokens(d['total_tokens'])}</td>
            <td class="num cost">{fmt_cost(d['cost'])}</td>
        </tr>"""

    # Top sessions HTML
    sessions_html = ""
    for s in top_sessions:
        sessions_html += f"""<tr>
            <td class="mono">{s['session_id'][:12]}…</td>
            <td>{s['project']}</td>
            <td>{s['model']}</td>
            <td>{s['date']}</td>
            <td class="num">{fmt_tokens(s['input_tokens'] + s['cache_create_tokens'] + s['cache_read_tokens'])}</td>
            <td class="num">{fmt_tokens(s['output_tokens'])}</td>
            <td class="num cost">{fmt_cost(s['cost'])}</td>
        </tr>"""

    # Daily cost chart data (last 30 days)
    recent_dates = sorted(by_date.keys())[-30:]
    chart_labels = json.dumps(recent_dates)
    chart_values = json.dumps([round(by_date[d]['cost'], 2) for d in recent_dates])

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code Cost Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
:root {{
    --bg: #0d1117;
    --card: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 24px;
}}
h1 {{
    font-size: 24px;
    margin-bottom: 8px;
}}
.subtitle {{
    color: var(--text-dim);
    margin-bottom: 24px;
}}
.cards {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
}}
.card {{
    background: var(--card);
    border: 1px solid var(--border);
    padding: 16px;
}}
.card .label {{
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}}
.card .value {{
    font-size: 28px;
    font-weight: 600;
    margin-top: 4px;
}}
.card .value.cost {{ color: var(--green); }}
.card .value.sessions {{ color: var(--accent); }}
.card .value.tokens {{ color: var(--purple); }}
.chart-container {{
    background: var(--card);
    border: 1px solid var(--border);
    padding: 20px;
    margin-bottom: 32px;
    max-height: 350px;
}}
h2 {{
    font-size: 18px;
    margin-bottom: 16px;
    color: var(--text);
}}
table {{
    width: 100%;
    border-collapse: collapse;
    background: var(--card);
    border: 1px solid var(--border);
    margin-bottom: 32px;
}}
th {{
    text-align: left;
    padding: 10px 12px;
    border-bottom: 2px solid var(--border);
    color: var(--text-dim);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    position: sticky;
    top: 0;
    background: var(--card);
}}
td {{
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
}}
tr:hover {{
    background: rgba(88, 166, 255, 0.05);
}}
.num {{
    text-align: right;
    font-variant-numeric: tabular-nums;
}}
.cost {{
    color: var(--green);
    font-weight: 600;
}}
.mono {{
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 12px;
}}
.section {{
    margin-bottom: 32px;
}}
</style>
</head>
<body>

<h1>Claude Code Cost Report</h1>
<p class="subtitle">Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · {len(sessions)} sessions scanned</p>

<div class="cards">
    <div class="card">
        <div class="label">Total Cost (Estimated)</div>
        <div class="value cost">{fmt_cost(total_cost)}</div>
    </div>
    <div class="card">
        <div class="label">Total Sessions</div>
        <div class="value sessions">{len(sessions):,}</div>
    </div>
    <div class="card">
        <div class="label">Total Input Tokens</div>
        <div class="value tokens">{fmt_tokens(sum(s['input_tokens'] + s['cache_create_tokens'] + s['cache_read_tokens'] for s in sessions))}</div>
    </div>
    <div class="card">
        <div class="label">Total Output Tokens</div>
        <div class="value tokens">{fmt_tokens(sum(s['output_tokens'] for s in sessions))}</div>
    </div>
    <div class="card">
        <div class="label">Projects</div>
        <div class="value sessions">{len(by_project)}</div>
    </div>
    <div class="card">
        <div class="label">Date Range</div>
        <div class="value" style="font-size:16px">{min(by_date.keys()) if by_date else '—'}<br>{max(by_date.keys()) if by_date else '—'}</div>
    </div>
</div>

<div class="chart-container">
    <h2>Daily Cost Trend (Last 30 Days)</h2>
    <canvas id="dailyChart"></canvas>
</div>

<div class="section">
    <h2>By Project</h2>
    <table>
        <thead><tr>
            <th>Project</th><th class="num">Sessions</th>
            <th class="num">Input</th><th class="num">Output</th>
            <th class="num">Cache Write</th><th class="num">Cache Read</th>
            <th class="num">Cost</th>
        </tr></thead>
        <tbody>{project_html}</tbody>
    </table>
</div>

<div class="section">
    <h2>By Date</h2>
    <table>
        <thead><tr>
            <th>Date</th><th class="num">Sessions</th>
            <th class="num">Input</th><th class="num">Output</th>
            <th class="num">Cost</th>
        </tr></thead>
        <tbody>{date_html}</tbody>
    </table>
</div>

<div class="section">
    <h2>By Model</h2>
    <table>
        <thead><tr>
            <th>Model</th><th class="num">Sessions</th>
            <th class="num">Total Tokens</th>
            <th class="num">Cost</th>
        </tr></thead>
        <tbody>{model_html}</tbody>
    </table>
</div>

<div class="section">
    <h2>Top 30 Sessions by Cost</h2>
    <table>
        <thead><tr>
            <th>Session</th><th>Project</th><th>Model</th><th>Date</th>
            <th class="num">Input</th><th class="num">Output</th>
            <th class="num">Cost</th>
        </tr></thead>
        <tbody>{sessions_html}</tbody>
    </table>
</div>

<script>
const ctx = document.getElementById('dailyChart').getContext('2d');
new Chart(ctx, {{
    type: 'bar',
    data: {{
        labels: {chart_labels},
        datasets: [{{
            label: 'Daily Cost (USD)',
            data: {chart_values},
            backgroundColor: 'rgba(59, 185, 80, 0.6)',
            borderColor: 'rgba(59, 185, 80, 1)',
            borderWidth: 1,
        }}]
    }},
    options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
            legend: {{ display: false }},
            tooltip: {{
                callbacks: {{
                    label: (ctx) => '$' + ctx.parsed.y.toFixed(2)
                }}
            }}
        }},
        scales: {{
            x: {{
                ticks: {{ color: '#8b949e', maxRotation: 45 }},
                grid: {{ color: 'rgba(48,54,61,0.5)' }}
            }},
            y: {{
                ticks: {{
                    color: '#8b949e',
                    callback: (v) => '$' + v.toFixed(2)
                }},
                grid: {{ color: 'rgba(48,54,61,0.5)' }}
            }}
        }}
    }}
}});
</script>

</body>
</html>"""
    return html


def main():
    projects_dir = Path.home() / '.claude' / 'projects'
    if not projects_dir.exists():
        print(f"Error: {projects_dir} not found")
        sys.exit(1)

    print(f"Scanning sessions in {projects_dir}...")

    # Find all top-level session .jsonl files (exclude subagents)
    session_files = []
    for project_path in projects_dir.iterdir():
        if not project_path.is_dir():
            continue
        for f in project_path.iterdir():
            if f.suffix == '.jsonl' and f.is_file():
                session_files.append(str(f))

    print(f"Found {len(session_files)} session files. Parsing...")

    sessions = []
    for i, fp in enumerate(session_files):
        if (i + 1) % 100 == 0:
            print(f"  {i+1}/{len(session_files)}...")
        result = parse_session(fp)
        if result:
            sessions.append(result)

    print(f"Parsed {len(sessions)} valid sessions.")

    # Aggregate by project
    by_project = defaultdict(lambda: {
        'sessions': 0, 'input': 0, 'output': 0,
        'cache_create': 0, 'cache_read': 0, 'cost': 0.0, 'full': ''
    })
    for s in sessions:
        p = by_project[s['project']]
        p['sessions'] += 1
        p['input'] += s['input_tokens']
        p['output'] += s['output_tokens']
        p['cache_create'] += s['cache_create_tokens']
        p['cache_read'] += s['cache_read_tokens']
        p['cost'] += s['cost']
        p['full'] = s['project_full']

    # Aggregate by date
    by_date = defaultdict(lambda: {
        'sessions': 0, 'input': 0, 'output': 0, 'cost': 0.0
    })
    for s in sessions:
        d = by_date[s['date']]
        d['sessions'] += 1
        d['input'] += s['input_tokens'] + s['cache_create_tokens'] + s['cache_read_tokens']
        d['output'] += s['output_tokens']
        d['cost'] += s['cost']

    # Aggregate by model
    by_model = defaultdict(lambda: {
        'sessions': 0, 'total_tokens': 0, 'cost': 0.0
    })
    for s in sessions:
        m = by_model[s['model']]
        m['sessions'] += 1
        m['total_tokens'] += (s['input_tokens'] + s['output_tokens']
                              + s['cache_create_tokens'] + s['cache_read_tokens'])
        m['cost'] += s['cost']

    total_cost = sum(s['cost'] for s in sessions)
    print(f"\nTotal estimated cost: ${total_cost:,.2f}")

    # Generate HTML
    html = generate_html(sessions, dict(by_project), dict(by_date), dict(by_model), total_cost)

    output_path = '/tmp/claude-cost-report.html'
    with open(output_path, 'w') as f:
        f.write(html)

    print(f"Report saved to {output_path}")
    print("Opening in browser...")
    webbrowser.open(f'file://{output_path}')


if __name__ == '__main__':
    main()
