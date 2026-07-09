import { useMemo, useState } from 'react'
import type { CalendarOccurrence } from './schema/types'
import { buildHeatmapData, intensityLevel, toDayKey, type HeatmapBucket } from './lib/heatmap-transform'
import { pipelineColor } from './lib/gantt-transform'
import './HeatmapView.css'

// ─── Heatmap tab: Overview (GitHub-style annual grid) + Tracker (habit rows) ──
//
// Design decisions (see dev/Sprint_Perf_And_Visual_Overhaul.md M4 for spec):
// - Week starts on Sunday, matching the GitHub contribution graph convention
//   this view is modeled after. Cells outside the selected year (the partial
//   weeks at the very start/end of the 53-column grid) render muted and are
//   not interactive.
// - Overview color scale is a fixed 5-step green ramp (level 0 = outlined
//   empty cell, 1-4 = increasing green) — colorblind-safe because it relies
//   on lightness/saturation steps, not a hue distinction.
// - Tracker mode scales each row independently (per-pipeline/per-schedule
//   max), so a low-volume pipeline still shows visible contrast instead of
//   being flattened to level 0/1 by a single global max.
// - Date range for Tracker mode is derived from the occurrences actually
//   passed in, capped at the most recent 120 days, with horizontal scroll
//   for anything wider than the viewport.
// - Row cap of 50 in Tracker mode is a hard render-cost guard; anything
//   beyond that is summarized in a one-line notice rather than rendered.

const GREEN_SCALE = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROW_DAY_LABELS: Record<number, string> = { 1: 'Mon', 3: 'Wed', 5: 'Fri' }
const MAX_TRACKER_ROWS = 60
const MAX_TRACKER_DAYS = 120

export interface HeatmapViewProps {
  occs: CalendarOccurrence[]
  /** Timezone used to bucket occurrences into calendar days. Defaults to the browser's local timezone. */
  timezone?: string
  /** Called when a day cell is clicked. If omitted, an internal fallback popup lists the day's occurrences. */
  onDayClick?: (dayKey: string, dayOccs: CalendarOccurrence[]) => void
  /** Called when an occurrence is picked from the internal fallback popup (ignored if onDayClick is provided). */
  onSelectOcc?: (occ: CalendarOccurrence) => void
}

interface HoverInfo {
  x: number
  y: number
  dayKey: string
  count: number
  titles: string[]
}

interface DayPopupState {
  dayKey: string
  occs: CalendarOccurrence[]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const TRACKER_ALPHA: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 }

