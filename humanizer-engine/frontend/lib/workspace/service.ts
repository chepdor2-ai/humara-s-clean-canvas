import {
  AlignmentType,
  Document,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  PageBreak,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx'
import { jsPDF } from 'jspdf'
import PptxGenJS from 'pptxgenjs'
import type {
  ScholarSearchFilters,
  WorkspaceDraft,
  WorkspaceDraftContent,
  WorkspaceExportArtifact,
  WorkspaceInstructionProfile,
  WorkspaceMessage,
  WorkspaceProject,
  WorkspaceRevisionAction,
  WorkspaceScoreReport,
  WorkspaceSource,
  WorkspaceTaskStep,
} from '@/lib/workspace/types'
import {
  buildDraftHtml,
  buildDraftMarkdown,
  buildReferenceEntriesFromSources,
  createFormattingProfile,
  ensureInlineCitations,
  formatBibliographyEntry,
  normalizeCitationStyle,
  parseDocumentText,
} from '@/lib/workspace/document-format'
import { searchLiveScholarSources } from '@/lib/workspace/scholar'

const WORKSPACE_TABLE = 'workspace_projects'
const fallbackWorkspaceStore = new Map<string, WorkspaceProject[]>()

function getFallbackProjects(userId: string) {
  const existing = fallbackWorkspaceStore.get(userId)
  if (existing && existing.length > 0) {
    return existing
  }
  const seed = [createSeedProject()]
  fallbackWorkspaceStore.set(userId, seed)
  return seed
}

function saveFallbackProject(userId: string, project: WorkspaceProject) {
  const current = getFallbackProjects(userId)
  const next = current.some((item) => item.id === project.id)
    ? current.map((item) => (item.id === project.id ? project : item))
    : [project, ...current]
  fallbackWorkspaceStore.set(userId, next)
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export const scholarlyCatalog: WorkspaceSource[] = [
  {
    id: 'src-1',
    title: 'Generative AI in Higher Education: A Structured Review of Uses, Risks, and Assessment Impacts',
    authors: ['Amelia Hart', 'Simeon Okafor'],
    journal: 'Journal of Digital Learning Research',
    year: 2024,
    doi: '10.5555/jdlr.2024.1032',
    abstractPreview: 'Reviews how universities are adapting coursework, feedback, and academic integrity policies in response to generative AI.',
    openAccess: true,
    fullTextUrl: 'https://example.org/open/higher-education-ai',
    citationCount: 128,
    qualityScore: 96,
    savedAt: '2026-04-19T08:00:00.000Z',
    notes: 'Useful for framing institutional implications and policy discussion.',
  },
  {
    id: 'src-2',
    title: 'Evidence-Supported Revision Loops for Academic Writing Assistants',
    authors: ['Mina Velasquez', 'Paul K. Morris'],
    journal: 'Computers and Composition',
    year: 2023,
    doi: '10.5555/comp.2023.441',
    abstractPreview: 'Examines section-level revision planning, rubric-aligned scoring, and student trust in iterative writing systems.',
    openAccess: true,
    fullTextUrl: 'https://example.org/open/revision-loops',
    citationCount: 84,
    qualityScore: 91,
    savedAt: '2026-04-19T08:00:00.000Z',
    notes: 'Strong support for revision engine positioning.',
  },
  {
    id: 'src-3',
    title: 'Open Scholarship Metadata Quality and Research Discoverability',
    authors: ['Nadia Freeman'],
    journal: 'Scholarly Infrastructure Quarterly',
    year: 2025,
    doi: '10.5555/siq.2025.771',
    abstractPreview: 'Explores how metadata completeness, access tags, and citation signals influence discoverability of scholarly work.',
    openAccess: false,
    fullTextUrl: null,
    citationCount: 51,
    qualityScore: 88,
    savedAt: '2026-04-19T08:00:00.000Z',
    notes: 'Helps justify quality indicators in scholar search UX.',
  },
  {
    id: 'src-4',
    title: 'Rubric-Aware Automated Feedback for Postsecondary Writing',
    authors: ['J. Chen', 'Fatima Al-Hassan', 'Derrick Cole'],
    journal: 'Assessment and Evaluation in Education',
    year: 2024,
    doi: '10.5555/aee.2024.929',
    abstractPreview: 'Finds that scoring engines improve student outcomes when tied to explicit rubric dimensions and actionable next-step plans.',
    openAccess: true,
    fullTextUrl: 'https://example.org/open/rubric-feedback',
    citationCount: 109,
    qualityScore: 94,
    savedAt: '2026-04-19T08:00:00.000Z',
    notes: 'Directly relevant to grading + revision loop.',
  },
  {
    id: 'src-5',
    title: 'Designing Research Workbenches for Long-Form AI Collaboration',
    authors: ['Olivia Mensah', 'Thomas Reid'],
    journal: 'Human-Centered AI Systems',
    year: 2025,
    doi: '10.5555/hcai.2025.550',
    abstractPreview: 'Documents product patterns for chat, source panes, live artifacts, and project memory in research-oriented AI tools.',
    openAccess: true,
    fullTextUrl: 'https://example.org/open/research-workbench',
    citationCount: 73,
    qualityScore: 93,
    savedAt: '2026-04-19T08:00:00.000Z',
    notes: 'Great conceptual support for the workbench framing.',
  },
]

export const workspaceCreditPlans = {
  free: 20000,
  scholar: 150000,
}

const defaultProgress = (): WorkspaceTaskStep[] => [
  {
    id: makeId('step'),
    title: 'Instruction analysis',
    detail: 'Assignment requirements, tone, structure, and citation expectations parsed into a project brief.',
    status: 'completed',
  },
  {
    id: makeId('step'),
    title: 'Scholarly search',
    detail: 'Relevant academic sources ranked by fit, quality, and open-access availability.',
    status: 'current',
  },
  {
    id: makeId('step'),
    title: 'Drafting and grading',
    detail: 'Draft is written, scored, and revised section-by-section toward the 90+ target.',
    status: 'pending',
  },
  {
    id: makeId('step'),
    title: 'Artifact and export',
    detail: 'Final document opens in the editor and is prepared for DOCX, PDF, XLSX, and PPTX export.',
    status: 'pending',
  },
]

function buildInstructionProfile(instructions: string, rubric: string, title: string): WorkspaceInstructionProfile {
  const lowered = `${instructions} ${rubric}`.toLowerCase()
  const citationStyle = lowered.includes('mla')
    ? 'MLA 9'
    : lowered.includes('chicago')
      ? 'Chicago'
      : 'APA 7'

  const targetWordCountMatch = instructions.match(/(\d{3,5})\s*words?/i)
  const targetWordCount = targetWordCountMatch ? Number(targetWordCountMatch[1]) : 1500

  return {
    assignmentType: lowered.includes('discussion') ? 'discussion post' : lowered.includes('report') ? 'report' : 'research essay',
    topic: title,
    requiredSections: ['Introduction', 'Critical Analysis', 'Evidence and Discussion', 'Conclusion'],
    sourceRequirement: lowered.includes('source') ? 'Scholarly sources required' : 'Sources recommended',
    citationStyle,
    targetWordCount,
    tone: lowered.includes('formal') ? 'formal academic' : 'analytical academic',
    analysisDepth: lowered.includes('critical') ? 'critical and comparative' : 'evidence-led analytical',
    formattingRules: ['Structured headings', `${citationStyle} references`, 'Clear academic transitions'],
    missingDetails: rubric ? [] : ['No rubric uploaded; grading uses inferred academic quality dimensions.'],
    gradingCriteria: rubric
      ? ['Instruction compliance', 'Rubric adherence', 'Evidence use', 'Coherence', 'Citation quality']
      : ['Instruction compliance', 'Analytical depth', 'Evidence integration', 'Structure', 'Formatting'],
  }
}

function createDraftMarkdown(content: WorkspaceDraftContent, sources: WorkspaceSource[], style: string) {
  return buildDraftMarkdown(content, sources, style)
}

function createDraftHtml(content: WorkspaceDraftContent, sources: WorkspaceSource[], style: string) {
  return buildDraftHtml(content, sources, style)
}

function createInitialDraft(title: string, instructionProfile: WorkspaceInstructionProfile, sources: WorkspaceSource[]): WorkspaceDraft {
  const selected = sources.slice(0, 3)
  const contentJson: WorkspaceDraftContent = {
    title,
    comments: ['This artifact stays editable and synced with future chat instructions.'],
    sections: [
      {
        id: makeId('section'),
        title: 'Introduction',
        goal: 'Frame the assignment and establish the thesis.',
        body: ensureInlineCitations(
          `${title} is approached here as an academic problem that requires structured analysis, recent scholarship, and clear alignment with the stated instructions. This introduction establishes the central argument, clarifies scope, and previews how evidence will be used to support each section.`,
          selected.slice(0, 1),
          instructionProfile.citationStyle,
        ),
        citations: selected.slice(0, 1).map((source) => source.id),
      },
      {
        id: makeId('section'),
        title: 'Critical Analysis',
        goal: 'Deliver the core reasoning and comparative discussion.',
        body: ensureInlineCitations(
          `The core discussion prioritizes ${instructionProfile.analysisDepth} reasoning. It connects the assignment requirements to relevant scholarly perspectives, identifies tensions in the literature, and explains why a research-workbench approach can produce more reliable outputs than one-shot prompting.`,
          selected.slice(0, 2),
          instructionProfile.citationStyle,
        ),
        citations: selected.slice(0, 2).map((source) => source.id),
      },
      {
        id: makeId('section'),
        title: 'Evidence and Discussion',
        goal: 'Use source-backed evidence to support the claims.',
        body: ensureInlineCitations(
          `Evidence is integrated as quotable, project-linked support rather than decorative citation. Each passage should directly advance the claim being made, strengthen interpretation, and make the reasoning auditable for the user before export.`,
          selected,
          instructionProfile.citationStyle,
        ),
        citations: selected.map((source) => source.id),
      },
      {
        id: makeId('section'),
        title: 'Conclusion',
        goal: 'Synthesize the findings and state implications.',
        body: ensureInlineCitations(
          `The conclusion reinforces the central finding: a premium academic workspace must coordinate instruction analysis, evidence retrieval, scoring, revision, and editable output as one continuous workflow. It closes by translating that principle into product and submission value for the user.`,
          selected.slice(1, 3),
          instructionProfile.citationStyle,
        ),
        citations: selected.slice(1, 3).map((source) => source.id),
      },
    ],
  }

  const timestamp = nowIso()

  return {
    id: makeId('draft'),
    versionNumber: 1,
    status: 'draft',
    contentJson,
    contentMarkdown: createDraftMarkdown(contentJson, sources, instructionProfile.citationStyle),
    contentHtml: createDraftHtml(contentJson, sources, instructionProfile.citationStyle),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function gradeDraft(project: WorkspaceProject, draft?: WorkspaceDraft): WorkspaceScoreReport {
  const activeDraft = draft ?? getActiveDraft(project)
  const content = activeDraft?.contentJson
  const sectionCount = content?.sections.length ?? 0
  const sourceCount = project.sourceLibrary.length
  const rubricBoost = project.rubric.trim() ? 3 : 0
  const wordiness = activeDraft?.contentMarkdown.split(/\s+/).filter(Boolean).length ?? 0
  const targetFit = Math.max(0, 100 - Math.min(25, Math.abs(project.targetWordCount - wordiness) / 25))

  const dimensions = {
    instructionCompliance: Math.min(98, 84 + Math.min(10, sectionCount * 2) + rubricBoost),
    structure: Math.min(96, 82 + Math.min(12, sectionCount * 3)),
    clarity: 88,
    analyticalDepth: Math.min(95, 80 + Math.min(12, sourceCount * 2)),
    evidenceIntegration: Math.min(96, 78 + Math.min(15, sourceCount * 3)),
    citationQuality: project.citationStyle ? 90 : 84,
    formattingMatch: Math.round(targetFit),
    originalityOfReasoning: 87,
    completeness: sectionCount >= 4 ? 91 : 82,
    grammarStyle: 92,
  }

  const overallScore = average(Object.values(dimensions))
  const weaknesses: string[] = []
  const revisionPlan: string[] = []

  if (dimensions.analyticalDepth < 90) {
    weaknesses.push('Core analysis needs stronger interpretation and more explicit evaluation of evidence.')
    revisionPlan.push('Strengthen analytical commentary in the main discussion sections.')
  }
  if (dimensions.evidenceIntegration < 90) {
    weaknesses.push('Evidence use is too light for the expected academic standard.')
    revisionPlan.push('Add two more scholarly sources and connect them to specific claims.')
  }
  if (dimensions.formattingMatch < 90) {
    weaknesses.push('Draft length or formatting target is not yet closely aligned with the assignment.')
    revisionPlan.push('Tighten length, heading consistency, and citation-format details.')
  }
  if (dimensions.completeness < 90) {
    weaknesses.push('One or more expected assignment sections remain underdeveloped.')
    revisionPlan.push('Expand weaker sections instead of rewriting the entire paper.')
  }

  if (weaknesses.length === 0 && overallScore < project.minimumScoreTarget) {
    weaknesses.push('The draft is solid but still needs sharper reasoning and polish to clear the target score.')
    revisionPlan.push('Refine transitions, sharpen topic sentences, and increase argumentative precision.')
  }

  return {
    id: makeId('score'),
    overallScore,
    minimumTarget: project.minimumScoreTarget,
    dimensions,
    blockingWeaknesses: weaknesses,
    revisionPlan,
    createdAt: nowIso(),
  }
}

function reviseSectionBody(body: string, focus: string) {
  return `${body} ${focus} The revision keeps the existing argument stable while increasing specificity, evidence linkage, and rubric alignment.`
}

export function reviseProjectToTarget(project: WorkspaceProject): {
  project: WorkspaceProject
  latestScore: WorkspaceScoreReport
  reachedTarget: boolean
  ceilingReason: string | null
} {
  const currentProject = structuredClone(project) as WorkspaceProject
  let safetyCounter = 0
  let latestScore = gradeDraft(currentProject)

  while (latestScore.overallScore < currentProject.minimumScoreTarget && safetyCounter < 3) {
    const activeDraft = getActiveDraft(currentProject)
    if (!activeDraft) break

    const updatedSections = activeDraft.contentJson.sections.map((section, index) => {
      if (index > 1 && latestScore.overallScore >= currentProject.minimumScoreTarget - 4) {
        return section
      }

      return {
        ...section,
        body: reviseSectionBody(
          section.body,
          latestScore.revisionPlan[index % Math.max(1, latestScore.revisionPlan.length)] ?? 'Improve clarity and evidence density.',
        ),
      }
    })

    const revisedContent = {
      ...activeDraft.contentJson,
      sections: updatedSections,
    }

    const revisedDraft: WorkspaceDraft = {
      ...activeDraft,
      id: makeId('draft'),
      versionNumber: currentProject.drafts.length + 1,
      status: latestScore.overallScore + 4 >= currentProject.minimumScoreTarget ? 'final' : 'revising',
      contentJson: revisedContent,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      contentMarkdown: createDraftMarkdown(revisedContent, currentProject.sourceLibrary, currentProject.citationStyle),
      contentHtml: createDraftHtml(revisedContent, currentProject.sourceLibrary, currentProject.citationStyle),
    }

    currentProject.drafts.push(revisedDraft)
    currentProject.activeDraftId = revisedDraft.id
    latestScore = gradeDraft(currentProject, revisedDraft)
    currentProject.scoreHistory.push(latestScore)
    currentProject.revisionHistory.push({
      id: makeId('revision'),
      summary: `Revision cycle ${currentProject.revisionHistory.length + 1}`,
      changes: latestScore.revisionPlan,
      scoreAfter: latestScore.overallScore,
      createdAt: nowIso(),
    })
    safetyCounter += 1
  }

  currentProject.updatedAt = nowIso()
  currentProject.progress = currentProject.progress.map((step, index) => {
    if (index === 1 || index === 2) return { ...step, status: 'completed' }
    if (index === 3) return { ...step, status: 'current' }
    return step
  })

  return {
    project: currentProject,
    latestScore,
    reachedTarget: latestScore.overallScore >= currentProject.minimumScoreTarget,
    ceilingReason:
      latestScore.overallScore >= currentProject.minimumScoreTarget
        ? null
        : 'The system hit its quality ceiling without additional user instructions, richer sources, or more specific rubric guidance.',
  }
}

function getActiveDraft(project: WorkspaceProject | null | undefined) {
  if (!project) return null
  return project.drafts.find((draft) => draft.id === project.activeDraftId) ?? project.drafts.at(-1) ?? null
}

export function createInitialProject(input: {
  title: string
  instructions: string
  rubric?: string
  uploads?: string[]
  citationStyle?: string
  targetWordCount?: number
  sources?: WorkspaceSource[]
}): WorkspaceProject {
  const instructionProfile = buildInstructionProfile(input.instructions, input.rubric ?? '', input.title)
  const selectedSources = (input.sources && input.sources.length > 0 ? input.sources : scholarlyCatalog).slice(0, 5)
  const evidenceChunks = selectedSources.flatMap((source, index) => [
    {
      id: makeId('evidence'),
      sourceId: source.id,
      sectionName: ['Introduction', 'Critical Analysis', 'Evidence and Discussion'][index] ?? 'Discussion',
      pageNumber: source.openAccess ? index + 2 : null,
      text: `${source.title} supports the project by clarifying how research tooling, assessment design, and evidence quality affect academic output.`,
      confidenceScore: 0.84 + index * 0.03,
    },
  ])

  const draft = createInitialDraft(input.title, instructionProfile, selectedSources)
  const timestamp = nowIso()
  const baseProject: WorkspaceProject = {
    id: makeId('project'),
    title: input.title,
    mode: 'essay',
    createdAt: timestamp,
    updatedAt: timestamp,
    instructions: input.instructions,
    rubric: input.rubric ?? '',
    uploads: input.uploads ?? [],
    citationStyle: input.citationStyle ?? instructionProfile.citationStyle,
    targetWordCount: input.targetWordCount ?? instructionProfile.targetWordCount,
    minimumScoreTarget: 90,
    instructionProfile,
    sourceLibrary: selectedSources,
    evidenceChunks,
    drafts: [draft],
    activeDraftId: draft.id,
    scoreHistory: [],
    revisionHistory: [],
    exports: [],
    messages: [],
    progress: defaultProgress(),
    workspaceCredits: { used: 2400, limit: workspaceCreditPlans.scholar },
  }

  const initialScore = gradeDraft(baseProject, draft)

  return {
    ...baseProject,
    scoreHistory: [initialScore],
    messages: [
      {
        id: makeId('msg'),
        role: 'assistant',
        content: 'I analyzed the assignment, created the first draft scaffold, and prepared an initial source set for revision-to-90.',
        createdAt: timestamp,
      },
    ],
  }
}

export function buildAssistantReply(project: WorkspaceProject, prompt: string): { message: WorkspaceMessage; project: WorkspaceProject } {
  const lowered = prompt.toLowerCase()
  const current = structuredClone(project) as WorkspaceProject
  const activeDraft = getActiveDraft(current)

  if (lowered.includes('add 2 more scholarly sources') || lowered.includes('add two more scholarly sources')) {
    const additional = scholarlyCatalog.filter((source) => !current.sourceLibrary.some((saved) => saved.id === source.id)).slice(0, 2)
    current.sourceLibrary.push(...additional)
    current.updatedAt = nowIso()
    const message = {
      id: makeId('msg'),
      role: 'assistant' as const,
      content: `I added ${additional.length} scholarly sources to the project library and linked them for use in the next grading cycle.`,
      createdAt: nowIso(),
    }
    current.messages.push(message)
    return { message, project: current }
  }

  if (activeDraft) {
    const firstSection = activeDraft.contentJson.sections[0]
    if (lowered.includes('more critical')) {
      firstSection.body = reviseSectionBody(firstSection.body, 'Increase evaluative language, identify assumptions, and challenge weaker counterpositions.')
    }
    if (lowered.includes('reduce repetition')) {
      activeDraft.contentJson.sections = activeDraft.contentJson.sections.map((section) => ({
        ...section,
        body: section.body.replace(/workbench/gi, 'system').replace(/evidence/gi, 'support'),
      }))
    }
    if (lowered.includes('apa')) {
      current.citationStyle = 'APA 7'
      current.instructionProfile.citationStyle = 'APA 7'
    }
    if (lowered.includes('mla')) {
      current.citationStyle = 'MLA 9'
      current.instructionProfile.citationStyle = 'MLA 9'
    }
    if (lowered.includes('harvard')) {
      current.citationStyle = 'Harvard'
      current.instructionProfile.citationStyle = 'Harvard'
    }
    if (lowered.includes('chicago') || lowered.includes('footnote')) {
      current.citationStyle = 'Chicago'
      current.instructionProfile.citationStyle = 'Chicago'
    }
    if (lowered.includes('slides') || lowered.includes('powerpoint')) {
      current.mode = 'presentation'
    }
    activeDraft.contentMarkdown = createDraftMarkdown(activeDraft.contentJson, current.sourceLibrary, current.citationStyle)
    activeDraft.contentHtml = createDraftHtml(activeDraft.contentJson, current.sourceLibrary, current.citationStyle)
    activeDraft.updatedAt = nowIso()
  }

  current.updatedAt = nowIso()
  const message = {
    id: makeId('msg'),
    role: 'assistant' as const,
    content: `I updated the current project state for your request: "${prompt}". The artifact, source plan, and grading state now reflect that direction.`,
    createdAt: nowIso(),
  }
  current.messages.push(message)
  return { message, project: current }
}

export function searchScholarCatalog(query: string, filters: ScholarSearchFilters = {}) {
  const lowered = query.trim().toLowerCase()
  return scholarlyCatalog
    .filter((source) => {
      const haystack = `${source.title} ${source.authors.join(' ')} ${source.journal} ${source.abstractPreview}`.toLowerCase()
      const queryMatch = lowered.length === 0 || haystack.includes(lowered)
      const fromMatch = !filters.yearFrom || source.year >= filters.yearFrom
      const toMatch = !filters.yearTo || source.year <= filters.yearTo
      const oaMatch = !filters.openAccessOnly || source.openAccess
      const authorMatch = !filters.author || source.authors.join(' ').toLowerCase().includes(filters.author.toLowerCase())
      const journalMatch = !filters.journal || source.journal.toLowerCase().includes(filters.journal.toLowerCase())
      return queryMatch && fromMatch && toMatch && oaMatch && authorMatch && journalMatch
    })
    .sort((a, b) => {
      if (filters.sort === 'year') return b.year - a.year
      if (filters.sort === 'citation_count') return b.citationCount - a.citationCount
      return b.qualityScore - a.qualityScore
    })
}

async function upsertProjectWithFallback(supabase: any, userId: string, project: WorkspaceProject) {
  try {
    const payload = {
      id: project.id,
      user_id: userId,
      title: project.title,
      mode: project.mode,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
      instructions: project.instructions,
      rubric: project.rubric,
      uploads: project.uploads,
      citation_style: project.citationStyle,
      target_word_count: project.targetWordCount,
      minimum_score_target: project.minimumScoreTarget,
      active_draft_id: project.activeDraftId,
      workspace_payload: project,
    }

    const { error } = await supabase.from(WORKSPACE_TABLE).upsert(payload, { onConflict: 'id' })
    if (error) {
      throw error
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Workspace persistence fallback active:', error)
    }
  }
}

export async function listProjects(supabase: any, userId: string): Promise<WorkspaceProject[]> {
  try {
    const { data, error } = await supabase
      .from(WORKSPACE_TABLE)
      .select('workspace_payload, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error || !data) {
      throw error
    }

    const projects = data
      .map((row: { workspace_payload?: WorkspaceProject | null }) => row.workspace_payload)
      .filter(Boolean) as WorkspaceProject[]

    if (projects.length > 0) {
      fallbackWorkspaceStore.set(userId, projects)
      return projects
    }

    return getFallbackProjects(userId)
  } catch {
    return getFallbackProjects(userId)
  }
}

export async function getProjectById(supabase: any, userId: string, projectId: string): Promise<WorkspaceProject | null> {
  try {
    const { data, error } = await supabase
      .from(WORKSPACE_TABLE)
      .select('workspace_payload')
      .eq('user_id', userId)
      .eq('id', projectId)
      .maybeSingle()

    if (error) {
      throw error
    }

    const project = (data?.workspace_payload as WorkspaceProject | null) ?? null
    if (project) {
      saveFallbackProject(userId, project)
    }
    return project
  } catch {
    return getFallbackProjects(userId).find((item) => item.id === projectId) ?? null
  }
}

async function resolveInitialSourcesForProject(input: {
  title: string
  instructions: string
  citationStyle?: string
}): Promise<WorkspaceSource[]> {
  const currentYear = new Date().getFullYear()
  const query = `${input.title} ${input.instructions}`.replace(/\s+/g, ' ').trim()

  try {
    const bundle = await searchLiveScholarSources(query, {
      yearFrom: currentYear - 5,
      sort: 'year',
    })

    if (bundle.results.length > 0) {
      return bundle.results.slice(0, 5)
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Live scholar search fallback active:', error)
    }
  }

  return scholarlyCatalog
}

export async function createProjectRecord(supabase: any, userId: string, input: {
  title: string
  instructions: string
  rubric?: string
  uploads?: string[]
  citationStyle?: string
  targetWordCount?: number
}) {
  const sources = await resolveInitialSourcesForProject(input)
  const project = createInitialProject({ ...input, sources })
  saveFallbackProject(userId, project)
  await upsertProjectWithFallback(supabase, userId, project)
  return project
}

export async function saveProjectRecord(supabase: any, userId: string, project: WorkspaceProject) {
  saveFallbackProject(userId, project)
  await upsertProjectWithFallback(supabase, userId, project)
  return project
}

export function createSeedProject() {
  const project = createInitialProject({
    title: 'How Humara Works',
    instructions: 'Write a structured academic overview of how Humara works, explain the instruction analysis flow, source discovery, grading loop, editable document workspace, and export options. Use a formal tone and APA references. Aim for 1400 words.',
    rubric: 'Score highly for critical explanation, clear structure, evidence-backed reasoning, and accurate APA formatting.',
    uploads: ['assignment-brief.pdf', 'rubric.png'],
    citationStyle: 'APA 7',
    targetWordCount: 1400,
  })
  project.id = 'project_seed_how_humara_works'
  return project
}

async function createExportArtifactLegacy(project: WorkspaceProject, type: WorkspaceExportArtifact['type']) {
  const activeDraft = getActiveDraft(project)
  const fileStem = `${slug(project.title || 'workspace-project')}-${type}`
  const createdAt = nowIso()

  if (type === 'docx' && activeDraft) {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              heading: HeadingLevel.TITLE,
              children: [new TextRun(project.title)],
            }),
            ...activeDraft.contentJson.sections.flatMap((section) => [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.title)] }),
              new Paragraph({ children: [new TextRun(section.body)] }),
            ]),
          ],
        },
      ],
    })

    const buffer = await Packer.toBase64String(doc)
    return {
      artifact: {
        id: makeId('export'),
        type,
        fileName: `${fileStem}.docx`,
        createdAt,
        status: 'ready' as const,
      },
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: buffer,
    }
  }

  if (type === 'pdf' && activeDraft) {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    pdf.setFontSize(18)
    pdf.text(project.title, 48, 54)
    pdf.setFontSize(11)
    let y = 88

    for (const section of activeDraft.contentJson.sections) {
      pdf.setFont('helvetica', 'bold')
      pdf.text(section.title, 48, y)
      y += 18
      pdf.setFont('helvetica', 'normal')
      const lines = pdf.splitTextToSize(section.body, 500)
      pdf.text(lines, 48, y)
      y += lines.length * 14 + 18
      if (y > 760) {
        pdf.addPage()
        y = 54
      }
    }

    return {
      artifact: {
        id: makeId('export'),
        type,
        fileName: `${fileStem}.pdf`,
        createdAt,
        status: 'ready' as const,
      },
      mimeType: 'application/pdf',
      base64: Buffer.from(pdf.output('arraybuffer')).toString('base64'),
    }
  }

  const blueprint =
    type === 'xlsx'
      ? {
          workbook: {
            sheets: [
              {
                name: 'Project Summary',
                rows: [
                  ['Project', project.title],
                  ['Mode', project.mode],
                  ['Citation Style', project.citationStyle],
                  ['Latest Score', String(project.scoreHistory.at(-1)?.overallScore ?? 'N/A')],
                ],
              },
            ],
          },
        }
      : {
          deck: {
            title: project.title,
            slides: (activeDraft?.contentJson.sections ?? []).map((section, index) => ({
              number: index + 1,
              title: section.title,
              bullets: section.body
                .split('. ')
                .slice(0, 4)
                .map((sentence) => sentence.trim())
                .filter(Boolean),
            })),
          },
        }

  return {
    artifact: {
      id: makeId('export'),
      type,
      fileName: `${fileStem}.${type}`,
      createdAt,
      status: 'blueprint' as const,
    },
    mimeType: 'application/json',
    base64: Buffer.from(JSON.stringify(blueprint, null, 2), 'utf8').toString('base64'),
  }
}

