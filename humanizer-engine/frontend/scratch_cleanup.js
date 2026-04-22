const fs = require('fs');
const filename = "c:/Users/User/Documents/GitHub/New folder/humara-s-clean-canvas/humanizer-engine/frontend/lib/engine/premium-humanizer.ts";
let content = fs.readFileSync(filename, "utf-8");
const startKeyword = "Running strict LLM punctuation cleanup...";
const idx = content.indexOf(startKeyword);
if (idx !== -1) {
    const lines = content.split('\n');
    let startRemove = -1;
    let endRemove = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("STRICT LLM PUNCTUATION/CAPITALIZATION CLEANUP")) {
            startRemove = i - 1; // get the previous comment line
        }
        if (startRemove !== -1 && i > startRemove && lines[i].includes("FINAL CAPITALIZATION ENFORCEMENT")) {
            endRemove = i - 2;
            break;
        }
    }
    if (startRemove !== -1 && endRemove !== -1) {
        lines.splice(startRemove, endRemove - startRemove + 1);
        fs.writeFileSync(filename, lines.join('\n'), "utf-8");
        console.log("Successfully removed block.");
    }
}
