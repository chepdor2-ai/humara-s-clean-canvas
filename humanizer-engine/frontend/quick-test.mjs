// Quick test for nuru engine
async function test() {
  try {
    const res = await fetch('http://localhost:3000/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'This study provides students with an evidence-based framework to make informed decisions about which study strategies best support their learning preferences and academic goals.',
        engine: 'nuru',
        strength: 'medium',
        tone: 'academic',
      }),
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
