# Pipeline Schedule Visualizer

A local-first, read-only dashboard for visualizing pipeline schedule definitions across projects.

> Screenshot: [add after deploy]

---

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
```

Open the app, paste or load a JSON file that matches the schema below, and the schedules render immediately.

---

## What It Does

- **Imports JSON schedule definitions** — projects, pipelines, and schedules defined in a single structured document; no database required.
- **Dual-tab visualization** — Timeline tab (continuous Gantt view with project → pipeline → schedule hierarchy) and Calendar tab (month/week/day grid); both tabs share the same data and filter state.
- **Filter by project, pipeline, urgency, owner, domain, and custom tags** — filters are OR within a dimension and AND across dimensions.
- **Click any occurrence to inspect detail** — schedule title, recurrence rule, timezone, duration, tags, operational checklist, output location, and dependency references.

Read-only. Local-only. No backend, no auth, no database.

---

## Stack

| Package | Version | Role |
|---------|---------|------|
| React | 19 | UI framework |
| TypeScript | 6 | Type safety |
| Vite | 8 | Dev server and build |
| SVAR React Gantt | 2.7.0 (MIT) | Timeline tab |
| FullCalendar Community | 6 | Calendar tab |
| rrule | — | RRULE recurrence expansion |
| cron-parser | — | Cron expression expansion |
| Zod | 4 | Schema validation |

---

## Data Format

The app loads a single JSON document. Full spec with all field definitions, validation rules, and annotated examples is in [`dev/Reference_JSON_Schedule_Schema.md`](dev/Reference_JSON_Schedule_Schema.md).

### Minimal valid document

```json
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "Data Team Schedules",
    "description": "...",
    "updatedAt": "2026-06-25T00:00:00+08:00"
  },
  "tagCatalog": {},
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "timezone": "Asia/Taipei",
      "pipelineRefs": [{ "pipelineId": "pipe-1", "role": "primary" }]
    }
  ],
  "pipelines": [
    {
      "id": "pipe-1",
      "name": "My Pipeline",
      "timezone": "Asia/Taipei",
      "schedules": [
        {
          "id": "sched-1",
          "title": "Weekly Refresh",
          "timezone": "Asia/Taipei",
          "schedule": {
            "type": "recurring",
            "startDate": "2026-07-07",
            "time": "09:00",
            "durationSeconds": 300,
            "recurrence": {
              "mode": "simple",
              "frequency": "weekly",
              "interval": 1,
              "byWeekday": ["MO"],
              "endDate": null
            }
          }
        }
      ]
    }
  ]
}
```

### Key rules

- Schedules must live inside pipelines; projects reference pipelines by id via `pipelineRefs` — never embed schedules in projects.
- Default timezone is `Asia/Taipei` at the project level; pipelines and schedules inherit it. A project and its referenced pipelines may have different timezones — the display layer converts transparently.
- Pipeline timezone and all child schedule timezones must match exactly — validation rejects mismatches.
- Three mutually exclusive recurrence modes: `simple` (daily/weekly/monthly with human-readable fields), `rrule` (RFC 5545 RRULE string), or `cron` (standard five-field cron expression).
- `durationSeconds` defaults to `300` if omitted. `endDate` is inclusive (last day an occurrence may start).

---

## AI Authoring

The JSON schema is designed so that an AI assistant can generate valid input from a natural-language description. Point the AI to [`dev/Reference_JSON_Schedule_Schema.md`](dev/Reference_JSON_Schedule_Schema.md), which contains the full AI output contract.

Key reminders for AI generation:

- Use `schedule` (not `job`) as the field name for schedule definitions.
- Put project-to-pipeline membership in `project.pipelineRefs`. Do not include `pipeline.projectRefs` in the source JSON — it is derived by the app at normalization time and must not appear in input.
- Default unspecified timezones to `Asia/Taipei`.
- For simple recurring patterns, prefer `mode: "simple"`. For "first Monday of the month" or other complex patterns, use `mode: "rrule"`. If the user provides a cron expression, use `mode: "cron"` and preserve it verbatim.
- Do not include `DTSTART` in an rrule string — the app injects it from `startDate` + `time` + `schedule.timezone`.

---

## Development Commands

```
npm run dev      # local dev server (http://localhost:5173)
npm run build    # production build
npm run check    # TypeScript type check
npm run test     # unit tests (29 tests)
```

---

## V1 Boundaries

V1 is read-only. The following are explicitly out of scope:

- Drag-and-drop schedule editing in the UI
- Writing edits back to JSON from the UI
- Execution monitoring (actual run success/failure)
- Exception dates (skip a specific occurrence, reschedule one instance)
- Notifications or alerting
- Authentication or user accounts
- Database persistence

See [`dev/Tracker_Roadmap_Milestones.md`](dev/Tracker_Roadmap_Milestones.md) for milestone definitions and the V1.5+ feature list.
