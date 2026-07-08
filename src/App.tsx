import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue, useTransition, lazy, Suspense } from 'react'

import type { IScaleConfig } from '@svar-ui/react-gantt'
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core'

import { parseScheduleDocument } from './schema/validate'
import type { ParsedScheduleDocument } from './schema/validate'
import { normalizeScheduleDocument } from './lib/normalize'
import type { NormalizedDocument } from './lib/normalize'
import { getOccurrencesCached, createExpandCacheState } from './lib/expand-cache'
import { applyFilters, extractFilterOptions, emptyFilter, countActiveFilters } from './lib/filters'
import type { FilterState } from './lib/filters'
import type { CalendarOccurrence } from './schema/types'
import type { ViewPresetKey } from './lib/gantt-transform'
import { toGanttData, computeGanttScales, computeGanttCellWidth } from './lib/gantt-transform'
import { toEvent, FC_MONTH_VIEWS } from './lib/calendar-transform'
import { FilterPanel } from './FilterPanel'
import { DetailPanel } from './DetailPanel'
import { ImportModal } from './ImportModal'
import { OccurrencePopup } from './OccurrencePopup'
import { TimelineTab } from './TimelineTab'
import { CalendarTab } from './CalendarTab'
import { HeatmapView } from './HeatmapView'
import sampleData from './data/sample-schedules.json'
import './App.css'

