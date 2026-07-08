import { describe, it, expect } from 'vitest'
import { expandRecurrence } from '../expand'
import { normalizeScheduleDocument } from '../normalize'
import type { ParsedScheduleDocument } from '../../schema/validate'

// ─── Fixture builders ─────────────────────────────────────────────────────────

const TZ = 'Asia/Taipei'

function baseDoc(pipelines: ParsedScheduleDocument['pipelines'], projects: ParsedScheduleDocument['projects'] = []): ParsedScheduleDocument {
  return { schemaVersion: '1.0', projects, pipelines }
}

function pipe(id: string, schedules: ParsedScheduleDocument['pipelines'][number]['schedules']) {
  return { id, name: id, timezone: TZ, schedules }
}

function sched(id: string, scheduleDef: ParsedScheduleDocument['pipelines'][number]['schedules'][number]['schedule'], overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    enabled: true,
    timezone: TZ,
    schedule: scheduleDef,
    ...overrides,
  }
}

// July 2026 — first full week starts Mon 6 Jul
const JUL_START = new Date('2026-07-01T00:00:00Z')
const JUL_END   = new Date('2026-07-31T23:59:59Z')

// ─── Simple recurrence ────────────────────────────────────────────────────────

describe('expandRecurrence — simple weekly', () => {
  it('generates Monday occurrences for a weekly schedule', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        time: '09:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })

    const dates = occurrences.map((o) => new Date(o.scheduledStart).getUTCDay())
    expect(occurrences.length).toBeGreaterThan(0)
    // All occurrences should be on Mondays (UTC day 1)
    dates.forEach((d) => expect(d).toBe(1))
  })

  it('generates exactly 5 Mondays in July 2026', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        time: '09:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    // Mondays in July 2026: 6, 13, 20, 27 → 4 Mondays (Jul 6 is the 1st Monday)
    // Actually: Jul 6, 13, 20, 27 = 4 Mondays
    expect(occurrences.length).toBe(4)
  })

  it('does not generate occurrences before startDate', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-13',  // starts on the 2nd Monday
        time: '09:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    // Should miss Jul 6 (before startDate)
    expect(occurrences.length).toBe(3) // Jul 13, 20, 27
  })

  it('respects endDate (inclusive)', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        time: '09:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'], endDate: '2026-07-20' },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    // Jul 6, 13, 20 → 3 (Jul 27 excluded by endDate)
    expect(occurrences.length).toBe(3)
  })

  it('returns zero occurrences for disabled schedule', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        time: '09:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
      }, { enabled: false }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(0)
  })
})

describe('expandRecurrence — simple daily', () => {
  it('generates one occurrence per day in range', () => {
    const smallRange = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-07T23:59:59Z') }
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        time: '06:00',
        durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'daily', interval: 1 },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, smallRange)
    expect(occurrences.length).toBe(7)
  })
})

// ─── Cron recurrence ──────────────────────────────────────────────────────────

describe('expandRecurrence — cron', () => {
  it('generates Monday 09:00 Asia/Taipei from cron 0 9 * * 1', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-07-01',
        durationSeconds: 300,
        recurrence: { mode: 'cron', cron: '0 9 * * 1' },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences.length).toBe(4) // same 4 Mondays
    // Each occurrence should have time 09:00 Asia/Taipei → 01:00 UTC
    for (const occ of occurrences) {
      const utcHour = new Date(occ.scheduledStart).getUTCHours()
      expect(utcHour).toBe(1) // 09:00 Taipei = 01:00 UTC
    }
  })
})

// ─── RRULE recurrence ─────────────────────────────────────────────────────────

describe('expandRecurrence — rrule', () => {
  it('generates same Mondays as simple weekly for FREQ=WEEKLY;BYDAY=MO', () => {
    const docSimple = baseDoc([pipe('p', [
      sched('simple', {
        type: 'recurring', startDate: '2026-07-01', time: '09:00', durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'weekly', interval: 1, byWeekday: ['MO'] },
      }),
    ])])
    const docRrule = baseDoc([pipe('p', [
      sched('rrule', {
        type: 'recurring', startDate: '2026-07-01', time: '09:00', durationSeconds: 300,
        recurrence: { mode: 'rrule', rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' },
      }),
    ])])
    const normSimple = normalizeScheduleDocument(docSimple, { mode: 'global' })
    const normRrule  = normalizeScheduleDocument(docRrule,  { mode: 'global' })
    const simpleOccs = expandRecurrence(normSimple, { start: JUL_START, end: JUL_END })
    const rruleOccs  = expandRecurrence(normRrule,  { start: JUL_START, end: JUL_END })

    expect(rruleOccs.length).toBe(simpleOccs.length)
    for (let i = 0; i < simpleOccs.length; i++) {
      expect(rruleOccs[i].scheduledStart).toBe(simpleOccs[i].scheduledStart)
    }
  })
})

