export type WorkspaceMode = 'essay' | 'report' | 'presentation' | 'spreadsheet'
export type WorkspaceRole = 'user' | 'assistant' | 'system'
export type WorkspaceStepStatus = 'completed' | 'current' | 'pending'

export interface WorkspaceInstructionProfile {
  assignmentType: string
  topic: string
  requiredSections: string[]
  sourceRequirement: string
  citationStyle: string
  targetWordCount: number
  tone: string
  analysisDepth: string
  formattingRules: string[]
  missingDetails: string[]
  gradingCriteria: string[]
}

export interface WorkspaceSource {
  id: string
  title: string
  authors: string[]
  journal: string
  year: number
  publicationDate?: string | null
  doi: string | null
  abstractPreview: string
  openAccess: boolean
  fullTextUrl: string | null
  sourceUrl?: string | null
  openAlexId?: string | null
  provider?: 'seed' | 'openalex' | 'google'
  citationCount: number
  qualityScore: number
  savedAt: string
  notes?: string
}

export interface WorkspaceEvidenceChunk {
  id: string
  sourceId: string
  sectionName: string
  pageNumber: number | null
  text: string
  confidenceScore: number
}

export interface WorkspaceDraftSection {
  id: string
  title: string
  goal: string
  body: string
  citations: string[]
}

export interface WorkspaceDraftContent {
  title: string
  sections: WorkspaceDraftSection[]
  comments: string[]
}

export interface WorkspaceDraft {
  id: string
  versionNumber: number
  status: 'draft' | 'revising' | 'final'
  contentJson: WorkspaceDraftContent
  contentMarkdown: string
  contentHtml: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceScoreReport {
  id: string
  overallScore: number
  minimumTarget: number
  dimensions: {
    instructionCompliance: number
    structure: number
    clarity: number
    analyticalDepth: number
    evidenceIntegration: number
    citationQuality: number
    formattingMatch: number
    originalityOfReasoning: number
    completeness: number
    grammarStyle: number
  }
  blockingWeaknesses: string[]
  revisionPlan: string[]
  createdAt: string
}

export interface WorkspaceRevisionAction {
  id: string
  summary: string
  changes: string[]
  scoreAfter: number
  createdAt: string
}

export interface WorkspaceExportArtifact {
  id: string
  type: 'docx' | 'pdf' | 'xlsx' | 'pptx'
  fileName: string
  createdAt: string
  status: 'ready' | 'blueprint'
}

export interface WorkspaceTaskStep {
  id: string
  title: string
  detail: string
  status: WorkspaceStepStatus
}

export interface WorkspaceMessage {
  id: string
  role: WorkspaceRole
  content: string
  createdAt: string
}

export interface WorkspaceProject {
  id: string
  title: string
  mode: WorkspaceMode
  createdAt: string
  updatedAt: string
  instructions: string
  rubric: string
  uploads: string[]
  citationStyle: string
  targetWordCount: number
  minimumScoreTarget: number
  instructionProfile: WorkspaceInstructionProfile
  sourceLibrary: WorkspaceSource[]
  evidenceChunks: WorkspaceEvidenceChunk[]
  drafts: WorkspaceDraft[]
  activeDraftId: string | null
  scoreHistory: WorkspaceScoreReport[]
  revisionHistory: WorkspaceRevisionAction[]
  exports: WorkspaceExportArtifact[]
  messages: WorkspaceMessage[]
  progress: WorkspaceTaskStep[]
  workspaceCredits: {
    used: number
    limit: number
  }
}

export interface ScholarSearchFilters {
  yearFrom?: number
  yearTo?: number
  openAccessOnly?: boolean
  author?: string
  journal?: string
  sort?: 'relevance' | 'year' | 'citation_count'
}
