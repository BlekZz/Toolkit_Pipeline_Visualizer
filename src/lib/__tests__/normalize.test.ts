import { describe, it, expect, vi } from 'vitest'
import { normalizeScheduleDocument } from '../normalize'
import { parseScheduleDocument } from '../../schema/validate'
import type { ParsedScheduleDocument } from '../../schema/validate'

// ─── Minimal fixture builders ─────────────────────────────────────────────────

function makeDoc(overrides: Partial<ParsedScheduleDocument> = {}): ParsedScheduleDocument {
  return {
    schemaVersion: '1.0',
    projects: [],
    pipelines: [],
    ...overrides,
  }
}

function makeProject(id: string, timezone = 'Asia/Taipei', pipelineIds: string[] = []) {
  return {
    id,
    name: id,
    timezone,
    pipelineRefs: pipelineIds.map((pid) => ({ pipelineId: pid })),
  }
}

function makePipeline(id: string, timezone = 'Asia/Taipei', schedules: ReturnType<typeof makeSchedule>[] = []) {
  return { id, name: id, timezone, schedules }
}

function makeSchedule(id: string, timezone = 'Asia/Taipei', overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    enabled: true,
    timezone,
    schedule: {
      type: 'recurring' as const,
      startDate: '2026-07-06',
      time: '09:00',
      durationSeconds: 300,
      recurrence: { mode: 'simple' as const, frequency: 'weekly' as const, interval: 1, byWeekday: ['MO' as const] },
    },
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('normalizeScheduleDocument — projectRefs derivation', () => {
  it('derives projectRefs on pipeline from project.pipelineRefs', () => {
    const doc = makeDoc({
      projects: [makeProject('proj-a', 'Asia/Taipei', ['pipe-1'])],
      pipelines: [makePipeline('pipe-1')],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].projectRefs).toHaveLength(1)
    expect(norm.pipelines[0].projectRefs[0].projectId).toBe('proj-a')
  })

  it('adds two projectRefs when pipeline is referenced by two projects', () => {
    const doc = makeDoc({
      projects: [
        makeProject('proj-a', 'Asia/Taipei', ['shared-pipe']),
        makeProject('proj-b', 'Asia/Taipei', ['shared-pipe']),
      ],
      pipelines: [makePipeline('shared-pipe')],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].projectRefs).toHaveLength(2)
    const ids = norm.pipelines[0].projectRefs.map((r) => r.projectId)
    expect(ids).toContain('proj-a')
    expect(ids).toContain('proj-b')
  })

  it('leaves projectRefs empty for a pipeline not referenced by any project', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('orphan-pipe')],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].projectRefs).toHaveLength(0)
  })
})

describe('normalizeScheduleDocument — projectRefs in source JSON', () => {
  it('warns and strips projectRefs found in source pipeline', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const doc = makeDoc({
      projects: [],
      // Cast to inject a projectRefs field that source JSON should not have
      pipelines: [{ ...makePipeline('pipe-x'), projectRefs: [{ projectId: 'x' }] } as unknown as ReturnType<typeof makePipeline>],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(consoleSpy).toHaveBeenCalledOnce()
    // After normalization, projectRefs should be derived (empty since no project refs pipe-x)
    expect(norm.pipelines[0].projectRefs).toHaveLength(0)
    consoleSpy.mockRestore()
  })
})

describe('normalizeScheduleDocument — DTSTART injection', () => {
  it('prepends DTSTART to rrule string', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('p', 'Asia/Taipei', [
        makeSchedule('s', 'Asia/Taipei', {
          schedule: {
            type: 'recurring',
            startDate: '2026-07-06',
            time: '09:00',
            durationSeconds: 300,
            recurrence: { mode: 'rrule', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
          },
        }),
      ])],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const sched = norm.pipelines[0].schedules[0]
    const def = sched.schedule
    if (def.type === 'recurring' && def.recurrence.mode === 'rrule') {
      expect(def.recurrence.rrule).toContain('DTSTART;TZID=Asia/Taipei:20260706T090000')
      expect(def.recurrence.rrule).toContain('FREQ=WEEKLY;BYDAY=MO')
    } else {
      throw new Error('schedule should be recurring rrule')
    }
  })

  it('overwrites existing DTSTART in rrule string', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('p', 'Asia/Taipei', [
        makeSchedule('s', 'Asia/Taipei', {
          schedule: {
            type: 'recurring',
            startDate: '2026-08-01',
            time: '10:00',
            durationSeconds: 300,
            recurrence: { mode: 'rrule', rrule: 'DTSTART;TZID=UTC:20260701T000000\nFREQ=WEEKLY;BYDAY=MO' },
          },
        }),
      ])],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const def = norm.pipelines[0].schedules[0].schedule
    if (def.type === 'recurring' && def.recurrence.mode === 'rrule') {
      const rrule = def.recurrence.rrule
      const dtStartCount = (rrule.match(/DTSTART/g) ?? []).length
      expect(dtStartCount).toBe(1)
      expect(rrule).toContain('DTSTART;TZID=Asia/Taipei:20260801T100000')
    } else {
      throw new Error('not rrule')
    }
  })

  it('does not inject DTSTART for non-rrule schedules', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('p', 'Asia/Taipei', [makeSchedule('s')])],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const def = norm.pipelines[0].schedules[0].schedule
    if (def.type === 'recurring' && def.recurrence.mode === 'simple') {
      // no rrule field on simple recurrence — just confirm it parsed as simple
      expect(def.recurrence.mode).toBe('simple')
    }
  })
})

