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

## ⏳ Open — Correctness / UX

- **MermaidPanel does not close on Escape** — found during runtime
  verification of the fixes above (not a regression, pre-existing). The
  panel is a full-screen overlay (`.mp-overlay`) that intercepts all
  clicks; only the explicit "× Close" button dismisses it. Add an
  `onKeyDown` handler (or a `useEffect` with a `keydown` listener for
  `Escape`) that calls the same `onClose` prop. Low effort, real papercut
  for keyboard users.

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

Only `expand.ts`, `normalize.ts`, and (as of this audit) `filters.ts` have
unit tests. Still uncovered, in priority order:

1. **`schema/validate.ts` cross-entity rules** — `validateCrossEntityRules()`
   (pipelineRef existence, pipeline↔schedule timezone match) is only
   exercised indirectly through `normalize.test.ts` fixtures that happen to
   be valid. Add fixtures that deliberately violate each rule and assert
   the specific error.
2. **`lib/tagEmoji.ts`** — pure lookup functions (`tagEmoji`, `tagLabel`),
   trivial to test, currently has none.
3. **Component-level**: `ImportModal` validation-error display,
   `FilterPanel` search-filtering of options — these are UI logic, not
   pure functions, so use `@testing-library/react` if/when component
   testing is set up (not currently a devDependency).
4. **`expand.ts` edge cases not yet covered**: Feb 29 leap year for cron,
   DST transition boundaries (the PRD's documented "silently drop
   occurrences in the missing DST hour" behavior has no regression test),
   invalid cron expressions.

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
