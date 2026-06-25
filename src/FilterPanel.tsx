import { useState, useCallback } from 'react'
import type { FilterState, FilterOptions } from './lib/filters'
import { toggleValue, emptyFilter, isFilterEmpty } from './lib/filters'
import { tagLabel } from './lib/tagEmoji'

// ─── Color helpers ────────────────────────────────────────────────────────────

const URGENCY_ACCENT: Record<string, string> = {
  critical: '#dc2626',
  high:     '#d97706',
  medium:   '#2563eb',
  low:      '#9ca3af',
}

const STRIPES = [
  '#7c3aed', '#db2777', '#0d9488', '#ea580c',
  '#0891b2', '#65a30d', '#e11d48', '#1d4ed8',
]

function pipelineColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h)
  return STRIPES[Math.abs(h) % STRIPES.length]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionProps {
  id: string; label: string; isOpen: boolean; active: number
  onToggle: () => void; children: React.ReactNode
}

function Section({ id, label, isOpen, active, onToggle, children }: SectionProps) {
  return (
    <div className="fp-section">
      <button
        className={`fp-section-head ${active > 0 ? 'fp-section-head--active' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`fp-body-${id}`}
      >
        <span className="fp-arrow" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
        <span className="fp-section-label">{label}</span>
        {active > 0 && <span className="fp-badge">{active}</span>}
      </button>
      {isOpen && (
        <div className="fp-section-body" id={`fp-body-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}

interface CheckItemProps {
  id: string; label: string; checked: boolean; dot?: string; onChange: () => void
}

function CheckItem({ id, label, checked, dot, onChange }: CheckItemProps) {
  return (
    <label className={`fp-check ${checked ? 'fp-check--on' : ''}`} htmlFor={`fp-cb-${id}`}>
      <input id={`fp-cb-${id}`} type="checkbox" checked={checked} onChange={onChange} className="fp-cb" />
      {dot && <span className="fp-dot" style={{ background: dot }} aria-hidden="true" />}
      <span className="fp-check-label">{label}</span>
    </label>
  )
}

// ─── FilterPanel ─────────────────────────────────────────────────────────────

interface FilterPanelProps {
  options:      FilterOptions
  filter:       FilterState
  onChange:     (next: FilterState) => void
  visibleCount: number
  totalCount:   number
  drawerOpen?:  boolean
}

export function FilterPanel({ options, filter, onChange, visibleCount, totalCount, drawerOpen }: FilterPanelProps) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(() => new Set(['projects', 'pipelines', 'urgency']))

  const q       = search.toLowerCase().trim()
  const matches = (s: string) => !q || s.toLowerCase().includes(q)

  const toggleSection = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggle = useCallback((key: keyof FilterState, value: string) => {
    onChange({ ...filter, [key]: toggleValue(filter[key], value) })
  }, [filter, onChange])

  const isFiltered = !isFilterEmpty(filter)

  // Active counts per section group
  const pipeTagActive  = filter.dataDomains.size + filter.pipelineTypes.size + filter.sourceSystems.size + filter.targetSystems.size
  const schedTagActive = filter.owners.size + filter.runTypes.size + filter.sourceTypes.size +
                         filter.envScopes.size + filter.maintenanceWindows.size + filter.reviewStates.size + filter.customTags.size

  // Per-section item lists (search-filtered)
  const f = <T extends string | { name: string }>(arr: T[]) =>
    arr.filter((x) => matches(typeof x === 'string' ? x : x.name))

  const projectItems    = f(options.projects)
  const pipelineItems   = f(options.pipelines)
  const urgencyItems    = f(options.urgencies)
  // Pipeline tags
  const dataDomainItems   = f(options.dataDomains)
  const pipelineTypeItems = f(options.pipelineTypes)
  const sourceSystemItems = f(options.sourceSystems)
  const targetSystemItems = f(options.targetSystems)
  // Schedule tags
  const ownerItems      = f(options.owners)
  const runTypeItems    = f(options.runTypes)
  const sourceTypeItems = f(options.sourceTypes)
  const envScopeItems   = f(options.envScopes)
  const mwItems         = f(options.maintenanceWindows)
  const reviewItems     = f(options.reviewStates)
  const customItems     = f(options.customTags)

  const hasPipeTagSection  = dataDomainItems.length + pipelineTypeItems.length + sourceSystemItems.length + targetSystemItems.length > 0
  const hasSchedTagSection = ownerItems.length + runTypeItems.length + sourceTypeItems.length + envScopeItems.length +
                             mwItems.length + reviewItems.length + customItems.length > 0

  return (
    <aside
      className={`filter-panel${drawerOpen ? ' filter-panel--open' : ''}`}
      aria-label="Filters"
    >
      {/* Search */}
      <div className="fp-search-row">
        <input
          className="fp-search"
          type="search"
          placeholder="Search filters…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search filter options"
        />
      </div>

      {/* Summary */}
      <div className="fp-summary">
        <span className="fp-count">
          {isFiltered && visibleCount !== totalCount
            ? `${visibleCount} / ${totalCount}`
            : `${totalCount} shown`}
        </span>
        {isFiltered && (
          <button className="fp-clear" onClick={() => onChange(emptyFilter())} type="button">
            Clear all
          </button>
        )}
      </div>

      <div className="fp-sections">

        {/* ── Section 1: Projects ── */}
        {projectItems.length > 0 && (
          <Section id="projects" label="Projects" isOpen={open.has('projects')}
            active={filter.projects.size} onToggle={() => toggleSection('projects')}>
            {projectItems.map((p) => (
              <CheckItem key={p.id} id={`proj-${p.id}`} label={p.name}
                checked={filter.projects.has(p.id)} onChange={() => toggle('projects', p.id)} />
            ))}
          </Section>
        )}

        {/* ── Section 2: Pipelines ── */}
        {pipelineItems.length > 0 && (
          <Section id="pipelines" label="Pipelines" isOpen={open.has('pipelines')}
            active={filter.pipelines.size} onToggle={() => toggleSection('pipelines')}>
            {pipelineItems.map((p) => (
              <CheckItem key={p.id} id={`pipe-${p.id}`} label={p.name}
                checked={filter.pipelines.has(p.id)} dot={pipelineColor(p.id)}
                onChange={() => toggle('pipelines', p.id)} />
            ))}
          </Section>
        )}

        {/* ── Section 3: Pipeline Tags ── */}
        {hasPipeTagSection && (
          <Section id="pipeTags" label="Pipeline Tags" isOpen={open.has('pipeTags')}
            active={pipeTagActive} onToggle={() => toggleSection('pipeTags')}>
            {dataDomainItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Data Domain</div>
                {dataDomainItems.map((d) => (
                  <CheckItem key={d} id={`dd-${d}`} label={tagLabel(d)}
                    checked={filter.dataDomains.has(d)} onChange={() => toggle('dataDomains', d)} />
                ))}
              </div>
            )}
            {pipelineTypeItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Pipeline Type</div>
                {pipelineTypeItems.map((t) => (
                  <CheckItem key={t} id={`pt-${t}`} label={tagLabel(t)}
                    checked={filter.pipelineTypes.has(t)} onChange={() => toggle('pipelineTypes', t)} />
                ))}
              </div>
            )}
            {sourceSystemItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Source System</div>
                {sourceSystemItems.map((s) => (
                  <CheckItem key={s} id={`ss-${s}`} label={tagLabel(s)}
                    checked={filter.sourceSystems.has(s)} onChange={() => toggle('sourceSystems', s)} />
                ))}
              </div>
            )}
            {targetSystemItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Target System</div>
                {targetSystemItems.map((s) => (
                  <CheckItem key={s} id={`ts-${s}`} label={tagLabel(s)}
                    checked={filter.targetSystems.has(s)} onChange={() => toggle('targetSystems', s)} />
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── Section 4: Urgency ── */}
        {urgencyItems.length > 0 && (
          <Section id="urgency" label="Urgency" isOpen={open.has('urgency')}
            active={filter.urgencies.size} onToggle={() => toggleSection('urgency')}>
            {urgencyItems.map((u) => (
              <CheckItem key={u} id={`urg-${u}`} label={u}
                checked={filter.urgencies.has(u)} dot={URGENCY_ACCENT[u]}
                onChange={() => toggle('urgencies', u)} />
            ))}
          </Section>
        )}

        {/* ── Section 5: Schedule Tags ── */}
        {hasSchedTagSection && (
          <Section id="schedTags" label="Schedule Tags" isOpen={open.has('schedTags')}
            active={schedTagActive} onToggle={() => toggleSection('schedTags')}>
            {ownerItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Owner</div>
                {ownerItems.map((o) => (
                  <CheckItem key={o} id={`own-${o}`} label={o}
                    checked={filter.owners.has(o)} onChange={() => toggle('owners', o)} />
                ))}
              </div>
            )}
            {runTypeItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Run Type</div>
                {runTypeItems.map((rt) => (
                  <CheckItem key={rt} id={`rt-${rt}`} label={tagLabel(rt)}
                    checked={filter.runTypes.has(rt)} onChange={() => toggle('runTypes', rt)} />
                ))}
              </div>
            )}
            {sourceTypeItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Source Type</div>
                {sourceTypeItems.map((t) => (
                  <CheckItem key={t} id={`stype-${t}`} label={tagLabel(t)}
                    checked={filter.sourceTypes.has(t)} onChange={() => toggle('sourceTypes', t)} />
                ))}
              </div>
            )}
            {envScopeItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Environment Scope</div>
                {envScopeItems.map((e) => (
                  <CheckItem key={e} id={`env-${e}`} label={tagLabel(e)}
                    checked={filter.envScopes.has(e)} onChange={() => toggle('envScopes', e)} />
                ))}
              </div>
            )}
            {mwItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Maintenance Window</div>
                {mwItems.map((mw) => (
                  <CheckItem key={mw} id={`mw-${mw}`} label={mw}
                    checked={filter.maintenanceWindows.has(mw)} onChange={() => toggle('maintenanceWindows', mw)} />
                ))}
              </div>
            )}
            {reviewItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Review State</div>
                {reviewItems.map((r) => (
                  <CheckItem key={r} id={`rev-${r}`} label={tagLabel(r)}
                    checked={filter.reviewStates.has(r)} onChange={() => toggle('reviewStates', r)} />
                ))}
              </div>
            )}
            {customItems.length > 0 && (
              <div className="fp-sub">
                <div className="fp-sub-label">Custom Tags</div>
                {customItems.map((c) => (
                  <CheckItem key={c} id={`ctag-${c}`} label={tagLabel(c)}
                    checked={filter.customTags.has(c)} onChange={() => toggle('customTags', c)} />
                ))}
              </div>
            )}
          </Section>
        )}

      </div>
    </aside>
  )
}
