#!/bin/bash
python3 -c "
import sys, json, os, socket

data = json.load(sys.stdin)

user = os.environ.get('USER', '—')
host = socket.gethostname().split('.')[0]
model = (data.get('model') or {}).get('display_name', '—')
session = data.get('session_id') or '—'
version = data.get('version', '—')
ctx = (data.get('context_window') or {}).get('remaining_percentage')
cost = (data.get('cost') or {}).get('total_cost_usd')
cwd = (data.get('workspace') or {}).get('current_dir') or data.get('cwd', '—')

cyan = '\033[36m'
yellow = '\033[33m'
green = '\033[32m'
blue = '\033[34m'
magenta = '\033[35m'
dim = '\033[2m'
reset = '\033[0m'

parts = []
parts.append(f'{green}{user}@{host}{reset}')
parts.append(f'{dim}v{version}{reset}')
parts.append(f'{cyan}{model}{reset}')
if ctx is not None:
    parts.append(f'{magenta}ctx:{ctx}%{reset}')
if cost is not None:
    parts.append(f'{green}\${cost:.2f}{reset}')
parts.append(f'{yellow}{session}{reset}')
parts.append(f'{blue}{cwd}{reset}')

print(f' {dim}|{reset} '.join(parts))
" <<< "$(cat)"