// Lazy-loaded: mermaid is ~2 MB and only needed when the diagram panel opens
const MermaidPanel = lazy(() =>
  import('./MermaidPanel').then((m) => ({ default: m.MermaidPanel })),
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNormalizedDoc(data: ParsedScheduleDocument): NormalizedDocument {
  return normalizeScheduleDocument(data, { mode: 'global' })
}

// Parse the bundled sample data exactly once at module load — both useState
// initializers below read from this shared result instead of re-parsing.
const PARSED_SAMPLE = parseScheduleDocument(sampleData)

// ─── View preset constants ────────────────────────────────────────────────────

const VIEW_PRESETS = [
  { label: 'Week',    key: 'week',    days: 7 },
  { label: 'Month',   key: 'month',   days: 30 },
  { label: 'Quarter', key: 'quarter', days: 90 },
  { label: 'Year',    key: 'year',    days: 365 },
] as const

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

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [normalizedDoc, setNormalizedDoc] = useState<NormalizedDocument | null>(() => {
    if (!PARSED_SAMPLE.success) {
      console.warn('[App] sample data validation failed:', PARSED_SAMPLE.errors)
      return null
    }
    return buildNormalizedDoc(PARSED_SAMPLE.data)
  })

  const [sourceDoc, setSourceDoc] = useState<ParsedScheduleDocument | null>(() =>
    PARSED_SAMPLE.success ? PARSED_SAMPLE.data : null
  )

  const [allOccs,     setAllOccs]     = useState<CalendarOccurrence[]>([])
  const [filterState, setFilterState] = useState<FilterState>(() => loadFilter())
  const [selectedOcc, setSelectedOcc] = useState<CalendarOccurrence | null>(null)
  const [showImport,  setShowImport]  = useState(false)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [showMermaid, setShowMermaid] = useState(false)
  const [collapseSchedules, setCollapseSchedules] = useState(true)
  const [activeTab,   setActiveTab]   = useState<'timeline' | 'calendar' | 'heatmap'>(
    () => (localStorage.getItem('psv-tab') as 'timeline' | 'calendar' | 'heatmap' | null) || 'timeline'
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
  const occsById = useRef<Map<string, CalendarOccurrence>>(new Map())

  // Cache for expandRecurrence results, keyed by (doc identity, range) — see
  // lib/expand-cache.ts. Shrinking the view range (e.g. Year -> Month) reuses
  // the cached expansion instead of re-running expandRecurrence.
  const expandCacheState = useRef(createExpandCacheState())

  const [isPending, startTransition] = useTransition()

  const filterOptions = useMemo(
    () => (normalizedDoc ? extractFilterOptions(normalizedDoc) : null),
    [normalizedDoc],
  )

  // Defer the search text so keystrokes don't block re-filtering the full
  // occurrence list on every character typed.
  const deferredSearchText = useDeferredValue(filterState.searchText)
  const effectiveFilterState = useMemo(
    () => ({ ...filterState, searchText: deferredSearchText }),
    [filterState, deferredSearchText],
  )

  const filteredOccs = useMemo(
    () => applyFilters(allOccs, effectiveFilterState),
    [allOccs, effectiveFilterState],
  )

  // Keep occsById in sync with filteredOccs
  useEffect(() => {
    const map = new Map<string, CalendarOccurrence>()
    for (const occ of filteredOccs) map.set(occ.id, occ)
    occsById.current = map
  }, [filteredOccs])

  // Expand occurrences when the normalized doc or view range changes — served
  // from the range-aware cache whenever possible (see expand-cache.ts).
  useEffect(() => {
    if (!normalizedDoc) return
    const occs = getOccurrencesCached(
      expandCacheState.current,
      normalizedDoc,
      { start: viewRange.start, end: viewRange.end },
    )
    setAllOccs(occs)
  }, [normalizedDoc, viewRange])

  const ganttTasks = useMemo(
    () => toGanttData(filteredOccs, collapseSchedules, activePreset),
    [filteredOccs, collapseSchedules, activePreset]
  )

  // Dynamic Gantt scales and cell width based on active view preset
  const ganttScales = useMemo<IScaleConfig[]>(
    () => computeGanttScales(activePreset),
    [activePreset],
  )

  const ganttCellWidth = useMemo(
    () => computeGanttCellWidth(activePreset),
    [activePreset],
  )

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

  // View preset click — sets Gantt X-axis window from today-3 to today+N days.
  // Wrapped in a transition so the button click itself stays responsive while
  // the (potentially large) downstream re-expansion/re-render happens.
  const handlePresetClick = useCallback((preset: typeof VIEW_PRESETS[number]) => {
    const start = new Date(); start.setDate(start.getDate() - 3); start.setHours(0, 0, 0, 0)
    const end = new Date(); end.setDate(end.getDate() + preset.days); end.setHours(23, 59, 59, 999)
    startTransition(() => {
      setViewRange({ start, end })
      setActivePreset(preset.key)
    })
  }, [startTransition])

  // FullCalendar eventClick handler
  const handleFCEventClick = useCallback((arg: EventClickArg) => {
    const occ: CalendarOccurrence = arg.event.extendedProps.occ
    setSelectedOcc(occ)
  }, [])

  const activeFilterCount = useMemo(() => countActiveFilters(filterState), [filterState])

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
                  onClick={() => startTransition(() => { setActiveTab('timeline'); setFilterOpen(false) })}
                  type="button"
                >
                  Timeline
                </button>
                <button
                  className={`tab-btn${activeTab === 'calendar' ? ' tab-btn--active' : ''}`}
                  onClick={() => startTransition(() => { setActiveTab('calendar'); setFilterOpen(false) })}
                  type="button"
                >
                  Calendar
                </button>
                <button
                  className={`tab-btn${activeTab === 'heatmap' ? ' tab-btn--active' : ''}`}
                  onClick={() => startTransition(() => { setActiveTab('heatmap'); setFilterOpen(false) })}
                  type="button"
                >
                  Heatmap
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
        <div className="zone-b" aria-busy={isPending}>
          {normalizedDoc && filterOptions ? (
            activeTab === 'timeline' ? (
              <TimelineTab
                tasks={ganttTasks}
                scales={ganttScales}
                cellWidth={ganttCellWidth}
                start={viewRange.start}
                end={viewRange.end}
                occsById={occsById}
                onSelectOcc={setSelectedOcc}
              />
            ) : activeTab === 'calendar' ? (
              <CalendarTab
                fcEvents={fcEvents}
                onDatesSet={handleDatesSet}
                onEventClick={handleFCEventClick}
              />
            ) : (
              <HeatmapView
                occs={filteredOccs}
                onSelectOcc={setSelectedOcc}
              />
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

      {/* Calendar / Heatmap tabs: occurrence popup */}
      {selectedOcc && activeTab !== 'timeline' && (
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
