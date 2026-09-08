#!/usr/bin/env python3
from pathlib import Path
import re, sys, json

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
SKIP = {'.git', 'node_modules', '.venv', 'dist', 'build'}
PATTERNS = {
    'credential_assignment': re.compile(r'(?i)\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*["\'][^"\']{4,}["\']'),
    'github_token': re.compile(r'\bgh[pousr]_[A-Za-z0-9_]{30,}\b'),
    'private_key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'bearer_token': re.compile(r'(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{20,}'),
    'aws_access_key': re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
}
TEXT_EXT = {'.js','.mjs','.cjs','.ts','.tsx','.json','.html','.css','.md','.txt','.rtf','.yml','.yaml','.env','.ini','.toml','.xml'}
findings = []
for path in ROOT.rglob('*'):
    if not path.is_file() or any(part in SKIP for part in path.parts):
        continue
    if path.suffix.lower() not in TEXT_EXT and path.name not in {'.env','.env.example'}:
        continue
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    for name, pattern in PATTERNS.items():
        for match in pattern.finditer(text):
            candidate = match.group(0).lower()
            if any(marker in candidate for marker in ["'invalid'", '"invalid"', "'replace-me'", '"replace-me"']):
                continue
            line = text.count('\n', 0, match.start()) + 1
            findings.append({'file': str(path), 'line': line, 'kind': name})
print(json.dumps({'root': str(ROOT), 'findings': findings, 'count': len(findings)}, indent=2))
sys.exit(1 if findings else 0)
