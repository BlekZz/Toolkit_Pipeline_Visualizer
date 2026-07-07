import { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react'

import { Gantt } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import type { IScaleConfig, IApi } from '@svar-ui/react-gantt'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import multiMonthPlugin from '@fullcalendar/multimonth'
import type { EventInput, EventContentArg, EventClickArg, DatesSetArg } from '@fullcalendar/core'

import { parseScheduleDocument } from './schema/validate'
import type { ParsedScheduleDocument } from './schema/validate'
import { normalizeScheduleDocument } from './lib/normalize'
import type { NormalizedDocument } from './lib/normalize'
import { expandRecurrence } from './lib/expand'
import { applyFilters, extractFilterOptions, emptyFilter, countActiveFilters } from './lib/filters'
import type { FilterState } from './lib/filters'
import type { CalendarOccurrence } from './schema/types'
import { FilterPanel } from './FilterPanel'
import { DetailPanel } from './DetailPanel'
import { ImportModal } from './ImportModal'
import sampleData from './data/sample-schedules.json'
import './App.css'

// Lazy-loaded: mermaid is ~2 MB and only needed when the diagram panel opens
const MermaidPanel = lazy(() =>
  import('./MermaidPanel').then((m) => ({ default: m.MermaidPanel })),
)

// ─── Urgency color palette ────────────────────────────────────────────────────

const URGENCY_BG: Record<string, string> = {
  critical: '#fef2f2',
  high:     '#fffbeb',
  medium:   '#eff6ff',
  low:      '#f9fafb',
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNormalizedDoc(data: ParsedScheduleDocument): NormalizedDocument {
  return normalizeScheduleDocument(data, { mode: 'global' })
}

const MIN_VISUAL_MS = 30 * 60 * 1000

// ─── SVAR Gantt data transform ────────────────────────────────────────────────

interface GanttTask {
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
}

function toGanttData(occs: CalendarOccurrence[], collapseSchedules = true): GanttTask[] {
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

  // Add occurrence bars under their schedule row
  for (const occ of occs) {
    const ctx = occ.projectContexts[0]
    if (!ctx) continue

    const schedId = `sched-${occ.scheduleId}`

    const startMs  = new Date(occ.scheduledStart).getTime()
    const endMs    = new Date(occ.scheduledEnd).getTime()
    const visualEnd = endMs < startMs + MIN_VISUAL_MS
      ? new Date(startMs + MIN_VISUAL_MS)
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
    } as GanttTask & Record<string, unknown>)
  }

  return tasks
}

// ─── Time scales (computed per preset) ───────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── FullCalendar event mapper ────────────────────────────────────────────────

