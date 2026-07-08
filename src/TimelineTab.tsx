import { useEffect, useRef } from 'react'
import { Gantt } from '@svar-ui/react-gantt'
import '@svar-ui/react-gantt/all.css'
import type { IScaleConfig, IApi } from '@svar-ui/react-gantt'

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
      />
    </div>
  )
}
