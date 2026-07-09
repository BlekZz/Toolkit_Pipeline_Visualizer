# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**V1 + Tri-Tab + Perf/Visual Overhaul Complete (2026-07-08)** — all 11 V1 phases shipped + SVAR Gantt migration (ADR-001) + dual-tab architecture (ADR-002) + post-V1 UX enhancements + [[Sprint_Perf_And_Visual_Overhaul]] (M0–M5: App.tsx decomposition, range-aware expand cache, scale-aware Gantt aggregation, Timeline/Calendar visual redesign, new Heatmap tab). App runs locally with full sample data, tri-tab UI (Timeline + Calendar + Heatmap), filter panel, detail panel, Mermaid diagram panel, JSON export, localStorage presets, frequency-based auto-filter, and 115 unit tests passing. See `dev/Tracker_V1_Checklist.md` for full V1 phase log; `dev/Sprint_Perf_And_Visual_Overhaul.md` for the perf/visual sprint detail; `dev/decisions/` for architecture decisions; `dev/Tracker_Tech_Debt_And_Optimization.md` for the standing tech-debt/optimization backlog (check before starting new work — several items are quick wins).

## Stack

React 19 + TypeScript 6 + Vite 8 + SVAR React Gantt 2.7.0 (MIT) + FullCalendar Community 6 + rrule + cron-parser + Zod 4

### UI Architecture: Tri-Tab

Zone A (top, ≤33vh): filter panel, header controls, tab switcher.
Zone B (fills remaining height): three tabs sharing the same data and filter state.

| Tab | Library | Purpose |
|-----|---------|---------|
| Timeline | SVAR React Gantt 2.7.0 | Y = Project → Pipeline → Schedule hierarchy; X = time (continuous Gantt). Week preset renders per-occurrence bars; Month/Quarter/Year presets aggregate each schedule into one bar (`agg-` id, `×N` count badge) to keep rendered task count low at coarse zoom. |
| Calendar | FullCalendar Community 6 | View switcher order: Day → Week → Month → Quarter → Year. EventChip shows an urgency dot + pipeline stripe + time label; a legend row shows urgency colors and visible pipeline swatches. |
| Heatmap | Custom (`HeatmapView.tsx`) | GitHub-contribution-style Overview (53×7 day grid, 5-level intensity) and Habit-Tracker-style per-pipeline/schedule rows; click a day to drill into that day's occurrences. |

Shared state: `normalizedDoc`, `filterState`, `filteredOccs`, `selectedOcc`, `viewRange`.
`viewRange` (today → +365 days) drives `expandRecurrence` once, through a range-aware cache (`lib/expand-cache.ts`) that reuses the cached expansion when a new range is a subset of the last one instead of re-running recurrence expansion. FullCalendar does its own internal date windowing — never updates `viewRange` via `datesSet`.

## Commands

```
npm run dev      # local dev server
npm run build    # production build
npm run check    # TypeScript validation
npm run test     # unit tests (optional in V1)
```

## Planned Source Layout

```
src/
  data/       # sample JSON files
  schema/     # Zod/Ajv validation definitions
  lib/        # recurrence expansion, normalization helpers
```

## Architecture

### Entity-Reference Model

```
Project  --references many-->  Pipeline  --owns many-->  Schedule
```

- **Project** — business-intent view; holds `pipelineRefs[]` (ids only, not embedded objects); derives `dataDomain`, `sourceSystem`, `targetSystem`, `owners` from referenced pipelines.
- **Pipeline** — reusable data-operation unit; can appear in multiple projects; canonical owner of schedules; holds `operationalChecklist` and `dependencies`.
- **Schedule** — formal execution definition; must be nested inside a pipeline; `job` is a UI/AI alias only — never use in schema, types, or code.

### Timezone Rules

- Project defaults to `Asia/Taipei`; pipeline inherits from project; schedule inherits from pipeline.
- Pipeline timezone **must equal** all child schedule timezones — validation error if mismatched.
- Project ↔ pipeline timezone mismatch is **allowed** — display layer converts transparently.
- DST: UTC instant preserved (absolute). An occurrence landing in the DST "missing hour" is not dropped — it resolves using the pre-transition UTC offset, so the wall-clock local time shifts forward by one hour (e.g. a 02:30 America/New_York cron on the spring-forward day resolves to 03:30 EDT, not 02:30). This is the natural behavior of the underlying `cron-parser`/rrule libraries; see `src/lib/__tests__/expand.test.ts` for regression coverage.

### Display Timezone (View-Context-Dependent)