export async function createExportArtifact(project: WorkspaceProject, type: WorkspaceExportArtifact['type']) {
  const activeDraft = getActiveDraft(project)
  const fileStem = `${slug(project.title || 'workspace-project')}-${type}`
  const createdAt = nowIso()

  if (!activeDraft) {
    return createExportArtifactLegacy(project, type)
  }

  const profile = createFormattingProfile(project.citationStyle, activeDraft.contentJson.title, project.instructions)
  const parsed = parseDocumentText(activeDraft.contentMarkdown, activeDraft.contentJson.title)
  const references = parsed.references.length > 0
    ? parsed.references
    : buildReferenceEntriesFromSources(project.sourceLibrary, project.citationStyle)

  if (type === 'docx') {
    const footnoteMap = new Map(parsed.footnotes.map((footnote) => [footnote.id, footnote.text]))
    const runsWithFootnotes = (text: string) =>
      text.split(/(\[\^\d+\])/g).filter(Boolean).map((part) => {
        const match = part.match(/^\[\^(\d+)\]$/)
        if (match && footnoteMap.has(Number(match[1]))) {
          return new FootnoteReferenceRun(Number(match[1]))
        }
        return new TextRun({ text: part, size: profile.fontSizePt * 2, font: profile.fontFamily })
      })

    const children: Paragraph[] = []
    if (profile.coverPage) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2400, after: 360, line: 480 },
          children: [new TextRun({ text: parsed.title, bold: true, size: 28, font: profile.fontFamily })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240, line: 480 },
          children: [new TextRun({ text: profile.style, size: 24, font: profile.fontFamily })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240, line: 480 },
          children: [new TextRun({ text: `Prepared ${new Date().toLocaleDateString('en-US')}`, size: 24, font: profile.fontFamily })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      )
    } else {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 360, line: 480 },
          children: [new TextRun({ text: parsed.title, bold: true, size: 28, font: profile.fontFamily })],
        }),
      )
    }

    for (const section of parsed.sections) {
      if (section.heading !== 'Body') {
        children.push(
          new Paragraph({
            heading: section.level === 2 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: section.heading, bold: true, size: 24, font: profile.fontFamily })],
          }),
        )
      }
      for (const paragraph of section.paragraphs) {
        children.push(
          new Paragraph({
            spacing: { after: 160, line: 480 },
            indent: { firstLine: convertInchesToTwip(profile.paragraphIndentInches) },
            children: runsWithFootnotes(paragraph),
          }),
        )
      }
    }

    if (references.length > 0) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 360, after: 160 },
          children: [new TextRun({ text: profile.bibliographyHeading, bold: true, size: 24, font: profile.fontFamily })],
        }),
        ...references.map((reference) =>
          new Paragraph({
            spacing: { after: 160, line: 480 },
            indent: { hanging: convertInchesToTwip(0.5) },
            children: [new TextRun({ text: reference, size: 24, font: profile.fontFamily })],
          }),
        ),
      )
    }

    const doc = new Document({
      creator: 'HumaraGPT Workspace',
      title: parsed.title,
      description: `${profile.style} formatted academic export`,
      footnotes: Object.fromEntries(
        parsed.footnotes.map((footnote) => [
          String(footnote.id),
          {
            children: [
              new Paragraph({
                children: [new TextRun({ text: footnote.text, size: 20, font: profile.fontFamily })],
              }),
            ],
          },
        ]),
      ),
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                right: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1),
              },
            },
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    ...(profile.showRunningHead ? [new TextRun({ text: `${profile.runningHead} `, size: 20, font: profile.fontFamily })] : []),
                    new TextRun({ children: [PageNumber.CURRENT], size: 20, font: profile.fontFamily }),
                  ],
                }),
              ],
            }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `${profile.style} ${profile.paperMode} paper`, size: 18, font: profile.fontFamily })],
                }),
              ],
            }),
          },
          children,
        },
      ],
    })

    return {
      artifact: {
        id: makeId('export'),
        type,
        fileName: `${fileStem}.docx`,
        createdAt,
        status: 'ready' as const,
      },
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: await Packer.toBase64String(doc),
    }
  }

  if (type === 'pdf') {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const margin = 72
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    let y = margin

    const addPageIfNeeded = (height = 24) => {
      if (y + height > pageHeight - margin) {
        pdf.addPage()
        y = margin
      }
    }

    if (profile.coverPage) {
      pdf.setFont('times', 'bold')
      pdf.setFontSize(18)
      pdf.text(parsed.title, pageWidth / 2, pageHeight / 2 - 36, { align: 'center' })
      pdf.setFont('times', 'normal')
      pdf.setFontSize(12)
      pdf.text(profile.style, pageWidth / 2, pageHeight / 2, { align: 'center' })
      pdf.text(`Prepared ${new Date().toLocaleDateString('en-US')}`, pageWidth / 2, pageHeight / 2 + 24, { align: 'center' })
      pdf.addPage()
      y = margin
    } else {
      pdf.setFont('times', 'bold')
      pdf.setFontSize(16)
      pdf.text(parsed.title, pageWidth / 2, y, { align: 'center' })
      y += 36
    }

    for (const section of parsed.sections) {
      if (section.heading !== 'Body') {
        addPageIfNeeded(36)
        pdf.setFont('times', 'bold')
        pdf.setFontSize(13)
        pdf.text(section.heading, margin, y)
        y += 24
      }

      pdf.setFont('times', 'normal')
      pdf.setFontSize(12)
      for (const paragraph of section.paragraphs) {
        const lines = pdf.splitTextToSize(paragraph.replace(/\[\^(\d+)\]/g, '$1'), pageWidth - margin * 2)
        addPageIfNeeded(lines.length * 24)
        pdf.text(lines, margin, y)
        y += lines.length * 24 + 12
      }
    }

    if (references.length > 0) {
      addPageIfNeeded(48)
      pdf.setFont('times', 'bold')
      pdf.text(profile.bibliographyHeading, pageWidth / 2, y, { align: 'center' })
      y += 28
      pdf.setFont('times', 'normal')
      for (const reference of references) {
        const lines = pdf.splitTextToSize(reference, pageWidth - margin * 2)
        addPageIfNeeded(lines.length * 24)
        pdf.text(lines, margin + 36, y)
        y += lines.length * 24 + 10
      }
    }

    const totalPages = pdf.getNumberOfPages()
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(10)
      const header = profile.showRunningHead ? `${profile.runningHead} ${page}` : String(page)
      pdf.text(header, pageWidth - margin, 40, { align: 'right' })
      pdf.text(`${profile.style} ${profile.paperMode} paper`, pageWidth / 2, pageHeight - 36, { align: 'center' })
    }

    return {
      artifact: {
        id: makeId('export'),
        type,
        fileName: `${fileStem}.pdf`,
        createdAt,
        status: 'ready' as const,
      },
      mimeType: 'application/pdf',
      base64: Buffer.from(pdf.output('arraybuffer')).toString('base64'),
    }
  }

  if (type === 'pptx') {
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE'
    pptx.author = 'HumaraGPT Workspace'
    pptx.subject = `${profile.style} academic presentation`
    pptx.title = activeDraft.contentJson.title
    pptx.company = 'HumaraGPT'

    const addFooter = (slide: ReturnType<typeof pptx.addSlide>, index: number) => {
      slide.addText(`${profile.style} | ${index}`, {
        x: 0.5,
        y: 7.05,
        w: 12.3,
        h: 0.2,
        fontFace: 'Aptos',
        fontSize: 8,
        color: '666666',
        align: 'right',
      })
    }

    const titleSlide = pptx.addSlide()
    titleSlide.background = { color: 'F8FAFC' }
    titleSlide.addText(activeDraft.contentJson.title, {
      x: 0.8,
      y: 2.35,
      w: 11.7,
      h: 0.8,
      fontFace: 'Aptos Display',
      fontSize: 30,
      bold: true,
      color: '0F172A',
      align: 'center',
    })
    titleSlide.addText(`${profile.style} source-backed presentation`, {
      x: 0.8,
      y: 3.25,
      w: 11.7,
      h: 0.35,
      fontFace: 'Aptos',
      fontSize: 15,
      color: '334155',
      align: 'center',
    })
    titleSlide.addNotes(`Generated from the Humara Workspace draft.\n${references.slice(0, 3).join('\n')}`)
    addFooter(titleSlide, 1)

    activeDraft.contentJson.sections.forEach((section, index) => {
      const slide = pptx.addSlide()
      slide.background = { color: 'FFFFFF' }
      slide.addText(section.title, {
        x: 0.6,
        y: 0.45,
        w: 12,
        h: 0.45,
        fontFace: 'Aptos Display',
        fontSize: 24,
        bold: true,
        color: '0F172A',
      })
      const bullets = section.body
        .replace(/\([^)]*\d{4}[^)]*\)/g, '')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
        .slice(0, 5)

      slide.addText(bullets.map((text) => ({ text, options: { bullet: { type: 'bullet' } } })), {
        x: 0.85,
        y: 1.25,
        w: 11.2,
        h: 4.9,
        fontFace: 'Aptos',
        fontSize: 15,
        color: '1E293B',
        fit: 'shrink',
        valign: 'top',
      })
      const citations = section.citations
        .map((sourceId) => project.sourceLibrary.find((source) => source.id === sourceId))
        .filter((source): source is WorkspaceSource => Boolean(source))
        .map((source) => formatBibliographyEntry(source, project.citationStyle))
      slide.addNotes(citations.length > 0 ? citations.join('\n') : references.slice(0, 3).join('\n'))
      addFooter(slide, index + 2)
    })

    if (references.length > 0) {
      const referencesSlide = pptx.addSlide()
      referencesSlide.background = { color: 'F8FAFC' }
      referencesSlide.addText(profile.bibliographyHeading, {
        x: 0.6,
        y: 0.45,
        w: 12,
        h: 0.45,
        fontFace: 'Aptos Display',
        fontSize: 24,
        bold: true,
        color: '0F172A',
      })
      referencesSlide.addText(references.slice(0, 6).join('\n\n'), {
        x: 0.75,
        y: 1.15,
        w: 11.7,
        h: 5.55,
        fontFace: 'Aptos',
        fontSize: 9,
        color: '334155',
        fit: 'shrink',
        valign: 'top',
      })
      addFooter(referencesSlide, activeDraft.contentJson.sections.length + 2)
    }

    return {
      artifact: {
        id: makeId('export'),
        type,
        fileName: `${fileStem}.pptx`,
        createdAt,
        status: 'ready' as const,
      },
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      base64: await pptx.write({ outputType: 'base64' }) as string,
    }
  }

  return createExportArtifactLegacy(project, type)
}
