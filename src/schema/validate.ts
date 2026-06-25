import { z } from 'zod'
import { DEFAULT_DURATION_SECONDS, DEFAULT_TIMEZONE } from './types'

// ─── Recurrence ───────────────────────────────────────────────────────────────

const WeekdayEnum = z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])

const SimpleRecurrenceSchema = z.object({
  mode: z.literal('simple'),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).default(1),
  byWeekday: z.array(WeekdayEnum).optional(),
  byMonthDay: z
    .number()
    .int()
    .refine(
      (d) => (d >= 1 && d <= 28) || d === -1,
      { message: 'byMonthDay must be 1–28 or -1 (last day). For days 29–31 use mode: "rrule".' },
    )
    .optional(),
  endDate: z.string().nullable().optional(),
})

const RRuleRecurrenceSchema = z.object({
  mode: z.literal('rrule'),
  rrule: z.string().min(1, 'rrule string must not be empty'),
  endDate: z.string().nullable().optional(),
})

const CronRecurrenceSchema = z.object({
  mode: z.literal('cron'),
  cron: z.string().min(1, 'cron expression must not be empty'),
  endDate: z.string().nullable().optional(),
})

const RecurrenceSchema = z.discriminatedUnion('mode', [
  SimpleRecurrenceSchema,
  RRuleRecurrenceSchema,
  CronRecurrenceSchema,
])

// ─── Schedule Def ─────────────────────────────────────────────────────────────

const OneTimeScheduleDefSchema = z.object({
  type: z.literal('one_time'),
  startDateTime: z.string().min(1),
  durationSeconds: z.number().int().min(1).default(DEFAULT_DURATION_SECONDS),
})

const RecurringScheduleDefSchema = z.object({
  type: z.literal('recurring'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:mm').optional(),
  durationSeconds: z.number().int().min(1).default(DEFAULT_DURATION_SECONDS),
  recurrence: RecurrenceSchema,
})

const ScheduleDefSchema = z.discriminatedUnion('type', [
  OneTimeScheduleDefSchema,
  RecurringScheduleDefSchema,
])

// ─── Tags ─────────────────────────────────────────────────────────────────────

const ProjectTagsSchema = z.object({
  purpose: z.array(z.string()).optional(),
  stakeholder: z.array(z.string()).optional(),
  lifecycle: z.string().optional(),
  priorityTier: z.string().optional(),
  projectOwner: z.array(z.string()).optional(),
  custom: z.array(z.string()).optional(),
}).optional()

const PipelineTagsSchema = z.object({
  dataDomain: z.array(z.string()).optional(),
  pipelineType: z.array(z.string()).optional(),
  sourceSystem: z.array(z.string()).optional(),
  targetSystem: z.array(z.string()).optional(),
  pipelineOwner: z.array(z.string()).optional(),
  escalationOwner: z.array(z.string()).optional(),
  cadenceClass: z.array(z.string()).optional(),
  reliabilityCriticality: z.string().optional(),
  failureModeRisk: z.array(z.string()).optional(),
  custom: z.array(z.string()).optional(),
}).optional()

const ScheduleTagsSchema = z.object({
  owner: z.array(z.string()).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  runType: z.enum(['automated', 'manual', 'semi-automated']).optional(),
  sourceType: z.array(z.string()).optional(),
  expectedDuration: z.enum(['short', 'medium', 'long']).optional(),
  maintenanceWindow: z.string().optional(),
  reviewState: z.enum(['confirmed', 'needs-review', 'assumed', 'deprecated']).optional(),
  environmentScope: z.string().optional(),
  custom: z.array(z.string()).optional(),
}).optional()

// ─── Schedule ─────────────────────────────────────────────────────────────────

const ScheduleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean(),
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
  schedule: ScheduleDefSchema,
  tags: ScheduleTagsSchema,
  operationalChecklist: z.object({
    hasFallback: z.boolean().optional(),
    hasNotification: z.boolean().optional(),
    hasValidation: z.boolean().optional(),
    requiresManualCheck: z.boolean().optional(),
    isBlocking: z.boolean().optional(),
    canRetry: z.boolean().optional(),
  }).optional(),
  output: z.object({
    outputDescription: z.string().optional(),
    outputLocation: z.string().optional(),
    outputFormat: z.string().optional(),
    outputNamingPattern: z.string().optional(),
    downstreamNotes: z.string().optional(),
  }).optional(),
  source: z.object({
    system: z.string().optional(),
    reference: z.string().optional(),
    documentationUrl: z.string().nullable().optional(),
  }).optional(),
  dependencies: z.object({
    blockedByScheduleIds: z
      .array(
        z.string().regex(
          /^[^:]+::[^:]+$/,
          'blockedByScheduleIds entries must use format pipelineId::scheduleId',
        ),
      )
      .optional(),
    blocksScheduleIds: z
      .array(
        z.string().regex(
          /^[^:]+::[^:]+$/,
          'blocksScheduleIds entries must use format pipelineId::scheduleId',
        ),
      )
      .optional(),
  }).optional(),
  notes: z.string().optional(),
  needsReview: z.boolean().optional(),
  assumptions: z.array(z.string()).optional(),
})