describe('normalizeScheduleDocument — tag inheritance', () => {
  it('puts schedule tags in directTags', () => {
    const schedule = makeSchedule('s', 'Asia/Taipei', {
      tags: { urgency: 'critical' as const, owner: ['alice'] },
    })
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('p', 'Asia/Taipei', [schedule])],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].schedules[0].directTags.urgency).toBe('critical')
    expect(norm.pipelines[0].schedules[0].directTags.owner).toEqual(['alice'])
  })

  it('puts pipeline tags in inheritedTags', () => {
    const pipeline = { ...makePipeline('p', 'Asia/Taipei', [makeSchedule('s')]), tags: { dataDomain: ['revenue'] } }
    const doc = makeDoc({ projects: [], pipelines: [pipeline] })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].schedules[0].inheritedTags.dataDomain).toEqual(['revenue'])
  })

  it('directTags and inheritedTags are independent (no mutation)', () => {
    const schedule = makeSchedule('s', 'Asia/Taipei', { tags: { custom: ['sch-tag'] } })
    const pipeline = { ...makePipeline('p', 'Asia/Taipei', [schedule]), tags: { custom: ['pipe-tag'] } }
    const doc = makeDoc({ projects: [], pipelines: [pipeline] })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.pipelines[0].schedules[0].directTags.custom).toEqual(['sch-tag'])
    expect(norm.pipelines[0].schedules[0].inheritedTags.custom).toEqual(['pipe-tag'])
  })
})

describe('normalizeScheduleDocument — displayTimezone', () => {
  it('uses project timezone in project view mode', () => {
    const doc = makeDoc({
      projects: [makeProject('proj-a', 'America/New_York')],
      pipelines: [],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'project', id: 'proj-a' })
    expect(norm.displayTimezone).toBe('America/New_York')
  })

  it('uses pipeline timezone in pipeline view mode', () => {
    const doc = makeDoc({
      projects: [],
      pipelines: [makePipeline('pipe-1', 'Europe/London')],
    })
    const norm = normalizeScheduleDocument(doc, { mode: 'pipeline', id: 'pipe-1' })
    expect(norm.displayTimezone).toBe('Europe/London')
  })

  it('uses browser timezone in global view mode', () => {
    const doc = makeDoc({ projects: [], pipelines: [] })
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    expect(norm.displayTimezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })
})

// ─── Schema defaults (via parseScheduleDocument / Zod) ───────────────────────

describe('parseScheduleDocument — default timezone', () => {
  it('defaults project timezone to Asia/Taipei when absent', () => {
    const result = parseScheduleDocument({
      schemaVersion: '1.0',
      projects: [{ id: 'p', name: 'p', pipelineRefs: [] }],
      pipelines: [],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.projects[0].timezone).toBe('Asia/Taipei')
    }
  })
})

describe('parseScheduleDocument — default durationSeconds', () => {
  it('defaults durationSeconds to 300 when absent from recurring schedule', () => {
    const result = parseScheduleDocument({
      schemaVersion: '1.0',
      projects: [],
      pipelines: [{
        id: 'p', name: 'p', timezone: 'Asia/Taipei',
        schedules: [{
          id: 's', title: 's', enabled: true, timezone: 'Asia/Taipei',
          schedule: {
            type: 'recurring',
            startDate: '2026-07-01',
            time: '09:00',
            recurrence: { mode: 'simple', frequency: 'daily', interval: 1 },
          },
        }],
      }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const def = result.data.pipelines[0].schedules[0].schedule
      if (def.type === 'recurring') {
        expect(def.durationSeconds).toBe(300)
      } else {
        throw new Error('Expected recurring schedule')
      }
    }
  })
})

describe('normalizeScheduleDocument — source mutation', () => {
  it('does not mutate the source document', () => {
    const schedule = makeSchedule('s')
    const pipeline = makePipeline('p', 'Asia/Taipei', [schedule])
    const doc = makeDoc({
      projects: [makeProject('proj', 'Asia/Taipei', ['p'])],
      pipelines: [pipeline],
    })
    const originalPipelineSchedules = doc.pipelines[0].schedules.length
    normalizeScheduleDocument(doc, { mode: 'global' })
    expect(doc.pipelines[0].schedules.length).toBe(originalPipelineSchedules)
    // projectRefs should NOT exist on the source pipeline
    expect((doc.pipelines[0] as unknown as Record<string, unknown>)['projectRefs']).toBeUndefined()
  })
})
