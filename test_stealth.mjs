import { stealthHumanize } from './humanizer-engine/frontend/lib/engine/stealth/index.js';

const text = "Customer Origin and Online Behavior Analysis for Financial Services. Understanding customer origin and online behavior is essential for improving conversion rates and maximizing revenue in financial services.";

console.log("=== Original Text ===");
console.log(text);

const output = stealthHumanize(text, 'medium', 'academic', 15);

console.log("\n=== Humanized Text ===");
console.log(output);
