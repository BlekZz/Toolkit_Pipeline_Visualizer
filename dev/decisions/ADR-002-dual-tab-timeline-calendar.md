# ADR-002: Dual-Tab Architecture — SVAR Timeline + FullCalendar Calendar

**Date:** 2026-06-26
**Status:** Accepted

---

## Context

Following ADR-001, SVAR React Gantt (MIT) was selected to replace FullCalendar Community for a hierarchical Y-axis layout (Project → Pipeline → Schedule). During the subsequent migration spike, a fundamental constraint in the library's data model was discovered that invalidates its use as a drop-in replacement for occurrence-based rendering.

**The blocking constraint:** SVAR Gantt maps each task object to exactly one Y-axis row. With 1,624 `CalendarOccurrence` objects in the sample dataset, a naive mapping produces 1,624 rows — one per occurrence. The intended "resource timeline" pattern — one row per schedule, with multiple occurrence bars plotted along the same row — requires SVAR's `segments` feature (split tasks). Segments are gated behind SVAR Pro. In the MIT edition, the `segments` field silently no-ops at render time with no error or warning (confirmed by spike test).

**Workarounds evaluated and rejected:**

| Approach | Problem |
|---|---|
| SVAR `segments` (split tasks) | Pro-gated. Silent no-op in MIT. Not available. |
| Custom `taskTemplate` with occurrence dots | Requires reading and mutating internal SVAR component state. Fragile; breaks on any SVAR version update. |
| Switch to dnd-timeline | MIT, React 19 compatible, native nested rows. Headless — no built-in scroll, row headers, expand/collapse, or time axis. Full UI assembly required; cost disproportionate to V1 scope. |
| FullCalendar Community Resource Timeline | Premium-only. Rejected in ADR-001. |

**Market context:** An informal survey of production pipeline scheduling tools (Apache Airflow, Prefect, Dagster) shows that schedule visualization is universally handled via calendar and list views, not resource timelines. Resource timeline UIs (Y=resource row, X=time, multi-bar rows) appear consistently in commercial workforce and project scheduling products built on paid libraries (MS Project, Smartsheet, Jira Advanced Roadmaps). Tools that need to answer both "how is work organized hierarchically" and "what is happening on a given date" — including Linear, Jira, and MS Project — use a dual-view or dual-tab pattern rather than forcing both answers into a single view type.

---

## Decision

Adopt a **dual-tab architecture** in which two purpose-built views share a unified data and state layer:

| Tab | Library | Y-axis | X-axis | Primary question answered |
|---|---|---|---|---|
| **Timeline** | SVAR React Gantt (MIT) | Project → Pipeline → Schedule hierarchy | Time (linear, scrollable) | How are pipelines organized across time? |
| **Calendar** | FullCalendar Community (MIT) | None | Time (standard grid) | What is running today / this week? |

SVAR Gantt is retained for the Timeline tab with one schedule per row. Each row represents the schedule's recurrence span or a single occurrence bar per occurrence — not a resource-timeline multi-bar row. The Calendar tab is the V1 FullCalendar implementation, restored in full.

---

## Considered Options

### Option A: Timeline-only (SVAR, one row per occurrence)

Each `CalendarOccurrence` maps to a discrete SVAR task row. The hierarchy (Project → Pipeline → Schedule) is visible. Schedule frequency is visible — each occurrence is a separate row item. The view degrades to unusable with large occurrence counts (1,624+ rows in sample data). Hierarchy and frequency are both rendered but the layout is not scalable.

**Rejected.** Row count grows with the expansion window size. At one year, a daily schedule produces 365 rows for a single schedule entry.

### Option B: Calendar-only (FullCalendar, V1 restored)

Standard month/week/day grid. Occurrence bars render correctly. Hierarchy (Project/Pipeline/Schedule relationships) is not visible in this view — grouping is by color or tag only. The question "how are my pipelines organized" cannot be answered from a calendar grid.

**Rejected.** Loses the hierarchy structure requirement that motivated ADR-001.

### Option C: dnd-timeline (headless, custom build)

Satisfies both the hierarchy requirement (native nested rows) and the occurrence-per-row constraint (full control over row data mapping). V1 cost is substantially higher — horizontal scroll, group headers, expand/collapse, and time axis must all be assembled from primitives. No documented production usage at this project's scale.

**Rejected for V1.** Retained as a long-term alternative if SVAR's API surface proves insufficient in future phases.

### Option D: Dual-tab (SVAR Timeline + FullCalendar Calendar) — Selected

Each tab answers a different question. Neither view is a compromise of the other. Both operate on the same normalized document and share filter state. Industry precedent for the pattern exists (Linear, MS Project, Jira). Implementation reuses code from both the V1 FullCalendar implementation and the ADR-001 SVAR integration work.

**Selected.**

---

## Architecture

### Shared state (both tabs read and write)

| State | Owner | How each tab interacts |
|---|---|---|
| `normalizedDoc` | top-level | read-only in both tabs |
| `filterState` | top-level | read-only in both tabs; written by Zone A filter panel |
| `viewRange: { start, end }` | top-level | Timeline tab updates on SVAR date-picker navigation; Calendar tab updates via FullCalendar `datesSet` callback |
| `selectedOcc` | top-level | written on click in either tab; drives DetailPanel |

### View range contract

A single `viewRange` drives `expandRecurrence()` for both tabs. The expansion runs once per `viewRange` change and the resulting `CalendarOccurrence[]` is passed to both tabs. Switching tabs does not re-expand occurrences unless `viewRange` changed while the tab was inactive. Each tab updates `viewRange` when the user navigates within it, so the occurrence set is always current for the active view.

### Data transformers

| Transformer | Input | Output | Used by |
|---|---|---|---|
| `toGanttData()` | `CalendarOccurrence[]` | SVAR task/project tree | Timeline tab |
| `toEvent()` | `CalendarOccurrence[]` | FullCalendar `EventInput[]` | Calendar tab |

Both transformers read from the same `CalendarOccurrence[]` array. Neither mutates the normalized document.

### Zone layout

Zone A (filter panel, header, active-filter chips) is rendered above the tab bar and is shared across both tabs. Zone B (the calendar/timeline render area) switches on active tab. Zone C (DetailPanel) is rendered outside the tab container and opens from a click event in either tab.

---

## Consequences

**Restored dependencies:**
- FullCalendar Community packages (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`, `@fullcalendar/interaction`) are reinstalled alongside SVAR React Gantt.

**Code:**
- `toEvent()` transformer is restored for the Calendar tab.
- `toGanttData()` transformer is retained for the Timeline tab.
- Two rendering paths exist in Zone B. Both must be updated when the normalized document schema changes.

**Test surface:**
- Unit tests for `toEvent()` and `toGanttData()` are independent and can be run in isolation.
- End-to-end behavior (filter state → both tabs update) requires integration-level testing.

**Maintenance risk:**
- Schema changes to `CalendarOccurrence` must be reflected in both transformers. This is the primary ongoing maintenance cost of the dual-tab approach.
- SVAR MIT edition capabilities are fixed at the current feature set. Any future requirement that depends on SVAR Pro features requires migration to dnd-timeline or a paid upgrade.

---

## Related Decisions

- **ADR-001** (`ADR-001-timeline-library-migration.md`) — Established the requirement for an MIT hierarchical timeline library and selected SVAR React Gantt after spike validation. ADR-002 supersedes the ADR-001 assumption that SVAR would replace FullCalendar entirely. Both libraries are now retained in separate roles.
