import { DetailPanel } from './DetailPanel'
import type { CalendarOccurrence } from './schema/types'

// ─── Calendar occurrence popup (modal) ───────────────────────────────────────

export function OccurrencePopup({ occ, onClose }: { occ: CalendarOccurrence; onClose: () => void }) {
  return (
    <div className="occ-popup-overlay" onClick={onClose}>
      <div className="occ-popup-card" onClick={(e) => e.stopPropagation()}>
        <DetailPanel occ={occ} onClose={onClose} />
      </div>
    </div>
  )
}
