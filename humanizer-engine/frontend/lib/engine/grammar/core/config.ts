export type EngineMode = 'academic' | 'business' | 'general' | 'casual';

export interface EngineConfig {
  mode: EngineMode;
  enableStyle: boolean;
  enableSpelling: boolean;
  enableGrammar: boolean;
  enablePunctuation: boolean;
  minConfidence: number;
  autoFixThreshold: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  mode: 'general',
  enableStyle: true,
  enableSpelling: true,
  enableGrammar: true,
  enablePunctuation: true,
  minConfidence: 0.5,
  autoFixThreshold: 0.85,
};