// ─── Pipeline ─────────────────────────────────────────────────────────────────

const PipelineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
  tags: PipelineTagsSchema,
  operationalChecklist: z.object({
    hasFallback: z.boolean().optional(),
    fallbackNotes: z.string().nullable().optional(),
    hasBackup: z.boolean().optional(),
    backupNotes: z.string().nullable().optional(),
    hasNotification: z.boolean().optional(),
    notificationNotes: z.string().nullable().optional(),
    hasValidation: z.boolean().optional(),
    validationNotes: z.string().nullable().optional(),
    hasSilentFailureRisk: z.boolean().optional(),
    silentFailureNotes: z.string().nullable().optional(),
  }).optional(),
  dependencies: z.object({
    upstreamPipelineIds: z.array(z.string()).optional(),
    downstreamPipelineIds: z.array(z.string()).optional(),
  }).optional(),
  schedules: z.array(ScheduleSchema),
})

// ─── Project ──────────────────────────────────────────────────────────────────

const PipelineRefSchema = z.object({
  pipelineId: z.string().min(1),
  role: z.string().optional(),
  notes: z.string().optional(),
})

const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE),
  tags: ProjectTagsSchema,
  pipelineRefs: z.array(PipelineRefSchema),
})

// ─── Document Root ────────────────────────────────────────────────────────────

const ScheduleDocumentSchema = z.object({
  schemaVersion: z.string().min(1),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional(),
  tagCatalog: z.record(z.string(), z.any()).optional(),
  projects: z.array(ProjectSchema),
  pipelines: z.array(PipelineSchema),
})

export type ParsedScheduleDocument = z.infer<typeof ScheduleDocumentSchema>

// ─── Cross-entity validation (run after Zod parse) ───────────────────────────

export interface CrossEntityError {
  path: string
  message: string
}

function validateCrossEntityRules(
  doc: ParsedScheduleDocument,
  rawDoc: Record<string, unknown>,
): CrossEntityError[] {
  const errors: CrossEntityError[] = []
  const pipelineIds = new Set(doc.pipelines.map((p) => p.id))

  // Warn if source JSON contained pipeline.projectRefs (derived field)
  const rawPipelines = rawDoc['pipelines']
  if (Array.isArray(rawPipelines)) {
    for (const rawP of rawPipelines as Array<Record<string, unknown>>) {
      if (rawP['projectRefs'] !== undefined) {
        console.warn(
          `[warn] pipeline "${rawP['id']}": "projectRefs" found in source JSON and will be ignored. ` +
          `It is derived by normalization — do not include it in source data.`,
        )
      }
    }
  }

  // pipelineRefs must point to existing pipeline ids
  for (const project of doc.projects) {
    for (const ref of project.pipelineRefs) {
      if (!pipelineIds.has(ref.pipelineId)) {
        errors.push({
          path: `projects[id="${project.id}"].pipelineRefs`,
          message: `pipelineRef "${ref.pipelineId}" does not match any pipeline id`,
        })
      }
    }
  }

  // Pipeline timezone must equal all child schedule timezones
  for (const pipeline of doc.pipelines) {
    const pipeTz = pipeline.timezone
    for (const schedule of pipeline.schedules) {
      const schedTz = schedule.timezone
      if (schedTz !== pipeTz) {
        errors.push({
          path: `pipelines[id="${pipeline.id}"].schedules[id="${schedule.id}"].timezone`,
          message:
            `schedule timezone "${schedTz}" must equal pipeline timezone "${pipeTz}"`,
        })
      }
    }
  }

  return errors
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ParseSuccess {
  success: true
  data: ParsedScheduleDocument
}

export interface ParseFailure {
  success: false
  errors: Array<{ path: string; message: string }>
}

export function parseScheduleDocument(raw: unknown): ParseSuccess | ParseFailure {
  const zodResult = ScheduleDocumentSchema.safeParse(raw)

  if (!zodResult.success) {
    return {
      success: false,
      errors: zodResult.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    }
  }

  const crossErrors = validateCrossEntityRules(
    zodResult.data,
    raw as Record<string, unknown>,
  )

  if (crossErrors.length > 0) {
    return { success: false, errors: crossErrors }
  }

  return { success: true, data: zodResult.data }
}
