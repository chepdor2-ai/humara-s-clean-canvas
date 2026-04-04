import { ghostMiniV1_2 } from "./lib/engine/ghost-mini-v1-2";
import { humanize } from "./lib/engine/humanizer";

const essay = `Artificial Intelligence (AI) has rapidly transformed modern society, influencing industries, economies, and everyday human interactions in profound ways. Over the past decade, AI has moved from being a futuristic concept to an integral part of daily life, powering everything from virtual assistants and recommendation systems to autonomous vehicles and advanced medical diagnostics. As machine learning algorithms become more sophisticated and data availability continues to grow, the potential applications of AI are expanding at an unprecedented rate.

One of the most significant impacts of AI is in the workplace. Automation driven by AI technologies is reshaping job markets across the globe. While AI has created new categories of employment, particularly in tech-related fields such as data science and machine learning engineering, it has also led to the displacement of workers in manufacturing, retail, and administrative roles. This dual effect has sparked ongoing debates about the future of work and the need for policies that support workforce transitions, including reskilling programs and social safety nets.

In healthcare, AI is proving to be a game-changer. From early disease detection through image recognition to personalized treatment plans driven by predictive analytics, AI tools are enhancing the accuracy and efficiency of medical care. For example, AI algorithms can now analyze medical images with a level of precision that rivals or exceeds that of trained radiologists. Moreover, during the COVID-19 pandemic, AI was instrumental in accelerating vaccine development and tracking the spread of the virus.

However, the rise of AI also brings significant ethical and societal challenges. Issues such as algorithmic bias, data privacy, and the lack of transparency in AI decision-making processes have raised concerns among policymakers, researchers, and the public. There is a growing call for comprehensive AI governance frameworks that ensure accountability, fairness, and respect for human rights. Without such safeguards, the deployment of AI could exacerbate existing inequalities and undermine public trust in technology.

In conclusion, while AI holds immense promise for improving various aspects of human life, its development and deployment must be guided by ethical principles and robust regulatory frameworks. The challenge lies in balancing innovation with responsibility, ensuring that the benefits of AI are equitably distributed and that its risks are carefully managed. As society continues to navigate this technological revolution, collaboration between governments, industry, and civil society will be essential in shaping an AI-driven future that serves the common good.`;

async function main() {
console.log("=== ORIGINAL TEXT (first paragraph) ===");
console.log(essay.split("\n\n")[0]);
console.log("");

// Ghost Mini v1.2
const gmResult = await ghostMiniV1_2(essay);
console.log("=== GHOST MINI v1.2 OUTPUT ===");
const gmParas = gmResult.split("\n\n");
for (let i = 0; i < gmParas.length; i++) {
  console.log(`\n--- Paragraph ${i+1} ---`);
  console.log(gmParas[i]);
}

console.log("\n\n=== GHOST MINI (ORIGINAL) OUTPUT ===");
const origResult = await humanize(essay, { tone: "academic", strength: "medium", mode: "ghost_mini" });
const origParas = origResult.split("\n\n");
for (let i = 0; i < origParas.length; i++) {
  console.log(`\n--- Paragraph ${i+1} ---`);
  console.log(origParas[i]);
}
}
main();
