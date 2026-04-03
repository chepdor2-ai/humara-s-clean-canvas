import re

def process_file():
    with open('lib/engine/shared-dictionaries.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    def process_object(m):
        prefix = m.group(1)
        body = m.group(2)
        
        seen = set()
        new_lines = []
        
        for line in body.split('\n'):
            # Find all keys in this line (e.g. `word: [` or `"phrase": [`)
            # Using findall to grab potential keys
            matches = re.finditer(r'(\b[a-zA-Z0-9_\-]+\b|"[^"]+"|\'[^\']+\')\s*:', line)
            
            new_line = line
            for match in reversed(list(matches)): # Go right to left safely
                key = match.group(1).strip("\"'")
                start_i = match.start()
                
                if key in seen:
                    # Remove it. Find the end of its value which might be a list [...] or string "..."
                    # Find comma or end of line.
                    # Since we go right to left, we can just find the end of the array or string
                    pattern = r'\s*:\s*(?:\[.*?\]|"[^"]*"|\'[^\']*\')[,\s]*'
                    rep = re.sub(pattern, '', new_line[start_i:], count=1)
                    new_line = new_line[:start_i] + rep
                else:
                    seen.add(key)
            
            # If the line was emptied out (except whitespace), don't append it
            if new_line.strip() != '':
                new_lines.append(new_line)
                
        return prefix + '\n'.join(new_lines)

    # find `={ ... }` blocks
    new_content = re.sub(r'(export const [a-zA-Z_]+(?:\s*:\s*[a-zA-Z<,\s>\[\]]+)?\s*=\s*\{)([\s\S]*?)(?=\n\})', process_object, content)
    
    with open('lib/engine/shared-dictionaries.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)

process_file()
