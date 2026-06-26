import type { CalendarOccurrence } from '../schema/types'
import type { NormalizedDocument } from './normalize'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilterState {
  searchText: string
  // Entity
  projects:    Set<string>
  pipelines:   Set<string>
  // Pipeline tags
  dataDomains:   Set<string>
  pipelineTypes: Set<string>
  sourceSystems: Set<string>
  targetSystems: Set<string>
  // Schedule tags
  urgencies:         Set<string>
  owners:            Set<string>
  runTypes:          Set<string>
  sourceTypes:       Set<string>
  envScopes:         Set<string>
  maintenanceWindows: Set<string>
  reviewStates:      Set<string>
  customTags:        Set<string>
}

export interface FilterOptions {
  projects:    Array<{ id: string; name: string }>
  pipelines:   Array<{ id: string; name: string }>
  // Pipeline tags
  dataDomains:   string[]
  pipelineTypes: string[]
  sourceSystems: string[]
  targetSystems: string[]
  // Schedule tags
  urgencies:         string[]
  owners:            string[]
  runTypes:          string[]
  sourceTypes:       string[]
  envScopes:         string[]
  maintenanceWindows: string[]
  reviewStates:      string[]
  customTags:        string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyFilter(): FilterState {
  return {
    searchText: '',
    projects:    new Set(),
    pipelines:   new Set(),
    dataDomains:   new Set(),
    pipelineTypes: new Set(),
    sourceSystems: new Set(),
    targetSystems: new Set(),
    urgencies:         new Set(),
    owners:            new Set(),
    runTypes:          new Set(),
    sourceTypes:       new Set(),
    envScopes:         new Set(),
    maintenanceWindows: new Set(),
    reviewStates:      new Set(),
    customTags:        new Set(),
  }
}

export function isFilterEmpty(f: FilterState): boolean {
  if (f.searchText !== '') return false
  const { searchText: _, ...sets } = f
  return Object.values(sets).every((s) => (s as Set<string>).size === 0)
}

export function countActiveFilters(f: FilterState): number {
  const { searchText, ...sets } = f
  const setCount = Object.values(sets).reduce((n, s) => n + (s as Set<string>).size, 0)
  return setCount + (searchText ? 1 : 0)
}

export function toggleValue(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

// ─── Filter application ───────────────────────────────────────────────────────

export function applyFilters(occs: CalendarOccurrence[], f: FilterState): CalendarOccurrence[] {
  let result = occs

  // Full-text search across schedule title, pipeline name, and project names
  if (f.searchText) {
    const q = f.searchText.toLowerCase()
    result = result.filter((occ) =>
      occ.scheduleTitle.toLowerCase().includes(q) ||
      occ.pipelineName.toLowerCase().includes(q) ||
      occ.projectContexts.some((ctx) => ctx.projectName.toLowerCase().includes(q))
    )
  }

  // Short-circuit if no dimension filters are active
  const { searchText: _, ...sets } = f
  if (Object.values(sets).every((s) => (s as Set<string>).size === 0)) return result

  return result.filter((occ) => {
    const dt = occ.directTags
    const it = occ.inheritedTags

    // ── Entity filters ──
    if (f.projects.size > 0) {
      if (!occ.projectContexts.map((p) => p.projectId).some((id) => f.projects.has(id))) return false
    }
    if (f.pipelines.size > 0 && !f.pipelines.has(occ.pipelineId)) return false

    // ── Pipeline tag filters ──
    if (f.dataDomains.size > 0) {
      if (!(it.dataDomain ?? []).some((d) => f.dataDomains.has(d))) return false
    }
    if (f.pipelineTypes.size > 0) {
      if (!(it.pipelineType ?? []).some((t) => f.pipelineTypes.has(t))) return false
    }
    if (f.sourceSystems.size > 0) {
      if (!(it.sourceSystem ?? []).some((s) => f.sourceSystems.has(s))) return false
    }
    if (f.targetSystems.size > 0) {
      if (!(it.targetSystem ?? []).some((s) => f.targetSystems.has(s))) return false
    }

    // ── Schedule tag filters ──
    if (f.urgencies.size > 0) {
      if (!f.urgencies.has(dt.urgency ?? 'low')) return false
    }
    if (f.owners.size > 0) {
      if (!(dt.owner ?? []).some((o) => f.owners.has(o))) return false
    }
    if (f.runTypes.size > 0) {
      if (!dt.runType || !f.runTypes.has(dt.runType)) return false
    }
    if (f.sourceTypes.size > 0) {
      if (!(dt.sourceType ?? []).some((t) => f.sourceTypes.has(t))) return false
    }
    if (f.envScopes.size > 0) {
      if (!dt.environmentScope || !f.envScopes.has(dt.environmentScope)) return false
    }
    if (f.maintenanceWindows.size > 0) {
      if (!dt.maintenanceWindow || !f.maintenanceWindows.has(dt.maintenanceWindow)) return false
    }
    if (f.reviewStates.size > 0) {
      if (!dt.reviewState || !f.reviewStates.has(dt.reviewState)) return false
    }
    if (f.customTags.size > 0) {
      const all = [...(dt.custom ?? []), ...(it.custom ?? [])]
      if (!all.some((t) => f.customTags.has(t))) return false
    }

    return true
  })
}

// ─── Options extraction ───────────────────────────────────────────────────────

type PipelineTagsLike = {
  dataDomain?: string[]
  pipelineType?: string[]
  sourceSystem?: string[]
  targetSystem?: string[]
  custom?: string[]
}

export function extractFilterOptions(doc: NormalizedDocument): FilterOptions {
  const sets = {
    dataDomains:        new Set<string>(),
    pipelineTypes:      new Set<string>(),
    sourceSystems:      new Set<string>(),
    targetSystems:      new Set<string>(),
    owners:             new Set<string>(),
    runTypes:           new Set<string>(),
    sourceTypes:        new Set<string>(),
    envScopes:          new Set<string>(),
    maintenanceWindows: new Set<string>(),
    reviewStates:       new Set<string>(),
    customTags:         new Set<string>(),
  }

  for (const pipeline of doc.pipelines) {
    const tags = pipeline.tags as PipelineTagsLike | undefined
    for (const v of tags?.dataDomain   ?? []) sets.dataDomains.add(v)
    for (const v of tags?.pipelineType ?? []) sets.pipelineTypes.add(v)
    for (const v of tags?.sourceSystem ?? []) sets.sourceSystems.add(v)
    for (const v of tags?.targetSystem ?? []) sets.targetSystems.add(v)
    for (const v of tags?.custom       ?? []) sets.customTags.add(v)

    for (const schedule of pipeline.schedules) {
      const st = schedule.directTags
      for (const v of st.owner      ?? []) sets.owners.add(v)
      if (st.runType)            sets.runTypes.add(st.runType)
      for (const v of st.sourceType ?? []) sets.sourceTypes.add(v)
      if (st.environmentScope)   sets.envScopes.add(st.environmentScope)
      if (st.maintenanceWindow)  sets.maintenanceWindows.add(st.maintenanceWindow)
      if (st.reviewState)        sets.reviewStates.add(st.reviewState)
      for (const v of st.custom  ?? []) sets.customTags.add(v)
    }
  }

  const sorted = (s: Set<string>) => [...s].sort()

  return {
    projects:    doc.projects.map((p) => ({ id: p.id, name: p.name })),
    pipelines:   doc.pipelines.map((p) => ({ id: p.id, name: p.name })),
    urgencies:   ['critical', 'high', 'medium', 'low'],
    dataDomains:        sorted(sets.dataDomains),
    pipelineTypes:      sorted(sets.pipelineTypes),
    sourceSystems:      sorted(sets.sourceSystems),
    targetSystems:      sorted(sets.targetSystems),
    owners:             sorted(sets.owners),
    runTypes:           sorted(sets.runTypes),
    sourceTypes:        sorted(sets.sourceTypes),
    envScopes:          sorted(sets.envScopes),
    maintenanceWindows: sorted(sets.maintenanceWindows),
    reviewStates:       sorted(sets.reviewStates),
    customTags:         sorted(sets.customTags),
  }
}
