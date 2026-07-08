import type { EventInput } from '@fullcalendar/core'
import type { CalendarOccurrence } from '../schema/types'
import { MIN_VISUAL_MS } from './gantt-transform'

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
