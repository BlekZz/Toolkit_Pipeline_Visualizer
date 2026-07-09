import { describe, it, expect, beforeEach } from 'vitest'
import type { EventInput } from '@fullcalendar/core'
import type { CalendarOccurrence } from '../../schema/types'
import {
  loadSavedFcView, saveFcView, FC_VIEW_STORAGE_KEY, DEFAULT_FC_VIEW,
  formatEventTime, derivePipelineLegend,
} from '../calendar-transform'

function occEvent(pipelineId: string, pipelineName: string): EventInput {
  const occ: Partial<CalendarOccurrence> = { pipelineId, pipelineName }
  return { id: `${pipelineId}-evt`, extendedProps: { occ } }
}

describe('FC view persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to dayGridMonth when nothing saved', () => {
    expect(loadSavedFcView()).toBe(DEFAULT_FC_VIEW)
  })

  it('round-trips a saved view', () => {
    saveFcView('timeGridWeek')
    expect(loadSavedFcView()).toBe('timeGridWeek')
    expect(localStorage.getItem(FC_VIEW_STORAGE_KEY)).toBe('timeGridWeek')
  })

  it('falls back to default for an unrecognized stored value', () => {
    localStorage.setItem(FC_VIEW_STORAGE_KEY, 'bogusView')
    expect(loadSavedFcView()).toBe(DEFAULT_FC_VIEW)
  })
})

describe('formatEventTime', () => {
  it('formats an ISO instant as local HH:mm', () => {
    const d = new Date()
    d.setHours(9, 5, 0, 0)
    expect(formatEventTime(d.toISOString())).toBe('09:05')
  })
})

describe('derivePipelineLegend', () => {
  it('returns an empty legend for no events', () => {
    expect(derivePipelineLegend([])).toEqual({ entries: [], overflow: 0 })
  })

  it('dedupes by pipelineId and preserves first-seen order', () => {
    const events = [
      occEvent('p1', 'Alpha'),
      occEvent('p2', 'Beta'),
      occEvent('p1', 'Alpha'),
    ]
    const legend = derivePipelineLegend(events)
    expect(legend.overflow).toBe(0)
    expect(legend.entries.map((e) => e.id)).toEqual(['p1', 'p2'])
    expect(legend.entries[0].name).toBe('Alpha')
  })

  it('caps entries at the given limit and reports overflow', () => {
    const events = Array.from({ length: 10 }, (_, i) => occEvent(`p${i}`, `Pipeline ${i}`))
    const legend = derivePipelineLegend(events, 8)
    expect(legend.entries).toHaveLength(8)
    expect(legend.overflow).toBe(2)
  })

  it('ignores events without an occ extendedProp', () => {
    const events: EventInput[] = [{ id: 'no-occ' }]
    expect(derivePipelineLegend(events)).toEqual({ entries: [], overflow: 0 })
  })
})
