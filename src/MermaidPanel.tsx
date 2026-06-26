import { useCallback, useEffect, useId, useRef, useState } from 'react'
import mermaid from 'mermaid'
import type { NormalizedDocument } from './lib/normalize'

// ─── Init (once) ──────────────────────────────────────────────────────────────

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'structure' | 'dependencies'

export interface MermaidPanelProps {
  doc: NormalizedDocument
  onClose: () => void
}

// ─── Diagram generators ───────────────────────────────────────────────────────

// Mermaid node/subgraph IDs must be plain alphanumeric — no quotes, no special chars
function safeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '_')
}

function labelText(text: string): string {
  return text.replace(/["\[\]{}|]/g, ' ').trim()
}

function buildStructureDiagram(doc: NormalizedDocument): string {
  const lines: string[] = [
    'flowchart LR',
    '  classDef project fill:#dbeafe,stroke:#3b82f6,color:#1e40af',
    '  classDef pipeline fill:#ede9fe,stroke:#7c3aed,color:#5b21b6',
    '  classDef schedule fill:#f0fdf4,stroke:#16a34a,color:#15803d',
  ]

  const pipelineById = new Map(doc.pipelines.map((p) => [p.id, p]))

  for (const project of doc.projects) {
    const projId = safeId(project.id)
    lines.push(`  subgraph ${projId}["${labelText(project.name)}"]`)
    lines.push('    direction TB')

    for (const ref of project.pipelineRefs) {
      const pipeline = pipelineById.get(ref.pipelineId)
      if (!pipeline) continue

      const pipeId = safeId(pipeline.id)
      lines.push(`    ${pipeId}["${labelText(pipeline.name)}"]:::pipeline`)

      for (const schedule of pipeline.schedules) {
        const schedId = safeId(`${pipeline.id}_${schedule.id}`)
        lines.push(`    ${schedId}["${labelText(schedule.title)}"]:::schedule`)
        lines.push(`    ${pipeId} --> ${schedId}`)
      }
    }

    lines.push('  end')
    lines.push(`  class ${projId} project`)
  }

  return lines.join('\n')
}

function buildDependencyDiagram(doc: NormalizedDocument): { diagram: string; hasEdges: boolean } {
  const lines: string[] = ['flowchart LR']
  let hasEdges = false

  const nodesSeen = new Set<string>()

  for (const pipeline of doc.pipelines) {
    for (const schedule of pipeline.schedules) {
      const nodeKey = `${pipeline.id}::${schedule.id}`
      if (!nodesSeen.has(nodeKey)) {
        nodesSeen.add(nodeKey)
        const nodeId = safeId(nodeKey)
        const label = `${labelText(schedule.title)}<br/>(${labelText(pipeline.name)})`
        lines.push(`  ${nodeId}["${label}"]`)
      }

      const deps = schedule.dependencies?.blockedByScheduleIds ?? []
      for (const dep of deps) {
        const depId = safeId(dep)
        if (!nodesSeen.has(dep)) {
          nodesSeen.add(dep)
          const [depPipeId, depSchedId] = dep.split('::')
          const depPipeline = doc.pipelines.find((p) => p.id === depPipeId)
          const depSched = depPipeline?.schedules.find((s) => s.id === depSchedId)
          const depLabel = depSched
            ? `${labelText(depSched.title)}<br/>(${labelText(depPipeline!.name)})`
            : labelText(dep)
          lines.push(`  ${depId}["${depLabel}"]`)
        }
        const nodeId = safeId(nodeKey)
        lines.push(`  ${depId} --> ${nodeId}`)
        hasEdges = true
      }
    }
  }

  return { diagram: lines.join('\n'), hasEdges }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MermaidPanel({ doc, onClose }: MermaidPanelProps) {
  const [mode, setMode] = useState<Mode>('structure')
  const [svg, setSvg] = useState<string>('')
  const [rawSyntax, setRawSyntax] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [noEdges, setNoEdges] = useState(false)
  const [copyLabel, setCopyLabel] = useState('Copy Mermaid Syntax')

  // Pan / zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 24, y: 24 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const uid = useId()
  const renderId = useRef(0)

  // Non-passive wheel listener for zoom
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setZoom((z) => Math.min(Math.max(z * factor, 0.05), 10))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Render diagram — also resets pan/zoom when content changes
  useEffect(() => {
    setZoom(1)
    setPan({ x: 24, y: 24 })

    let diagram: string
    let hasEdges = true

    if (mode === 'structure') {
      diagram = buildStructureDiagram(doc)
    } else {
      const result = buildDependencyDiagram(doc)
      diagram = result.diagram
      hasEdges = result.hasEdges
    }

    setRawSyntax(diagram)
    setNoEdges(mode === 'dependencies' && !hasEdges)
    setError(null)

    if (mode === 'dependencies' && !hasEdges) {
      setSvg('')
      return
    }

    const id = ++renderId.current
    const elementId = `mp-render-${uid.replace(/:/g, '')}-${id}`

    mermaid
      .render(elementId, diagram)
      .then(({ svg: rendered }) => {
        if (renderId.current === id) setSvg(rendered)
      })
      .catch((err: unknown) => {
        if (renderId.current === id) {
          setError(err instanceof Error ? err.message : String(err))
          setSvg('')
        }
      })
  }, [mode, doc, uid])

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setDragging(true)
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragRef.current) return
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.sx),
      y: dragRef.current.py + (e.clientY - dragRef.current.sy),
    })
  }, [dragging])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  function handleCopy() {
    navigator.clipboard.writeText(rawSyntax).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy Mermaid Syntax'), 2000)
    })
  }

  function handleReset() {
    setZoom(1)
    setPan({ x: 24, y: 24 })
  }

  return (
    <>
      <style>{`
        .mp-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.6);
          z-index: 200;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
        }
        .mp-panel {
          display: flex;
          flex-direction: column;
          background: #fff;
          width: 100%;
          height: 100%;
        }
        .mp-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          height: 52px;
          background: #0f172a;
          color: #f1f5f9;
          flex-shrink: 0;
          border-bottom: 1px solid #1e293b;
          gap: 8px;
        }
        .mp-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mp-title {
          font-size: 14px;
          font-weight: 600;
          color: #94a3b8;
          margin-right: 4px;
        }
        .mp-close {
          padding: 5px 10px;
          background: #334155;
          border: 1px solid #475569;
          border-radius: 5px;
          color: #e2e8f0;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          line-height: 1;
        }
        .mp-close:hover { background: #475569; color: #f8fafc; }
        .mp-body {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          position: relative;
          background: #f8fafc;
        }
        .mp-canvas {
          position: absolute;
          inset: 0;
          /* cursor set inline via dragging state */
        }
        .mp-canvas-content {
          display: inline-block;
          transform-origin: 0 0;
          /* transform set inline */
        }
        .mp-canvas-content svg {
          display: block;
          max-width: none;
        }
        .mp-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          font-size: 14px;
          color: #64748b;
        }
        .mp-error {
          padding: 24px;
          overflow: auto;
          height: 100%;
        }
        .mp-error-title {
          font-size: 13px;
          color: #dc2626;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .mp-error pre {
          font-family: ui-monospace, monospace;
          font-size: 11px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
          color: #334155;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .mp-footer {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
          flex-shrink: 0;
        }
        .mp-foot-btn {
          padding: 4px 12px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 5px;
          font-size: 12px;
          font-weight: 500;
          color: #334155;
          cursor: pointer;
          line-height: 1.5;
        }
        .mp-foot-btn:hover { background: #e2e8f0; }
        .mp-zoom-pct {
          font-size: 12px;
          color: #64748b;
          min-width: 44px;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }
        .mp-foot-spacer { flex: 1; }
        .mp-hint {
          font-size: 11px;
          color: #94a3b8;
        }
      `}</style>

      <div className="mp-overlay">
        <div className="mp-panel" role="dialog" aria-modal="true" aria-label="Mermaid diagram viewer">
          {/* Header */}
          <div className="mp-header">
            <div className="mp-header-left">
              <span className="mp-title">Diagram</span>
              <div className="tab-switcher">
                <button
                  className={`tab-btn${mode === 'structure' ? ' tab-btn--active' : ''}`}
                  onClick={() => setMode('structure')}
                >
                  Structure
                </button>
                <button
                  className={`tab-btn${mode === 'dependencies' ? ' tab-btn--active' : ''}`}
                  onClick={() => setMode('dependencies')}
                >
                  Dependencies
                </button>
              </div>
            </div>
            <button className="mp-close" onClick={onClose} aria-label="Close diagram panel">
              ✕ Close
            </button>
          </div>

          {/* Body — pan/zoom canvas */}
          <div
            ref={bodyRef}
            className="mp-body"
          >
            {noEdges && <div className="mp-empty">No dependency relationships defined.</div>}

            {!noEdges && error && (
              <div className="mp-error">
                <div className="mp-error-title">Diagram render error — showing raw Mermaid syntax</div>
                <pre>{rawSyntax}</pre>
              </div>
            )}

            {!noEdges && !error && svg && (
              <div
                className="mp-canvas"
                style={{ cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <div
                  className="mp-canvas-content"
                  style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mp-footer">
            <button className="mp-foot-btn" onClick={handleCopy}>{copyLabel}</button>
            <div className="mp-foot-spacer" />
            <span className="mp-hint">scroll to zoom · drag to pan</span>
            <button className="mp-foot-btn" onClick={() => setZoom((z) => Math.min(z * 1.2, 10))}>+</button>
            <span className="mp-zoom-pct">{Math.round(zoom * 100)}%</span>
            <button className="mp-foot-btn" onClick={() => setZoom((z) => Math.max(z / 1.2, 0.05))}>−</button>
            <button className="mp-foot-btn" onClick={handleReset}>Reset</button>
          </div>
        </div>
      </div>
    </>
  )
}
