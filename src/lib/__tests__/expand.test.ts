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
