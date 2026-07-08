import { useEffect } from 'react'
import { DetailPanel } from './DetailPanel'
import type { CalendarOccurrence } from './schema/types'

// ─── Calendar occurrence popup (modal) ───────────────────────────────────────

export function OccurrencePopup({ occ, onClose }: { occ: CalendarOccurrence; onClose: () => void }) {
  // Escape key closes the popup
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="occ-popup-overlay" onClick={onClose}>
      <div className="occ-popup-card" onClick={(e) => e.stopPropagation()}>
        <DetailPanel occ={occ} onClose={onClose} />
      </div>
    </div>
  )
}
