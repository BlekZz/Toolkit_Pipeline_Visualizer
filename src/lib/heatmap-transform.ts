import type { CalendarOccurrence } from '../schema/types'

// ─── Heatmap data aggregation (pure functions, no DOM) ────────────────────────
//
// Design notes:
// - `dayKey` is always `YYYY-MM-DD`, computed by rendering `scheduledStart`
//   (a UTC ISO instant) through an `Intl.DateTimeFormat` configured with the
//   given IANA `timezone` and the `en-CA` locale, which happens to format
//   dates as `YYYY-MM-DD` natively — no manual string surgery required.
// - Formatters are expensive to construct, so one is cached per timezone in
//   a module-level Map and reused across calls (mirrors the P6 formatter
//   cache pattern already used in `expand.ts`).
// - `intensityLevel` buckets a count into 5 discrete levels (0–4) using
//   fixed quantile thresholds of `max` (25/50/75%), matching the GitHub
//   contribution-graph convention: level 0 is reserved exclusively for
//   `count === 0` (rendered as an outlined/empty cell, never green), and
//   levels 1–4 split the non-zero range into quartiles of the day's busiest
//   count. This keeps the mapping monotonically increasing in count and
//   stable regardless of the absolute magnitude of `max`.

export interface HeatmapBucket {
  name: string
  days: Map<string, number>
}

export interface HeatmapData {
  overview: Map<string, number>
  byPipeline: Map<string, HeatmapBucket>
  bySchedule: Map<string, HeatmapBucket>
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timezone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timezone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formatterCache.set(timezone, fmt)
  }
  return fmt
}

/** Formats a UTC ISO instant as a `YYYY-MM-DD` day key in the given timezone. */
export function toDayKey(isoUtc: string, timezone: string): string {
  return getFormatter(timezone).format(new Date(isoUtc))
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function bumpBucket(
  buckets: Map<string, HeatmapBucket>,
  id: string,
  name: string,
  dayKey: string,
): void {
  let bucket = buckets.get(id)
  if (!bucket) {
    bucket = { name, days: new Map() }
    buckets.set(id, bucket)
  }
  bump(bucket.days, dayKey)
}

export function buildHeatmapData(occs: CalendarOccurrence[], timezone: string): HeatmapData {
  const overview: Map<string, number> = new Map()
  const byPipeline: Map<string, HeatmapBucket> = new Map()
  const bySchedule: Map<string, HeatmapBucket> = new Map()

  for (const occ of occs) {
    const dayKey = toDayKey(occ.scheduledStart, timezone)
    bump(overview, dayKey)
    bumpBucket(byPipeline, occ.pipelineId, occ.pipelineName, dayKey)
    bumpBucket(bySchedule, occ.scheduleId, occ.scheduleTitle, dayKey)
  }

  return { overview, byPipeline, bySchedule }
}

/**
 * Maps a raw occurrence count to a 5-step intensity level (0–4).
 *
 * - `0` is reserved for `count === 0` (empty/outlined cell).
 * - `1`–`4` split the non-zero range into quartiles of `max`
 *   (<=25%, <=50%, <=75%, >75%), so intensity is monotonically
 *   non-decreasing in `count` and stable across different `max` scales.
 */
export function intensityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (max <= 0) return 4
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}
