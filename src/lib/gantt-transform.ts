import type { IScaleConfig } from '@svar-ui/react-gantt'
import type { CalendarOccurrence } from '../schema/types'

// ─── View preset key (shared with App.tsx's VIEW_PRESETS) ────────────────────

export type ViewPresetKey = 'week' | 'month' | 'quarter' | 'year'

// ─── Urgency color palette ────────────────────────────────────────────────────

export const URGENCY_BG: Record<string, string> = {
  critical: '#fef2f2',
  high:     '#fffbeb',
  medium:   '#eff6ff',
  low:      '#f9fafb',
}

// ─── Pipeline stripe palette ──────────────────────────────────────────────────

export const STRIPES = [
  '#7c3aed', '#db2777', '#0d9488', '#ea580c',
  '#0891b2', '#65a30d', '#e11d48', '#1d4ed8',
]

export function pipelineColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return STRIPES[Math.abs(h) % STRIPES.length]
}

// Used by calendar-transform.ts for FullCalendar event minimum duration —
// unrelated to the Gantt's pixel-based minimum below (FC has no notion of
// "pixels per day" the way the Gantt's cellWidth does).
export const MIN_VISUAL_MS = 30 * 60 * 1000

// Presets at this scale or coarser render one aggregated bar per schedule
// instead of one bar per occurrence — see toGanttData.
const AGGREGATE_PRESETS = new Set<ViewPresetKey>(['month', 'quarter', 'year'])

// Minimum rendered bar width, in pixels, for any Gantt preset. Below this a
// bar becomes visually indistinguishable from a hairline (the original bug:
// a 30-minute minimum duration at Month scale's 40px/day rendered ~0.8px wide).
export const MIN_BAR_PX = 6

const DAY_MS = 24 * 60 * 60 * 1000

// Base time unit rendered by the bottom-most scale row per preset — see
// computeGanttScales. Used to convert a pixel minimum into a duration.
const PRESET_BASE_UNIT_MS: Record<ViewPresetKey, number> = {
  week:    DAY_MS,
  month:   DAY_MS,
  quarter: 7 * DAY_MS,
  year:    30.44 * DAY_MS, // average month length; only used for a visual floor
}

// Converts the fixed pixel minimum into a millisecond duration for the given
// preset, using that preset's cellWidth (px per base unit). Replaces the old
// fixed MIN_VISUAL_MS, which didn't scale with zoom level and made bars
// invisible at coarser presets.
export function computeMinBarMs(preset: ViewPresetKey, minPx = MIN_BAR_PX): number {
  const cellWidth = computeGanttCellWidth(preset)
  return (minPx / cellWidth) * PRESET_BASE_UNIT_MS[preset]
}

const URGENCY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }

function pickWorstUrgency(occs: CalendarOccurrence[]): string {
  let worst = 'low'
  for (const occ of occs) {
    const u = occ.directTags?.urgency ?? 'low'
    if ((URGENCY_RANK[u] ?? 0) > (URGENCY_RANK[worst] ?? 0)) worst = u
  }
  return worst
}

// ─── SVAR Gantt data transform ────────────────────────────────────────────────

export interface GanttTask {
  id: string | number
  text: string
  start?: Date
  end?: Date
  parent?: string | number
  type: 'summary' | 'task'
  open?: boolean
  progress?: number
  // Custom fields for click handling
  _occId?: string
  // Aggregated-bar occurrence count (only set on `agg-` tasks)
  _occCount?: number
  // Urgency/pipeline visual metadata consumed by TimelineTab's taskTemplate
  _urgency?: string
  _urgencyBg?: string
  _stripe?: string
}

