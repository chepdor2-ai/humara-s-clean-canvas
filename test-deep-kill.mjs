// Test all Deep Kill engines
const TEXT = `I. INTRODUCTION

Over the past three to four decades, Washington, D.C. has experienced significant urban transformation shaped by economic restructuring, demographic change, and shifting policy priorities. Once characterized by high levels of concentrated poverty and racial segregation, particularly in neighborhoods east of the Anacostia River, the city has increasingly undergone redevelopment and reinvestment. This transformation has been driven by key urban processes such as gentrification, the transition to a post-industrial economy, and the suburbanization of both wealth and poverty. While these changes have contributed to economic growth and urban revitalization, they have also intensified inequality, reshaping the spatial and social organization of the city.

This paper provides a data-driven analysis of these changes using census data, American Community Survey (ACS) indicators, and spatial mapping tools. The focus is on identifying and interpreting patterns related to poverty, immigration, housing, and crime across Washington, D.C. neighborhoods. By incorporating maps and statistical indicators, the analysis highlights how these variables have evolved over time and how they are distributed unevenly across space. Particular attention is given to the relationship between rising housing costs, demographic shifts, and changing neighborhood characteristics.

The analysis is guided by key sociological concepts, including neighborhood effects and structural inequality. The idea of neighborhood effects suggests that where individuals live significantly influences their life chances, shaping access to resources, opportunities, and social networks. However, as Slater (2013) argues, these patterns are deeply rooted in broader structural forces rather than simply the characteristics of neighborhoods themselves. This perspective emphasizes that urban inequality is not accidental but produced through economic systems and policy decisions that determine who benefits from urban change.

II. CONCENTRATED POVERTY & SUBURBANIZATION

Washington, D.C.'s spatial structure has been heavily influenced by suburbanization patterns that emerged during the late twentieth century. Between 1980 and 2000, large numbers of white and middle-class residents moved out of the city and into surrounding suburban areas in Maryland and Virginia. This migration was driven by factors such as housing affordability, access to larger homes, and perceived improvements in suburban living conditions. Meanwhile, many Black and low-income populations remained within the city, particularly in historically disadvantaged neighborhoods. This shift contributed to increasing levels of racial and economic segregation, reinforcing patterns of concentrated poverty within specific areas of Washington, D.C.
Over time, the racial and spatial composition of the city began to change, but these changes did not eliminate inequality. Instead, Washington, D.C. became more diverse while remaining deeply unequal. In recent decades, a process often described as the suburbanization of poverty has emerged, where lower-income populations have gradually moved outward into suburban areas due to rising housing costs in the urban core. As a result, poverty has not disappeared but has been redistributed across the metropolitan region.

A clear example of concentrated poverty can be found in Southeast Washington, particularly in neighborhoods such as Anacostia. These areas have historically exhibited poverty rates exceeding 30 percent, along with high unemployment and limited access to economic opportunities and social services. The persistence of these conditions reflects long-standing structural inequalities rather than temporary economic fluctuations.

The relationship between poverty and crime in these neighborhoods is complex. While higher levels of crime are often observed in disadvantaged areas, research suggests that poverty itself is not a direct cause of crime. Instead, Sampson and Raudenbush (2001) argue that both crime and disorder stem from underlying structural factors such as concentrated disadvantage and weak social institutions. This perspective challenges simplified assumptions about urban crime and highlights the importance of broader social conditions.

Urban policy responses have attempted to address concentrated poverty, most notably through housing redevelopment initiatives such as the HOPE VI program. These policies aimed to reduce poverty concentration by replacing public housing with mixed-income developments. While such initiatives have reduced visible signs of poverty, they have also led to significant displacement of low-income residents and the disruption of established community networks. As a result, these policies often shift poverty rather than resolving its root causes.

III. POST-INDUSTRIAL URBANISM

Washington, D.C.'s transformation into a post-industrial city is closely tied to the decline of its manufacturing and industrial base. Like many U.S. cities, D.C. experienced a reduction in industrial employment during the late twentieth century, leading to the loss of stable, working-class jobs. This shift disproportionately affected low-income residents, particularly those without access to higher education or specialized skills. As manufacturing opportunities disappeared, many workers faced unemployment or were pushed into lower-paying service sector jobs.
The decline of industrial employment contributed to rising inequality and the concentration of disadvantage in certain neighborhoods. Without access to stable employment, many residents experienced economic hardship, reinforcing patterns of poverty identified in earlier decades. This transition marked a shift from an industrial to a service-based economy, fundamentally altering the structure of employment within the city.

At the same time, Washington, D.C. began to develop a post-industrial economy centered on government, technology, and professional services. The growth of what is often referred to as the creative class brought an influx of highly educated workers into the city. These individuals were drawn by employment opportunities, urban amenities, and proximity to political and economic institutions. As a result, neighborhoods that once experienced decline began to attract new investment and population growth.

Urban policy played a key role in facilitating this transformation. City leaders implemented strategies aimed at promoting economic growth, including downtown redevelopment projects, investments in entertainment and tourism infrastructure, and tax incentives for private developers. These policies reflect broader neoliberal approaches to urban governance, where cities compete for investment by creating favorable conditions for business and capital.

However, the benefits of post-industrial growth have not been evenly distributed. While highly educated professionals have benefited from new economic opportunities, many low-income residents have been excluded from these gains. Rising housing costs, limited access to high-paying jobs, and ongoing structural inequalities have reinforced divisions within the city. As a result, Washington, D.C.'s transformation into a post-industrial economy has both revitalized the city and intensified existing inequalities.`;

const ENGINES = [
  'ninja_2',
  'ninja_3', 
  'ninja_4',
  'ninja_5',
  'ghost_trial_2',
  'ghost_trial_2_alt',
  'conscusion_1',
  'conscusion_12',
];

async function testEngine(engineId) {
  const body = {
    text: TEXT,
    engine: engineId,
    strength: 'strong',
    tone: 'academic',
    strict_meaning: false,
  };

  console.log(`\n${'='.repeat(80)}`);
  console.log(`ENGINE: ${engineId}`);
  console.log(`${'='.repeat(80)}`);

  const start = Date.now();
  try {
    const res = await fetch('http://localhost:3001/api/humanize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (data.success) {
      console.log(`STATUS: SUCCESS | TIME: ${elapsed}s | ENGINE_USED: ${data.engine_used || engineId}`);
      console.log(`WORD_COUNT: ${data.word_count || 'N/A'}`);
      console.log(`---OUTPUT---`);
      console.log(data.humanized);
    } else {
      console.log(`STATUS: FAILED | TIME: ${elapsed}s | ERROR: ${data.error}`);
    }
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`STATUS: EXCEPTION | TIME: ${elapsed}s | ERROR: ${err.message}`);
  }
}

(async () => {
  console.log(`Testing ${ENGINES.length} Deep Kill engines...`);
  console.log(`Input text: ${TEXT.split(/\s+/).length} words\n`);

  for (const eng of ENGINES) {
    await testEngine(eng);
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('ALL TESTS COMPLETE');
  console.log(`${'='.repeat(80)}`);
})();
