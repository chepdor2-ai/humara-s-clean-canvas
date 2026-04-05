/*  ═══════════════════════════════════════════════════════════════════
    STEALTH WRITER MODULE — Phrase-Level Academic Paraphrasing
    ────────────────────────────────────────────────────────
    Processes each sentence through 4 phases:
      Phase 1: Phrase-level paraphrasing (multi-word expression rewording)
      Phase 2: Structural simplification (complex → simpler constructions)
      Phase 3: Connector/transition variation (natural academic swaps)
      Phase 4: Register balancing (micro-downgrade overly formal words)

    Designed to produce output similar to professional paraphrasing
    engines that rewrite at phrase level rather than word-by-word.
    ═══════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════
// PHASE 1: ACADEMIC PHRASE PARAPHRASES
// Multi-word expressions → natural academic alternatives
// ═══════════════════════════════════════════

export const STEALTH_PHRASES = {
  // ── Purpose/Aim expressions ──
  'the primary purpose of':          ['the main aim of', 'the central goal of', 'the chief objective of'],
  'the primary aim of':              ['the main purpose of', 'the key objective of', 'the central goal of'],
  'the main purpose of':             ['the primary aim of', 'the key objective of', 'the core goal of'],
  'the secondary purpose of':        ['the second aim of', 'the additional goal of', 'the supporting objective of'],
  'the purpose of this study':       ['the aim of this research', 'the goal of this work', 'the objective of this investigation'],
  'the aim of this study':           ['the goal of this research', 'the purpose of this work', 'the objective of this investigation'],
  'this study aims to':              ['this research seeks to', 'this work sets out to', 'this investigation intends to'],
  'this study seeks to':             ['this research aims to', 'this work attempts to', 'this investigation strives to'],
  'the study aims to':               ['the research seeks to', 'the work intends to', 'the investigation sets out to'],
  'the research aims to':            ['the study sets out to', 'the work seeks to', 'the investigation attempts to'],
  'aims to determine':               ['seeks to establish', 'sets out to find', 'intends to ascertain'],
  'aims to measure':                 ['seeks to quantify', 'sets out to assess', 'intends to gauge'],
  'aims to identify':                ['seeks to determine', 'sets out to recognize', 'intends to pinpoint'],
  'aims to examine':                 ['seeks to investigate', 'sets out to explore', 'intends to study'],
  'aims to analyze':                 ['seeks to examine', 'sets out to investigate', 'intends to assess'],
  'is to compare':                   ['is to contrast', 'is to assess', 'is to weigh'],
  'is to examine':                   ['is to investigate', 'is to look into', 'is to explore'],
  'the goal is to':                  ['the aim is to', 'the objective is to', 'the intention is to'],

  // ── Method/Approach expressions ──
  'by employing':                    ['by using', 'through the use of', 'by applying'],
  'by utilizing':                    ['by using', 'through the use of', 'by making use of'],
  'by conducting':                   ['by carrying out', 'by performing', 'through the execution of'],
  'a controlled quasi-experimental design': ['a controlled quasi-experimental approach', 'a quasi-experimental methodology', 'a controlled comparative design'],
  'measure and analyze':             ['quantify and test', 'assess and evaluate', 'gauge and examine'],
  'measure and evaluate':            ['assess and test', 'quantify and examine', 'gauge and appraise'],
  'following exposure to':           ['after exposure to', 'upon encountering', 'after being presented with'],

  // ── Comparison/Evaluation expressions ──
  'compare the effectiveness of':    ['assess the effectiveness of', 'weigh the effectiveness of', 'evaluate the performance of'],
  'offer superior benefits compared to': ['have a better advantage over', 'provide greater value than', 'present stronger benefits than'],
  'offer superior benefits':         ['provide greater advantages', 'present better outcomes', 'yield stronger results'],
  'compared to traditional':         ['in contrast to traditional', 'relative to traditional', 'when measured against traditional'],
  'outperform':                      ['surpass', 'exceed the performance of', 'do better than'],
  'whether technological convenience translates into': ['whether technological convenience is converted to', 'whether the convenience of technology leads to', 'if technological ease results in'],
  'translates into':                 ['is converted to', 'leads to', 'results in', 'gives rise to'],
  'still hold greater':              ['remain more valuable in terms of', 'continue to carry more', 'retain greater'],

  // ── Understanding/Knowledge expressions ──
  'provides valuable insight into':  ['is a good insight into', 'offers useful understanding of', 'gives meaningful awareness of'],
  'provides insight into':           ['offers understanding of', 'gives awareness of', 'sheds light on'],
  'valuable insight':                ['good insight', 'useful understanding', 'meaningful awareness'],
  'a more comprehensive understanding of': ['a more complete knowledge of', 'a fuller picture of', 'a more thorough grasp of'],
  'comprehensive understanding':     ['complete knowledge', 'thorough grasp', 'full picture'],
  'understanding of how':            ['knowledge of how', 'awareness of how', 'grasp of how'],
  'a deeper understanding':          ['a better grasp', 'a fuller knowledge', 'a more complete picture'],

  // ── Research/Evidence expressions ──
  'is grounded in':                  ['is based on', 'draws from', 'rests on', 'is rooted in'],
  'an extensive body of':            ['a large amount of', 'a substantial collection of', 'a considerable body of'],
  'prior research':                  ['earlier studies', 'previous work', 'past investigations'],
  'prior research that examines':    ['earlier work that investigates', 'previous studies that explore', 'past research that looks into'],
  'examines how':                    ['investigates the way', 'explores how', 'looks into how'],
  'highlight the growing significance of': ['emphasize the increasing importance of', 'point to the rising value of', 'stress the growing weight of'],
  'the growing significance of':     ['the increasing importance of', 'the rising value of', 'the growing weight of'],
  'growing significance':            ['increasing importance', 'rising value', 'expanding relevance'],
  'provide compelling evidence':     ['offer strong evidence', 'present solid proof', 'give convincing support'],
  'compelling evidence supporting':  ['convincing proof for', 'strong support for', 'solid evidence backing'],
  'compelling evidence':             ['strong evidence', 'convincing proof', 'solid support'],
  'demonstrating their effectiveness': ['showing that they are effective', 'proving their value', 'confirming their usefulness'],
  'an extensive body of prior research': ['a large amount of previous research', 'a substantial body of earlier work', 'a wide range of prior studies'],

  // ── Construct/Concept expressions ──
  'a multidimensional construct that encompasses': ['a multidimensional concept that involves', 'a complex idea that includes', 'a multi-layered construct that covers'],
  'a multidimensional construct':    ['a multidimensional concept', 'a complex idea', 'a multi-layered notion'],
  'encompasses emotional':           ['involves both emotional', 'includes emotional', 'covers emotional'],
  'encompasses':                     ['involves', 'includes', 'covers', 'spans'],

  // ── Learning/Education expressions ──
  'student learning and retention':  ['learning and retention among students', 'student acquisition and recall', 'learner performance and memory'],
  'technology-based study tools':    ['technology-based learning tools', 'digital study instruments', 'technology-driven learning aids'],
  'technology-based':                ['technology-driven', 'digital', 'computer-based'],
  'study tools':                     ['learning tools', 'study instruments', 'learning aids'],
  'study habits':                    ['study behavior', 'learning patterns', 'study routines'],
  'in fostering autonomy':           ['in promoting the sense of autonomy', 'in developing independence', 'in building self-direction'],
  'self-regulated study habits':     ['self-regulated study behavior', 'self-directed learning habits', 'independent study patterns'],
  'in facilitating deep processing': ['in promoting deep processing', 'in supporting thorough analysis', 'in enabling careful examination'],
  'long-term retention':             ['long-term memory', 'lasting recall', 'enduring retention'],
  'durable learning and recall':     ['long term learning and recollection', 'lasting understanding and memory', 'enduring knowledge and recall'],
  'durable learning':                ['long-term learning', 'lasting understanding', 'enduring knowledge'],
  'cognitive processes such as':     ['cognitive processes, including', 'cognitive operations like', 'mental processes such as'],
  'deeper learning':                 ['enhanced learning', 'richer understanding', 'more thorough comprehension'],
  'promotes persistence and enjoyment in learning': ['encourages persistence as well as enjoyment in the learning process', 'fosters both stamina and pleasure in education', 'supports sustained effort and satisfaction in learning'],
  'persistence and enjoyment in learning': ['persistence as well as enjoyment in the learning process', 'sustained effort and satisfaction in education', 'stamina and pleasure in learning'],

  // ── Theory/Framework expressions ──
  'this focus aligns with':          ['this attention is consistent with', 'this emphasis agrees with', 'this direction matches'],
  'aligns with':                     ['is consistent with', 'agrees with', 'corresponds to', 'matches'],
  'emphasizes the management of':    ['insists on management of', 'stresses the handling of', 'focuses on controlling'],
  'limited working memory capacity': ['the small working memory capacity', 'the restricted capacity of working memory', 'the finite working memory space'],
  'limited working memory':          ['restricted working memory', 'finite working memory', 'bounded working memory'],
  'a balanced framework':            ['a moderate structure', 'a fair basis', 'an even-handed approach'],
  'balanced framework':              ['moderate structure', 'fair basis', 'even-handed approach'],
  'provides a balanced framework for evaluating': ['offers a moderate structure for assessing', 'gives a fair basis for judging', 'presents an even-handed approach to evaluating'],
  'synthesizing these perspectives': ['combining these views', 'bringing these viewpoints together', 'merging these outlooks'],

  // ── Contribution expressions ──
  'the findings will contribute to': ['the results will also be added to', 'the outcomes will feed into', 'the results will strengthen'],
  'will contribute to':              ['will add to', 'will feed into', 'will strengthen', 'will support'],
  'contributes to a more':           ['adds to a more', 'supports a more', 'feeds into a more'],
  'this research contributes to':    ['this study adds to', 'this work supports', 'this investigation strengthens'],
  'seeks to enhance academic outcomes': ['will aim at improving the academic performance', 'strives to improve academic results', 'works toward better academic achievement'],
  'seeks to enhance':                ['will aim at improving', 'strives to improve', 'works toward improving'],
  'the most effective methods for promoting': ['the best approaches in fostering', 'the strongest techniques for building', 'the most suitable ways of encouraging'],
  'the most effective methods':       ['the best approaches', 'the most suitable techniques', 'the strongest methods'],
  'academic success':                ['academic achievement', 'academic performance', 'scholastic accomplishment'],

  // ── Engagement/Motivation expressions ──
  'examine students\' attitudes':    ['investigate the attitudes of students', 'look into student perceptions', 'explore the views of students'],
  'engagement levels and motivation': ['involvement and motivation', 'participation levels and drive', 'engagement and impetus'],
  'how digital interfaces, interactivity, and immediate feedback features influence': ['the effects of digital interfaces, interactivity and immediate feedback features on', 'how digital design, interaction and instant feedback affect', 'the influence of digital interfaces, interactivity and prompt feedback on'],
  'influence student motivation':    ['affect student motivation', 'shape learner drive', 'impact student engagement'],
  'compared to the tactile and reflective nature of': ['in contrast to the tangible and contemplative qualities of', 'relative to the hands-on and thoughtful character of', 'when measured against the physical and reflective quality of'],
  'tactile and reflective nature':   ['tangible and contemplative qualities', 'hands-on and thoughtful character', 'physical and reflective quality'],
  'understanding these affective responses is essential for': ['it is important to understand these affective reactions for', 'knowledge of these emotional responses is crucial for', 'grasping these affective reactions matters for'],
  'affective responses':             ['affective reactions', 'emotional responses', 'attitudinal reactions'],
  'maximize engagement and performance': ['boost both engagement and performance', 'improve engagement and results', 'enhance involvement and outcomes'],

  // ── Evidence/Support expressions ──
  'responds to recent':              ['is a response to recent', 'answers recent', 'addresses recent'],
  'research calling for':            ['studies that demand', 'research that seeks', 'work that asks for'],
  'more nuanced analyses':           ['more detailed studies', 'finer-grained analyses', 'more thorough examinations'],
  'nuanced analyses':                ['detailed studies', 'thorough examinations', 'fine-grained assessments'],
  'aspires to inform':               ['hopes to enlighten', 'aims to guide', 'seeks to shape'],
  'inform balanced strategies':      ['guide balanced approaches', 'shape even-handed strategies', 'influence well-rounded methods'],
  'enhance both cognitive and motivational dimensions': ['increase both cognitive and motivational aspects', 'improve both thinking and motivational elements', 'strengthen both cognitive and drive-related factors'],
  'cognitive and motivational dimensions': ['cognitive and motivational aspects', 'thinking and motivational elements', 'intellectual and drive-related factors'],

  // ── Association/Relationship expressions ──
  'closely associated with':         ['closely related to', 'tightly linked to', 'strongly connected to'],
  'has been linked to':              ['has been found to be associated with', 'has been connected to', 'has been tied to'],
  'linked to improved':              ['associated with better', 'connected to improved', 'tied to enhanced'],
  'improved cognitive encoding':     ['better cognitive encoding', 'stronger memory encoding', 'enhanced mental encoding'],
  'promote accessibility and interactivity': ['facilitate accessibility and interactivity', 'support access and interaction', 'enable ease of use and engagement'],
  'offering advantages in scalability and instant feedback': ['having the benefit of scalability and real-time feedback', 'providing scalability and immediate response', 'allowing for expansion and prompt feedback'],
  'advantages in scalability':       ['the benefit of scalability', 'scalability benefits', 'expansion advantages'],
  'instant feedback':                ['real-time feedback', 'immediate response', 'prompt feedback'],
  'that traditional approaches lack': ['which traditional methods do not provide', 'that conventional approaches do not offer', 'that standard methods are missing'],
  'traditional approaches lack':     ['traditional methods do not provide', 'conventional approaches do not offer', 'standard practices do not support'],

  // ── Candidate/Examination expressions ──
  'strong candidates for examination': ['good candidates to be investigated', 'suitable subjects for investigation', 'worthy targets for study'],
  'making them strong candidates':   ['which makes them good candidates', 'positioning them as suitable subjects', 'rendering them worthy targets'],

  // ── Impact/Effect expressions ──
  'impact cognitive performance':    ['have on cognitive performance', 'affect cognitive functioning', 'influence mental performance'],
  'well-established physical methods': ['well-established physical tools', 'proven physical approaches', 'traditional physical techniques'],
  'how learning tool design influences': ['how the design of learning tools affects', 'the way learning tool design shapes', 'how tool design impacts'],
  'learning tool design influences': ['the design of learning tools affects', 'tool design shapes', 'how tools are designed impacts'],

  // ── General academic expressions ──
  'the rationale for':               ['the reasoning behind', 'the basis for', 'the logic behind'],
  'it is essential for':             ['it is important for', 'it matters for', 'it is necessary for'],
  'is essential for educators':      ['matters for educators', 'is important for instructors', 'is necessary for teachers'],
  'in higher education':             ['in university settings', 'in tertiary education', 'at the college level'],
  'learner preferences and contexts': ['the preferences and settings of learners', 'student needs and environments', 'learner needs and circumstances'],
  'through this dual focus on':      ['through this dual emphasis on', 'by this combined attention to', 'via this two-pronged focus on'],
  'dual focus':                      ['dual emphasis', 'combined attention', 'two-pronged focus'],

  // ── Evidence evaluation expressions ──
  'provide compelling evidence supporting traditional study methods': ['strongly argue in favor of traditional study techniques', 'give solid support for conventional study approaches', 'offer convincing evidence for standard study methods'],
  'by integrating these empirical insights': ['by combining these empirical findings', 'through the synthesis of these research results', 'by bringing together these data-driven conclusions'],
  'integrating these empirical insights': ['combining these empirical findings', 'synthesizing these research results', 'drawing together these data-driven conclusions'],
  'empirical insights':              ['empirical findings', 'research results', 'data-driven conclusions'],

  // ── Heading transformations ──
  'purpose of the study':            ['study objective', 'research purpose', 'aim of the study'],
  'support from literature':         ['literary support', 'evidence from the literature', 'foundation in prior work'],

  // ── More academic paraphrases ──
  'it is widely recognized that':    ['it is generally accepted that', 'it is broadly acknowledged that', 'there is wide agreement that'],
  'a growing body of research':      ['an increasing number of studies', 'expanding research', 'a rising volume of work'],
  'body of research':                ['collection of studies', 'set of investigations', 'range of research'],
  'serves as a foundation for':      ['forms the basis for', 'underpins', 'provides the groundwork for'],
  'pedagogical practices':           ['teaching methods', 'instructional approaches', 'educational practices'],
  'offers a more balanced':          ['provides a more even-handed', 'gives a more moderate', 'presents a more fair'],
  'cognitive value':                 ['intellectual worth', 'mental benefit', 'thinking value'],
  'cognitive load theory':           ['cognitive load theory', 'the cognitive load framework', 'cognitive load principles'],
  'working memory capacity':         ['working memory space', 'short-term memory limits', 'active memory capacity'],
  'structured learning activities':  ['organized learning tasks', 'planned educational activities', 'systematic learning exercises'],
  'learning and retention':          ['acquisition and recall', 'understanding and memory', 'comprehension and retention'],
  'memory encoding':                 ['encoding of memories', 'the process of encoding memory', 'memory formation'],
  'the effects of media on information processing': ['the influence of media in information processing', 'how media affect the processing of information', 'media effects on information handling'],
  'effects of media':                ['influence of media', 'media effects', 'impact of media'],
  'performance differences':         ['differences in performance', 'variations in results', 'performance gaps'],
};

// Pre-compile for performance — longest phrases first
const STEALTH_PHRASE_ENTRIES = Object.entries(STEALTH_PHRASES)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, alts]) => ({
    re: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
    alts,
  }));


// ═══════════════════════════════════════════
// PHASE 2: STRUCTURAL SIMPLIFICATION
// Complex constructions → simpler academic forms
// ═══════════════════════════════════════════

const STEALTH_STRUCTURES = [
  // "By employing/using X, the research/study aims to Y" → "The study will use X to Y"
  {
    re: /^By\s+(employing|using|utilizing|adopting|applying|conducting)\s+(.+?),\s+(?:the\s+)?(research|study|work|investigation|paper)\s+(?:aims|seeks|intends|attempts|sets out)\s+to\s+(.+)$/i,
    apply: (m) => {
      const verbs = ['will use', 'will employ', 'will apply', 'will adopt'];
      const v = verbs[Math.floor(Math.random() * verbs.length)];
      return `The ${m[3].toLowerCase()} ${v} ${m[2]} to ${m[4]}`;
    }
  },
  // "By examining/analyzing X, Y" → "Through the examination of X, Y"
  {
    re: /^By\s+(examining|analyzing|investigating|exploring|studying|considering|reviewing)\s+(.+?),\s+(.+)$/i,
    apply: (m) => {
      const nounMap = {
        examining: 'examination', analyzing: 'analysis', investigating: 'investigation',
        exploring: 'exploration', studying: 'study', considering: 'consideration',
        reviewing: 'review'
      };
      const noun = nounMap[m[1].toLowerCase()] || m[1];
      if (Math.random() < 0.5) {
        return `Through the ${noun} of ${m[2]}, ${m[3]}`;
      }
      return `The ${noun} of ${m[2]} allows ${m[3].charAt(0).toLowerCase() + m[3].slice(1)}`;
    }
  },
  // "Understanding/Examining X provides/gives Y" → "The knowledge/study of X is/offers Y"
  {
    re: /^(Understanding|Examining|Analyzing|Investigating|Studying|Recognizing|Knowing)\s+(.+?)\s+(provides?|gives?|offers?|yields?|produces?)\s+(.+)$/i,
    apply: (m) => {
      const nounMap = {
        understanding: 'knowledge', examining: 'examination', analyzing: 'analysis',
        investigating: 'investigation', studying: 'study', recognizing: 'recognition',
        knowing: 'awareness'
      };
      const noun = nounMap[m[1].toLowerCase()] || m[1].toLowerCase();
      return `The ${noun} of ${m[2]} is ${m[4]}`;
    }
  },
  // "X, such as Y—Z—offer/provide W" → "X (Y, Z) offer/provide W" (em-dash → parens)
  {
    re: /(.+?)(?:—|--|–)(?:such as\s+)?(.+?)(?:—|--|–)((?:offer|provide|give|yield|present|create|produce|have|show|demonstrate|can)\w*\s+.+)$/i,
    apply: (m) => `${m[1]} (${m[2].trim()}) ${m[3].trim()}`
  },
  // "X is/are considered to be a key/important/critical Y" → "X is/are a key/important Y"
  {
    re: /(.+?)\s+(?:is|are)\s+(?:widely|generally|commonly|often|typically)?\s*considered\s+(?:to be\s+)?(.+)$/i,
    apply: (m) => {
      if (Math.random() < 0.5) return `${m[1]} is ${m[2]}`;
      return null; // skip sometimes
    }
  },
  // "X seek(s) to enhance/improve Y by Z" → "X will aim at improving Y through Z"
  {
    re: /(.+?)\s+seeks?\s+to\s+(enhance|improve|increase|strengthen|boost|advance|expand|promote|develop)\s+(.+?)(?:\s+by\s+(.+))?$/i,
    apply: (m) => {
      const verbMap = {
        enhance: 'improving', improve: 'bettering', increase: 'raising',
        strengthen: 'reinforcing', boost: 'increasing', advance: 'furthering',
        expand: 'broadening', promote: 'advancing', develop: 'building'
      };
      const gerund = verbMap[m[2].toLowerCase()] || m[2] + 'ing';
      const suffix = m[4] ? ` through ${m[4]}` : '';
      return `${m[1]} will aim at ${gerund} ${m[3]}${suffix}`;
    }
  },
  // "The findings/results suggest/indicate/show that X" → "The data/evidence points to X"
  {
    re: /^(?:The\s+)?(findings|results|data|evidence|outcomes|conclusions)\s+(suggest|indicate|show|demonstrate|reveal|confirm|point to)\s+that\s+(.+)$/i,
    apply: (m) => {
      const nounAlts = { findings: 'results', results: 'findings', data: 'evidence', evidence: 'data', outcomes: 'results', conclusions: 'findings' };
      const noun = nounAlts[m[1].toLowerCase()] || m[1];
      const verbAlts = ['suggest that', 'indicate that', 'point to the fact that', 'show that'];
      const verb = verbAlts[Math.floor(Math.random() * verbAlts.length)];
      return `The ${noun} ${verb} ${m[3]}`;
    }
  },
];


// ═══════════════════════════════════════════
// PHASE 3: CONNECTOR/TRANSITION VARIATION
// Natural academic discourse marker swaps
// ═══════════════════════════════════════════

const STEALTH_CONNECTORS = [
  // Sentence-initial connectors (include comma/space handling)
  { re: /^Additionally,?\s+/i,      alts: ['Also, ', 'In addition, ', 'Besides this, ', 'What is more, '] },
  { re: /^Furthermore,?\s+/i,       alts: ['Moreover, ', 'In addition, ', 'Beyond this, ', 'Equally, '] },
  { re: /^Moreover,?\s+/i,          alts: ['Furthermore, ', 'In addition, ', 'Besides, ', 'What is more, '] },
  { re: /^Ultimately,?\s+/i,        alts: ['Finally, ', 'In the end, ', 'At the end of it all, ', 'Last of all, '] },
  { re: /^Conversely,?\s+/i,        alts: ['On the other hand, ', 'In contrast, ', 'By way of contrast, ', 'Then again, '] },
  { re: /^Consequently,?\s+/i,      alts: ['As a result, ', 'Because of this, ', 'For this reason, ', 'It follows that '] },
  { re: /^Nevertheless,?\s+/i,      alts: ['Even so, ', 'All the same, ', 'Despite this, ', 'Still, '] },
  { re: /^Nonetheless,?\s+/i,       alts: ['Even so, ', 'Still, ', 'All the same, ', 'In spite of this, '] },
  { re: /^Hence,?\s+/i,             alts: ['Therefore, ', 'For this reason, ', 'As a result, ', 'Thus, '] },
  { re: /^Thus,?\s+/i,              alts: ['Therefore, ', 'In this way, ', 'As a result, ', 'Accordingly, '] },
  { re: /^Notably,?\s+/i,           alts: ['In particular, ', 'Significantly, ', 'Of note, ', 'Importantly, '] },
  { re: /^Specifically,?\s+/i,      alts: ['In particular, ', 'More precisely, ', 'To be exact, ', 'To specify, '] },
  { re: /^Similarly,?\s+/i,         alts: ['In the same way, ', 'Likewise, ', 'Along similar lines, ', 'Comparably, '] },
  { re: /^Likewise,?\s+/i,          alts: ['Similarly, ', 'In the same way, ', 'Along the same lines, ', 'Equally, '] },
  { re: /^Importantly,?\s+/i,       alts: ['Significantly, ', 'Of importance, ', 'Crucially, ', 'Notably, '] },
  { re: /^Significantly,?\s+/i,     alts: ['Importantly, ', 'Notably, ', 'Of significance, ', 'Remarkably, '] },
  { re: /^Interestingly,?\s+/i,     alts: ['Of interest, ', 'Curiously, ', 'What stands out is that ', 'It is worth noting that '] },
  { re: /^Evidently,?\s+/i,         alts: ['Clearly, ', 'Apparently, ', 'As can be seen, ', 'It is apparent that '] },
  { re: /^Undoubtedly,?\s+/i,       alts: ['Without question, ', 'Certainly, ', 'There is no doubt that ', 'Unquestionably, '] },
  { re: /^In particular,?\s+/i,     alts: ['Specifically, ', 'Especially, ', 'Above all, ', 'Most notably, '] },
  { re: /^In contrast,?\s+/i,       alts: ['By comparison, ', 'On the other hand, ', 'Conversely, ', 'Unlike this, '] },
  { re: /^On the contrary,?\s+/i,   alts: ['Rather, ', 'Instead, ', 'In contrast, ', 'Quite the opposite, '] },
  { re: /^As a result,?\s+/i,       alts: ['Consequently, ', 'Because of this, ', 'For this reason, ', 'This leads to '] },
  { re: /^In summary,?\s+/i,        alts: ['To sum up, ', 'Overall, ', 'On the whole, ', 'Taken together, '] },
  { re: /^In conclusion,?\s+/i,     alts: ['To conclude, ', 'All in all, ', 'Overall, ', 'Bringing it all together, '] },
  { re: /^To this end,?\s+/i,       alts: ['For this purpose, ', 'With this goal, ', 'Toward this aim, ', 'In pursuit of this, '] },
];


// ═══════════════════════════════════════════
// PHASE 4: REGISTER BALANCING
// Micro-downgrade overly formal/AI-typical words
// to slightly less formal but still academic alternatives
// ═══════════════════════════════════════════

export const STEALTH_REGISTER = {
  // ── AI-typical formal → natural academic ──
  'valuable':       ['good', 'useful', 'worthwhile', 'helpful'],
  'extensive':      ['large', 'broad', 'wide', 'substantial'],
  'compelling':     ['strong', 'convincing', 'persuasive', 'solid'],
  'nuanced':        ['detailed', 'subtle', 'fine-grained', 'refined'],
  'construct':      ['concept', 'idea', 'notion', 'framework'],
  'encompasses':    ['involves', 'includes', 'covers', 'takes in'],
  'paramount':      ['crucial', 'critical', 'vital', 'key'],
  'pivotal':        ['key', 'central', 'critical', 'important'],
  'multifaceted':   ['complex', 'varied', 'many-sided', 'diverse'],
  'myriad':         ['many', 'numerous', 'various', 'a range of'],
  'plethora':       ['abundance', 'wealth', 'range', 'variety'],
  'underscore':     ['highlight', 'stress', 'emphasize', 'show'],
  'underscores':    ['highlights', 'stresses', 'emphasizes', 'shows'],
  'elucidate':      ['clarify', 'explain', 'make clear', 'illuminate'],
  'elucidates':     ['clarifies', 'explains', 'makes clear', 'illuminates'],
  'delineate':      ['outline', 'describe', 'define', 'map out'],
  'delineates':     ['outlines', 'describes', 'defines', 'maps out'],
  'necessitate':    ['require', 'call for', 'demand', 'need'],
  'necessitates':   ['requires', 'calls for', 'demands', 'needs'],
  'ubiquitous':     ['common', 'widespread', 'ever-present', 'pervasive'],
  'salient':        ['key', 'main', 'notable', 'important'],
  'propensity':     ['tendency', 'inclination', 'likelihood', 'leaning'],
  'exacerbate':     ['worsen', 'intensify', 'aggravate', 'make worse'],
  'exacerbates':    ['worsens', 'intensifies', 'aggravates', 'makes worse'],
  'ameliorate':     ['improve', 'better', 'enhance', 'ease'],
  'ameliorates':    ['improves', 'betters', 'enhances', 'eases'],
  'paradigm':       ['model', 'framework', 'pattern', 'approach'],
  'holistic':       ['comprehensive', 'all-round', 'complete', 'whole'],
  'synergy':        ['cooperation', 'collaboration', 'combined effect', 'interplay'],
  'robust':         ['strong', 'solid', 'sturdy', 'reliable'],
  'efficacy':       ['effectiveness', 'usefulness', 'potency', 'value'],
  'subsequently':   ['later', 'afterwards', 'then', 'after that'],
  'endeavor':       ['effort', 'attempt', 'undertaking', 'pursuit'],
  'endeavors':      ['efforts', 'attempts', 'undertakings', 'pursuits'],
  'cognizant':      ['aware', 'mindful', 'conscious', 'alert'],
  'commence':       ['begin', 'start', 'initiate', 'launch'],
  'ascertain':      ['determine', 'find out', 'discover', 'establish'],
  'postulate':      ['suggest', 'propose', 'theorize', 'assume'],
  'postulates':     ['suggests', 'proposes', 'theorizes', 'assumes'],
  'proliferation':  ['growth', 'spread', 'increase', 'expansion'],
  'juxtaposition':  ['contrast', 'comparison', 'side-by-side view', 'placement'],
  'dichotomy':      ['divide', 'split', 'contrast', 'division'],
  'inherently':     ['by nature', 'naturally', 'at its core', 'in itself'],
  'intrinsically':  ['by nature', 'fundamentally', 'at its core', 'in itself'],
  'unequivocally':  ['clearly', 'without doubt', 'certainly', 'plainly'],
  'indispensable':  ['essential', 'necessary', 'vital', 'crucial'],
  'facilitate':     ['help', 'support', 'enable', 'aid'],
  'facilitates':    ['helps', 'supports', 'enables', 'aids'],
  'utilize':        ['use', 'employ', 'apply', 'draw on'],
  'utilizes':       ['uses', 'employs', 'applies', 'draws on'],
  'utilizing':      ['using', 'employing', 'applying', 'drawing on'],
  'pertaining':     ['relating', 'concerning', 'about', 'connected'],
  'aforementioned': ['previously mentioned', 'noted earlier', 'earlier', 'above'],
  'henceforth':     ['from now on', 'going forward', 'from this point', 'moving forward'],
  'notwithstanding':['despite', 'regardless of', 'in spite of', 'even with'],
  'inasmuch':       ['since', 'because', 'given that', 'in that'],
  'whilst':         ['while', 'as', 'during', 'at the same time as'],
  'amongst':        ['among', 'between', 'amid', 'within'],
  'thereof':        ['of it', 'of that', 'of this', 'from it'],
  'whereby':        ['by which', 'through which', 'where', 'in which'],
  'therein':        ['in this', 'in that', 'within it', 'here'],
  'forthwith':      ['immediately', 'at once', 'right away', 'promptly'],
};

// Pre-compile register entries
const STEALTH_REGISTER_ENTRIES = Object.entries(STEALTH_REGISTER)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([word, alts]) => ({
    re: new RegExp(`\\b${word}\\b`, 'gi'),
    alts,
  }));


// ═══════════════════════════════════════════
// MAIN STEALTH WRITER FUNCTIONS
// ═══════════════════════════════════════════

/**
 * Phase 1: Apply phrase-level paraphrasing
 * Replaces multi-word academic expressions with natural alternatives
 */
