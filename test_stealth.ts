import { stealthHumanize } from './humanizer-engine/frontend/lib/engine/stealth/index.ts';

const text = "Understanding customer origin and online behavior is essential for improving conversion rates and maximizing revenue in financial services. Through exploratory data analysis (EDA), organizations can identify patterns in how customers discover their platforms, interact with services, and ultimately complete transactions.";

console.log("=== Original Text ===");
console.log(text);

const output = stealthHumanize(text, 'medium', 'academic', 15);

console.log("\n=== Humanized Text ===");
console.log(output);