export function toGanttData(
  occs: CalendarOccurrence[],
  collapseSchedules = true,
  preset: ViewPresetKey = 'week',
): GanttTask[] {
  const tasks: GanttTask[] = []

  // Track what rows have been added already
  const projectIds  = new Set<string>()
  const pipelineIds = new Set<string>()
  const scheduleIds = new Set<string>()

  // Collect unique project → pipeline → schedule structure
  // For multi-project occurrences, use the first project context
  for (const occ of occs) {
    const ctx = occ.projectContexts[0]
    if (!ctx) continue

    const projId  = `proj-${ctx.projectId}`
    const pipeId  = `pipe-${occ.pipelineId}`
    const schedId = `sched-${occ.scheduleId}`

    if (!projectIds.has(projId)) {
      projectIds.add(projId)
      tasks.push({
        id:   projId,
        text: ctx.projectName,
        type: 'summary',
        open: true,
      })
    }

    if (!pipelineIds.has(pipeId)) {
      pipelineIds.add(pipeId)
      tasks.push({
        id:     pipeId,
        text:   occ.pipelineName,
        parent: projId,
        type:   'summary',
        open:   true,
      })
    }

    if (!scheduleIds.has(schedId)) {
      scheduleIds.add(schedId)
      tasks.push({
        id:     schedId,
        text:   occ.scheduleTitle,
        parent: pipeId,
        type:   'summary',
        open:   !collapseSchedules,
      })
    }
  }

  if (AGGREGATE_PRESETS.has(preset)) {
    // Month/Quarter/Year: one aggregated activity-span bar per schedule
    // instead of one bar per occurrence — keeps task count bounded regardless
    // of how many occurrences fall in the view range.
    const bySchedule = new Map<string, CalendarOccurrence[]>()
    for (const occ of occs) {
      if (!occ.projectContexts[0]) continue
      const list = bySchedule.get(occ.scheduleId)
      if (list) list.push(occ)
      else bySchedule.set(occ.scheduleId, [occ])
    }

    for (const [schedId, list] of bySchedule) {
      let startMs = Infinity
      let endMs   = -Infinity
      for (const occ of list) {
        const s = new Date(occ.scheduledStart).getTime()
        const e = new Date(occ.scheduledEnd).getTime()
        if (s < startMs) startMs = s
        if (e > endMs)   endMs = e
      }
      const first   = list[0]
      const urgency = pickWorstUrgency(list)
      const minMs   = computeMinBarMs(preset)

      tasks.push({
        id:       `agg-${schedId}`,
        text:     first.scheduleTitle,
        start:    new Date(startMs),
        end:      new Date(Math.max(endMs, startMs + minMs)),
        parent:   `sched-${schedId}`,
        type:     'task',
        progress: 0,
        _occCount:  list.length,
        _urgency:   urgency,
        _urgencyBg: URGENCY_BG[urgency] ?? URGENCY_BG.low,
        _stripe:    pipelineColor(first.pipelineId),
      })
    }

    return tasks
  }

  // Add occurrence bars under their schedule row
  for (const occ of occs) {
    const ctx = occ.projectContexts[0]
    if (!ctx) continue

    const schedId = `sched-${occ.scheduleId}`

    const startMs  = new Date(occ.scheduledStart).getTime()
    const endMs    = new Date(occ.scheduledEnd).getTime()
    const minMs    = computeMinBarMs(preset)
    const visualEnd = endMs < startMs + minMs
      ? new Date(startMs + minMs)
      : new Date(occ.scheduledEnd)

    const urgency  = occ.directTags?.urgency ?? 'low'
    const stripe   = pipelineColor(occ.pipelineId)

    tasks.push({
      id:       `occ-${occ.id}`,
      text:     occ.scheduleTitle,
      start:    new Date(occ.scheduledStart),
      end:      visualEnd,
      parent:   schedId,
      type:     'task',
      progress: 0,
      // Store metadata for click handling and coloring
      _occId:   occ.id,
      // SVAR allows arbitrary extra fields
      _urgency: urgency,
      _urgencyBg: URGENCY_BG[urgency] ?? URGENCY_BG.low,
      _stripe:  stripe,
    })
  }

  return tasks
}

// ─── Time scales (computed per preset) ───────────────────────────────────────

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function computeGanttScales(activePreset: ViewPresetKey): IScaleConfig[] {
  if (activePreset === 'year') {
    return [{
      unit: 'month',
      step: 1,
      format: (d) => `${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`,
    }]
  }
  if (activePreset === 'quarter') {
    return [
      {
        unit: 'month',
        step: 1,
        format: (d) => `${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}`,
      },
      {
        unit: 'week',
        step: 1,
        format: (d) => {
          const end = new Date(d); end.setDate(end.getDate() + 6)
          return `${d.getMonth() + 1}/${d.getDate()}–${end.getDate()}`
        },
      },
    ]
  }
  // week / month: day-level resolution
  return [
    {
      unit: 'week',
      step: 1,
      format: (d) => {
        const end = new Date(d); end.setDate(end.getDate() + 6)
        return `${d.getMonth() + 1}/${d.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`
      },
    },
    { unit: 'day', step: 1, format: (d) => `${DAY_NAMES[d.getDay()]} ${d.getDate()}` },
  ]
}

export function computeGanttCellWidth(activePreset: ViewPresetKey): number {
  if (activePreset === 'year')    return 55   // 55px/month → ~26 months visible
  if (activePreset === 'quarter') return 75   // 75px/week  → ~19 weeks visible
  if (activePreset === 'month')   return 40   // 40px/day   → ~36 days visible
  return 80                                   // week: 80px/day → ~18 days
}
