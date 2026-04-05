const t = `Suzanne, the Chief Marketing Officer (CMO) of an athletic clothing company, is confronted with significant challenges due to the declining performance of her sales manager, Hank. As a key figure in the organization, Suzanne's role is critical in driving the company's marketing and sales strategies. However, her leadership approach, especially in dealing with Hank's performance issues, reveals several underlying problems. The purpose of this analysis is to delve into Suzanne's leadership performance, focusing on her application of the four foundations of leadership. By evaluating her cognitive, social, emotional, and moral foundations, we can better understand her strengths and areas needing improvement. This analysis aims to provide insights into how Suzanne can enhance her leadership effectiveness and foster a more supportive and productive work environment.`;

async function test(engine) {
  const r = await fetch('http://localhost:3000/api/humanize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, engine, strength: 'medium', tone: 'academic' }),
  });
  const d = await r.json();
  console.log(`\n=== ${engine.toUpperCase()} ===`);
  const inS = t.match(/[^.!?]+[.!?]+/g) || [];
  const outS = d.humanized.match(/[^.!?]+[.!?]+/g) || [];
  let same = 0;
  inS.forEach((s, i) => {
    const match = s.trim() === outS[i]?.trim();
    if (match) same++;
    console.log(`${match ? 'SAME' : 'DIFF'}[${i}]:`);
    console.log(`  IN:  ${s.trim().substring(0, 90)}`);
    console.log(`  OUT: ${(outS[i] || '').trim().substring(0, 90)}`);
  });
  console.log(`\nResult: ${same}/${inS.length} sentences unchanged`);
}

test('omega').then(() => test('nuru')).catch(e => console.error(e));
