// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEZONE = 'Asia/Taipei'
export const DEFAULT_DURATION_SECONDS = 300

// ─── Recurrence ───────────────────────────────────────────────────────────────

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

export interface SimpleRecurrence {
  mode: 'simple'
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number
  byWeekday?: Weekday[]    // weekly only
  byMonthDay?: number      // monthly only: 1–28 or -1 (last day)
  endDate?: string | null  // inclusive YYYY-MM-DD
}

export interface RRuleRecurrence {
  mode: 'rrule'
  rrule: string            // DTSTART injected by normalization
  endDate?: string | null
}

export interface CronRecurrence {
  mode: 'cron'
  cron: string             // interpreted in schedule.timezone
  endDate?: string | null
}

export type Recurrence = SimpleRecurrence | RRuleRecurrence | CronRecurrence

export interface OneTimeScheduleDef {
  type: 'one_time'
  startDateTime: string    // ISO 8601 with offset
  durationSeconds?: number
}

export interface RecurringScheduleDef {
  type: 'recurring'
  startDate: string        // YYYY-MM-DD
  time?: string            // HH:mm (omit for cron mode)
  durationSeconds?: number
  recurrence: Recurrence
}

export type ScheduleDef = OneTimeScheduleDef | RecurringScheduleDef

// ─── Tags ─────────────────────────────────────────────────────────────────────

export interface ProjectTags {
  purpose?: string[]
  stakeholder?: string[]
  lifecycle?: string
  priorityTier?: string
  projectOwner?: string[]
  custom?: string[]
}

export interface PipelineTags {
  dataDomain?: string[]
  pipelineType?: string[]
  sourceSystem?: string[]
  targetSystem?: string[]
  pipelineOwner?: string[]
  escalationOwner?: string[]
  cadenceClass?: string[]
  reliabilityCriticality?: string
  failureModeRisk?: string[]
  custom?: string[]
}

export interface ScheduleTags {
  owner?: string[]
  urgency?: 'low' | 'medium' | 'high' | 'critical'
  runType?: 'automated' | 'manual' | 'semi-automated'
  sourceType?: string[]
  expectedDuration?: 'short' | 'medium' | 'long'
  maintenanceWindow?: string
  reviewState?: 'confirmed' | 'needs-review' | 'assumed' | 'deprecated'
  environmentScope?: string
  custom?: string[]
}

// ─── Pipeline Operational Checklist ───────────────────────────────────────────

export interface PipelineChecklist {
  hasFallback?: boolean
  fallbackNotes?: string | null
  hasBackup?: boolean
  backupNotes?: string | null
  hasNotification?: boolean
  notificationNotes?: string | null
  hasValidation?: boolean
  validationNotes?: string | null
  hasSilentFailureRisk?: boolean
  silentFailureNotes?: string | null
}

export interface ScheduleChecklist {
  hasFallback?: boolean
  hasNotification?: boolean
  hasValidation?: boolean
  requiresManualCheck?: boolean
  isBlocking?: boolean
  canRetry?: boolean
}

// ─── Schedule Output ──────────────────────────────────────────────────────────

export interface ScheduleOutput {
  outputDescription?: string
  outputLocation?: string
  outputFormat?: string
  outputNamingPattern?: string
  downstreamNotes?: string
}

// ─── Schedule Source ──────────────────────────────────────────────────────────

export interface ScheduleSource {
  system?: string
  reference?: string
  documentationUrl?: string | null
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export interface ScheduleDependencies {
  blockedByScheduleIds?: string[]  // format: pipelineId::scheduleId
  blocksScheduleIds?: string[]
}

export interface PipelineDependencies {
  upstreamPipelineIds?: string[]
  downstreamPipelineIds?: string[]
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface PipelineRef {
  pipelineId: string
  role?: string
  notes?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  timezone: string
  tags?: ProjectTags
  pipelineRefs: PipelineRef[]
}

export interface Schedule {
  id: string
  title: string
  description?: string
  enabled: boolean
  timezone: string
  schedule: ScheduleDef
  tags?: ScheduleTags
  operationalChecklist?: ScheduleChecklist
  output?: ScheduleOutput
  source?: ScheduleSource
  dependencies?: ScheduleDependencies
  notes?: string
  needsReview?: boolean
  assumptions?: string[]
}

export interface Pipeline {
  id: string
  name: string
  description?: string
  timezone: string
  tags?: PipelineTags
  operationalChecklist?: PipelineChecklist
  dependencies?: PipelineDependencies
  schedules: Schedule[]
  // projectRefs is DERIVED by normalization — must not appear in source JSON
  projectRefs?: never
}

// ─── Document Root ────────────────────────────────────────────────────────────

export interface DocumentMetadata {
  name?: string
  description?: string
  updatedAt?: string
}

export interface TagCatalog {
  project?: Record<string, string[]>
  pipeline?: Record<string, string[]>
  schedule?: Record<string, string[]>
}

export interface ScheduleDocument {
  schemaVersion: string
  metadata?: DocumentMetadata
  tagCatalog?: TagCatalog
  projects: Project[]
  pipelines: Pipeline[]
}

// ─── View Context ─────────────────────────────────────────────────────────────

export type ViewContextMode = 'project' | 'pipeline' | 'global'

export interface ViewContext {
  mode: ViewContextMode
  id?: string
}

// ─── Calendar Occurrence ──────────────────────────────────────────────────────

export interface ProjectContext {
  projectId: string
  projectName: string
  projectTimezone: string
  projectTags?: ProjectTags
  pipelineRole?: string
}

export interface CalendarOccurrence {
  /** Format: pipelineId::scheduleId::scheduledStartUTC */
  id: string
  pipelineId: string
  pipelineName: string
  scheduleId: string
  scheduleTitle: string
  /** UTC ISO 8601 with Z suffix */
  scheduledStart: string
  /** UTC ISO 8601 with Z suffix */
  scheduledEnd: string
  durationSeconds: number
  displayTimezone: string
  recurrenceMode: 'simple' | 'rrule' | 'cron' | 'one_time'
  /** Tags defined directly on the schedule */
  directTags: ScheduleTags
  /** Tags inherited from the pipeline (fill gaps not covered by directTags) */
  inheritedTags: PipelineTags
  /** All projects that reference the pipeline containing this schedule */
  projectContexts: ProjectContext[]
  needsReview?: boolean
  assumptions?: string[]
  /** Raw rule string: cron expression, rrule string, simple summary, or one-time ISO datetime */
  recurrenceSource?: string
}
