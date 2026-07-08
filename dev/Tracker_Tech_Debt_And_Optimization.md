---
name: tracker-tech-debt-and-optimization
sync_with:
  - "[[Tracker_V1_Checklist]]"
  - "[[Tracker_Roadmap_Milestones]]"
---

# Tracker: Tech Debt & Optimization Backlog

Long-term tracker for known tech debt, deferred cleanups, and optimization
opportunities identified outside the normal phase/milestone flow — e.g. via
multi-agent codebase audits. Unlike `Tracker_V1_Checklist.md` (phase-scoped,
closed once V1 shipped) and `Tracker_Roadmap_Milestones.md` (feature
milestones), this tracker is **evergreen**: items get added as found, marked
✅ when resolved, and never archived — it is the standing backlog for "not
broken, but worth doing" work.

Any agent picking up work on this repo should skim the ⏳ Open section below
before starting a new task — several items are quick wins.

---

## Audit Log

| Date | Trigger | Scope |
|------|---------|-------|
| 2026-07-08 | User-requested multi-agent scan ("派遣 haiku agents 掃描這個專案...") | Full codebase: src/ structure, build/deps/tests, dev/ docs |
| 2026-07-08 | User-requested 4-agent parallel fix ("escape修復 和 tagemmojits我都要修復，修復好後測試覆蓋缺口") | Escape-key UX fix + all remaining test-coverage gaps from the audit below |

---

## ✅ Resolved (2026-07-08 audit)

These were found broken or missing and fixed in the same session
(commit `97fcacc`):

- **Build was completely broken** — `@svar-ui/react-gantt` was declared in
  `devDependencies` but never installed; `npm run build` failed with 3
  `Cannot find module` errors. Moved to `dependencies` (it's imported by
  `App.tsx` at runtime, not a dev-only tool) and ran `npm install`.
- **`main.tsx` imported a deleted spike file** (`./spike/SpikeApp.tsx`) behind
  a `?spike=1` query-param guard. The spike directory never existed in this
  checkout — removed the guard entirely.
- **3 type errors** surfaced once the build could run at all:
  `expand.ts` lost its `rec.recurrence.mode === 'rrule'` narrowing inside a
  `.map()` closure (fixed by hoisting `rec` before the closure);
  `FilterPanel.tsx`'s `toggle()` accepted `keyof FilterState` including
  `searchText` (a `string`, not a `Set<string>`) — narrowed to
  `Exclude<keyof FilterState, 'searchText'>`; unused `scheduleCount` in
  `App.tsx` removed.
- **`tsconfig.app.json` had no `strict: true`** — enabled; zero new errors
  once the above were fixed, meaning the codebase was already
  strict-clean in practice.
- **mermaid (~640KB unminified) shipped in the initial bundle** —
  `MermaidPanel` is now `React.lazy` + `Suspense`; `vite.config.ts` gained
  `manualChunks` splitting FullCalendar and SVAR Gantt into their own
  vendor chunks so the diagram panel's dependency only loads on first open.
- **44 lines of dead `.legend-*` CSS** in `App.css` from a removed sidebar
  component — deleted.
- **`src/lib/filters.ts` had zero test coverage** despite being core
  filtering logic (AND across dimensions, OR within a dimension, full-text
  search, tag extraction/sorting) — added
  `src/lib/__tests__/filters.test.ts` (17 tests).
- Minor: oxlint warning (unnecessary regex escape in `MermaidPanel.tsx`),
  placeholder `<title>vite-temp</title>` in `index.html`.

**Verified at runtime** (not just typecheck/tests) via Playwright against
`vite preview`: initial load shows 11,595 occurrences with mermaid absent
from network requests; opening the Diagram panel triggers the lazy chunk;
filter toggling correctly narrows the occurrence count; Calendar tab
renders and applies the frequency auto-filter; `?spike=1` no longer
blanks the page.

---

## ✅ Resolved (2026-07-08, 4-agent parallel dispatch)

Test suite grew from 46 → 83 tests across 4 independent, parallelized agent
tasks. All verified via `npm run check` (0 type errors) and `npm run test`
(83/83 passing) after the fact by the orchestrating session.

- **MermaidPanel Escape-key fix** — added a `useEffect` `keydown` listener
  in `src/MermaidPanel.tsx` that calls `onClose()` on `Escape`, cleaned up
  on unmount. Matches the file's existing effect style.