export function stealthPhrase(sentence, usedSet) {
  let r = sentence;
  for (const { re, alts } of STEALTH_PHRASE_ENTRIES) {
    r = r.replace(re, (match) => {
      const available = alts.filter(a => !usedSet.has(a.toLowerCase()));
      const pool = available.length > 0 ? available : alts;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      usedSet.add(pick.toLowerCase());
      // Preserve capitalization
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return pick.charAt(0).toUpperCase() + pick.slice(1);
      }
      return pick;
    });
  }
  return r;
}

/**
 * Phase 2: Apply structural simplification patterns
 * Complex constructions → simpler academic forms
 */
export function stealthStructure(sentence) {
  for (const pattern of STEALTH_STRUCTURES) {
    const m = sentence.match(pattern.re);
    if (m) {
      try {
        const result = pattern.apply(m);
        if (result !== null && result !== sentence) {
          // Safety: must still be one sentence
          const cleaned = result.replace(/(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K|al)\.\s+[A-Z]/g, '___ABBR___ ');
          if ((cleaned.match(/[.!?]\s+[A-Z]/g) || []).length === 0) {
            return result;
          }
        }
      } catch { /* skip on error */ }
    }
  }
  return sentence;
}

/**
 * Phase 3: Apply connector/transition variation
 * Swap sentence-initial discourse markers with natural alternatives
 * Guards against creating duplicates (e.g., "Also, ... also ...")
 */
