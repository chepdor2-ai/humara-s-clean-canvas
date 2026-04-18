/**
 * Validation Post-Process Live API Regression
 *
 * Hits the real /api/humanize route over HTTP with the full capitalization
 * sample so the final route-level cleanup can be checked end-to-end.
 */

import assert from 'node:assert/strict';

const API_URL_CANDIDATES = process.env.HUMARA_API_URL
  ? [process.env.HUMARA_API_URL]
  : [
      'http://127.0.0.1:3002/api/humanize',
      'http://127.0.0.1:3001/api/humanize',
    ];

const FULL_SAMPLE_TEXT = `Health and Time Availability as a Project Risk

During the initial and middle phases of this Project, a serious illness was encountered that heavily formed the capability to adhere to the created timeline, with the unexpected and interesting Risk associated with personal health and Time management constraints affecting essential dimensions of the Project, such as the recruitment of participants, the collection of data, and the early stages of build development. Although Multiple employed the initial Risk assessment recognizs and logistical problems, personal health matters were not adequately resolved as a viable Risk to Project completion. The position of this risk was major, as it required adjustments to both the project schedule and workflow. This makes clear that while not all risks can be predicted, the ability to respond effectively is a critical component of successful project management. Tasks had to be reprioritised, and certain activities, such as interview scheduling and wireframe testing, were delayed. However, the experience also reinforced the role of adaptability in project management. That safeguarding particular and open Communication with the Project supervisor, locating how illness affected the Project timeline, and sharing consistent updates regarding progress and obstacles were involved in the chief approach to softening the part of Health-related disruptions. Receiving extensions on the first three submission deadlined, which played a vital role in safeguarding the total quality of the Project, resulted from this transparent exchange, while the Tutor's Sustain acted as an essential external material that empowered the Project to continue agreed with its objectived despite setbacks. Despite obstacled encountered, the Project persist on course with its objectived due to the invaluable external asset provided by the supervisor's assistance; this encounter showcased the role of stakeholder Communication in Project management, in academic settings where results can be greatly altered by guidance and adaptability. Additionally, compiled in the appendix to show the formal character of these dialogued are the documentation of this Communication (including emails) which shows that the continuous gain of the report was further added to by the orderly feedback received during these extended deadlined, ensuring that each iteration improved upon the last. Reflecting the Iterative development across Multiple Submissions, this approach to Mitigation illustrates how a potentially disruptive Risk can be converted into a manageable obstacle through successful Communication and Support arrangements. Mitigation through Tutor Support and Communication

The final submission therefore shows not just the end result, but the process of development, adaptation, and refinement that led to it. In the craft. Research model. This project was developed over the course of three prior submissions, each representing a different stage of the design and research process. And, the iterative testing process aligned with the module's focus on evaluation and refinement. This final submission represents the culmination of that iterative process, bringing together all elements into a cohesive and refined outcome. The need to revisit and improve earlier work, especially in light of both tutor feedback and personal challenges, reinforced the role of iteration in design and also in project documentation. Vital nature of iteration in both build and Project documentation was underlined. An opportunity to rectify gaps, elaborate on once insufficient sections, and incorporate additional supporting evidence, such as questionnaire results (interview excerpts) and refined wireframes was gived by each report version. In this instance ensuring that the Project's development was accurately captured, the Iterative cycle extended beyond the product itself to take in the report. Iterative development across Multiple Submissions

Intimately paralleled with User-centered craft principles, this Iterative approach demonstrates persistent feedback and evaluation as pathways to progress. This open communication led to the granting of extensions across the first three submission deadlines, which proved essential in maintaining the overall quality and integrity of the project. This iterative approach closely aligns with user-centred design principles, where continuous feedback and evaluation lead to progressive improvements. As part of the university's Module Interaction Design and the User Experience, the approach employed and the resulting outcomes were greatly formed by the occurrence of the Project. As an essential theme of the Module, the ranking the needs (behaviors) and circumstances of actual users over the assumptions made by designers, User-centered construct is underlined. Throughout the Project, the consistent exercise of this principle was apparent, especially in the collection of authentic User feedback via questionnaires and interviews. Demonstrating the role of the complete craft lifecycle, which covers requirements gathering (craft) prototyping and evaluation was likewise a focus of the Module. Organized progression of the Project, which included initial research and participant Interaction adhered by the development of low- and high-fidelity wireframed and subsequent User testing, reflected this. Reflected in the methodical progress of the Project, the emphasis passaged from initial research and participant Interaction to the development of both low- and high-fidelity wireframed, adhered by the conduct of subsequent User testing. Application of User-Centred Design principles from the Module

Practical tools and techniques introduced in the module, such as persona creation, user journey mapping, and usability evaluation, were directly applied. To illustrate, the development of the "Fatima" persona and her journey map informed key design decisions, ensuring that the wireframes handled real user pain points. Also, grounded in these principles, the final high-fidelity wireframes present used craft powers and also show a far-reaching conceding of User involvement theory and exercise. Reflecting on the project as a whole, several strengths and limitations can be identified from a project management perspective. Competence to adapt to changing circumstances, reacting to the hurdles posed by illness was conceded as One of the vital assets. The use of structured tools such as the Gantt chart, project log, and risk register provided a framework for managing tasks and tracking progress, even when deviations from the original plan occurred. Also, the integration of user feedback into the design process demonstrated effective application of iterative development principles. That said areas where improvements could have been made also existed. As the initial Risk evaluation lacked consideration of personal variables, such as health and Availability, unexpected delays resulted, thus demanding enhancement of precise facets. Capability to adapt to changing circumstances, especially adhering the obstacles posed by illness was One of the essential merits. This principle was applied throughout the project, especially in the use of questionnaires and interviews to gather authentic user input.

Improvements could have been made in areas; however, they were also show. Unanticipated delays occurred because personal factors, such as health and Availability were not fully accounted for in the initial Risk assessment.`;