| View context | Display timezone |
|---|---|
| Single project view | `project.timezone` |
| Single pipeline view | `pipeline.timezone` |
| Global view | `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser) |

### Recurrence Modes (mutually exclusive, one canonical per schedule)

| mode | field | example |
|------|-------|---------|
| `simple` | `frequency`, `interval`, `byWeekday`, `endDate` | `weekly / MO` |
| `rrule` | `rrule` string | `FREQ=WEEKLY;BYDAY=MO` |
| `cron` | `cron` expression | `0 9 * * 1` |

Plus `type: "one_time"` with `startDateTime`.

Recurrence expansion happens **only within the visible view range** — never pre-generate infinite occurrences.

### Schedule Frequency Classification

`CalendarOccurrence.scheduleFrequency?: ScheduleFrequency` — computed in `expandRecurrence` per schedule:

| Value | Meaning | Hidden in month-level FC views? |
|---|---|---|
| `sub-daily` | Hourly or more frequent | ✅ Yes |
| `daily` | Once per day or several times per week | ✅ Yes |
| `weekly` | Once per week | No |
| `monthly-or-less` | Monthly, yearly, one-time | No |

FullCalendar month / quarter / year views auto-filter to weekly+ by default. Week / Day views show all.

### Normalization Layer

`normalizeScheduleDocument(doc, viewContext)` applies:
1. Defaults (timezone cascade, `durationSeconds → 300`)
2. Derive `pipeline.projectRefs` by inverting `project.pipelineRefs` (not from source JSON)
3. Inject RRULE DTSTART from `startDate + time + schedule.timezone`
4. Tag inheritance: schedule direct tags win over pipeline inherited; project context is additive
5. Flatten to `CalendarOccurrence[]`: one per `(pipelineId, scheduleId, scheduledStart)` with `projectContexts[]`

Source JSON is **never mutated** during normalization.

### Occurrence IDs

`pipelineId::scheduleId::scheduledStart` — `scheduledStart` is UTC ISO 8601 with Z suffix.

### Confirmed Design Decisions

| Topic | Decision |
|---|---|
| Validation library | **Zod** (discriminatedUnion on recurrence.mode) |
| State management | useState + useReducer (no external library) |
| Calendar rendering | Dual-tab: Timeline (SVAR React Gantt) + Calendar (FullCalendar Community) |
| Time scales — V1 | Day / Week / Month (Calendar tab); continuous Gantt timeline (Timeline tab) |
| Time scales — M2 | Quarter / Year discrete views shipped; Half-Year removed (user decision) |
| Primary color dimension | Urgency (critical=red, high=amber, medium=blue, low=gray) |
| Pipeline/project visual | Left border stripe or background tint per pipeline |
| Filter AND/OR | Within dimension = OR; across dimensions = AND |
| tagCatalog | Advisory only (no validation failure on unknown values) |
| pipeline.projectRefs | Derived at normalization — absent from source JSON |
| endDate semantics | Inclusive (last day an occurrence may start) |
| DST strategy | UTC absolute (wall clock may shift at DST boundaries) |
| Monthly simple mode | byMonthDay field (-1 = last day); values 29–31 rejected → use rrule |
| Occurrence dedup | 1 event per (pipelineId, scheduleId, scheduledStart); projectContexts[] carries all referencing projects |
| Responsive | Desktop-first min 1024px; below 768px shows banner only |
| Dependency ref format | pipelineId::scheduleId (globally unambiguous) |

## Key Spec Files

| File | Purpose |
|------|---------|
| `dev/Pipeline_Schedule_Visualizer_PRD.md` | Full product requirements and workflows |
| `dev/Design_Data_Model_Architecture.md` | Entity relationships, timezone rules, validation logic |
| `dev/Reference_JSON_Schedule_Schema.md` | Canonical JSON shape with examples for all recurrence modes |
| `dev/Tracker_V1_Checklist.md` | Phase-by-phase implementation checklist with acceptance criteria |
| `dev/Tracker_Roadmap_Milestones.md` | Milestone definitions and exit criteria |
| `dev/Tracker_Tech_Debt_And_Optimization.md` | Standing backlog of tech debt, deferred cleanups, and optimization opportunities — check before new work |

## V1 Boundaries

V1 is **read-only**. No drag-and-drop editing, no execution monitoring, no notifications, no authentication, no database. Those are V1.5+ features.

---

## Active Agents
> Generated by /agent-bench-setup; revised 2026-07-03 (A13 fix — bench_agency-agents was a persona pool with no `model:`/`tools:` frontmatter, replaced with bench_awesome-toolkit engineering agents). Re-run /agent-bench-setup only against bench_awesome-toolkit going forward.

Only the agents listed below are active for this project.
All other agents in `~/.claude/agents/bench_*/` should be treated as inactive.

| Agent | File | Bench | Reason |
|-------|------|-------|--------|
| React Specialist | react-specialist.md | bench_awesome-toolkit | Core stack: React + TypeScript + Vite + FullCalendar UI implementation |
| Data Visualization | data-visualization.md | bench_awesome-toolkit | Pipeline visualizer's core purpose — interactive dashboards, D3/Chart.js-style rendering |
| Code Reviewer | code-reviewer.md | bench_awesome-toolkit | TypeScript type correctness, normalization logic, Zod/Ajv schema quality |
| Frontend Architect | frontend-architect.md | bench_awesome-toolkit | Calendar UI layout, CSS system, accessibility, filter panel component architecture |
| Technical Writer | technical-writer.md | bench_awesome-toolkit | README, JSON schema docs, AI output contract documentation |
| QA Automation | qa-automation.md | bench_awesome-toolkit | Visual QA for calendar renders, filter behavior, detail panel correctness |

## Inactive
All agents not listed above are suppressed for this session.
Dropped in A13 (no functional counterpart in bench_awesome-toolkit): Software Architect, Rapid Prototyper, Minimal Change Engineer, Workflow Architect.
If you need an unlisted agent, explicitly name it in your message and reference its bench folder.
