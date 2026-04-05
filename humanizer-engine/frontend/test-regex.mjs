const re = /\(([A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?(?:;\s*[A-Z][a-zA-Z&.\s]+,?\s*\d{4}[a-z]?)*)\)/g;
const t = 'effectively (Zimmerman, 2002). Also (Pamolarco, 2022).';
const m = t.match(re);
console.log('Matches:', JSON.stringify(m));

let citIdx = 0;
const citationMap = new Map();
const result = t.replace(re, (match) => {
  const placeholder = `__CITE_${citIdx++}__`;
  citationMap.set(placeholder, match);
  return placeholder;
});
console.log('Result:', result);
console.log('Map:', JSON.stringify([...citationMap.entries()]));