async function runLiveValidationPostProcessApiTest(): Promise<void> {
  console.log('='.repeat(70));
  console.log('VALIDATION POST-PROCESS LIVE API REGRESSION');
  console.log('='.repeat(70));

  const attemptedUrls: string[] = [];
  let response: Response | undefined;
  let rawResult: Record<string, unknown> | null = null;
  let resolvedApiUrl: string | undefined;

  for (const apiUrl of API_URL_CANDIDATES) {
    attemptedUrls.push(apiUrl);

    try {
      const candidateResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: FULL_SAMPLE_TEXT,
          engine: 'ghost_mini_v1_2',
          strength: 'medium',
          tone: 'academic',
          strict_meaning: true,
          enable_post_processing: true,
        }),
      });

      const rawBody = await candidateResponse.text();
      const contentType = candidateResponse.headers.get('content-type') || '';
      const parsedBody = contentType.includes('application/json') ? JSON.parse(rawBody) : null;

      if (candidateResponse.ok && parsedBody && typeof parsedBody === 'object') {
        response = candidateResponse;
        rawResult = parsedBody;
        resolvedApiUrl = apiUrl;
        break;
      }

      attemptedUrls[attemptedUrls.length - 1] = `${apiUrl} -> ${candidateResponse.status} ${contentType || 'unknown-content-type'}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptedUrls[attemptedUrls.length - 1] = `${apiUrl} -> ${message}`;
    }
  }

  assert.ok(response && rawResult && resolvedApiUrl, `Unable to reach a live /api/humanize endpoint. Tried:\n${attemptedUrls.join('\n')}`);

  console.log(`API URL: ${resolvedApiUrl}`);
  assert.equal(response.ok, true, `API returned ${response.status}: ${JSON.stringify(rawResult)}`);

  const humanized = typeof rawResult?.humanized === 'string' ? rawResult.humanized : '';
  assert.ok(humanized.trim().length > 0, 'API response did not include humanized text');

  assert.match(humanized, /^Health and Time Availability as a Project Risk/m);
  assert.doesNotMatch(humanized, /\bthis Project\b/);
  assert.doesNotMatch(humanized, /\binteresting Risk\b/);
  assert.doesNotMatch(humanized, /\bTime management\b/);

  console.log('');
  console.log('Engine:', rawResult.engine_used);
  console.log('Meaning similarity:', rawResult.meaning_similarity);
  console.log('');
  console.log('=== CLEANED OUTPUT ===');
  console.log(humanized);
}

runLiveValidationPostProcessApiTest().catch((error) => {
  console.error('Live API regression failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});