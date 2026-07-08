import { useRef, useMemo, useCallback } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import multiMonthPlugin from '@fullcalendar/multimonth'
import type { EventInput, EventContentArg, EventClickArg, DatesSetArg } from '@fullcalendar/core'

import type { CalendarOccurrence } from './schema/types'
import { pipelineColor } from './lib/gantt-transform'
import {
  loadSavedFcView, saveFcView, URGENCY_DOT, formatEventTime, derivePipelineLegend,
  type PipelineLegendEntry,
} from './lib/calendar-transform'

// ─── FullCalendar EventChip component ────────────────────────────────────────

function EventChip({ info }: { info: EventContentArg }) {
  const occ: CalendarOccurrence = info.event.extendedProps.occ
  const urgency = occ.directTags?.urgency ?? 'low'
  const dot = URGENCY_DOT[urgency] ?? URGENCY_DOT.low
  const stripe = pipelineColor(occ.pipelineId)
  const compact = info.view.type === 'dayGridMonth' || info.view.type.startsWith('multiMonth')

  return (
    <div
      className={`fc-chip ${compact ? 'fc-chip--compact' : 'fc-chip--full'}`}
      style={{ borderLeftColor: stripe }}
    >
      <span className="fc-chip-dot" style={{ background: dot }} aria-hidden="true" />
      {compact && <span className="fc-chip-time">{formatEventTime(occ.scheduledStart)}</span>}
      <span className="fc-chip-title">{occ.scheduleTitle}</span>
    </div>
  )
}

// ─── Urgency + pipeline color legend ─────────────────────────────────────────

const URGENCY_LEGEND_ORDER: Array<keyof typeof URGENCY_DOT> = ['critical', 'high', 'medium', 'low']

function CalendarLegend({ pipelines, overflow }: { pipelines: PipelineLegendEntry[]; overflow: number }) {
  return (
    <div className="fc-legend">
      <div className="fc-legend-group">
        {URGENCY_LEGEND_ORDER.map((u) => (
          <span key={u} className="fc-legend-item">
            <span className="fc-legend-dot" style={{ background: URGENCY_DOT[u] }} aria-hidden="true" />
            {u}
          </span>
        ))}
      </div>
      {pipelines.length > 0 && (
        <>
          <div className="fc-legend-sep" aria-hidden="true" />
          <div className="fc-legend-group">
            {pipelines.map((p) => (
              <span key={p.id} className="fc-legend-item" title={p.name}>
                <span className="fc-legend-stripe" style={{ background: p.color }} aria-hidden="true" />
                {p.name}
              </span>
            ))}
            {overflow > 0 && <span className="fc-legend-item fc-legend-overflow">+{overflow}</span>}
          </div>
        </>
      )}
    </div>
  )
}

interface CalendarTabProps {
  fcEvents: EventInput[]
  onDatesSet: (arg: DatesSetArg) => void
  onEventClick: (arg: EventClickArg) => void
}

export function CalendarTab({ fcEvents, onDatesSet, onEventClick }: CalendarTabProps) {
  // Uncontrolled: FC only reads `initialView` on mount. Persistence is handled via
  // `handleDatesSet` writing back to localStorage on every view change.
  const initialViewRef = useRef(loadSavedFcView())

  const legend = useMemo(() => derivePipelineLegend(fcEvents), [fcEvents])

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    saveFcView(arg.view.type)
    onDatesSet(arg)
  }, [onDatesSet])

  return (
    <div className="fc-wrapper">
      <CalendarLegend pipelines={legend.entries} overflow={legend.overflow} />
      <div className="fc-body">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]}
          initialView={initialViewRef.current}
          views={{
            multiMonthQuarter: {
              type: 'multiMonth',
              duration: { months: 3 },
              buttonText: 'Quarter',
            },
          }}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek,dayGridMonth,multiMonthQuarter,multiMonthYear',
          }}
          buttonText={{
            today: 'Today',
            month: 'Month',
            week: 'Week',
            day: 'Day',
            year: 'Year',
          }}
          events={fcEvents}
          datesSet={handleDatesSet}
          eventContent={(info) => <EventChip info={info} />}
          eventClick={onEventClick}
          dayMaxEvents={3}
          nowIndicator={true}
          height="100%"
        />
      </div>
    </div>
  )
}
