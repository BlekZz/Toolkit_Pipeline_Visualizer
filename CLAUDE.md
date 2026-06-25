# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**V1 Complete** — all 11 phases shipped. App runs locally with full sample data, filter panel, detail panel, responsive 200% zoom layout, emoji tag system, and 29 unit tests passing. See `dev/Tracker_V1_Checklist.md` for phase details.

## Stack

React 19 + TypeScript 6 + Vite 8 + FullCalendar Community 6 + rrule + cron-parser + Zod 4

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
- DST: UTC instant preserved (absolute). Occurrences in the DST missing hour are silently dropped.

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
| FullCalendar | Community edition; daygrid + timegrid + interaction plugins |
| Time scales | Day / Week / Month / Quarter / Half-Year / Year (all V1) |
| Calendar views | Quarter/Half/Year require custom implementation |
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

## V1 Boundaries

V1 is **read-only**. No drag-and-drop editing, no execution monitoring, no notifications, no authentication, no database. Those are V1.5+ features.

---

## Active Agents
> Generated by /agent-bench-setup. Re-run to update.

Only the agents listed below are active for this project.
All other agents in `~/.claude/agents/bench_*/` should be treated as inactive.

| Agent | File | Bench | Reason |
|-------|------|-------|--------|
| Frontend Developer | engineering-frontend-developer.md | bench_agency-agents | Core stack: React + TypeScript + Vite + FullCalendar UI implementation |
| Software Architect | engineering-software-architect.md | bench_agency-agents | Entity-reference model design, normalization layer architecture decisions |
| Data Engineer | engineering-data-engineer.md | bench_agency-agents | Domain knowledge for pipeline scheduling, recurrence logic, ETL concepts |
| Rapid Prototyper | engineering-rapid-prototyper.md | bench_agency-agents | Phase 0–V1 MVP delivery — scaffold, sample data, working prototype |
| Code Reviewer | engineering-code-reviewer.md | bench_agency-agents | TypeScript type correctness, normalization logic, Zod/Ajv schema quality |
| UX Architect | design-ux-architect.md | bench_agency-agents | Calendar UI layout, CSS system, filter panel component architecture |
| Minimal Change Engineer | engineering-minimal-change-engineer.md | bench_agency-agents | Prevent scope creep across 11 implementation phases |
| Technical Writer | engineering-technical-writer.md | bench_agency-agents | README, JSON schema docs, AI output contract documentation |
| Evidence Collector | testing-evidence-collector.md | bench_agency-agents | Visual QA for calendar renders, filter behavior, detail panel correctness |
| Workflow Architect | specialized-workflow-architect.md | bench_agency-agents | Normalization flow, tag inheritance paths, validation and timezone alignment workflows |

## Inactive
All agents not listed above are suppressed for this session.
If you need an unlisted agent, explicitly name it in your message and reference its bench folder.
