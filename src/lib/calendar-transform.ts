import type { EventInput } from '@fullcalendar/core'
import type { CalendarOccurrence } from '../schema/types'
import { MIN_VISUAL_MS, pipelineColor } from './gantt-transform'

// ─── FullCalendar event mapper ────────────────────────────────────────────────

export function toEvent(occ: CalendarOccurrence): EventInput {
  const startMs = new Date(occ.scheduledStart).getTime()
  const endMs   = new Date(occ.scheduledEnd).getTime()
  const visualEnd = endMs < startMs + MIN_VISUAL_MS
    ? new Date(startMs + MIN_VISUAL_MS)
    : new Date(occ.scheduledEnd)
  return {
    id:              occ.id,
    title:           occ.scheduleTitle,
    start:           occ.scheduledStart,
    end:             visualEnd.toISOString(),
    backgroundColor: 'transparent',
    borderColor:     'transparent',
    textColor:       '#111',
    extendedProps:   { occ },
  }
}

// ─── Month-level FC views: high-freq schedules hidden by default ──────────────

export const FC_MONTH_VIEWS = new Set(['dayGridMonth', 'multiMonthYear', 'multiMonthQuarter'])

// ─── FC view persistence (localStorage, mirrors `psv-tab` pattern) ────────────

export const FC_VIEW_STORAGE_KEY = 'psv-fc-view'
export const DEFAULT_FC_VIEW = 'dayGridMonth'
export const VALID_FC_VIEWS = new Set([
  'timeGridDay', 'timeGridWeek', 'dayGridMonth', 'multiMonthQuarter', 'multiMonthYear',
])

/** Reads the last FC view type from localStorage, falling back to the default. */
export function loadSavedFcView(): string {
  try {
    const v = localStorage.getItem(FC_VIEW_STORAGE_KEY)
    return v && VALID_FC_VIEWS.has(v) ? v : DEFAULT_FC_VIEW
  } catch {
    return DEFAULT_FC_VIEW
  }
}

/** Persists the current FC view type to localStorage. */
export function saveFcView(view: string): void {
  try {
    localStorage.setItem(FC_VIEW_STORAGE_KEY, view)
  } catch {
    // localStorage unavailable (private mode, quota) — persistence is best-effort
  }
}

// ─── EventChip urgency palette (solid dot, independent of Gantt's tinted URGENCY_BG) ──

export const URGENCY_DOT: Record<string, string> = {
  critical: '#dc2626',
  high:     '#d97706',
  medium:   '#2563eb',
  low:      '#6b7280',
}

/** Formats a UTC ISO instant as a browser-local HH:mm string. */
export function formatEventTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// ─── Pipeline color legend derivation ─────────────────────────────────────────

export interface PipelineLegendEntry {
  id: string
  name: string
  color: string
}

export interface PipelineLegendResult {
  entries: PipelineLegendEntry[]
  overflow: number
}

/** Derives the set of distinct pipelines visible in `events`, capped at `limit`. */
export function derivePipelineLegend(events: EventInput[], limit = 8): PipelineLegendResult {
  const seen = new Map<string, PipelineLegendEntry>()
  for (const e of events) {
    const occ = e.extendedProps?.occ as CalendarOccurrence | undefined
    if (!occ || seen.has(occ.pipelineId)) continue
    seen.set(occ.pipelineId, {
      id:    occ.pipelineId,
      name:  occ.pipelineName,
      color: pipelineColor(occ.pipelineId),
    })
  }
  const entries = Array.from(seen.values())
  if (entries.length <= limit) return { entries, overflow: 0 }
  return { entries: entries.slice(0, limit), overflow: entries.length - limit }
}
