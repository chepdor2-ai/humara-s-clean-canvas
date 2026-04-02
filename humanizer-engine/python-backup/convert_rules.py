"""Convert Python data maps to TypeScript format."""
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import rules

def dict_to_ts_record(d, indent=2):
    """Convert dict to TypeScript Record literal."""
    lines = []
    for k, v in d.items():
        key = json.dumps(k)
        if isinstance(v, list):
            val = json.dumps(v)
        elif isinstance(v, str):
            val = json.dumps(v)
        else:
            val = json.dumps(v)
        lines.append(f"{'  ' * indent}{key}: {val},")
    return "\n".join(lines)

# Output rules.ts
out = []
out.append('// Auto-generated from rules.py — DO NOT EDIT MANUALLY')
out.append('')
out.append(f'export const BURSTINESS_TARGET = {rules.BURSTINESS_TARGET};')
out.append(f'export const SYNONYM_RATE = {rules.SYNONYM_RATE};')
out.append(f'export const PHRASE_RATE = {rules.PHRASE_RATE};')
out.append(f'export const RESTRUCTURE_RATE = {rules.RESTRUCTURE_RATE};')
out.append(f'export const CLAUSE_SWAP_RATE = {rules.CLAUSE_SWAP_RATE};')
out.append('')

# AI_STARTER_REPLACEMENTS
out.append('export const AI_STARTER_REPLACEMENTS: Record<string, string[]> = {')
for k, v in rules.AI_STARTER_REPLACEMENTS.items():
    out.append(f'  {json.dumps(k)}: {json.dumps(v)},')
out.append('};')
out.append('')

# PHRASE_SUBSTITUTIONS
out.append('export const PHRASE_SUBSTITUTIONS: Record<string, string[]> = {')
for k, v in rules.PHRASE_SUBSTITUTIONS.items():
    out.append(f'  {json.dumps(k)}: {json.dumps(v)},')
out.append('};')
out.append('')

# Sort by length descending (as Python code does)
out.append('// Pre-sorted by phrase length (longest first) for matching')
out.append('export const SORTED_PHRASE_KEYS: string[] = Object.keys(PHRASE_SUBSTITUTIONS)')
out.append('  .sort((a, b) => b.length - a.length);')
out.append('')

# SYNONYM_BANK
out.append('export const SYNONYM_BANK: Record<string, string[]> = {')
for k, v in rules.SYNONYM_BANK.items():
    out.append(f'  {json.dumps(k)}: {json.dumps(v)},')
out.append('};')
out.append('')

# PROTECTED_WORDS
pw_list = sorted(rules.PROTECTED_WORDS)
out.append(f'export const PROTECTED_WORDS: ReadonlySet<string> = new Set({json.dumps(pw_list)});')
out.append('')

# PROTECTED_PATTERNS (they are raw strings, not compiled regexes)
out.append('export const PROTECTED_PATTERNS: RegExp[] = [')
for p in rules.PROTECTED_PATTERNS:
    # They are raw strings in Python
    out.append(f'  new RegExp({json.dumps(p)}),')
out.append('];')

result = "\n".join(out)
# Write to ts-engine/src/rules.ts
outpath = os.path.join(os.path.dirname(__file__), "ts-engine", "src", "rules.ts")
os.makedirs(os.path.dirname(outpath), exist_ok=True)
with open(outpath, "w", encoding="utf-8") as f:
    f.write(result)
print(f"Written {len(result)} bytes to {outpath}")
print(f"AI_STARTER_REPLACEMENTS: {len(rules.AI_STARTER_REPLACEMENTS)} entries")
print(f"PHRASE_SUBSTITUTIONS: {len(rules.PHRASE_SUBSTITUTIONS)} entries")
print(f"SYNONYM_BANK: {len(rules.SYNONYM_BANK)} entries")
print(f"PROTECTED_WORDS: {len(rules.PROTECTED_WORDS)} entries")
print(f"PROTECTED_PATTERNS: {len(rules.PROTECTED_PATTERNS)} entries")
