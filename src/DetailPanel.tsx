import type { CalendarOccurrence } from './schema/types'
import { tagLabel } from './lib/tagEmoji'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone:    timezone,
      weekday:     'short',
      month:       'short',
      day:         'numeric',
      hour:        '2-digit',
      minute:      '2-digit',
      hour12:      false,
      timeZoneName: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60)   return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span className={`dp-chip ${muted ? 'dp-chip--muted' : ''}`}>{label}</span>
  )
}

// ─── Urgency badge ────────────────────────────────────────────────────────────

const URGENCY_CLASS: Record<string, string> = {
  critical: 'dp-urg--critical',
  high:     'dp-urg--high',
  medium:   'dp-urg--medium',
  low:      'dp-urg--low',
}

// ─── CopyId row ───────────────────────────────────────────────────────────────

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="dp-copy-row">
      <span className="dp-copy-label">{label}</span>
      <code className="dp-copy-val">{value}</code>
      <button
        className="dp-copy-btn"
        onClick={() => copyText(value)}
        title="Copy to clipboard"
        type="button"
      >
        ⎘
      </button>
    </div>
  )
}

// ─── DetailPanel ─────────────────────────────────────────────────────────────

interface DetailPanelProps {
  occ:     CalendarOccurrence
  onClose: () => void
}

export function DetailPanel({ occ, onClose }: DetailPanelProps) {
  const urgency   = occ.directTags.urgency ?? 'low'
  const runType   = occ.directTags.runType
  const duration  = occ.durationSeconds
  const tz        = occ.displayTimezone

  // Recurrence source rule
  let sourceRule = occ.recurrenceSource ?? '—'
  if (occ.recurrenceMode === 'cron')     sourceRule = `cron: ${occ.recurrenceSource ?? '—'}`
  if (occ.recurrenceMode === 'rrule')    sourceRule = `rrule: ${occ.recurrenceSource ?? '—'}`
  if (occ.recurrenceMode === 'one_time') sourceRule = `one-time: ${occ.recurrenceSource ?? '—'}`
  if (occ.recurrenceMode === 'simple')   sourceRule = occ.recurrenceSource ?? '—'

  // Direct tag entries (schedule-level)
  const directEntries = Object.entries(occ.directTags).filter(([, v]) => v !== undefined && v !== null)
  // Inherited tag entries (pipeline-level)
  const inheritedEntries = Object.entries(occ.inheritedTags).filter(([, v]) => v !== undefined && v !== null)

  const formatTagValue = (v: unknown): string => {
    if (Array.isArray(v)) return v.map((item) => tagLabel(String(item))).join(', ')
    return tagLabel(String(v))
  }

  return (
    <div className="detail-panel" role="dialog" aria-label="Occurrence detail">
      {/* Header */}
      <div className="dp-header">
        <h2 className="dp-title">{occ.scheduleTitle}</h2>
        <button className="dp-close" onClick={onClose} aria-label="Close detail panel" type="button">✕</button>
      </div>

      {/* ── Zone A: Always visible ── */}
      <div className="dp-zone dp-zone-a">
        {/* Breadcrumb */}
        <div className="dp-breadcrumb">
          {occ.projectContexts.length > 0
            ? occ.projectContexts.map((p) => p.projectName).join(', ')
            : <span className="dp-bc-none">No project</span>}
          <span className="dp-bc-sep"> › </span>
          <span className="dp-bc-pipeline">{occ.pipelineName}</span>
          <span className="dp-bc-sep"> › </span>
          <span className="dp-bc-schedule">{occ.scheduleTitle}</span>
        </div>

        {/* Time */}
        <div className="dp-time-block">
          <div className="dp-time-row">
            <span className="dp-time-label">Start</span>
            <span className="dp-time-val">{formatDateTime(occ.scheduledStart, tz)}</span>
          </div>
          <div className="dp-time-row">
            <span className="dp-time-label">End</span>
            <span className="dp-time-val">{formatDateTime(occ.scheduledEnd, tz)}</span>
          </div>
          <div className="dp-time-row">
            <span className="dp-time-label">Duration</span>
            <span className="dp-time-val">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Badges */}
        <div className="dp-badges">
          <span className={`dp-urg ${URGENCY_CLASS[urgency] ?? 'dp-urg--low'}`}>{urgency}</span>
          {runType && <span className="dp-badge-pill">{runType}</span>}
          <span className="dp-badge-pill dp-badge-pill--mode">{occ.recurrenceMode}</span>
        </div>
      </div>

      {/* ── Zone B: Tags & recurrence ── */}
      <div className="dp-zone dp-zone-b">
        <div className="dp-section-label">Recurrence</div>
        <p className="dp-source-rule">{sourceRule}</p>

        {directEntries.length > 0 && (
          <>
            <div className="dp-section-label">
              Schedule tags
              <span className="dp-section-hint"> (direct)</span>
            </div>
            <div className="dp-chips">
              {directEntries.map(([k, v]) => (
                <Chip key={k} label={`${k}: ${formatTagValue(v)}`} />
              ))}
            </div>
          </>
        )}

        {inheritedEntries.length > 0 && (
          <>
            <div className="dp-section-label">
              Pipeline tags
              <span className="dp-section-hint"> (inherited)</span>
            </div>
            <div className="dp-chips">
              {inheritedEntries.map(([k, v]) => (
                <Chip key={k} label={`${k}: ${formatTagValue(v)}`} muted />
              ))}
            </div>
          </>
        )}

        {occ.projectContexts.length > 0 && (
          <>
            <div className="dp-section-label">Project contexts</div>
            <div className="dp-chips">
              {occ.projectContexts.map((p) => (
                <Chip key={p.projectId} label={p.projectName} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Zone C: Advanced (collapsed) ── */}
      <details className="dp-zone dp-zone-c">
        <summary className="dp-advanced-toggle">Advanced</summary>

        {(occ.assumptions ?? []).length > 0 && (
          <div className="dp-adv-block">
            <div className="dp-section-label">Assumptions</div>
            <ul className="dp-assumptions">
              {(occ.assumptions ?? []).map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {occ.needsReview && (
          <div className="dp-adv-block">
            <span className="dp-needs-review">⚠ Needs review</span>
          </div>
        )}

        <div className="dp-adv-block">
          <div className="dp-section-label">IDs</div>
          <CopyRow label="Occurrence" value={occ.id} />
          <CopyRow label="Schedule"   value={occ.scheduleId} />
          <CopyRow label="Pipeline"   value={occ.pipelineId} />
        </div>
      </details>
    </div>
  )
}
