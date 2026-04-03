import re

with open('lib/engine/shared-dictionaries.ts', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's just fix it using regex replacing all keys that match earlier keys.
import json

def process_dict(match):
    prefix = match.group(1)
    body = match.group(2)
    suffix = match.group(3)
    
    # We will just write a poor man's parser:
    keys_seen = set()
    new_body = ""
    # Find every key: value,
    # The regex for key: value, is tricky if value has lists of strings with commas.
    # We can just split by '],' and assume each is a key-value or something, but that's unsafe.
    
    # Actually, Node is better for this since it has access to a JS parser if I just use a simple regex for finding keys.
    pass

# We can find all keys like   word: ["a", "b"],
import sys
# It's easier to just use JS Regex in a Python script or better, simple Python string manipulation.

keys_seen = set()
def repl(m):
    key = m.group(1)
    if key in keys_seen:
        return ""
    keys_seen.add(key)
    return m.group(0)

# Replace in ADVANCED_SYNONYMS specifically since that's where the error is.
match = re.search(r'export const ADVANCED_SYNONYMS.*?\n([\s\S]*?)\n};', text)
if match:
    body = match.group(1)
    keys_seen.clear()
    
    # Find   key: [val],
    def kill_dupe(m):
        k = m.group(1)
        if k in keys_seen:
            return ""
        keys_seen.add(k)
        return m.group(0)
    
    new_body = re.sub(r'^\s*([a-zA-Z0-9_\-]+)\s*:\s*\[.*?\],?\s*$', kill_dupe, body, flags=re.MULTILINE)
    # What if they are on the same line?
    new_body = re.sub(r'([a-zA-Z0-9_\-]+)\s*:\s*\[.*?\],?', kill_dupe, new_body)
    
    text = text[:match.start(1)] + new_body + text[match.end(1):]

with open('lib/engine/shared-dictionaries.ts', 'w', encoding='utf-8') as f:
    f.write(text)

