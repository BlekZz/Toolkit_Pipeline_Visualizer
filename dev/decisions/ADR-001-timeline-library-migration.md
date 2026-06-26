# ADR-001: Timeline Library Migration — FullCalendar Community → SVAR React Gantt

**Date:** 2026-06-26
**Status:** Accepted — spike test passed (2026-06-26). Full migration superseded by ADR-002 (dual-tab). See ADR-002.

---

## Context

The Pipeline Schedule Visualizer requires a calendar layout with:

- Y-axis: hierarchical drilldown with three levels (Project → Pipeline → Schedule)
- X-axis: time (linear, scrollable)
- Horizontal scroll via Shift+scroll or scrollbar
- Vertical scroll through all rows
- Event bars rendered per schedule occurrence

The project currently uses **FullCalendar Community 6**. FullCalendar's Resource Timeline view — the only built-in view that satisfies the Y-axis requirement — is locked behind **FullCalendar Premium**, a paid license. The Community edition cannot satisfy the hierarchical Y-axis requirement without a paid upgrade.

A fully open-source replacement (MIT or Apache 2.0) is required. No paid licenses are acceptable.

---

## Decision

Replace FullCalendar Community 6 with **SVAR React Gantt** (MIT license), subject to a spike test validating the five criteria listed in the Validation Criteria section below.

If the spike test fails, the fallback is **dnd-timeline** (see Alternatives Retained).

---

## Considered Options

| Library | License | React 19 | Hierarchical Y-axis | Notes |
|---|---|---|---|---|
| FullCalendar Community | MIT | Yes | No | Current library. Resource Timeline is Premium-only. Cannot satisfy requirement without paid upgrade. |
| Planby | Proprietary | Partial | No | Disqualified. Not open-source. |
| vis-timeline | Apache 2.0 + MIT | Unclear | No — flat only | Requires React wrapper. Wrapper quality uneven; no well-maintained canonical option. |
| frappe-gantt | MIT | Risky | No — flat only | No TypeScript core. Community React wrappers inconsistent in quality and maintenance. |
| react-calendar-timeline | MIT | Yes | No — flat groups only | Mature (74k downloads/week). Groups are flat; no native nesting. Would require custom hierarchy shim. |
| dnd-timeline | MIT | Yes | Yes — native nested rows | Headless component library. Very high customization ceiling. Small community (245 GitHub stars). High UI assembly cost. Retained as fallback. |
| **SVAR React Gantt** | **MIT** | **Yes — confirmed** | **Yes — native parent-child** | Active maintenance as of 2026. React 19 explicitly supported. TypeScript support included. Horizontal scroll built-in. Selected. |
| Apache ECharts | Apache 2.0 | Yes | Yes — via custom chart | Extremely high ceiling but requires full custom implementation of every timeline behavior. Disproportionate build cost for V1. |

---

## Rationale

SVAR React Gantt is the only candidate that satisfies all four hard requirements simultaneously:

1. Native 3-level hierarchy (no shim required)
2. Confirmed React 19 compatibility
3. MIT license
4. Horizontal scroll built-in

All other open-source candidates fail on at least one hard requirement. Planby is disqualified on license grounds alone.

---

## Consequences

**Immediate:**
- ~~FullCalendar Community 6 will be removed from the dependency tree.~~ Superseded by ADR-002: FullCalendar is retained as the Calendar tab; SVAR Gantt is the Timeline tab.
- SVAR React Gantt added for Timeline tab (hierarchy view); FullCalendar Community retained for Calendar tab (month/week/day grid).
- See ADR-002 for the dual-tab architectural decision and the data-sharing contract between tabs.

**Ongoing:**
- SVAR React Gantt's community is smaller than FullCalendar's. Long-term maintenance risk is higher.
- If SVAR React Gantt's customization ceiling proves insufficient for a future requirement, dnd-timeline remains available as a replacement path at higher implementation cost.

**If spike fails:**
- Evaluate dnd-timeline. Expect significantly more UI assembly work to reach feature parity with SVAR's built-in behaviors (horizontal scroll, row expand/collapse, group headers).

---

## Validation Criteria

The spike test must pass all five criteria before the full migration proceeds:

| # | Criterion | Pass condition |
|---|---|---|
| 1 | 3-level hierarchy renders | Project → Pipeline → Schedule rows display correctly with expand/collapse |
| 2 | Horizontal scroll works | Time axis scrolls horizontally via Shift+scroll or scrollbar without layout breakage |
| 3 | 24-hour time format | Time axis displays in 24h format (HH:mm), not 12h AM/PM |
| 4 | Event bars render | Schedule occurrence bars appear on the correct row at the correct time position |
| 5 | React 19 + TypeScript compatible | Project builds without type errors; no runtime warnings from React 19 strict mode |

A spike that passes 4 of 5 does not pass. All five are required before migration proceeds.

---

## Alternatives Retained

**dnd-timeline** (MIT, React 19, native nested rows) is retained as the named fallback.

Trigger condition: SVAR React Gantt spike fails on any of the five criteria above, or post-migration customization requirements exceed what SVAR's API surface allows.

Trade-off: dnd-timeline is headless — it provides layout primitives, not a complete calendar widget. Adopting it requires implementing horizontal scroll behavior, group headers, row expand/collapse, and time axis rendering from scratch. The implementation cost is substantially higher than SVAR.