function toEvent(occ: CalendarOccurrence): EventInput {
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

// ─── Month-level FC views: high-freq schedules hidden by default ──────────────

const FC_MONTH_VIEWS = new Set(['dayGridMonth', 'multiMonthYear', 'multiMonthQuarter'])

// ─── View preset constants ────────────────────────────────────────────────────

const VIEW_PRESETS = [
  { label: 'Week',    key: 'week',    days: 7 },
  { label: 'Month',   key: 'month',   days: 30 },
  { label: 'Quarter', key: 'quarter', days: 90 },
  { label: 'Year',    key: 'year',    days: 365 },
] as const

type ViewPresetKey = (typeof VIEW_PRESETS)[number]['key']

// ─── FilterState localStorage helpers ────────────────────────────────────────

const FILTER_SET_KEYS = [
  'projects', 'pipelines', 'dataDomains', 'pipelineTypes',
  'sourceSystems', 'targetSystems', 'urgencies', 'owners',
  'runTypes', 'sourceTypes', 'envScopes', 'maintenanceWindows',
  'reviewStates', 'customTags',
] as const

function saveFilter(f: FilterState): void {
  const obj: Record<string, unknown> = { searchText: f.searchText }
  for (const k of FILTER_SET_KEYS) obj[k] = [...f[k]]
  localStorage.setItem('psv-filter', JSON.stringify(obj))
}

function loadFilter(): FilterState {
  try {
    const raw = localStorage.getItem('psv-filter')
    if (!raw) return emptyFilter()
    const obj = JSON.parse(raw) as Record<string, unknown>
    const f = emptyFilter()
    f.searchText = typeof obj.searchText === 'string' ? obj.searchText : ''
    for (const k of FILTER_SET_KEYS) {
      if (Array.isArray(obj[k])) f[k] = new Set(obj[k] as string[])
    }
    return f
  } catch { return emptyFilter() }
}

// ─── Calendar occurrence popup (modal) ───────────────────────────────────────

function OccurrencePopup({ occ, onClose }: { occ: CalendarOccurrence; onClose: () => void }) {
  return (
    <div className="occ-popup-overlay" onClick={onClose}>
      <div className="occ-popup-card" onClick={(e) => e.stopPropagation()}>
        <DetailPanel occ={occ} onClose={onClose} />
      </div>
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

  const [sourceDoc, setSourceDoc] = useState<ParsedScheduleDocument | null>(() => {
    const result = parseScheduleDocument(sampleData)
    return result.success ? result.data : null
  })

  const [allOccs,     setAllOccs]     = useState<CalendarOccurrence[]>([])
  const [filterState, setFilterState] = useState<FilterState>(() => loadFilter())
  const [selectedOcc, setSelectedOcc] = useState<CalendarOccurrence | null>(null)
  const [showImport,  setShowImport]  = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [showMermaid, setShowMermaid] = useState(false)
  const [collapseSchedules, setCollapseSchedules] = useState(true)
  const [activeTab,   setActiveTab]   = useState<'timeline' | 'calendar'>(
    () => (localStorage.getItem('psv-tab') as 'timeline' | 'calendar' | null) || 'timeline'
  )
  const [activePreset, setActivePreset] = useState<ViewPresetKey>(
    () => (localStorage.getItem('psv-preset') as ViewPresetKey | null) || 'month'
  )
  const [fcViewType, setFcViewType] = useState('dayGridMonth')

  // Gantt display window — drives expandRecurrence; FullCalendar does its own internal date windowing
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date }>(() => {
    const start = new Date()
    start.setDate(start.getDate() - 3)
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setDate(end.getDate() + 365)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  })

  // Occurrences map for click lookup
  const occsById  = useRef<Map<string, CalendarOccurrence>>(new Map())
  const ganttRef  = useRef<IApi>(null)

  const filterOptions = useMemo(
    () => (normalizedDoc ? extractFilterOptions(normalizedDoc) : null),
    [normalizedDoc],
  )

  const filteredOccs = useMemo(
    () => applyFilters(allOccs, filterState),
    [allOccs, filterState],
  )

  // Keep occsById in sync with filteredOccs
  useEffect(() => {
    const map = new Map<string, CalendarOccurrence>()
    for (const occ of filteredOccs) map.set(occ.id, occ)
    occsById.current = map
  }, [filteredOccs])

  // Expand occurrences when the normalized doc or view range changes
  useEffect(() => {
    if (!normalizedDoc) return
    const occs = expandRecurrence(normalizedDoc, { start: viewRange.start, end: viewRange.end })
    setAllOccs(occs)
  }, [normalizedDoc, viewRange])

  const ganttTasks = useMemo(
    () => toGanttData(filteredOccs, collapseSchedules),
    [filteredOccs, collapseSchedules]
  )

  // Dynamic Gantt scales and cell width based on active view preset
  const ganttScales = useMemo<IScaleConfig[]>(() => {
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
  }, [activePreset])

  const ganttCellWidth = useMemo(() => {
    if (activePreset === 'year')    return 55   // 55px/month → ~26 months visible
    if (activePreset === 'quarter') return 75   // 75px/week  → ~19 weeks visible
    if (activePreset === 'month')   return 40   // 40px/day   → ~36 days visible
    return 80                                   // week: 80px/day → ~18 days
  }, [activePreset])

  // FullCalendar events — in month-level views, hide sub-daily and daily schedules
  const fcEvents = useMemo(() => {
    const source = FC_MONTH_VIEWS.has(fcViewType)
      ? filteredOccs.filter((o) => o.scheduleFrequency !== 'sub-daily' && o.scheduleFrequency !== 'daily')
      : filteredOccs
    return source.map(toEvent)
  }, [filteredOccs, fcViewType])

  // Persist filterState, activePreset, activeTab to localStorage
  useEffect(() => { saveFilter(filterState) }, [filterState])
  useEffect(() => { localStorage.setItem('psv-preset', activePreset) }, [activePreset])
  useEffect(() => { localStorage.setItem('psv-tab', activeTab) }, [activeTab])

  const handleImport = useCallback((doc: ParsedScheduleDocument) => {
    setSourceDoc(doc)
    setNormalizedDoc(buildNormalizedDoc(doc))
    setAllOccs([])
    setFilterState(emptyFilter())
    setSelectedOcc(null)
    setShowImport(false)
  }, [])

  // Widen the view range from the date picker
  const handleGotoDate = useCallback((dateStr: string) => {
    if (!dateStr) return
    const target = new Date(dateStr)
    const start = new Date(target)
    start.setDate(target.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    const end = new Date(target)
    end.setDate(target.getDate() + 21)
    end.setHours(23, 59, 59, 999)
    setViewRange({ start, end })
  }, [])

  const handleExportJSON = useCallback(() => {
    if (!sourceDoc) return
    const blob = new Blob([JSON.stringify(sourceDoc, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'schedules.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [sourceDoc])

  // FullCalendar datesSet — capture view type for freq filter; do NOT update viewRange
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setFcViewType(arg.view.type)
  }, [])

  // View preset click — sets Gantt X-axis window from today-3 to today+N days
  const handlePresetClick = useCallback((preset: typeof VIEW_PRESETS[number]) => {
    const start = new Date(); start.setDate(start.getDate() - 3); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setDate(end.getDate() + preset.days); end.setHours(23, 59, 59, 999)
    setViewRange({ start, end })
    setActivePreset(preset.key)
  }, [])

  // FullCalendar eventClick handler
  const handleFCEventClick = useCallback((arg: EventClickArg) => {
    const occ: CalendarOccurrence = arg.event.extendedProps.occ
    setSelectedOcc(occ)
  }, [])

  const activeFilterCount = useMemo(() => countActiveFilters(filterState), [filterState])

  // Wire select-task via the IApi ref once the Gantt mounts
  useEffect(() => {
    const api = ganttRef.current
    if (!api) return
    api.on('select-task', (ev: { id: string | number }) => {
      const id = String(ev.id ?? '')
      if (id.startsWith('occ-')) {
        const occId = id.slice(4)
        const occ   = occsById.current.get(occId)
        if (occ) setSelectedOcc(occ)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedDoc])

  return (
    <>
      {/* Mobile fallback */}
      <div className="mobile-banner" role="alert">
        <strong>Pipeline Schedule Visualizer</strong> is optimised for desktop (≥ 1024 px).
        Please open on a wider screen.
      </div>

      {/* Desktop shell — Zone A + Zone B layout */}
      <div className="app-shell">

        {/* ── Zone A: header + filters ── */}
        <div className="zone-a">
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
              <div className="tab-switcher">
                <button
                  className={`tab-btn${activeTab === 'timeline' ? ' tab-btn--active' : ''}`}
                  onClick={() => { setActiveTab('timeline'); setFilterOpen(false) }}
                  type="button"
                >
                  Timeline
                </button>
                <button
                  className={`tab-btn${activeTab === 'calendar' ? ' tab-btn--active' : ''}`}
                  onClick={() => { setActiveTab('calendar'); setFilterOpen(false) }}
                  type="button"
                >
                  Calendar
                </button>
              </div>
            </div>
            <div className="app-header-right">
              {normalizedDoc && (
                <span className="app-meta">
                  {filteredOccs.length} / {allOccs.length} occ
                </span>
              )}
              <input
                className="search-input"
                type="search"
                placeholder="Search schedules..."
                aria-label="Search schedules"
                value={filterState.searchText}
                onChange={(e) => setFilterState((f) => ({ ...f, searchText: e.target.value }))}
              />
              <input
                className="date-picker"
                type="date"
                aria-label="Navigate to date"
                onChange={(e) => handleGotoDate(e.target.value)}
              />
              <button
                className="import-btn"
                onClick={() => setShowImport(true)}
                type="button"
              >
                Import JSON
              </button>
              <button
                className="import-btn"
                onClick={handleExportJSON}
                disabled={!sourceDoc}
                type="button"
              >
                Export JSON
              </button>
              <button
                className="import-btn"
                onClick={() => setShowMermaid(true)}
                disabled={!normalizedDoc}
                type="button"
              >
                Diagram
              </button>
            </div>
          </header>

          {activeTab === 'timeline' && (
            <div className="view-presets">
              {VIEW_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`preset-btn${activePreset === p.key ? ' preset-btn--active' : ''}`}
                  onClick={() => handlePresetClick(p)}
                >
                  {p.label}
                </button>
              ))}
              <div className="preset-spacer" />
              <button
                type="button"
                className="preset-btn"
                onClick={() => setCollapseSchedules((v) => !v)}
              >
                {collapseSchedules ? 'Expand All' : 'Collapse All'}
              </button>
            </div>
          )}

          {normalizedDoc && filterOptions && (
            <div className="zone-a-filters">
              <FilterPanel
                options={filterOptions}
                filter={filterState}
                onChange={(newFilter) => setFilterState((prev) => ({ ...newFilter, searchText: prev.searchText }))}
                visibleCount={filteredOccs.length}
                totalCount={allOccs.length}
                drawerOpen={filterOpen}
              />
              {/* Backdrop closes the filter drawer in narrow/high-zoom mode */}
              <div
                className={`filter-backdrop${filterOpen ? ' filter-backdrop--visible' : ''}`}
                onClick={() => setFilterOpen(false)}
              />
            </div>
          )}
        </div>

        {/* ── Zone B: canvas (timeline or calendar) ── */}
        <div className="zone-b">
          {normalizedDoc && filterOptions ? (
            activeTab === 'timeline' ? (
              <div className="gantt-wrapper">
                <Gantt
                  ref={ganttRef}
                  tasks={ganttTasks}
                  links={[]}
                  scales={ganttScales}
                  start={viewRange.start}
                  end={viewRange.end}
                  cellWidth={ganttCellWidth}
                  cellHeight={36}
                  readonly={true}
                />
              </div>
            ) : (
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
                  datesSet={handleDatesSet}
                  eventContent={(info) => <EventChip info={info} />}
                  eventClick={handleFCEventClick}
                  dayMaxEvents={3}
                  nowIndicator={true}
                  height="100%"
                />
              </div>
            )
          ) : (
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
          )}
        </div>

        {/* Timeline: side panel; Calendar: popup modal */}
        {selectedOcc && activeTab === 'timeline' && (
          <DetailPanel occ={selectedOcc} onClose={() => setSelectedOcc(null)} />
        )}
      </div>

      {/* Calendar tab: occurrence popup */}
      {selectedOcc && activeTab === 'calendar' && (
        <OccurrencePopup occ={selectedOcc} onClose={() => setSelectedOcc(null)} />
      )}

      {/* Mermaid diagram panel */}
      {showMermaid && normalizedDoc && (
        <Suspense fallback={null}>
          <MermaidPanel doc={normalizedDoc} onClose={() => setShowMermaid(false)} />
        </Suspense>
      )}

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
