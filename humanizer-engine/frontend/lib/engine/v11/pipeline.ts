/**
 * V1.1 Pipeline — Sequential Phase Runner
 * =========================================
 */

import type { DocumentState, Phase } from './types';

export class HumanizationPipeline {
  constructor(private phases: Phase[]) {}

  async run(initialState: DocumentState): Promise<DocumentState> {
    let state = initialState;

    for (const phase of this.phases) {
      const start = Date.now();
      state = await phase.process(state);
      const elapsed = Date.now() - start;
      state.logs.push(`[${phase.name}] completed in ${elapsed}ms`);
    }

    return state;
  }
}
