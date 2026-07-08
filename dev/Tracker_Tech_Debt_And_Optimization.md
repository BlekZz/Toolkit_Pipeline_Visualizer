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

## ⏳ Open — Structural / Refactor

- **`App.tsx` is 621 lines** hosting the entire app shell: state
  orchestration, `toGanttData()`/`toEvent()` transforms, the
  `OccurrencePopup` sub-component, and the FullCalendar/SVAR Gantt wiring
  all in one file. Candidate extractions (in order of value):
  - `lib/gantt-transform.ts` — `toGanttData()` and the Gantt scale/cellWidth
    computation (currently App.tsx ~line 61-159, 343-387)
  - `lib/calendar-transform.ts` — `toEvent()` / `fcEvents` construction
  - `OccurrencePopup.tsx` — currently an inline component in App.tsx
  This is a pure refactor (no behavior change) — safe for a Sonnet-tier
  agent to do in one pass, verify via the `verify` skill against the
  Timeline/Calendar tabs afterward.
- **`App.css` is ~950 lines**, single global stylesheet, BEM-ish naming
  (`.app-*`, `.dp-*`, `.fp-*`, `.mp-*`). Not currently causing problems
  (no specificity fights observed, no unused rules beyond the ones already
  removed) but will get harder to navigate as features are added. If it
  crosses ~1500 lines, consider splitting per-component
  (`FilterPanel.css`, `MermaidPanel.css`, etc.) rather than CSS modules —
  matches the existing plain-CSS approach with less churn than a tooling
  change.

## ⏳ Open — Test Coverage

All items from the original audit are resolved as of 2026-07-08 (see
`## ✅ Resolved (2026-07-08, 4-agent parallel dispatch)` above) — this
section is currently empty. `expand.ts`, `normalize.ts`, `filters.ts`,
`validate.ts`, `tagEmoji.ts`, `ImportModal.tsx`, and `FilterPanel.tsx` all
have coverage now (83 tests total across 7 files).

## ⏳ Open — Performance (watch, not urgent)

None of these are causing problems today (sample data tops out around
11,595 occurrences post-expansion and the app stays responsive), but flag
them for whoever adds bulk real-world data:

- **No virtualization** on the Gantt task list or Calendar event list. If a
  real dataset produces tens of thousands of rows in Timeline's Month/Week
  view, consider `@svar-ui/react-gantt`'s built-in virtualization options
  (check its docs — SVAR Gantt generally virtualizes rows already, but the
  *filtered* task tree rebuild in `toGanttData()` is not memoscoped beyond
  `filteredOccs`/`collapseSchedules`).
- **365-day eager expansion on every `viewRange` change** — acceptable now
  because `viewRange` only changes on explicit user action (preset click,
  date picker), not on every render. If a future feature ties `viewRange`
  to continuous scrolling, revisit — `expandRecurrence` is O(schedules ×
  occurrences-in-range) and re-runs synchronously.

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
