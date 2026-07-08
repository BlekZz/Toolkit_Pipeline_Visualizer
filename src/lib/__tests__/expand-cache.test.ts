import { describe, it, expect, vi } from 'vitest'
import { createExpandCacheState, getOccurrencesCached } from '../expand-cache'
import type { NormalizedDocument } from '../normalize'
import type { CalendarOccurrence } from '../../schema/types'

// expandFn is stubbed out — these tests only verify the caching/invalidation
// policy, not real recurrence expansion (covered by expand.test.ts).

function fakeDoc(): NormalizedDocument {
  return {
    schemaVersion: '1.0',
    projects: [],
    pipelines: [],
    displayTimezone: 'UTC',
  }
}

function range(startIso: string, endIso: string) {
  return { start: new Date(startIso), end: new Date(endIso) }
}

describe('getOccurrencesCached', () => {
  it('calls expandFn on first request', () => {
    const state = createExpandCacheState()
    const doc = fakeDoc()
    const expandFn = vi.fn<() => CalendarOccurrence[]>().mockReturnValue([])
    getOccurrencesCached(state, doc, range('2026-01-01', '2026-12-31'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(1)
  })

  it('does not recompute when the new range is a subset of the cached range', () => {
    const state = createExpandCacheState()
    const doc = fakeDoc()
    const occs: CalendarOccurrence[] = [
      { id: 'a', pipelineId: 'p', pipelineName: 'p', scheduleId: 's', scheduleTitle: 's',
        scheduledStart: '2026-06-01T00:00:00Z', scheduledEnd: '2026-06-01T00:05:00Z',
        durationSeconds: 300, displayTimezone: 'UTC', recurrenceMode: 'cron',
        directTags: {}, inheritedTags: {}, projectContexts: [] },
    ]
    const expandFn = vi.fn<() => CalendarOccurrence[]>().mockReturnValue(occs)

    getOccurrencesCached(state, doc, range('2026-01-01', '2026-12-31'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(1)

    // Shrink the range — should be served from cache, no recompute
    const result = getOccurrencesCached(state, doc, range('2026-05-01', '2026-07-01'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(1)
  })

  it('filters cached occurrences to the requested subset range', () => {
    const state = createExpandCacheState()
    const doc = fakeDoc()
    const occs: CalendarOccurrence[] = [
      { id: 'in-range', pipelineId: 'p', pipelineName: 'p', scheduleId: 's', scheduleTitle: 's',
        scheduledStart: '2026-06-15T00:00:00Z', scheduledEnd: '2026-06-15T00:05:00Z',
        durationSeconds: 300, displayTimezone: 'UTC', recurrenceMode: 'cron',
        directTags: {}, inheritedTags: {}, projectContexts: [] },
      { id: 'out-of-range', pipelineId: 'p', pipelineName: 'p', scheduleId: 's', scheduleTitle: 's',
        scheduledStart: '2026-11-01T00:00:00Z', scheduledEnd: '2026-11-01T00:05:00Z',
        durationSeconds: 300, displayTimezone: 'UTC', recurrenceMode: 'cron',
        directTags: {}, inheritedTags: {}, projectContexts: [] },
    ]
    const expandFn = vi.fn<() => CalendarOccurrence[]>().mockReturnValue(occs)

    getOccurrencesCached(state, doc, range('2026-01-01', '2026-12-31'), expandFn)
    const result = getOccurrencesCached(state, doc, range('2026-06-01', '2026-07-01'), expandFn)

    expect(expandFn).toHaveBeenCalledTimes(1)
    expect(result.map((o) => o.id)).toEqual(['in-range'])
  })

  it('recomputes when the new range extends beyond the cached range', () => {
    const state = createExpandCacheState()
    const doc = fakeDoc()
    const expandFn = vi.fn<() => CalendarOccurrence[]>().mockReturnValue([])

    getOccurrencesCached(state, doc, range('2026-06-01', '2026-06-30'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(1)

    // Wider range than cached — must recompute
    getOccurrencesCached(state, doc, range('2026-01-01', '2026-12-31'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(2)
  })

  it('invalidates the cache when the document reference changes (e.g. new import)', () => {
    const state = createExpandCacheState()
    const doc1 = fakeDoc()
    const doc2 = fakeDoc()
    const expandFn = vi.fn<() => CalendarOccurrence[]>().mockReturnValue([])

    getOccurrencesCached(state, doc1, range('2026-01-01', '2026-12-31'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(1)

    // Same (subset) range, but a different document instance
    getOccurrencesCached(state, doc2, range('2026-06-01', '2026-07-01'), expandFn)
    expect(expandFn).toHaveBeenCalledTimes(2)
  })
})
