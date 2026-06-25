---
name: Assumption Risk Analysis — Pipeline Schedule Visualizer V1
type: audit
generated_by: pm-product-discovery / identify-assumptions-existing
date: 2026-06-25
decisions_updated: 2026-06-25
---

# Assumption Risk Analysis — V1

Devil's advocate stress-test of the current spec across PM / Designer / Engineer perspectives.  
Goal: surface what could go wrong **before** coding starts, so the team can decide what to validate vs. accept.

---

## Decisions Made (2026-06-25)

| ID | Assumption | Decision | Action |
|---|---|---|---|
| U3 / F1 | Quarter / Half-Year / Year views in V1 | ✅ **DEFERRED to Milestone 2** | Remove from Phase 6 checklist. V1 = Day/Week/Month only. |
| V2 | JSON import friction | ✅ **ACCEPTED** as V1 boundary | Document explicitly. Milestone 3 (JSON authoring) is the mitigation. No spec change. |
| F3 | `normalizeScheduleDocument` complexity | ✅ **MITIGATED** | Write unit test fixtures for all Phase 4 acceptance criteria **before** starting implementation. |
| U2 | Users understand Project/Pipeline/Schedule distinction | ✅ **MITIGATED** | Plan minimal first-run tooltip / hover explanation in Phase 6 UI (not blocking, but explicit deliverable). |
| V1 / V5 | Value without database | ✅ **ACCEPTED** | V1 is a structured dogfood prototype. Value hypothesis validated during V1 use, not before. |
| U1 | Calendar as primary mental model | ✅ **ACCEPTED** | DAG/dependency view is Milestone 5. No change. |
| U4 | Desktop-first acceptable | ✅ **ACCEPTED** | No change needed. |
| F6 | Year-view performance risk | ✅ **MOOT** | Resolved by U3/F1 deferral. No Year view in V1. |
| All others | F2, F4, F5, V3, V4, U5 | ✅ **ACCEPTED** | Low/medium risk; monitor during implementation. |

**Net spec change from this review: Phase 6 scope reduction only.** All other assumptions accepted or mitigated via process (pre-Phase-4 test fixtures).

---

## Risk Rating Key

| Confidence | Meaning |
|---|---|
| High | We have strong evidence this assumption holds |
| Medium | Plausible, but no hard validation yet |
| Low | Guessed or inferred — needs testing |

| Risk Level | Meaning |
|---|---|
| 🔴 High | Could block adoption or require rework if wrong |
| 🟡 Medium | Would create friction or extra work |
| 🟢 Low | Manageable even if assumption fails |

---

## PM Perspective — Value & Viability

| # | Assumption | Confidence | Risk | What Could Go Wrong | How to Test |
|---|---|---|---|---|---|
| V1 | Pipeline operators need a **standalone** schedule visualization tool | Medium | 🟡 | Airflow / Dagster / Prefect already have native calendar views. Users may never open a separate tool | Ask 3 data engineers: "Would you use this over your orchestrator's UI? Why?" |
| V2 | **JSON file import** is an acceptable workflow for daily use | Low | 🔴 | Manually maintaining and re-importing JSON every time schedules change is high friction. Without live sync, the tool becomes stale fast | Build and dogfood with a real team for 2 weeks before committing to Milestone 3 scope |
| V3 | The **3-level hierarchy** (Project → Pipeline → Schedule) matches how real teams already think | Medium | 🟡 | Teams may have a flat "job list" mental model. The hierarchy imposes structure that could feel unnatural | Show a data engineer the JSON schema and ask them to label 5 of their own pipelines into it |
| V4 | One pipeline appearing in multiple projects reflects real org structures | Low | 🟢 | Some teams have strict 1:1 pipeline-to-project ownership. Shared pipelines may be an edge case, not the norm | Check: does the spec's entity model solve the most common case or only an advanced case? |
| V5 | V1 without a database can deliver **real value** (not just demo value) | Medium | 🟡 | If users must manually re-import JSON after every schedule change, the tool may only work for static demos | Define what "real use" looks like. Can a team run their daily standup using this tool? |

---

## Designer Perspective — Usability & Adoption

