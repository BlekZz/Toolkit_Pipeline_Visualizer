import { expandRecurrence } from './expand'
import type { DateRange } from './expand'
import type { NormalizedDocument } from './normalize'
import type { CalendarOccurrence } from '../schema/types'

// ─── Range-aware expansion cache ──────────────────────────────────────────────
//
// expandRecurrence is the most expensive step in the render pipeline (it walks
// every schedule occurrence-by-occurrence). Most view-range changes (preset
// clicks that shrink the window, e.g. Year -> Month) are strict subsets of a
// range already expanded — those can be served by filtering the cached result
// (O(n) over already-computed occurrences) instead of re-expanding from
// scratch. Only a range that extends beyond what's cached needs a recompute.

export type ExpandFn = (doc: NormalizedDocument, range: DateRange) => CalendarOccurrence[]

export interface ExpandCacheState {
  doc: NormalizedDocument | null
  range: DateRange | null
  occs: CalendarOccurrence[]
}

export function createExpandCacheState(): ExpandCacheState {
  return { doc: null, range: null, occs: [] }
}

function isSubsetRange(range: DateRange, of: DateRange): boolean {
  return range.start.getTime() >= of.start.getTime() && range.end.getTime() <= of.end.getTime()
}

function filterByRange(occs: CalendarOccurrence[], range: DateRange): CalendarOccurrence[] {
  const startMs = range.start.getTime()
  const endMs   = range.end.getTime()
  return occs.filter((occ) => {
    const t = new Date(occ.scheduledStart).getTime()
    return t >= startMs && t <= endMs
  })
}

/**
 * Returns occurrences for `doc` within `range`, reusing `state` (mutated
 * in-place) as a cache. Recomputes only when `doc` changes (by reference —
 * a new document from import/normalization) or when `range` is not a subset
 * of the previously cached range.
 */
export function getOccurrencesCached(
  state: ExpandCacheState,
  doc: NormalizedDocument,
  range: DateRange,
  expandFn: ExpandFn = expandRecurrence,
): CalendarOccurrence[] {
  if (state.doc === doc && state.range && isSubsetRange(range, state.range)) {
    return filterByRange(state.occs, range)
  }

  const occs = expandFn(doc, range)
  state.doc = doc
  state.range = range
  state.occs = occs
  return occs
}
