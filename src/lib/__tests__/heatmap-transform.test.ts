import { describe, it, expect } from 'vitest'
import { buildHeatmapData, intensityLevel, toDayKey } from '../heatmap-transform'
import type { CalendarOccurrence } from '../../schema/types'

function makeOcc(overrides: Partial<CalendarOccurrence>): CalendarOccurrence {
  return {
    id: overrides.id ?? 'p1::s1::2026-07-08T00:00:00Z',
    pipelineId: 'p1',
    pipelineName: 'Pipeline One',
    scheduleId: 's1',
    scheduleTitle: 'Schedule One',
    scheduledStart: '2026-07-08T00:00:00Z',
    scheduledEnd: '2026-07-08T00:05:00Z',
    durationSeconds: 300,
    displayTimezone: 'Asia/Taipei',
    recurrenceMode: 'cron',
    directTags: {},
    inheritedTags: {},
    projectContexts: [],
    ...overrides,
  }
}

describe('toDayKey', () => {
  it('crosses the UTC day boundary into the next local day for Asia/Taipei (+8)', () => {
    // 23:00 UTC on 2026-07-08 is 07:00 the next day in Asia/Taipei
    expect(toDayKey('2026-07-08T23:00:00Z', 'Asia/Taipei')).toBe('2026-07-09')
  })

  it('stays on the same UTC day when timezone is UTC', () => {
    expect(toDayKey('2026-07-08T23:00:00Z', 'UTC')).toBe('2026-07-08')
  })

  it('crosses the day boundary backward for a negative-offset timezone', () => {
    // 02:00 UTC on 2026-07-08 is still 2026-07-07 22:00 in America/New_York (-4 EDT in July)
    expect(toDayKey('2026-07-08T02:00:00Z', 'America/New_York')).toBe('2026-07-07')
  })
})

describe('buildHeatmapData', () => {
  it('returns empty maps for empty input', () => {
    const result = buildHeatmapData([], 'UTC')
    expect(result.overview.size).toBe(0)
    expect(result.byPipeline.size).toBe(0)
    expect(result.bySchedule.size).toBe(0)
  })

  it('aggregates multiple occurrences on the same day', () => {
    const occs = [
      makeOcc({ id: 'a', scheduledStart: '2026-07-08T01:00:00Z' }),
      makeOcc({ id: 'b', scheduledStart: '2026-07-08T05:00:00Z' }),
      makeOcc({ id: 'c', scheduledStart: '2026-07-08T10:00:00Z' }),
    ]
    const result = buildHeatmapData(occs, 'UTC')
    expect(result.overview.get('2026-07-08')).toBe(3)
    expect(result.byPipeline.get('p1')?.days.get('2026-07-08')).toBe(3)
    expect(result.bySchedule.get('s1')?.days.get('2026-07-08')).toBe(3)
  })

  it('buckets by pipeline and schedule independently across multiple entities', () => {
    const occs = [
      makeOcc({ id: 'a', pipelineId: 'p1', pipelineName: 'P1', scheduleId: 's1', scheduleTitle: 'S1' }),
      makeOcc({ id: 'b', pipelineId: 'p2', pipelineName: 'P2', scheduleId: 's2', scheduleTitle: 'S2' }),
    ]
    const result = buildHeatmapData(occs, 'UTC')
    expect(result.overview.get('2026-07-08')).toBe(2)
    expect(result.byPipeline.size).toBe(2)
    expect(result.bySchedule.size).toBe(2)
    expect(result.byPipeline.get('p2')?.name).toBe('P2')
  })

  it('recomputes correctly when called again with a filtered subset (no shared mutable state)', () => {
    const occs = [
      makeOcc({ id: 'a', pipelineId: 'p1' }),
      makeOcc({ id: 'b', pipelineId: 'p2', pipelineName: 'P2', scheduleId: 's2', scheduleTitle: 'S2' }),
    ]
    const full = buildHeatmapData(occs, 'UTC')
    const filtered = buildHeatmapData([occs[0]], 'UTC')
    expect(full.byPipeline.size).toBe(2)
    expect(filtered.byPipeline.size).toBe(1)
  })
})

describe('intensityLevel', () => {
  it('returns 0 for zero or negative count', () => {
    expect(intensityLevel(0, 10)).toBe(0)
    expect(intensityLevel(-1, 10)).toBe(0)
  })

  it('returns 4 when max is 0 but count is positive (degenerate guard)', () => {
    expect(intensityLevel(1, 0)).toBe(4)
  })

  it('splits the non-zero range into quartiles of max', () => {
    expect(intensityLevel(1, 4)).toBe(1)  // ratio 0.25
    expect(intensityLevel(2, 4)).toBe(2)  // ratio 0.5
    expect(intensityLevel(3, 4)).toBe(3)  // ratio 0.75
    expect(intensityLevel(4, 4)).toBe(4)  // ratio 1.0
  })

  it('is monotonically non-decreasing as count increases toward max', () => {
    const max = 20
    let prev = 0
    for (let count = 0; count <= max; count++) {
      const level = intensityLevel(count, max)
      expect(level).toBeGreaterThanOrEqual(prev)
      prev = level
    }
  })
})
