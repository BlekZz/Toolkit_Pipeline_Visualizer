import { describe, it, expect } from 'vitest'
import { toGanttData } from '../gantt-transform'
import type { CalendarOccurrence } from '../../schema/types'
import type { ProjectContext } from '../../schema/types'

const ctx = (id = 'proj-a'): ProjectContext => ({
  projectId: id,
  projectName: id === 'proj-a' ? 'Project A' : id,
  projectTimezone: 'Asia/Taipei',
})

function makeOcc(overrides: Partial<CalendarOccurrence>): CalendarOccurrence {
  return {
    id: overrides.id ?? 'p1::s1::2026-07-01T00:00:00Z',
    pipelineId: 'p1',
    pipelineName: 'Pipeline One',
    scheduleId: 's1',
    scheduleTitle: 'Schedule One',
    scheduledStart: '2026-07-01T00:00:00Z',
    scheduledEnd: '2026-07-01T00:05:00Z',
    durationSeconds: 300,
    displayTimezone: 'Asia/Taipei',
    recurrenceMode: 'cron',
    directTags: {},
    inheritedTags: {},
    projectContexts: [ctx()],
    ...overrides,
  }
}

describe('toGanttData — week preset (per-occurrence, default behavior)', () => {
  it('produces one task bar per occurrence under the schedule row', () => {
    const occs = [
      makeOcc({ id: 'a', scheduledStart: '2026-07-01T00:00:00Z', scheduledEnd: '2026-07-01T00:05:00Z' }),
      makeOcc({ id: 'b', scheduledStart: '2026-07-02T00:00:00Z', scheduledEnd: '2026-07-02T00:05:00Z' }),
      makeOcc({ id: 'c', scheduledStart: '2026-07-03T00:00:00Z', scheduledEnd: '2026-07-03T00:05:00Z' }),
    ]
    const tasks = toGanttData(occs, true, 'week')
    // 3 hierarchy rows (project, pipeline, schedule) + 3 occurrence bars
    expect(tasks.length).toBe(6)
    const occTasks = tasks.filter((t) => String(t.id).startsWith('occ-'))
    expect(occTasks.length).toBe(3)
    expect(occTasks.every((t) => t._occCount === undefined)).toBe(true)
  })
})

describe('toGanttData — month/quarter/year preset (aggregated)', () => {
  it('collapses all occurrences of a schedule into a single aggregated bar', () => {
    const occs = [
      makeOcc({ id: 'a', scheduledStart: '2026-07-01T00:00:00Z', scheduledEnd: '2026-07-01T00:05:00Z' }),
      makeOcc({ id: 'b', scheduledStart: '2026-07-15T00:00:00Z', scheduledEnd: '2026-07-15T00:05:00Z' }),
      makeOcc({ id: 'c', scheduledStart: '2026-07-30T00:00:00Z', scheduledEnd: '2026-07-30T00:05:00Z' }),
    ]
    const tasks = toGanttData(occs, true, 'month')

    // task count = project + pipeline + schedule rows + 1 aggregated bar
    expect(tasks.length).toBe(4)

    const agg = tasks.find((t) => String(t.id).startsWith('agg-'))
    expect(agg).toBeDefined()
    expect(agg!.id).toBe('agg-s1')
    expect(agg!.parent).toBe('sched-s1')

    // span = first occurrence start -> last occurrence end
    expect(agg!.start!.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(agg!.end!.toISOString()).toBe('2026-07-30T00:05:00.000Z')

    // occurrence count badge
    expect((agg as unknown as { _occCount: number })._occCount).toBe(3)
  })

  it('keeps schedules separate — one aggregated bar each', () => {
    const occs = [
      makeOcc({ id: 'a', scheduleId: 's1', scheduledStart: '2026-07-01T00:00:00Z', scheduledEnd: '2026-07-01T00:05:00Z' }),
      makeOcc({ id: 'b', scheduleId: 's2', scheduleTitle: 'Schedule Two', scheduledStart: '2026-07-02T00:00:00Z', scheduledEnd: '2026-07-02T00:05:00Z' }),
    ]
    const tasks = toGanttData(occs, true, 'quarter')
    const aggBars = tasks.filter((t) => String(t.id).startsWith('agg-'))
    expect(aggBars.length).toBe(2)
  })

  it('picks the worst urgency among aggregated occurrences', () => {
    const occs = [
      makeOcc({ id: 'a', directTags: { urgency: 'low' } }),
      makeOcc({ id: 'b', directTags: { urgency: 'critical' } }),
      makeOcc({ id: 'c', directTags: { urgency: 'medium' } }),
    ]
    const tasks = toGanttData(occs, true, 'year')
    const agg = tasks.find((t) => String(t.id).startsWith('agg-')) as unknown as { _urgency: string }
    expect(agg._urgency).toBe('critical')
  })

  it('guarantees a minimum visible bar width even for a single occurrence', () => {
    const occs = [makeOcc({ id: 'a' })]
    const tasks = toGanttData(occs, true, 'month')
    const agg = tasks.find((t) => String(t.id).startsWith('agg-'))!
    expect(agg.end!.getTime() - agg.start!.getTime()).toBeGreaterThanOrEqual(30 * 60 * 1000)
  })
})
