import { useState, useMemo, useCallback, useRef } from 'react'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DatesSetArg, EventInput, EventContentArg, EventClickArg } from '@fullcalendar/core'

import { parseScheduleDocument } from './schema/validate'
import type { ParsedScheduleDocument } from './schema/validate'
import { normalizeScheduleDocument } from './lib/normalize'
import type { NormalizedDocument } from './lib/normalize'
import { expandRecurrence } from './lib/expand'
import { applyFilters, extractFilterOptions, emptyFilter, countActiveFilters } from './lib/filters'
import type { FilterState } from './lib/filters'
import { tagEmoji } from './lib/tagEmoji'
import type { CalendarOccurrence } from './schema/types'
import { FilterPanel } from './FilterPanel'
import { DetailPanel } from './DetailPanel'
import { ImportModal } from './ImportModal'
import sampleData from './data/sample-schedules.json'
import './App.css'

// ─── Urgency color palette ────────────────────────────────────────────────────

const URGENCY: Record<string, { bg: string; text: string }> = {
  critical: { bg: '#fef2f2', text: '#991b1b' },
  high:     { bg: '#fffbeb', text: '#92400e' },
  medium:   { bg: '#eff6ff', text: '#1e40af' },
  low:      { bg: '#f9fafb', text: '#374151' },
}

// ─── Pipeline stripe palette ──────────────────────────────────────────────────

const STRIPES = [
  '#7c3aed', '#db2777', '#0d9488', '#ea580c',
  '#0891b2', '#65a30d', '#e11d48', '#1d4ed8',
]

function pipelineColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return STRIPES[Math.abs(h) % STRIPES.length]
}

// ─── Source type icon ─────────────────────────────────────────────────────────