| # | Assumption | Confidence | Risk | What Could Go Wrong | How to Test |
|---|---|---|---|---|---|
| U1 | A **calendar** is the right mental model for schedule visualization | Medium | 🟡 | For pipeline dependencies, a DAG / dependency graph shows "what depends on what" — a calendar shows "when." Ops engineers may need the dependency view more than the time view | Show both a calendar mock and a Gantt/DAG mock to 3 users. Which do they prefer? |
| U2 | Users understand the **Project / Pipeline / Schedule distinction** without onboarding | Low | 🔴 | The 3-level model is clear in the spec but non-obvious to first-time users. "What's the difference between a pipeline and a schedule?" will come up immediately | Conduct a 5-minute think-aloud test with the sample JSON and a fresh user |
| U3 | **Quarter / Half-Year / Year** views are needed in V1 | Low | 🔴 | These views require custom FullCalendar implementation (Community edition does not provide them). The engineering cost is high and the user need is unvalidated — Day/Week/Month might be enough to launch | Move Q/H/Y to Milestone 2. Validate demand before building. See Feasibility F1. |
| U4 | **Desktop-first (min 1024px)** is acceptable for the target users | High | 🟢 | Data engineering tools are overwhelmingly desktop tools. The risk is very low. | Low priority to validate. |
| U5 | Users can navigate the **filter panel** without guidance | Medium | 🟡 | 8+ filter dimensions in a single panel may feel overwhelming. Users may not discover tag inheritance filtering | Usability test: can a user find all schedules owned by "team-data" using only filters? |

---

## Feasibility Perspective — Technical Risks

| # | Assumption | Confidence | Risk | What Could Go Wrong | How to Test |
|---|---|---|---|---|---|
| F1 | **FullCalendar Community Edition** can support all V1 views | Low | 🔴 | **Quarter / Half-Year / Year views are NOT in FullCalendar Community.** The spec acknowledges this but says "custom implementation." Building custom multi-month calendar grids from scratch is 2–4x the work of using a native FullCalendar view. This is the single highest-risk scope item. | Spike: can a FullCalendar "list view" or "timeline view" (premium) serve Q/H/Y? Or build a prototype week-grid manually to estimate effort before committing. |
| F2 | **DST handling** is manageable at V1 scope | Medium | 🟡 | "Silently drop occurrences in the DST missing hour" sounds simple, but DST behavior varies by timezone library. rrule and cron-parser handle DST differently. Edge cases: Asia/Taipei has no DST, but US/Europe timezones do. | Write a focused test: US/Eastern timezone, spring-forward week, weekly cron `0 2 * * *` (2 AM falls in the missing hour). Does the library drop it cleanly? |
| F3 | **`normalizeScheduleDocument`** can be built as a single pure function | Medium | 🟡 | The function has 5 transformation stages, 3 recurrence modes, 2 timezone cascades, tag inheritance, DTSTART injection, and occurrence dedup. It will have bugs. | Define a unit test fixture for every acceptance criterion in Phase 4 before implementation. Tests first. |
| F4 | **Zod `discriminatedUnion`** cleanly covers 3 recurrence modes | High | 🟢 | Zod `z.discriminatedUnion("mode", [...])` is well-suited to this pattern. The main risk is that `mode` might be missing or misspelled in AI-generated JSON — the error message may not be helpful. | Test: what error does Zod give if `recurrence.mode` is `"weekly"` (wrong string) vs. missing entirely? |
| F5 | **rrule + cron-parser** are sufficient for all recurrence edge cases | High | 🟢 | Both libraries are mature. The main risk is `byMonthDay` -1 (last day of month) and 29–31 rejection in simple mode. These are spec-defined, not library gaps. | Test last-day-of-month and rejection of day 29–31 in simple mode early in Phase 2. |
| F6 | The **normalization layer is fast enough** for the visible calendar range | Medium | 🟡 | If a pipeline has 10+ schedules with daily cron recurrence and a Year view is open, expansion could generate thousands of occurrences. No performance budget is defined. | Spike: expand a daily cron schedule across a full year (365 occurrences) × 5 pipelines. Measure render time in React. |

---

## Prioritized Watchlist

These assumptions are the highest-priority to resolve **before or during Phase 0**:

| Priority | ID | Decision Required |
|---|---|---|
| 1 | U3 / F1 | **Defer Quarter / Half-Year / Year views to Milestone 2.** Do not custom-build calendar views in V1. The spec already acknowledges these are "custom" — the risk to timeline and quality is too high. |
| 2 | V2 | **Accept JSON import limitation consciously.** Document it as a V1 boundary and plan Milestone 3 (JSON authoring) as the mitigation. |
| 3 | F3 | **Write normalization unit tests before implementation.** Create fixtures for all Phase 4 acceptance criteria before touching code. |
| 4 | U2 | **Plan an onboarding tooltip or first-run guide** as a V1 deliverable, even if minimal. |
| 5 | V1 | **Identify one internal team as a real dogfood user** before or during V1 development. |

---

## Notes

- Assumptions marked 🟢 are accepted risks — no action needed in V1.
- This document should be reviewed after Phase 3 (sample data complete) and updated with any new findings.