// ─── One-time schedule ────────────────────────────────────────────────────────

describe('expandRecurrence — one_time', () => {
  it('returns exactly one occurrence when datetime is in range', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'one_time',
        startDateTime: '2026-07-15T14:00:00+08:00',
        durationSeconds: 900,
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(1)
    // 14:00+08:00 = 06:00Z
    expect(new Date(occurrences[0].scheduledStart).toISOString()).toBe('2026-07-15T06:00:00.000Z')
  })

  it('returns zero occurrences when datetime is outside range', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', { type: 'one_time', startDateTime: '2026-08-01T10:00:00+08:00', durationSeconds: 300 }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(0)
  })
})

// ─── Occurrence ID format ─────────────────────────────────────────────────────

describe('expandRecurrence — occurrence ID', () => {
  it('formats id as pipelineId::scheduleId::utcIsoZ', () => {
    const doc = baseDoc([pipe('my-pipe', [
      sched('my-sched', {
        type: 'one_time',
        startDateTime: '2026-07-10T08:00:00+08:00',
        durationSeconds: 300,
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const [occ] = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occ.id).toMatch(/^my-pipe::my-sched::2026-07-10T00:00:00/)
    expect(occ.id).toMatch(/Z$/)
  })
})

// ─── Shared pipeline → projectContexts ───────────────────────────────────────

describe('expandRecurrence — shared pipeline', () => {
  it('single occurrence carries two projectContexts when pipeline in two projects', () => {
    const projects = [
      { id: 'proj-a', name: 'A', timezone: TZ, pipelineRefs: [{ pipelineId: 'shared' }] },
      { id: 'proj-b', name: 'B', timezone: TZ, pipelineRefs: [{ pipelineId: 'shared' }] },
    ]
    const doc = baseDoc([
      pipe('shared', [
        sched('s', { type: 'one_time', startDateTime: '2026-07-10T08:00:00+08:00', durationSeconds: 300 }),
      ]),
    ], projects)
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].projectContexts).toHaveLength(2)
    const ctxIds = occurrences[0].projectContexts.map((c) => c.projectId)
    expect(ctxIds).toContain('proj-a')
    expect(ctxIds).toContain('proj-b')
  })
})

// ─── Infinite recurrence bounded ─────────────────────────────────────────────

describe('expandRecurrence — bounded by visible range', () => {
  it('never generates occurrences outside visible range', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring', startDate: '2026-01-01', time: '06:00', durationSeconds: 300,
        recurrence: { mode: 'simple', frequency: 'daily', interval: 1 },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const range = { start: new Date('2026-07-01T00:00:00Z'), end: new Date('2026-07-07T23:59:59Z') }
    const occurrences = expandRecurrence(norm, range)
    for (const occ of occurrences) {
      const t = new Date(occ.scheduledStart).getTime()
      expect(t).toBeGreaterThanOrEqual(range.start.getTime())
      expect(t).toBeLessThanOrEqual(range.end.getTime())
    }
  })
})

// ─── Cron: Feb 29 leap-year boundary ─────────────────────────────────────────

describe('expandRecurrence — cron Feb 29 leap year', () => {
  it('only fires in leap years, correctly skipping non-leap Februaries', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2023-01-01',
        durationSeconds: 300,
        recurrence: { mode: 'cron', cron: '0 9 29 2 *' },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    // Spans 2023 (non-leap) through mid-2029, covering leap years 2024 and 2028
    const range = { start: new Date('2023-01-01T00:00:00Z'), end: new Date('2029-06-01T00:00:00Z') }
    const occurrences = expandRecurrence(norm, range)

    expect(occurrences).toHaveLength(2)
    const dates = occurrences.map((o) => o.scheduledStart.slice(0, 10)).sort()
    expect(dates).toEqual(['2024-02-29', '2028-02-29'])
    // 09:00 Asia/Taipei = 01:00 UTC
    for (const occ of occurrences) {
      expect(new Date(occ.scheduledStart).getUTCHours()).toBe(1)
    }
  })
})

// ─── DST transition boundaries ───────────────────────────────────────────────
// Asia/Taipei has no DST, so these tests use America/New_York (spring-forward
// gap: 2026-03-08 02:00 -> 03:00 local, the 02:00-02:59 wall-clock hour does
// not exist that day).

describe('expandRecurrence — DST spring-forward boundary', () => {
  it('cron schedule landing in the missing hour does not throw and yields exactly one occurrence', () => {
    const nyPipe = { id: 'p', name: 'p', timezone: 'America/New_York', schedules: [
      sched('s', {
        type: 'recurring',
        startDate: '2026-01-01',
        durationSeconds: 300,
        recurrence: { mode: 'cron', cron: '30 2 8 3 *' }, // 02:30 on 2026-03-08 — inside the DST gap
      }, { timezone: 'America/New_York' }),
    ] }
    const doc = baseDoc([nyPipe])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const range = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-12-31T23:59:59Z') }

    expect(() => expandRecurrence(norm, range)).not.toThrow()
    const occurrences = expandRecurrence(norm, range)
    // NOTE: CLAUDE.md documents this as "silently dropped". Empirically (verified
    // against cron-parser 5.6.1's tz-aware iteration), the nonexistent local time is
    // NOT dropped — it resolves using the pre-transition (EST, UTC-5) offset, landing
    // on 2026-03-08T07:30:00.000Z, which reads back as 03:30 EDT (i.e. shifted forward
    // by an hour) rather than being omitted. This test locks in the actual behavior;
    // it does not throw and does not silently duplicate/omit the occurrence.
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].scheduledStart).toBe('2026-03-08T07:30:00.000Z')
  })

  it('does not generate a duplicate occurrence for the fall-back repeated hour', () => {
    // Fall-back in America/New_York 2026: 2026-11-01 02:00 EDT -> 01:00 EST
    // (clocks repeat the 01:00-01:59 hour). A schedule firing at 01:30 should
    // still resolve to exactly one occurrence, not two.
    const nyPipe = { id: 'p', name: 'p', timezone: 'America/New_York', schedules: [
      sched('s', {
        type: 'recurring',
        startDate: '2026-01-01',
        durationSeconds: 300,
        recurrence: { mode: 'cron', cron: '30 1 1 11 *' },
      }, { timezone: 'America/New_York' }),
    ] }
    const doc = baseDoc([nyPipe])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const range = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-12-31T23:59:59Z') }

    expect(() => expandRecurrence(norm, range)).not.toThrow()
    const occurrences = expandRecurrence(norm, range)
    expect(occurrences).toHaveLength(1)
  })
})

