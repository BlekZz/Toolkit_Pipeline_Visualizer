import { describe, it, expect } from 'vitest'
import {
  emptyFilter, isFilterEmpty, countActiveFilters, toggleValue,
  applyFilters, extractFilterOptions,
} from '../filters'
import type { FilterState } from '../filters'
import { normalizeScheduleDocument } from '../normalize'
import type { CalendarOccurrence, ScheduleTags, PipelineTags } from '../../schema/types'

// ─── Minimal fixture builders ─────────────────────────────────────────────────

function makeOcc(overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence {
  return {
    id: 'pipe-1::sched-1::2026-07-06T01:00:00Z',
    pipelineId: 'pipe-1',
    pipelineName: 'Sales ETL',
    scheduleId: 'sched-1',
    scheduleTitle: 'Daily sync',
    scheduledStart: '2026-07-06T01:00:00Z',
    scheduledEnd: '2026-07-06T01:05:00Z',
    durationSeconds: 300,
    displayTimezone: 'Asia/Taipei',
    recurrenceMode: 'simple',
    directTags: {},
    inheritedTags: {},
    projectContexts: [
      { projectId: 'proj-a', projectName: 'Project A', projectTimezone: 'Asia/Taipei' },
    ],
    ...overrides,
  }
}

function withFilter(overrides: Partial<FilterState>): FilterState {
  return { ...emptyFilter(), ...overrides }
}

// ─── Helper functions ─────────────────────────────────────────────────────────

describe('filter helpers', () => {
  it('emptyFilter is empty and counts zero', () => {
    expect(isFilterEmpty(emptyFilter())).toBe(true)
    expect(countActiveFilters(emptyFilter())).toBe(0)
  })

  it('searchText alone makes the filter non-empty and counts as one', () => {
    const f = withFilter({ searchText: 'sales' })
    expect(isFilterEmpty(f)).toBe(false)
    expect(countActiveFilters(f)).toBe(1)
  })

  it('countActiveFilters sums values across dimensions', () => {
    const f = withFilter({
      projects: new Set(['proj-a']),
      urgencies: new Set(['high', 'critical']),
      searchText: 'x',
    })
    expect(countActiveFilters(f)).toBe(4)
  })

  it('toggleValue adds a missing value and removes an existing one, without mutating', () => {
    const original = new Set(['a'])
    const added = toggleValue(original, 'b')
    expect([...added].sort()).toEqual(['a', 'b'])
    const removed = toggleValue(added, 'a')
    expect([...removed]).toEqual(['b'])
    expect([...original]).toEqual(['a']) // input untouched
  })
})

// ─── applyFilters ─────────────────────────────────────────────────────────────

describe('applyFilters — full-text search', () => {
  const occs = [
    makeOcc({ scheduleTitle: 'Daily sales sync' }),
    makeOcc({ id: 'p2::s2::t', pipelineName: 'Finance ETL', scheduleTitle: 'Ledger close' }),
    makeOcc({
      id: 'p3::s3::t',
      scheduleTitle: 'Refresh',
      pipelineName: 'Misc',
      projectContexts: [{ projectId: 'proj-x', projectName: 'Sales Domain', projectTimezone: 'Asia/Taipei' }],
    }),
  ]

  it('matches case-insensitively across schedule title, pipeline name, and project name', () => {
    const result = applyFilters(occs, withFilter({ searchText: 'SALES' }))
    expect(result).toHaveLength(2) // title match + project-name match
  })

  it('returns everything when the filter is empty', () => {
    expect(applyFilters(occs, emptyFilter())).toHaveLength(3)
  })
})

describe('applyFilters — dimension semantics', () => {
  const dtHigh: ScheduleTags  = { urgency: 'high', owner: ['alice'], runType: 'automated' }
  const dtLow: ScheduleTags   = { owner: ['bob'] } // no urgency → defaults to 'low'
  const itSales: PipelineTags = { dataDomain: ['sales'], sourceSystem: ['erp'] }
  const itFin: PipelineTags   = { dataDomain: ['finance'] }

  const occs = [
    makeOcc({ directTags: dtHigh, inheritedTags: itSales }),
    makeOcc({ id: 'p2::s2::t', pipelineId: 'pipe-2', directTags: dtLow, inheritedTags: itFin }),
  ]

  it('OR within a dimension: two urgencies match either occurrence', () => {
    const result = applyFilters(occs, withFilter({ urgencies: new Set(['high', 'low']) }))
    expect(result).toHaveLength(2)
  })

  it('missing urgency tag falls back to "low"', () => {
    const result = applyFilters(occs, withFilter({ urgencies: new Set(['low']) }))
    expect(result).toHaveLength(1)
    expect(result[0].pipelineId).toBe('pipe-2')
  })

  it('AND across dimensions: urgency + dataDomain must both match', () => {
    const both = applyFilters(occs, withFilter({
      urgencies: new Set(['high']),
      dataDomains: new Set(['sales']),
    }))
    expect(both).toHaveLength(1)

    const conflict = applyFilters(occs, withFilter({
      urgencies: new Set(['high']),
      dataDomains: new Set(['finance']),
    }))
    expect(conflict).toHaveLength(0)
  })

  it('pipeline filter matches by pipelineId', () => {
    const result = applyFilters(occs, withFilter({ pipelines: new Set(['pipe-2']) }))
    expect(result).toHaveLength(1)
  })

  it('project filter matches any of the occurrence projectContexts', () => {
    const shared = makeOcc({
      id: 'p3::s3::t',
      projectContexts: [
        { projectId: 'proj-a', projectName: 'A', projectTimezone: 'Asia/Taipei' },
        { projectId: 'proj-b', projectName: 'B', projectTimezone: 'Asia/Taipei' },
      ],
    })
    const result = applyFilters([shared], withFilter({ projects: new Set(['proj-b']) }))
    expect(result).toHaveLength(1)
  })

  it('customTags match across both direct and inherited tags', () => {
    const occ = makeOcc({
      directTags: { custom: ['adhoc'] },
      inheritedTags: { custom: ['quarterly'] },
    })
    expect(applyFilters([occ], withFilter({ customTags: new Set(['quarterly']) }))).toHaveLength(1)
    expect(applyFilters([occ], withFilter({ customTags: new Set(['adhoc']) }))).toHaveLength(1)
    expect(applyFilters([occ], withFilter({ customTags: new Set(['none']) }))).toHaveLength(0)
  })

  it('occurrences without the filtered tag are excluded', () => {
    const result = applyFilters(occs, withFilter({ runTypes: new Set(['manual']) }))
    expect(result).toHaveLength(0)
  })
})

// ─── extractFilterOptions ─────────────────────────────────────────────────────

describe('extractFilterOptions', () => {
  const doc = normalizeScheduleDocument({
    schemaVersion: '1.0',
    projects: [{ id: 'proj-a', name: 'Project A', timezone: 'Asia/Taipei', pipelineRefs: [{ pipelineId: 'pipe-1' }] }],
    pipelines: [{
      id: 'pipe-1',
      name: 'Sales ETL',
      timezone: 'Asia/Taipei',
      tags: { dataDomain: ['sales', 'crm'], sourceSystem: ['erp'], custom: ['legacy'] },
      schedules: [{
        id: 'sched-1',
        title: 'Daily sync',
        enabled: true,
        timezone: 'Asia/Taipei',
        tags: { owner: ['alice'], runType: 'automated' as const, custom: ['adhoc'] },
        schedule: {
          type: 'recurring' as const,
          startDate: '2026-07-06',
          time: '09:00',
          durationSeconds: 300,
          recurrence: { mode: 'simple' as const, frequency: 'daily' as const, interval: 1 },
        },
      }],
    }],
  }, { mode: 'global' })

  const options = extractFilterOptions(doc)

  it('lists projects and pipelines with id + name', () => {
    expect(options.projects).toEqual([{ id: 'proj-a', name: 'Project A' }])
    expect(options.pipelines).toEqual([{ id: 'pipe-1', name: 'Sales ETL' }])
  })

  it('collects and sorts pipeline tag values', () => {
    expect(options.dataDomains).toEqual(['crm', 'sales']) // sorted
    expect(options.sourceSystems).toEqual(['erp'])
  })

  it('collects schedule tag values and merges custom tags from both levels', () => {
    expect(options.owners).toEqual(['alice'])
    expect(options.runTypes).toEqual(['automated'])
    expect(options.customTags).toEqual(['adhoc', 'legacy'])
  })

  it('always exposes the fixed urgency ladder', () => {
    expect(options.urgencies).toEqual(['critical', 'high', 'medium', 'low'])
  })
})