export function stealthConnector(sentence) {
  for (const { re, alts } of STEALTH_CONNECTORS) {
    const m = sentence.match(re);
    if (m) {
      // Filter out alternatives that would create duplicate words in the sentence
      const rest = sentence.replace(re, '').toLowerCase();
      const safe = alts.filter(a => {
        const key = a.replace(/[^a-z]/gi, '').toLowerCase();
        return !rest.includes(key);
      });
      const pool = safe.length > 0 ? safe : alts;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      const remainder = sentence.replace(re, '');
      // Capitalize the rest properly
      return pick + remainder.charAt(0).toLowerCase() + remainder.slice(1);
    }
  }
  return sentence;
}

/**
 * Phase 4: Apply register balancing
 * Micro-downgrade overly formal words to natural academic alternatives
 * Applied at a controlled rate (~30% of eligible words)
 * Guards against producing ungrammatical forms (e.g., "more good")
 */
export function stealthRegister(sentence, usedSet) {
  const rate = 0.30;
  let r = sentence;
  for (const { re, alts } of STEALTH_REGISTER_ENTRIES) {
    r = r.replace(re, (match, offset) => {
      if (Math.random() > rate) return match;
      // Guard: skip if preceded by "more", "most", "less", "least" — comparative form
      // "more valuable" → "more good" is ungrammatical
      const before = r.substring(Math.max(0, offset - 10), offset).toLowerCase();
      if (/\b(more|most|less|least)\s*$/.test(before)) return match;
      const available = alts.filter(a => !usedSet.has(a.toLowerCase()));
      const pool = available.length > 0 ? available : alts;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      usedSet.add(pick.toLowerCase());
      if (match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()) {
        return pick.charAt(0).toUpperCase() + pick.slice(1);
      }
      return pick;
    });
  }
  return r;
}

/**
 * Main stealth rewrite orchestrator
 * Applies all 4 phases in sequence to a single sentence
 */
export function stealthRewrite(sentence, usedSet) {
  let result = sentence;

  // Phase 2 FIRST: Structural simplification (before phrase paraphrase changes patterns)
  // These catch complex constructions like "By employing X, the study aims to Y"
  result = stealthStructure(result);

  // Phase 1: Phrase-level paraphrasing (most impactful)
  result = stealthPhrase(result, usedSet);

  // Phase 3: Connector/transition variation (always apply if a connector is found)
  result = stealthConnector(result);

  // Phase 4: Register balancing
  result = stealthRegister(result, usedSet);

  return result;
}
