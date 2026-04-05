// Quick test of one engine
const TEST_TEXT = `The Role of Technology in Shaping Modern Society
Introduction

Technology has become one of the most powerful forces shaping modern society. From communication and education to healthcare and business, technological advancements have transformed the way people live, work, and interact. Over the past few decades, the rapid development of digital tools, artificial intelligence, and global connectivity has created both opportunities and challenges. While technology has improved efficiency, accessibility, and innovation, it has also raised concerns about privacy, inequality, and dependency.

This essay explores the role of technology in shaping modern society by examining its impact on communication, education, business, healthcare, and social relationships. It also evaluates the challenges associated with technological growth and considers the future implications of an increasingly digital world.

The Impact on Communication

One of the most significant changes brought about by technology is in the field of communication. The invention of the internet, smartphones, and social media platforms has revolutionized the way people connect with one another. In the past, communication was limited to face-to-face interactions, letters, and telephone calls. Today, people can instantly communicate with anyone around the world through emails, messaging apps, video calls, and social media.

Social media platforms such as Facebook, Twitter, and Instagram have created new avenues for social interaction. These platforms allow individuals to share their thoughts, experiences, and opinions with a global audience. However, the rise of social media has also raised concerns about misinformation, cyberbullying, and the erosion of face-to-face communication skills.

Conclusion

In conclusion, technology has had a profound impact on modern society, transforming the way people communicate, learn, conduct business, and access healthcare. While it has brought numerous benefits, it has also introduced significant challenges that must be addressed. As technology continues to evolve, it is essential for individuals, businesses, and governments to work together to ensure that its benefits are maximized while its risks are minimized.`;

const ENGINES = ['ghost_mini', 'ghost_mini_v1_2', 'fast_v11', 'humara', 'humara_v1_3'];

async function test(engine) {
  try {
    const res = await fetch('http://localhost:3001/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: TEST_TEXT, engine, strength: 'medium', tone: 'academic' })
    });
    const data = await res.json();
    const output = data.humanized || data.text || 'NO OUTPUT';
    console.log(`\n${'='.repeat(60)}`);
    console.log(`ENGINE: ${engine.toUpperCase()}`);
    console.log(`${'='.repeat(60)}`);
    console.log(output);
    
    // Count sentences in input vs output (split on . ! ?)
    const countSentences = (t) => t.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
    const inputSentences = countSentences(TEST_TEXT);
    const outputSentences = countSentences(output);
    const diff = outputSentences - inputSentences;
    console.log(`\n📊 Sentences: INPUT=${inputSentences} → OUTPUT=${outputSentences} (${diff >= 0 ? '+' : ''}${diff})`);
    
    // Check for incomplete sentences (end with comma, no period, etc.)
    const lines = output.split('\n').filter(l => l.trim().length > 0);
    const incomplete = lines.filter(l => {
      const t = l.trim();
      return t.length > 20 && !t.match(/[.!?"]$/) && !t.match(/^[A-Z][^.!?]{0,60}$/) // not a heading
    });
    if (incomplete.length > 0) {
      console.log(`⚠️  INCOMPLETE SENTENCES (${incomplete.length}):`);
      incomplete.forEach(s => console.log(`   → "${s.trim().slice(-60)}"`));
    }
    
    // Check for known bad patterns
    const badPatterns = ['becomed', 'goed', 'runned', 'thinked', 'admittedly', 'progressively', 'imbalance', 'avenues', 'globe', 'folks', 'likewise', 'the strategy', 'the manner'];
    const found = badPatterns.filter(p => output.toLowerCase().includes(p));
    if (found.length > 0) {
      console.log(`\n⚠️  BAD PATTERNS FOUND: ${found.join(', ')}`);
    } else {
      console.log(`\n✅ No known bad patterns detected`);
    }
  } catch (e) {
    console.log(`\n❌ ${engine}: ${e.message}`);
  }
}

async function runAll() {
  for (const engine of ENGINES) {
    await test(engine);
  }
}

runAll().catch(console.error);