const SOURCE_ICON: Record<string, string> = {
  cron:     '⏱',
  rrule:    '↻',
  simple:   '◈',
  one_time: '①',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urgencyOf(occ: CalendarOccurrence): string {
  return occ.directTags.urgency ?? 'low'
}

const MIN_VISUAL_MS = 30 * 60 * 1000

function toEvent(occ: CalendarOccurrence): EventInput {
  const startMs  = new Date(occ.scheduledStart).getTime()
  const endMs    = new Date(occ.scheduledEnd).getTime()
  const visualEnd = endMs < startMs + MIN_VISUAL_MS
    ? new Date(startMs + MIN_VISUAL_MS).toISOString()
    : occ.scheduledEnd

  return {
    id:              occ.id,
    title:           occ.scheduleTitle,
    start:           occ.scheduledStart,
    end:             visualEnd,
    backgroundColor: 'transparent',
    borderColor:     'transparent',
    textColor:       '#111',
    extendedProps:   { occ },
  }
}

function buildNormalizedDoc(data: ParsedScheduleDocument): NormalizedDocument {
  return normalizeScheduleDocument(data, { mode: 'global' })
}

// ─── Event chip ───────────────────────────────────────────────────────────────

function EventChip({ info }: { info: EventContentArg }) {
  const occ     = info.event.extendedProps.occ as CalendarOccurrence
  const urgency = urgencyOf(occ)
  const colors  = URGENCY[urgency] ?? URGENCY.low
  const stripe  = pipelineColor(occ.pipelineId)
  const projects = occ.projectContexts.map((p) => p.projectName).join(', ') || '—'

  // Prefer a system/type emoji; fall back to recurrence mode icon
  const sysEmoji = (occ.inheritedTags.sourceSystem?.[0] && tagEmoji(occ.inheritedTags.sourceSystem[0]))
                || (occ.inheritedTags.pipelineType?.[0]  && tagEmoji(occ.inheritedTags.pipelineType[0]))
                || ''
  const icon = sysEmoji || SOURCE_ICON[occ.recurrenceMode] || '◈'

  const tooltip = [
    `Schedule: ${occ.scheduleTitle}`,
    `Pipeline: ${occ.pipelineName}`,
    `Project(s): ${projects}`,
    `Urgency: ${urgency}`,
    `Mode: ${occ.recurrenceMode}`,
  ].join('\n')

  return (
    <div
      className="ev-chip"
      style={{ borderLeftColor: stripe, backgroundColor: colors.bg, color: colors.text }}
      title={tooltip}
    >
      <span className="ev-icon" aria-hidden="true">{icon}</span>
      <span className="ev-title">{occ.scheduleTitle}</span>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [normalizedDoc, setNormalizedDoc] = useState<NormalizedDocument | null>(() => {
    const result = parseScheduleDocument(sampleData)
    if (!result.success) {
      console.warn('[App] sample data validation failed:', result.errors)
      return null
    }
    return buildNormalizedDoc(result.data)
  })

  const calendarRef = useRef<FullCalendar>(null)

  const [allOccs,     setAllOccs]     = useState<CalendarOccurrence[]>([])
  const [filterState, setFilterState] = useState<FilterState>(() => emptyFilter())
  const [selectedOcc, setSelectedOcc] = useState<CalendarOccurrence | null>(null)
  const [showImport,  setShowImport]  = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)

  const filterOptions = useMemo(
    () => (normalizedDoc ? extractFilterOptions(normalizedDoc) : null),
    [normalizedDoc],
  )

  const filteredOccs = useMemo(
    () => applyFilters(allOccs, filterState),
    [allOccs, filterState],
  )

  const events = useMemo(
    () => filteredOccs.map(toEvent),
    [filteredOccs],
  )

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    if (!normalizedDoc) return
    const occs = expandRecurrence(normalizedDoc, { start: info.start, end: info.end })
    setAllOccs(occs)
  }, [normalizedDoc])

  const handleEventClick = useCallback((info: EventClickArg) => {
    setSelectedOcc(info.event.extendedProps.occ as CalendarOccurrence)
  }, [])

  const handleImport = useCallback((doc: ParsedScheduleDocument) => {
    setNormalizedDoc(buildNormalizedDoc(doc))
    setAllOccs([])
    setFilterState(emptyFilter())
    setSelectedOcc(null)
    setShowImport(false)
  }, [])

  const scheduleCount      = normalizedDoc?.pipelines.reduce((n, p) => n + p.schedules.length, 0) ?? 0
  const activeFilterCount  = useMemo(() => countActiveFilters(filterState), [filterState])

  return (
    <>
      {/* Mobile fallback */}
      <div className="mobile-banner" role="alert">
        <strong>Pipeline Schedule Visualizer</strong> is optimised for desktop (≥ 1024 px).
        Please open on a wider screen.
      </div>

      {/* Desktop shell */}
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-left">
            <span className="app-logo">Pipeline Schedule Visualizer</span>
            <button
              className="filter-toggle"
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Toggle filter panel"
              aria-pressed={filterOpen}
              type="button"
            >
              ☰{activeFilterCount > 0 ? ` (${activeFilterCount})` : ' Filters'}
            </button>
          </div>
          <div className="app-header-right">
            {normalizedDoc && (
              <span className="app-meta">
                {normalizedDoc.projects.length}p · {normalizedDoc.pipelines.length}pl · {scheduleCount}s
              </span>
            )}
            <input
              className="date-picker"
              type="date"
              aria-label="Navigate to date"
              onChange={(e) => {
                if (e.target.value) {
                  calendarRef.current?.getApi().gotoDate(e.target.value)
                }
              }}
            />
            <button
              className="import-btn"
              onClick={() => setShowImport(true)}
              type="button"
            >
              Import JSON
            </button>
          </div>
        </header>

        <div className="app-body">
          {normalizedDoc && filterOptions ? (
            <>
              <FilterPanel
                options={filterOptions}
                filter={filterState}
                onChange={setFilterState}
                visibleCount={filteredOccs.length}
                totalCount={allOccs.length}
                drawerOpen={filterOpen}
              />
              {/* Backdrop closes the filter drawer in narrow / high-zoom mode */}
              <div
                className={`filter-backdrop${filterOpen ? ' filter-backdrop--visible' : ''}`}
                onClick={() => setFilterOpen(false)}
              />

              <main className="app-main">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={{
                    left:   'prev,next today',
                    center: 'title',
                    right:  'dayGridMonth,timeGridWeek,timeGridDay',
                  }}
                  buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
                  events={events}
                  datesSet={handleDatesSet}
                  eventContent={(info) => <EventChip info={info} />}
                  eventClick={handleEventClick}
                  dayMaxEvents={3}
                  nowIndicator
                  height="100%"
                />
              </main>

              {selectedOcc && (
                <DetailPanel
                  occ={selectedOcc}
                  onClose={() => setSelectedOcc(null)}
                />
              )}
            </>
          ) : (
            <main className="app-main">
              <div className="empty-state">
                <p className="empty-title">No schedule data loaded</p>
                <p className="empty-sub">
                  <button
                    className="import-btn"
                    onClick={() => setShowImport(true)}
                    type="button"
                  >
                    Import JSON
                  </button>
                </p>
              </div>
            </main>
          )}
        </div>
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  )
}

export default App
