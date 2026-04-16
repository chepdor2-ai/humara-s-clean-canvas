import { stealthHumanize } from './humanizer-engine/frontend/lib/engine/stealth/index';

const text = `I. INTRODUCTION (≈280 words)

Over the past three to four decades, Washington, D.C. has experienced significant urban transformation shaped by economic restructuring, demographic change, and shifting policy priorities. Once characterized by high levels of concentrated poverty and racial segregation, particularly in neighborhoods east of the Anacostia River, the city has increasingly undergone redevelopment and reinvestment. This transformation has been driven by key urban processes such as gentrification, the transition to a post-industrial economy, and the suburbanization of both wealth and poverty. While these changes have contributed to economic growth and urban revitalization, they have also intensified inequality, reshaping the spatial and social organization of the city.

This paper provides a data-driven analysis of these changes using census data, American Community Survey (ACS) indicators, and spatial mapping tools. The focus is on identifying and interpreting patterns related to poverty, immigration, housing, and crime across Washington, D.C. neighborhoods. By incorporating maps and statistical indicators, the analysis highlights how these variables have evolved over time and how they are distributed unevenly across space. Particular attention is given to the relationship between rising housing costs, demographic shifts, and changing neighborhood characteristics.

The analysis is guided by key sociological concepts, including neighborhood effects and structural inequality. The idea of neighborhood effects suggests that where individuals live significantly influences their life chances, shaping access to resources, opportunities, and social networks. However, as Slater (2013) argues, these patterns are deeply rooted in broader structural forces rather than simply the characteristics of neighborhoods themselves. This perspective emphasizes that urban inequality is not accidental but produced through economic systems and policy decisions that determine who benefits from urban change.`;

console.log("=== NURU 2.0 TEST RUN ===");
const start = Date.now();
const result = stealthHumanize(text, 'medium', 'academic', 15);
const duration = Date.now() - start;

console.log("\n=== ORIGINAL ===");
console.log(text);
console.log(`\n=== OUTPUT (${duration}ms) ===`);
console.log(result);