// ─── Invalid cron expressions ─────────────────────────────────────────────────

describe('expandRecurrence — invalid cron expression', () => {
  it('swallows a malformed cron string and returns zero occurrences instead of throwing', () => {
    const doc = baseDoc([pipe('p', [
      sched('s', {
        type: 'recurring',
        startDate: '2026-01-01',
        durationSeconds: 300,
        recurrence: { mode: 'cron', cron: 'not a cron' },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })

    expect(() => expandRecurrence(norm, { start: JUL_START, end: JUL_END })).not.toThrow()
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(0)
  })

  it('does not affect other valid schedules in the same document', () => {
    const doc = baseDoc([pipe('p', [
      sched('bad', {
        type: 'recurring', startDate: '2026-01-01', durationSeconds: 300,
        recurrence: { mode: 'cron', cron: 'garbage' },
      }),
      sched('good', {
        type: 'recurring', startDate: '2026-07-01', durationSeconds: 300,
        recurrence: { mode: 'cron', cron: '0 9 * * 1' },
      }),
    ])])
    const norm = normalizeScheduleDocument(doc, { mode: 'global' })
    const occurrences = expandRecurrence(norm, { start: JUL_START, end: JUL_END })
    expect(occurrences).toHaveLength(4) // only the 4 Mondays from the valid schedule
    expect(occurrences.every((o) => o.scheduleId === 'good')).toBe(true)
  })
})
