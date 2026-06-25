import { DEFAULT_TIMEZONE } from '../schema/types'
import type {
  ProjectContext,
  ProjectTags,
  PipelineTags,
  ScheduleTags,
  ViewContext,
  DocumentMetadata,
  TagCatalog,
} from '../schema/types'
import type { ParsedScheduleDocument } from '../schema/validate'

// ─── Normalized types ─────────────────────────────────────────────────────────

type ParsedSchedule   = ParsedScheduleDocument['pipelines'][number]['schedules'][number]
type ParsedPipeline   = ParsedScheduleDocument['pipelines'][number]
type ParsedProject    = ParsedScheduleDocument['projects'][number]

export interface NormalizedSchedule extends Omit<ParsedSchedule, 'tags'> {
  directTags: ScheduleTags
  inheritedTags: PipelineTags
}

export interface NormalizedPipeline extends Omit<ParsedPipeline, 'schedules'> {
  schedules: NormalizedSchedule[]
  projectRefs: ProjectContext[]
}

export interface NormalizedDocument {
  schemaVersion: string
  metadata?: DocumentMetadata
  tagCatalog?: TagCatalog
  projects: ParsedProject[]
  pipelines: NormalizedPipeline[]
  displayTimezone: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveDisplayTimezone(doc: ParsedScheduleDocument, ctx: ViewContext): string {
  if (ctx.mode === 'project') {
    const p = doc.projects.find((pr) => pr.id === ctx.id)
    return p?.timezone ?? DEFAULT_TIMEZONE
  }
  if (ctx.mode === 'pipeline') {
    const p = doc.pipelines.find((pl) => pl.id === ctx.id)
    return p?.timezone ?? DEFAULT_TIMEZONE
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function buildProjectRefsByPipeline(doc: ParsedScheduleDocument): Map<string, ProjectContext[]> {
  const map = new Map<string, ProjectContext[]>()
  for (const project of doc.projects) {
    for (const ref of project.pipelineRefs) {
      const existing = map.get(ref.pipelineId) ?? []
      existing.push({
        projectId:       project.id,
        projectName:     project.name,
        projectTimezone: project.timezone,
        projectTags:     (project.tags as ProjectTags | undefined),
        pipelineRole:    ref.role,
      })
      map.set(ref.pipelineId, existing)
    }
  }
  return map
}

function injectDtstart(schedule: ParsedSchedule): ParsedSchedule {
  const def = schedule.schedule
  if (def.type !== 'recurring') return schedule
  if (def.recurrence.mode !== 'rrule') return schedule

  const startDate = def.startDate.replace(/-/g, '')
  const time      = (def.time ?? '00:00').replace(':', '')
  const dtstart   = `DTSTART;TZID=${schedule.timezone}:${startDate}T${time}00`

  // Remove any existing DTSTART line then prepend canonical value
  const cleaned = def.recurrence.rrule.replace(/^DTSTART[^\n]*\n?/m, '').trim()
  const newRrule = `${dtstart}\n${cleaned}`

  return {
    ...schedule,
    schedule: {
      ...def,
      recurrence: { ...def.recurrence, rrule: newRrule },
    },
  }
}

function normalizeSchedule(schedule: ParsedSchedule, pipelineTags: PipelineTags | undefined): NormalizedSchedule {
  const withDtstart = injectDtstart(schedule)
  const { tags, ...rest } = withDtstart as ParsedSchedule & { tags?: ScheduleTags }
  return {
    ...rest,
    directTags:    tags ?? {},
    inheritedTags: pipelineTags ?? {},
  }
}

function normalizePipeline(
  pipeline: ParsedPipeline,
  projectRefs: ProjectContext[],
): NormalizedPipeline {
  // Warn if source pipeline incorrectly contained projectRefs
  const raw = pipeline as unknown as Record<string, unknown>
  if (raw['projectRefs'] !== undefined) {
    console.warn(
      `[warn] pipeline "${pipeline.id}": "projectRefs" found in source data and will be ignored. ` +
      `It is derived by normalization — do not include it in source JSON.`,
    )
  }

  const normalizedSchedules = pipeline.schedules.map((s) =>
    normalizeSchedule(s, pipeline.tags as PipelineTags | undefined),
  )

  return {
    ...pipeline,
    schedules: normalizedSchedules,
    projectRefs,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function normalizeScheduleDocument(
  doc: ParsedScheduleDocument,
  viewContext: ViewContext,
): NormalizedDocument {
  const projectRefsByPipeline = buildProjectRefsByPipeline(doc)
  const displayTimezone = resolveDisplayTimezone(doc, viewContext)

  const normalizedPipelines = doc.pipelines.map((pipeline) =>
    normalizePipeline(pipeline, projectRefsByPipeline.get(pipeline.id) ?? []),
  )

  return {
    schemaVersion: doc.schemaVersion,
    metadata:      doc.metadata,
    tagCatalog:    doc.tagCatalog,
    projects:      doc.projects,
    pipelines:     normalizedPipelines,
    displayTimezone,
  }
}
