import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import multiMonthPlugin from '@fullcalendar/multimonth'
import type { EventInput, EventContentArg, EventClickArg, DatesSetArg } from '@fullcalendar/core'

import type { CalendarOccurrence } from './schema/types'
import { URGENCY_BG, pipelineColor } from './lib/gantt-transform'

// ─── FullCalendar EventChip component ────────────────────────────────────────

function EventChip({ info }: { info: EventContentArg }) {
  const occ: CalendarOccurrence = info.event.extendedProps.occ
  const urgency = occ.directTags?.urgency ?? 'low'
  const bg = URGENCY_BG[urgency] ?? URGENCY_BG.low
  const stripe = pipelineColor(occ.pipelineId)
  return (
    <div style={{
      background: bg,
      borderLeft: `3px solid ${stripe}`,
      borderRadius: 4,
      padding: '1px 4px',
      fontSize: 11,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      cursor: 'pointer',
      width: '100%',
    }}>
      {occ.scheduleTitle}
    </div>
  )
}

interface CalendarTabProps {
  fcEvents: EventInput[]
  onDatesSet: (arg: DatesSetArg) => void
  onEventClick: (arg: EventClickArg) => void
}

export function CalendarTab({ fcEvents, onDatesSet, onEventClick }: CalendarTabProps) {
  return (
    <div className="fc-wrapper">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, multiMonthPlugin]}
        initialView="dayGridMonth"
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
          right: 'dayGridMonth,timeGridWeek,timeGridDay,multiMonthQuarter,multiMonthYear',
        }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day',
          year: 'Year',
        }}
        events={fcEvents}
        datesSet={onDatesSet}
        eventContent={(info) => <EventChip info={info} />}
        eventClick={onEventClick}
        dayMaxEvents={3}
        nowIndicator={true}
        height="100%"
      />
    </div>
  )
}
