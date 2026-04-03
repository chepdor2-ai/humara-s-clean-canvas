const fs = require('fs');
const content = fs.readFileSync('lib/engine/shared-dictionaries.ts', 'utf8');

// Extract the object with regex. It's exported as: export const ADVANCED_SYNONYMS: Record<string, string[]> = { ... };
const match = content.match(/export const ADVANCED_SYNONYMS: Record<string, string\[\]> = \{([\s\S]*?)\};/);

if (match) {
  const inner = match[1];
  const entries = new Map();
  
  // extract pairs like key: ["value1", "value2"],
  const regex = /([a-z]+)\s*:\s*\[(.*?)\](?=,|$)/gi;
  let p;
  while ((p = regex.exec(inner)) !== null) {
      if (!entries.has(p[1])) {
          entries.set(p[1], p[2]);
      }
  }
  
  let newInner = '';
  for (const [k, v] of entries.entries()) {
      newInner += `  ${k}: [${v}],\n`;
  }
  
  const newContent = content.replace(match[1], '\n' + newInner);
  fs.writeFileSync('lib/engine/shared-dictionaries.ts', newContent);
  console.log('Fixed ADVANCED_SYNONYMS');
} else {
    console.log('ADVANCED_SYNONYMS not found');
}