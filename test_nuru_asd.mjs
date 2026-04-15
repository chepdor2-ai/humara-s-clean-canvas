// Test Nuru V2 with ASD academic text
const text = `Current Challenges and Future Directions

Despite the growing body of evidence supporting multisensory interventions, significant challenges persist. One major issue is the heterogeneity of ASD itself, which makes it difficult to develop standardized treatment protocols (Narzisi et al., 2025). Each child presents with a unique sensory profile, requiring interventions that are highly individualized (Osório et al., 2021). This variability complicates efforts to conduct large-scale randomized controlled trials, often resulting in small sample sizes and inconsistent methodologies across studies.

Another critical gap lies in the limited use of objective, technology-driven assessment tools. While clinical observations and parent-reported outcomes are valuable, they are inherently subjective (Deng et al., 2023). More recently, tools such as functional near-infrared spectroscopy (fNIRS) and wearable motion sensors (e.g., Footscan systems) have begun to be used to measure physiological and motor responses during therapy sessions (De Domenico et al., 2024). However, these technologies are still in the early stages of integration into clinical practice and require further validation.

Longitudinal research is also notably lacking. Most existing studies focus on short-term outcomes, with intervention periods typically lasting between 8 to 12 weeks (Schaaf et al., 2015). This duration may be insufficient to capture the lasting effects of sensory integration therapy, especially as children grow and encounter new developmental challenges. Future research should prioritize extended follow-up periods and examine how improvements in sensory processing translate into long-term functional gains in areas such as academic performance, peer relationships, and daily living skills.

The need for culturally adapted intervention models is another area that remains underexplored. Many of the therapeutic frameworks currently in use were developed in Western clinical settings, which may not fully account for cultural differences in parenting practices, sensory environments, or expectations around child development (Barton et al., 2015). Expanding the evidence base to include more diverse populations will strengthen the generalizability and ethical grounding of sensory integration research.

Interdisciplinary collaboration also holds significant promise. Occupational therapists, psychologists, educators, and technologists can work together to develop more comprehensive treatment plans that address the full range of sensory, behavioral, and cognitive needs of children with ASD. Technology-enhanced interventions, including virtual reality, robotic-assisted therapy, and AI-driven adaptive programs, represent emerging frontiers that could personalize treatment in real-time based on a child's responses (Deng et al., 2023).

Looking ahead, there is a clear mandate for methodologically rigorous research that combines objective outcome measures with qualitative insights from families and clinicians. Establishing standardized assessment protocols, developing validated sensory profile tools, and creating inclusive intervention frameworks will be essential for advancing the field. By addressing these gaps systematically, the research community can move closer to ensuring that all children with ASD have access to evidence-based, culturally responsive, and individually tailored sensory integration therapies.`;

async function test() {
  console.log("Testing Nuru V2 with ASD academic text...\n");
  console.log("Input length:", text.length, "chars,", text.split(/\s+/).length, "words\n");
  
  try {
    const res = await fetch("http://localhost:3000/api/humanize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        engine: "nuru_v2",
        strength: "medium",
        enable_post_processing: true
      })
    });

    if (!res.ok) {
      console.error("HTTP Error:", res.status, await res.text());
      return;
    }

    const data = await res.json();
    console.log("=== RESPONSE KEYS ===", Object.keys(data));
    console.log("\n=== HUMANIZED OUTPUT ===\n");
    console.log(data.humanized || data.humanizedText || data.text || data.result || data.output);
    console.log("\n=== STATS ===");
    console.log("Word count:", data.word_count);
    if (data.scores) console.log("Scores:", JSON.stringify(data.scores, null, 2));
    if (data.meaning_preserved !== undefined) console.log("Meaning preserved:", data.meaning_preserved);
  } catch (err) {
    console.error("Error:", err.message);
  }
}

test();
