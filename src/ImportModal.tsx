import { useState, useRef, useCallback } from 'react'
import { parseScheduleDocument } from './schema/validate'
import type { ParsedScheduleDocument } from './schema/validate'

// ─── ImportModal ──────────────────────────────────────────────────────────────

interface ImportModalProps {
  onImport: (doc: ParsedScheduleDocument) => void
  onClose:  () => void
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [text,   setText]   = useState('')
  const [errors, setErrors] = useState<Array<{ path: string; message: string }>>([])
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validate = useCallback((raw: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      setErrors([{ path: '(root)', message: `Invalid JSON: ${(e as Error).message}` }])
      setStatus('error')
      return
    }
    const result = parseScheduleDocument(parsed)
    if (!result.success) {
      setErrors(result.errors)
      setStatus('error')
      return
    }
    setErrors([])
    setStatus('ok')
    onImport(result.data)
    onClose()
  }, [onImport, onClose])

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setText(content)
      validate(content)
    }
    reader.readAsText(file)
  }, [validate])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label="Import JSON">
        <div className="modal-header">
          <h2 className="modal-title">Import Schedule JSON</h2>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {/* Drop zone / file picker */}
          <div
            className="import-drop"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <p className="import-drop-text">Drop a <code>.json</code> file here, or</p>
            <button
              className="import-pick-btn"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          <div className="import-or">or paste JSON below</div>

          {/* Paste editor */}
          <textarea
            className={`import-editor ${status === 'error' ? 'import-editor--error' : status === 'ok' ? 'import-editor--ok' : ''}`}
            value={text}
            onChange={(e) => { setText(e.target.value); setErrors([]); setStatus('idle') }}
            placeholder='{ "schemaVersion": "1.0", "projects": [...], "pipelines": [...] }'
            rows={10}
            spellCheck={false}
            aria-label="Paste JSON"
          />

          {/* Error list */}
          {errors.length > 0 && (
            <div className="import-errors" role="alert">
              <strong className="import-errors-title">
                {errors.length} validation error{errors.length > 1 ? 's' : ''}
              </strong>
              <ul className="import-error-list">
                {errors.map((err, i) => (
                  <li key={i} className="import-error-item">
                    <code className="import-err-path">{err.path}</code>
                    <span className="import-err-msg">{err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn modal-btn--secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="modal-btn modal-btn--primary"
            onClick={() => validate(text)}
            type="button"
            disabled={!text.trim()}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
