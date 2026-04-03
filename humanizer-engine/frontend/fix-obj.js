const fs = require('fs');

let content = fs.readFileSync('lib/engine/shared-dictionaries.ts', 'utf-8');

// Find all objects exported
const objectRegex = /(export const [a-zA-Z0-9_]+.*?(?:=\s*new[^{]+{)?|(?:=\s*){)([\s\S]*?)(\n\s*};?)/g;

content = content.replace(objectRegex, (match, prefix, body, suffix) => {
    let seen = new Set();
    
    // Replace any key: [ ... ] or key: '...' 
    // We regex look for keys
    const kvRegex = /([a-zA-Z0-9_]+|["'][^"']+["'])\s*:\s*(\[[^\]]*\]|["'][^"']*["'])[,\s]*/g;
    
    let newBody = body.replace(kvRegex, (match2, key, val) => {
        let cleanKey = key.replace(/['"]/g, '').trim();
        if (seen.has(cleanKey)) {
            console.log('Removed duplicate:', cleanKey);
            return ' '; // empty space
        }
        seen.add(cleanKey);
        return match2;
    });
    
    return prefix + newBody + suffix;
});

fs.writeFileSync('lib/engine/shared-dictionaries.ts', content, 'utf-8');
console.log('Done scanning');