import { useEffect, useRef } from 'react'
import { Gantt } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import type { IScaleConfig, IApi, ITask } from '@svar-ui/react-gantt'

import type { CalendarOccurrence } from './schema/types'
import type { GanttTask } from './lib/gantt-transform'

interface TimelineTabProps {
  tasks: GanttTask[]
  scales: IScaleConfig[]
  cellWidth: number
  start: Date
  end: Date
  occsById: React.RefObject<Map<string, CalendarOccurrence>>
  onSelectOcc: (occ: CalendarOccurrence) => void
}

// ─── Task bar visual template ─────────────────────────────────────────────────
//
// SVAR's taskTemplate prop replaces the bar's inner content slot entirely
// (see @svar-ui/react-gantt bar rendering: when taskTemplate is provided it
// renders in place of the default `.wx-content` div, not wrapped by it). We
// render a full-bleed absolutely-positioned div so it visually owns the whole
// bar regardless of the default `.wx-task` background — this is how
// `_urgencyBg` (fill) and `_stripe` (pipeline left border) actually reach the
// screen; without a template they are inert data fields (the pre-M2 bug).
function GanttBarContent({ data }: { data: ITask }) {
  // Project/Pipeline/Schedule rows are `type: 'summary'` and get an
  // auto-computed rollup bar from their children's date range — they never
  // carry _urgencyBg/_stripe (only occ-/agg- task bars do). Render them with
  // the library's own default content markup so the summary bracket styling
  // (`.wx-bar.wx-summary`, untouched by this template) still looks right;
  // taskTemplate has no per-type opt-out, so this branch has to do it by hand.
  if (data.type === 'summary') {
    return <div className="wx-content">{data.text || ''}</div>
  }

  const t = data as GanttTask
  const isAgg  = typeof t.id === 'string' && t.id.startsWith('agg-')
  const bg     = t._urgencyBg ?? '#f9fafb'
  const stripe = t._stripe ?? '#94a3b8'
  const count  = t._occCount

  const title = isAgg && count
    ? `${count} occurrence${count === 1 ? '' : 's'} — switch to Week preset for detail`
    : undefined

  return (
    <div
      className={`gantt-bar-fill${isAgg ? ' gantt-bar-fill--agg' : ''}`}
      style={{ backgroundColor: bg, borderLeftColor: stripe }}
      title={title}
    >
      <span className="gantt-bar-text">{data.text}</span>
      {isAgg && count ? <span className="gantt-bar-count">×{count}</span> : null}
    </div>
  )
}

// ─── Weekend column shading ────────────────────────────────────────────────────
//
// SVAR's highlightTime(date, unit) returns a css class applied to each scale
// cell; we only shade at day-level granularity (present in Week and Month
// presets' bottom scale row — Quarter/Year use week/month cells and are left
// alone since "weekend" isn't a meaningful concept at that resolution).
function highlightTime(date: Date, unit: string): string {
  if (unit === 'day' && (date.getDay() === 0 || date.getDay() === 6)) {
    return 'gantt-weekend'
  }
  return ''
}

// NOTE — "today" vertical reference line: SVAR's `markers` config is typed
// and accepted by the free @svar-ui/react-gantt package, but its own license
// gate (node_modules/@svar-ui/gantt-store/dist/index.js — the block that
// force-resets `markers`/`_markers`, `baselines`, `criticalPath`, `slack`,
// `rollups`, etc. to empty/false) silently empties it outside the PRO
// license. Confirmed experimentally: passing `markers` renders no
// `.wx-markers` DOM at all. Reimplementing it ourselves would mean an
// absolutely-positioned overlay that has to track the grid-panel width and
// the chart's horizontal scrollLeft by reading internal `IData` state not
// exposed on the public `IApi` — exactly the "fragile DOM hack" this
// milestone says to avoid. Left undone; upgrading to SVAR PRO is the
// straightforward way to get this.

export function TimelineTab({ tasks, scales, cellWidth, start, end, occsById, onSelectOcc }: TimelineTabProps) {
  const ganttRef = useRef<IApi>(null)

  // Wire select-task via the IApi ref once the Gantt mounts
  useEffect(() => {
    const api = ganttRef.current
    if (!api) return
    api.on('select-task', (ev: { id: string | number }) => {
      const id = String(ev.id ?? '')
      if (id.startsWith('occ-')) {
        const occId = id.slice(4)
        const occ   = occsById.current.get(occId)
        if (occ) onSelectOcc(occ)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="gantt-wrapper">
      <Gantt
        ref={ganttRef}
        tasks={tasks}
        links={[]}
        scales={scales}
        start={start}
        end={end}
        cellWidth={cellWidth}
        cellHeight={36}
        readonly={true}
        taskTemplate={GanttBarContent}
        highlightTime={highlightTime}
      />
    </div>
  )
}
