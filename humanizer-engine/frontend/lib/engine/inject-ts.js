import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const dir = join(__dirname, "..");
const ghostProPath = join(dir, "ghost-pro.ts");
const humanizerPath = join(dir, "humanizer.ts");
const llmHumanizerPath = join(dir, "llm-humanizer.ts");

function inject(targetPath: string, searchRe: RegExp, replacement: string, name: string) {
  try {
    let content = readFileSync(targetPath, "utf-8");
    if (!content.includes("executeAggressiveStealthPostProcessing")) {
      content = 'import { executeAggressiveStealthPostProcessing } from "./aggressive-stealth";\n' + content;
    }
    
    if (searchRe.test(content)) {
      content = content.replace(searchRe, replacement);
      writeFileSync(targetPath, content, "utf-8");
      console.log(`[SUCCESS] Injected Aggressive Stealth into ${name}`);
    } else {
      console.log(`[SKIPPED] Pattern not found in ${name} or already injected`);
    }
  } catch (e: any) {
    console.log(`[ERROR] Processing ${name} - ${e.message}`);
  }
}

// 1. Ghost Pro
inject(
  ghostProPath,
  /return\s*currentResult;/g,
  "currentResult = executeAggressiveStealthPostProcessing(currentResult);\n    return currentResult;",
  "Ghost Pro"
);

// 2. Ghost Mini (in humanizer.ts)
inject(
  humanizerPath,
  /if\s*\(\(mode === "ghost_mini" \|\| mode === "ghost_pro"\)\s*&&\s*enablePostProcessing\)\s*\{\s*currentResult = postProcess\(currentResult\);\s*\}/g,
  `if ((mode === "ghost_mini" || mode === "ghost_pro") && enablePostProcessing) {
      currentResult = postProcess(currentResult);
      currentResult = executeAggressiveStealthPostProcessing(currentResult);
    }`,
  "Humanizer (Ghost Mini)"
);

// 3. Ninja (in llm-humanizer.ts)
inject(
  llmHumanizerPath,
  /return\s*result\.trim\(\);/g,
  "result = executeAggressiveStealthPostProcessing(result);\n\n    return result.trim();",
  "LLM Humanizer (Ninja)"
);