function addDaysUTC(date: Date, days: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function ymdUTC(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function topTitlesForDay(occs: CalendarOccurrence[], dayKey: string, timezone: string, limit = 5): string[] {
  const matches = occs.filter((o) => toDayKey(o.scheduledStart, timezone) === dayKey)
  return matches.slice(0, limit).map((o) => o.scheduleTitle)
}

function occsForDay(occs: CalendarOccurrence[], dayKey: string, timezone: string): CalendarOccurrence[] {
  return occs.filter((o) => toDayKey(o.scheduledStart, timezone) === dayKey)
}

function occsForBucketDay(
  occs: CalendarOccurrence[],
  dayKey: string,
  timezone: string,
  idField: 'pipelineId' | 'scheduleId',
  id: string,
): CalendarOccurrence[] {
  return occs.filter((o) => o[idField] === id && toDayKey(o.scheduledStart, timezone) === dayKey)
}

// ─── Overview grid model ──────────────────────────────────────────────────────

interface OverviewCell {
  dayKey: string
  inYear: boolean
  col: number
  row: number
}

function buildOverviewGrid(year: number): OverviewCell[] {
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const startOffset = jan1.getUTCDay() // 0 = Sunday
  const gridStart = addDaysUTC(jan1, -startOffset)
  const cells: OverviewCell[] = []
  for (let col = 0; col < 53; col++) {
    for (let row = 0; row < 7; row++) {
      const d = addDaysUTC(gridStart, col * 7 + row)
      cells.push({ dayKey: ymdUTC(d), inYear: d.getUTCFullYear() === year, col, row })
    }
  }
  return cells
}

function monthLabelsForGrid(cells: OverviewCell[]): Map<number, string> {
  const labels = new Map<number, string>()
  let lastMonth = -1
  for (const cell of cells) {
    if (cell.row !== 0) continue
    if (!cell.inYear) continue
    const month = Number(cell.dayKey.slice(5, 7)) - 1
    if (month !== lastMonth) {
      labels.set(cell.col, MONTH_NAMES[month])
      lastMonth = month
    }
  }
  return labels
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HeatmapView({ occs, timezone, onDayClick, onSelectOcc }: HeatmapViewProps) {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [mode, setMode] = useState<'overview' | 'tracker'>('overview')
  const [granularity, setGranularity] = useState<'pipeline' | 'schedule'>('pipeline')
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [dayPopup, setDayPopup] = useState<DayPopupState | null>(null)

  const heatmap = useMemo(() => buildHeatmapData(occs, tz), [occs, tz])

  const availableYears = useMemo(() => {
    const years = new Set<number>()
    for (const dayKey of heatmap.overview.keys()) years.add(Number(dayKey.slice(0, 4)))
    return [...years].sort()
  }, [heatmap])

  const [year, setYear] = useState<number>(() => new Date().getFullYear())
  const effectiveYear = availableYears.includes(year)
    ? year
    : (availableYears[availableYears.length - 1] ?? new Date().getFullYear())

  const overviewMax = useMemo(() => Math.max(0, ...heatmap.overview.values()), [heatmap])
  const overviewCells = useMemo(() => buildOverviewGrid(effectiveYear), [effectiveYear])
  const monthLabels = useMemo(() => monthLabelsForGrid(overviewCells), [overviewCells])

  function handleDayClick(dayKey: string, dayOccs: CalendarOccurrence[]) {
    if (onDayClick) {
      onDayClick(dayKey, dayOccs)
      return
    }
    setDayPopup({ dayKey, occs: dayOccs })
  }

  function showHover(e: React.MouseEvent, dayKey: string, count: number, titles: string[]) {
    setHover({ x: e.clientX, y: e.clientY, dayKey, count, titles })
  }

  const buckets: Map<string, HeatmapBucket> = granularity === 'pipeline' ? heatmap.byPipeline : heatmap.bySchedule
  const bucketEntries = useMemo(() => [...buckets.entries()], [buckets])
  const visibleBuckets = bucketEntries.slice(0, MAX_TRACKER_ROWS)
  const hiddenBucketCount = bucketEntries.length - visibleBuckets.length

  const trackerDays = useMemo(() => {
    if (occs.length === 0) return [] as string[]
    let minMs = Infinity
    let maxMs = -Infinity
    for (const o of occs) {
      const ms = new Date(o.scheduledStart).getTime()
      if (ms < minMs) minMs = ms
      if (ms > maxMs) maxMs = ms
    }
    const start = new Date(minMs)
    const end = new Date(maxMs)
    const days: string[] = []
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
    while (cursor <= endDay && days.length < MAX_TRACKER_DAYS + 1) {
      days.push(ymdUTC(cursor))
      cursor = addDaysUTC(cursor, 1)
    }
    return days.length > MAX_TRACKER_DAYS ? days.slice(-MAX_TRACKER_DAYS) : days
  }, [occs])

  return (
    <div className="heatmap-view">
      <div className="heatmap-toolbar">
        <div className="heatmap-mode-tabs">
          <button
            className={mode === 'overview' ? 'heatmap-tab-btn active' : 'heatmap-tab-btn'}
            onClick={() => setMode('overview')}
          >
            Overview
          </button>
          <button
            className={mode === 'tracker' ? 'heatmap-tab-btn active' : 'heatmap-tab-btn'}
            onClick={() => setMode('tracker')}
          >
            Tracker
          </button>
        </div>

        {mode === 'overview' && availableYears.length > 1 && (
          <div className="heatmap-year-picker">
            {availableYears.map((y) => (
              <button
                key={y}
                className={y === effectiveYear ? 'heatmap-year-btn active' : 'heatmap-year-btn'}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {mode === 'tracker' && (
          <div className="heatmap-granularity-tabs">
            <button
              className={granularity === 'pipeline' ? 'heatmap-tab-btn active' : 'heatmap-tab-btn'}
              onClick={() => setGranularity('pipeline')}
            >
              By Pipeline
            </button>
            <button
              className={granularity === 'schedule' ? 'heatmap-tab-btn active' : 'heatmap-tab-btn'}
              onClick={() => setGranularity('schedule')}
            >
              By Schedule
            </button>
          </div>
        )}
      </div>

      {mode === 'overview' && (
        <div className="heatmap-overview">
          <div className="heatmap-overview-grid" style={{ gridTemplateColumns: `auto repeat(53, 1fr)` }}>
            <div className="heatmap-corner" />
            {Array.from({ length: 53 }, (_, col) => (
              <div key={`m-${col}`} className="heatmap-month-label">
                {monthLabels.get(col) ?? ''}
              </div>
            ))}
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <div key={`row-${row}`} className="heatmap-row-fragment" style={{ display: 'contents' }}>
                <div className="heatmap-day-label">{ROW_DAY_LABELS[row] ?? ''}</div>
                {overviewCells
                  .filter((c) => c.row === row)
                  .map((cell) => {
                    const count = heatmap.overview.get(cell.dayKey) ?? 0
                    const level = intensityLevel(count, overviewMax)
                    return (
                      <div
                        key={cell.dayKey + cell.col}
                        className={`heatmap-cell${cell.inYear ? '' : ' heatmap-cell--muted'}`}
                        style={{ backgroundColor: GREEN_SCALE[level] }}
                        onMouseEnter={(e) =>
                          cell.inYear &&
                          showHover(e, cell.dayKey, count, topTitlesForDay(occs, cell.dayKey, tz))
                        }
                        onMouseLeave={() => setHover(null)}
                        onClick={() => cell.inYear && handleDayClick(cell.dayKey, occsForDay(occs, cell.dayKey, tz))}
                      />
                    )
                  })}
              </div>
            ))}
          </div>

          <div className="heatmap-legend">
            <span>Less</span>
            {GREEN_SCALE.map((color, i) => (
              <div key={i} className="heatmap-legend-swatch" style={{ backgroundColor: color }} />
            ))}
            <span>More</span>
          </div>
        </div>
      )}

      {mode === 'tracker' && (
        <div className="heatmap-tracker">
          {bucketEntries.length === 0 && <p className="heatmap-empty">No occurrences to display.</p>}

          {bucketEntries.length > 0 && (
            <div className="heatmap-tracker-scroll">
              <div className="heatmap-tracker-grid">
                {visibleBuckets.map(([id, bucket]) => {
                  const color = pipelineColor(id)
                  const rowMax = Math.max(0, ...bucket.days.values())
                  return (
                    <div key={id} className="heatmap-tracker-row">
                      <div className="heatmap-tracker-row-label">
                        <span className="heatmap-tracker-dot" style={{ backgroundColor: color }} />
                        <span className="heatmap-tracker-row-name" title={bucket.name}>
                          {bucket.name}
                        </span>
                      </div>
                      <div className="heatmap-tracker-cells">
                        {trackerDays.map((dayKey) => {
                          const count = bucket.days.get(dayKey) ?? 0
                          const level = intensityLevel(count, rowMax)
                          const bg = level === 0 ? 'transparent' : hexToRgba(color, TRACKER_ALPHA[level])
                          return (
                            <div
                              key={dayKey}
                              className={`heatmap-cell heatmap-cell--tracker${level === 0 ? ' heatmap-cell--muted' : ''}`}
                              style={{ backgroundColor: bg }}
                              onMouseEnter={(e) =>
                                showHover(
                                  e,
                                  dayKey,
                                  count,
                                  topTitlesForDay(
                                    occsForBucketDay(
                                      occs,
                                      dayKey,
                                      tz,
                                      granularity === 'pipeline' ? 'pipelineId' : 'scheduleId',
                                      id,
                                    ),
                                    dayKey,
                                    tz,
                                  ),
                                )
                              }
                              onMouseLeave={() => setHover(null)}
                              onClick={() =>
                                handleDayClick(
                                  dayKey,
                                  occsForBucketDay(
                                    occs,
                                    dayKey,
                                    tz,
                                    granularity === 'pipeline' ? 'pipelineId' : 'scheduleId',
                                    id,
                                  ),
                                )
                              }
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {hiddenBucketCount > 0 && (
            <p className="heatmap-truncation-notice">
              {hiddenBucketCount} more {granularity === 'pipeline' ? 'pipelines' : 'schedules'} not shown
              (row limit {MAX_TRACKER_ROWS}).
            </p>
          )}
        </div>
      )}

      {hover && (
        <div className="heatmap-tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div className="heatmap-tooltip-date">{hover.dayKey}</div>
          <div className="heatmap-tooltip-count">{hover.count} occurrence{hover.count === 1 ? '' : 's'}</div>
          {hover.titles.length > 0 && (
            <ul className="heatmap-tooltip-list">
              {hover.titles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {dayPopup && (
        <div className="heatmap-daypopup-overlay" onClick={() => setDayPopup(null)}>
          <div className="heatmap-daypopup-card" onClick={(e) => e.stopPropagation()}>
            <div className="heatmap-daypopup-header">
              <span>{dayPopup.dayKey}</span>
              <button className="heatmap-daypopup-close" onClick={() => setDayPopup(null)}>
                &times;
              </button>
            </div>
            {dayPopup.occs.length === 0 ? (
              <p className="heatmap-empty">No occurrences on this day.</p>
            ) : (
              <ul className="heatmap-daypopup-list">
                {dayPopup.occs.map((o) => (
                  <li key={o.id}>
                    <button
                      className="heatmap-daypopup-item"
                      onClick={() => {
                        onSelectOcc?.(o)
                        setDayPopup(null)
                      }}
                    >
                      <span className="heatmap-tracker-dot" style={{ backgroundColor: pipelineColor(o.pipelineId) }} />
                      {o.scheduleTitle}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
