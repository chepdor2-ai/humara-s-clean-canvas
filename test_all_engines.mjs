// Test ALL humanizer engines with AI in Nursing text
const text = `Artificial Intelligence (AI) is rapidly transforming the healthcare sector, and nursing is one of the most impacted professions. AI refers to computer systems designed to perform tasks that typically require human intelligence, such as decision-making, pattern recognition, and learning from data. In nursing, AI is being integrated into clinical practice, administration, education, and patient care to enhance efficiency, accuracy, and outcomes. As healthcare systems face increasing pressure from growing populations, chronic diseases, and workforce shortages, AI offers innovative solutions that can support nurses in delivering high-quality care.

One of the most significant contributions of AI in nursing is in clinical decision support. AI-powered systems can analyze vast amounts of patient data, including medical histories, lab results, and real-time vital signs, to assist nurses in making informed decisions. These systems help identify early warning signs of patient deterioration, predict potential complications, and recommend appropriate interventions. For example, predictive analytics tools can alert nurses to patients at risk of sepsis or cardiac arrest, enabling timely intervention and improving survival rates. This reduces the burden on nurses and enhances patient safety by minimizing human error.

AI also plays a crucial role in improving patient monitoring and care delivery. Wearable devices and smart monitoring systems collect continuous health data, which AI algorithms analyze to detect abnormalities. Nurses can remotely monitor patients, especially those with chronic conditions, without requiring constant physical presence. This is particularly beneficial in home-based care and telehealth services, where nurses can provide support and guidance from a distance. Additionally, robotic technologies are being used to assist with routine tasks such as medication delivery, lifting patients, and sanitizing hospital environments. These innovations reduce physical strain on nurses and allow them to focus more on direct patient interaction.`;

const ENGINES = [
  'nuru_v2',       // Nuru 2.0 — non-LLM stealth
  'oxygen',        // Humara 2.0 — GPTZero killer (needs king_server)
  'ozone',         // Humara 2.1 — ZeroGPT cleaner (external API)
  'easy',          // Humara 2.2 — Broad spectrum (external API)
  'humara_v3_3',   // Humara 2.4 — Triple fallback (needs king_server)
  'oxygen3',       // Humara 3.0 — Fine-tuned model (HF Space)
  'ghost_pro_wiki', // Wikipedia — Encyclopedic NPOV
];

const PORT = 3000;
const TIMEOUT = 120000; // 2 min per engine

async function testEngine(engine) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const start = Date.now();
    const res = await fetch(`http://localhost:${PORT}/api/humanize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        engine,
        strength: 'medium',
        enable_post_processing: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      const errText = await res.text();
      // Extract JSON error if embedded in HTML
      const jsonMatch = errText.match(/"message":"([^"]+)"/);
      const errMsg = jsonMatch ? jsonMatch[1] : errText.substring(0, 200);
      return { engine, status: 'ERROR', error: `HTTP ${res.status}: ${errMsg}`, elapsed };
    }

    const data = await res.json();
    const output = data.humanized || data.humanizedText || data.text || '';
    const wordCount = output.split(/\s+/).filter(Boolean).length;

    return {
      engine,
      status: 'OK',
      output,
      wordCount,
      inputWordCount: data.input_word_count,
      meaningPreserved: data.meaning_preserved,
      elapsed,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { engine, status: 'TIMEOUT', error: `Exceeded ${TIMEOUT / 1000}s`, elapsed: TIMEOUT / 1000 };
    }
    return { engine, status: 'ERROR', error: err.message, elapsed: '?' };
  }
}

async function main() {
  const inputWords = text.split(/\s+/).filter(Boolean).length;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  HUMANIZER ENGINE TEST — ${ENGINES.length} engines`);
  console.log(`  Input: ${inputWords} words, ${text.length} chars`);
  console.log(`${'='.repeat(80)}\n`);

  for (const engine of ENGINES) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`  ENGINE: ${engine}`);
    console.log(`${'─'.repeat(80)}`);

    const result = await testEngine(engine);

    if (result.status !== 'OK') {
      console.log(`  STATUS: ${result.status} (${result.elapsed}s)`);
      console.log(`  ERROR: ${result.error}`);
      continue;
    }

    console.log(`  STATUS: OK (${result.elapsed}s) | Words: ${result.inputWordCount} → ${result.wordCount} | Meaning: ${result.meaningPreserved}`);
    console.log(`\n${result.output}\n`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('  ALL TESTS COMPLETE');
  console.log(`${'='.repeat(80)}\n`);
}

main();