- **`src/lib/tagEmoji.ts` test coverage** — new `src/lib/__tests__/tagEmoji.test.ts`
  (5 tests): known-value lookup, case-insensitivity, unknown-value fallback.
- **`src/schema/validate.ts` cross-entity rule tests** — new
  `src/schema/__tests__/validate.test.ts` (8 tests): dangling `pipelineRefs`,
  pipeline/schedule timezone mismatch, `pipeline.projectRefs` derived-only
  warning (not an error), `blockedByScheduleIds` id-format regex,
  `byMonthDay` range validation, plus a valid-doc control. Note: "only one
  recurrence mode canonical" was found to not be a distinct testable rule —
  `RecurrenceSchema` is a Zod `discriminatedUnion` on `mode`, so a JSON
  payload structurally cannot hold two modes; Zod's default "strip unknown
  keys" behavior handles stray fields silently rather than rejecting them.
- **`expand.ts` edge cases** — 7 new tests in `src/lib/__tests__/expand.test.ts`
  (leap-year Feb 29 cron, DST spring-forward, DST fall-back, invalid cron
  string, invalid cron alongside a valid schedule in the same doc). See the
  **DST documentation mismatch** flag below — this is a finding, not a fix.
- **Component-level tests (`ImportModal`, `FilterPanel`)** — added
  `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `jsdom` as devDependencies; switched
  `vitest.config.ts` environment to `jsdom`, added `src/test-setup.ts`
  (`afterEach(cleanup)` + jest-dom matchers, since this repo doesn't use
  vitest `globals: true`). New `src/__tests__/ImportModal.test.tsx` (8 tests:
  JSON parse errors, schema-invalid errors, valid-import flow, no-blank-state
  on failure) and `src/__tests__/FilterPanel.test.tsx` (11 tests: search
  filtering, checkbox toggle, section collapse, clear-all). No bugs found
  in either component.

### ✅ Resolved (2026-07-08): DST documentation corrected to match actual behavior

The DST discrepancy flagged above was resolved by decision: keep
`expand.ts`'s actual behavior (shift-forward using the pre-transition UTC
offset, not drop) and correct the documentation to match, rather than add
drop-detection logic for a once-a-year edge case that only affects
non-`Asia/Taipei` (DST-observing) timezones. Rationale: the shift-forward
behavior is what real cron daemons/scheduling libraries generally do
already, so it's the more accurate representation of "what will actually
run" for a visualization tool — silently dropping would hide an occurrence
that would, in reality, still fire.

Updated "silently dropped" → "shifts forward by one hour via pre-transition
UTC offset" wording in: `CLAUDE.md` (DST Handling), `Tracker_V1_Checklist.md`
(Phase 1 + Phase 5), `Reference_JSON_Schedule_Schema.md`. No code changes.
`Design_Data_Model_Architecture.md` already had the correct wording and
needed no change. `src/lib/__tests__/expand.test.ts` (added same session)
is now consistent with all doc sources.

## ✅ Resolved (2026-07-08, [[Sprint_Perf_And_Visual_Overhaul]] M0–M4)

- **`App.tsx` split** (M0, commit `99e086f`) — extracted `lib/gantt-transform.ts`
  (`toGanttData()`, scale/cellWidth computation, `pipelineColor()`),
  `lib/calendar-transform.ts` (`toEvent()`, `fcEvents` filtering),
  `OccurrencePopup.tsx`, `TimelineTab.tsx`, `CalendarTab.tsx`. App.tsx went
  from 621 → 464 lines (state orchestration + header + tab switching only).
  Not yet under the original 300-line aspirational target — a `Header`
  extraction would close the gap further but was out of M0's explicit scope;
  left as a future quick win, not re-opened as a tracked item.
- **Both Performance items below** (M1, commit `3ce4d55`) — formatter cache,
  range-aware expand cache, `useDeferredValue`/`useTransition`, and
  scale-aware Gantt aggregation. See the old open items, now resolved, and
  the sprint doc's Part 1.1 diagnosis + Appendix A for measured numbers.
- **Timeline visual redesign** (M2, commit `3c7b302`) — pixel-based minimum
  bar width, urgency/pipeline colors rendered via SVAR's `taskTemplate`,
  aggregated-bar count badges + hatch pattern. Today marker line was
  evaluated and dropped — SVAR React Gantt's free tier force-clears the
  `markers` API server-side (verified in `gantt-store` bundled source), not
  an oversight.
- **Calendar visual redesign** (M3, commit `fe9788d`) — view switcher
  reordered to Day → Week → Month → Quarter → Year; EventChip redesign;
  color legend; today/weekend accents; FC view persisted to localStorage.
- **New Heatmap tab** (M4, commits `9c037a3` + `953daa5`) — GitHub-style
  Overview + per-pipeline Tracker modes, wired as the app's third tab.
- **`OccurrencePopup` missing Escape-key close** — found during M5
  acceptance review (not part of the original M0 fix, which covered
  `MermaidPanel` only); added the same `keydown` listener pattern.

## ⏳ Open — Structural / Refactor

- **`App.tsx` is 464 lines** (down from 621, see above) — header JSX
  (~180 lines) is the main remaining chunk; extracting a `Header.tsx`
  component would be a safe follow-up pure refactor if it grows further.
- **`App.css` is ~950 lines**, single global stylesheet, BEM-ish naming
  (`.app-*`, `.dp-*`, `.fp-*`, `.mp-*`). Not currently causing problems
  (no specificity fights observed, no unused rules beyond the ones already
  removed) but will get harder to navigate as features are added. If it
  crosses ~1500 lines, consider splitting per-component
  (`FilterPanel.css`, `MermaidPanel.css`, etc.) rather than CSS modules —
  matches the existing plain-CSS approach with less churn than a tooling
  change.

## ⏳ Open — Test Coverage

All items from the original audit are resolved — this section is currently
empty. `expand.ts`, `normalize.ts`, `filters.ts`, `validate.ts`,
`tagEmoji.ts`, `ImportModal.tsx`, `FilterPanel.tsx`, `gantt-transform.ts`,
`calendar-transform.ts`, `expand-cache.ts`, and `heatmap-transform.ts` all
have coverage (115 tests total across 11 files as of the
[[Sprint_Perf_And_Visual_Overhaul]] sprint).

## ✅ Resolved (2026-07-08, [[Sprint_Perf_And_Visual_Overhaul]] M1)

- **No virtualization on Gantt task list** — superseded by scale-aware
  aggregation instead: Month/Quarter/Year presets now collapse each
  schedule to one bar rather than one bar per occurrence, so the rendered
  task count dropped from ~11.6k to ~50 without needing row virtualization.
  Week preset still emits per-occurrence bars but stays well within a
  visible-week's row count.
- **365-day eager expansion on every `viewRange` change** — replaced by
  `lib/expand-cache.ts`: a shrinking range (e.g. Year → Month) is served
  by filtering the already-cached expansion instead of re-running
  `expandRecurrence`; only a range exceeding the cached bounds, or a new
  `normalizedDoc` reference (import), triggers a real recompute.
  `wallClockToUtc`'s `Intl.DateTimeFormat` construction is also now
  cached per timezone (~14x faster over 11,595 calls in isolated
  measurement: 492ms → 35ms).

## ⏳ Open — Performance (watch, not urgent)

Measured after the M1 optimization pass (see sprint doc Appendix A for
full numbers): cold load ~1.4s, preset switch ~44ms, tab switch ~80ms,
all within target. Nothing urgent, but flag for whoever adds bulk
real-world data or extends the Heatmap tab:

- **Heatmap tab has no dedicated perf probe** — M5 acceptance confirmed it
  shares the same `startTransition`-wrapped tab-switch mechanism as
  Timeline/Calendar and is O(n) to aggregate, but wasn't independently
  timed with Playwright. Add a probe if a future dataset makes it the
  slow tab.
- **Calendar event list has no virtualization** — not a problem at sample-
  data scale (FullCalendar's own date windowing keeps rendered events low
  in Week/Day views; Month view already hides sub-daily/daily schedules).
  Revisit if a single month-view window can exceed a few hundred events.

---

## Guidance for the Next Agent

- Before starting new feature work, check this file's ⏳ Open sections —
  several are small, well-scoped, and safe to batch with unrelated feature
  PRs (e.g. the Escape-key fix, or `tagEmoji.ts` tests).
- When you resolve an item, move it to a dated `## ✅ Resolved (date)`
  section with a one-line note of what changed and where — don't just
  delete the line. This file's value is the audit trail.
- If you run another full-codebase audit, add a new row to the Audit Log
  table above with the date and trigger, so future agents know when the
  last sweep happened and don't assume this list is exhaustive or fresh.
