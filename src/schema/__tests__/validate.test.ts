import { describe, it, expect, vi } from 'vitest'
import { parseScheduleDocument } from '../validate'

// ─── Minimal raw fixture builders (plain JSON — mirrors real source data) ────

function makeSchedule(id: string, timezone = 'Asia/Taipei', overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    enabled: true,
    timezone,
    schedule: {
      type: 'recurring',
      startDate: '2026-07-06',
      time: '09:00',
      durationSeconds: 300,
      recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
    },
    ...overrides,
  }
}

function makePipeline(id: string, timezone = 'Asia/Taipei', schedules: Array<Record<string, unknown>> = [], overrides: Record<string, unknown> = {}) {
  return { id, name: id, timezone, schedules, ...overrides }
}

function makeProject(id: string, timezone = 'Asia/Taipei', pipelineIds: string[] = []) {
  return {
    id,
    name: id,
    timezone,
    pipelineRefs: pipelineIds.map((pid) => ({ pipelineId: pid })),
  }
}

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    projects: [],
    pipelines: [],
    ...overrides,
  }
}

// ─── Control: fully valid document ───────────────────────────────────────────

describe('parseScheduleDocument — valid document (control)', () => {
  it('parses a well-formed document with no errors', () => {
    const doc = makeDoc({
      projects: [makeProject('proj-a', 'Asia/Taipei', ['pipe-1'])],
      pipelines: [makePipeline('pipe-1', 'Asia/Taipei', [makeSchedule('sched-1', 'Asia/Taipei')])],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pipelines).toHaveLength(1)
      expect(result.data.projects).toHaveLength(1)
    }
  })
})

// ─── Rule: pipelineRefs must point to existing pipeline ids ─────────────────

describe('parseScheduleDocument — pipelineRefs must reference existing pipelines', () => {
  it('rejects a project pipelineRef pointing to a nonexistent pipeline id', () => {
    const doc = makeDoc({
      projects: [makeProject('proj-a', 'Asia/Taipei', ['does-not-exist'])],
      pipelines: [makePipeline('pipe-1', 'Asia/Taipei', [makeSchedule('sched-1')])],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(false)
    if (!result.success) {
      const err = result.errors.find((e) => e.message.includes('does not match any pipeline id'))
      expect(err).toBeDefined()
      expect(err?.path).toBe('projects[id="proj-a"].pipelineRefs')
      expect(err?.message).toContain('does-not-exist')
    }
  })
})

// ─── Rule: pipeline timezone must equal all child schedule timezones ────────

describe('parseScheduleDocument — pipeline/schedule timezone must match', () => {
  it('rejects a schedule whose timezone differs from its pipeline timezone', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [makeSchedule('sched-1', 'America/New_York')]),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(false)
    if (!result.success) {
      const err = result.errors.find((e) => e.message.includes('must equal pipeline timezone'))
      expect(err).toBeDefined()
      expect(err?.path).toBe('pipelines[id="pipe-1"].schedules[id="sched-1"].timezone')
      expect(err?.message).toContain('America/New_York')
      expect(err?.message).toContain('Asia/Taipei')
    }
  })
})

// ─── Rule: pipeline.projectRefs in source JSON is derived-only ──────────────

describe('parseScheduleDocument — pipeline.projectRefs in source JSON', () => {
  it('warns (but does not fail validation) when source pipeline includes projectRefs', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [makeSchedule('sched-1')], {
          projectRefs: [{ projectId: 'proj-a' }],
        }),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(consoleSpy).toHaveBeenCalledOnce()
    expect(consoleSpy.mock.calls[0][0]).toContain('projectRefs')
    // Not treated as a validation error — this is a warning-only rule.
    expect(result.success).toBe(true)
    consoleSpy.mockRestore()
  })
})

// ─── Rule: dependency ids must use pipelineId::scheduleId format ────────────

describe('parseScheduleDocument — dependency id format', () => {
  it('rejects a blockedByScheduleIds entry missing the pipelineId::scheduleId separator', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [
          makeSchedule('sched-1', 'Asia/Taipei', {
            dependencies: { blockedByScheduleIds: ['just-a-schedule-id'] },
          }),
        ]),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(false)
    if (!result.success) {
      const err = result.errors.find((e) => e.message.includes('pipelineId::scheduleId'))
      expect(err).toBeDefined()
    }
  })

  it('accepts a blockedByScheduleIds entry in the correct pipelineId::scheduleId format', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [
          makeSchedule('sched-1', 'Asia/Taipei', {
            dependencies: { blockedByScheduleIds: ['other-pipe::other-sched'] },
          }),
        ]),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(true)
  })
})

// ─── Rule: monthly byMonthDay 29-31 must use rrule instead ──────────────────

describe('parseScheduleDocument — simple monthly byMonthDay range', () => {
  it('rejects byMonthDay values 29-31 (must use rrule mode)', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [
          makeSchedule('sched-1', 'Asia/Taipei', {
            schedule: {
              type: 'recurring',
              startDate: '2026-07-06',
              time: '09:00',
              durationSeconds: 300,
              recurrence: { mode: 'simple', frequency: 'monthly', interval: 1, byMonthDay: 30 },
            },
          }),
        ]),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(false)
    if (!result.success) {
      const err = result.errors.find((e) => e.message.includes('use mode: "rrule"'))
      expect(err).toBeDefined()
    }
  })

  it('accepts byMonthDay -1 (last day of month)', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [
        makePipeline('pipe-1', 'Asia/Taipei', [
          makeSchedule('sched-1', 'Asia/Taipei', {
            schedule: {
              type: 'recurring',
              startDate: '2026-07-06',
              time: '09:00',
              durationSeconds: 300,
              recurrence: { mode: 'simple', frequency: 'monthly', interval: 1, byMonthDay: -1 },
            },
          }),
        ]),
      ],
    })
    const result = parseScheduleDocument(doc)
    expect(result.success).toBe(true)
  })
})
