# Pipeline Schedule Visualizer

A local-first, read-only calendar dashboard for data pipeline schedules.

Import a JSON file describing your projects, pipelines, and schedules — the app validates, expands recurrence, and renders everything on a FullCalendar view with filtering and detail inspection. No backend, no authentication, no data leaves your machine.

## Quick Start

```bash
npm install
npm run dev        # starts dev server at http://localhost:5173
npm run build      # production build
npm run check      # TypeScript validation (tsc --noEmit)
npm run test       # unit tests (vitest)
```

The app auto-loads `src/data/sample-schedules.json` on first open. Click **Import JSON** in the header to load your own data.

## Features

| Feature | Status |
|---|---|
| Day / Week / Month calendar views | ✅ V1 |
| Filter by project, pipeline, urgency, tags | ✅ V1 |
| Click occurrence for detail panel (tags, IDs, breadcrumb) | ✅ V1 |
| JSON import via file picker or paste | ✅ V1 |
| Simple / RRULE / Cron / one-time recurrence | ✅ V1 |
| Pipeline-shared across multiple projects | ✅ V1 |
| Quarter / Half-Year / Year views | Milestone 2 |
| Drag-and-drop editing | V1.5+ |
| Execution monitoring / notifications | V1.5+ |

## JSON Format

```json
{
  "schemaVersion": "1.0",
  "metadata": { "name": "My Schedules", "updatedAt": "2026-06-25T00:00:00+08:00" },
  "projects": [
    {
      "id": "ops-project",
      "name": "Operations",
      "timezone": "Asia/Taipei",
      "pipelineRefs": [{ "pipelineId": "my-pipeline" }]
    }
  ],
  "pipelines": [
    {
      "id": "my-pipeline",
      "name": "My Pipeline",
      "timezone": "Asia/Taipei",
      "schedules": [
        {
          "id": "weekly-run",
          "title": "Weekly Run",
          "enabled": true,
          "timezone": "Asia/Taipei",
          "schedule": {
            "type": "recurring",
            "startDate": "2026-01-01",
            "time": "09:00",
            "durationSeconds": 300,
            "recurrence": { "mode": "simple", "frequency": "weekly", "interval": 1, "byWeekday": ["MO"] }
          }
        }
      ]
    }
  ]
}
```

See `dev/Reference_JSON_Schedule_Schema.md` for the full schema with all recurrence modes and tag fields.

## Timezone Behavior

- Default timezone: `Asia/Taipei`
- Pipeline and all its child schedules must share the same timezone (validation error if mismatched)
- Project ↔ pipeline timezone differences are allowed — display layer converts transparently
- Display timezone depends on view context: single-project → project.timezone, single-pipeline → pipeline.timezone, global → browser timezone

## Schedule vs. Job

`schedule` is the official schema and code term. `job` is a UI/AI conversation alias only — never appears in JSON or TypeScript types.

## Recurrence Modes

Three modes per schedule (mutually exclusive):

| Mode | Field | Example |
|---|---|---|
| `simple` | `frequency`, `interval`, `byWeekday`/`byMonthDay` | weekly every Monday |
| `rrule` | `rrule` string | `FREQ=WEEKLY;BYDAY=MO` |
| `cron` | `cron` expression | `0 9 * * 1` (Mondays 09:00) |

Plus `type: "one_time"` for one-off schedules with `startDateTime` (ISO 8601 with offset).

**Notes:**
- `simple` monthly with `byMonthDay` 29–31 is rejected — use `rrule` instead
- DTSTART is automatically injected by the normalization layer; do not include it in source JSON
- Cron expressions are interpreted in `schedule.timezone`

## Pipeline Sharing

One pipeline can be referenced by multiple projects. The occurrence carries `projectContexts[]` with all referencing projects. Filtering by project returns all occurrences where that project is in `projectContexts`.

```json
"projects": [
  { "id": "proj-a", "pipelineRefs": [{ "pipelineId": "shared-pipe" }] },
  { "id": "proj-b", "pipelineRefs": [{ "pipelineId": "shared-pipe" }] }
]
```

## Tag System

Tags live at three levels:

| Level | Tags | Example fields |
|---|---|---|
| Schedule | `directTags` | `urgency`, `owner`, `runType`, `sourceType` |
| Pipeline | `inheritedTags` | `dataDomain`, `pipelineType`, `sourceSystem`, `targetSystem` |
| Project | additive context | `purpose`, `stakeholder`, `lifecycle` |

The filter panel queries the union of direct + inherited tags. Detail panel visually distinguishes direct tags (solid chips) from inherited tags (outlined chips).

Urgency drives event chip color: `critical` = red, `high` = amber, `medium` = blue, `low` = gray.

## Default Duration

Missing `durationSeconds` defaults to `300` (5 minutes). Occurrences render with a minimum visual height of 30 minutes in time-grid views.

## AI Prompt Example

To generate importable JSON with an AI assistant, use a prompt like:

```
Generate a pipeline schedule JSON for [your use case] following these rules:
- schemaVersion: "1.0"
- Top-level "projects" and "pipelines" arrays (not nested)
- Put pipelineRefs on projects (ids only); schedules go inside pipelines
- Never include pipeline.projectRefs — it is derived by the app
- Pipeline and all its child schedules must share the same timezone
- Default timezone: "Asia/Taipei" | Default duration: 300 seconds
- Use "schedule" everywhere; "job" is a conversation alias only
- One recurrence mode per schedule: simple / rrule / cron (or type: "one_time")
- Do NOT add DTSTART to rrule strings — the app injects it automatically
- Output raw JSON only — no markdown fences, no prose
```

Full rules in `dev/Reference_AI_Output_Contract.md`.

## V1 Known Limitations

- Read-only — no editing, drag-and-drop, or execution monitoring
- No database persistence — all data is in-memory per session
- No authentication or access control
- Quarter / Half-Year / Year views require custom implementation (Milestone 2)
- Monthly simple recurrence with byMonthDay 29–31 must use `rrule` mode instead

## Project Structure

```
src/
  data/              sample JSON files
  schema/
    types.ts          TypeScript type definitions
    validate.ts       Zod schema + parseScheduleDocument()
    validateSample.ts smoke test script
  lib/
    normalize.ts      normalizeScheduleDocument()
    expand.ts         expandRecurrence()
    filters.ts        applyFilters(), FilterState
    __tests__/        unit tests (vitest)
  App.tsx             main app + calendar
  FilterPanel.tsx     filter sidebar
  DetailPanel.tsx     occurrence detail panel
  ImportModal.tsx     JSON import UI
documentation/
  architecture.md     system design, data flow, trust boundaries
  flows.md            user flow diagrams
  permissions.md      auth/permissions stance
  variables.md        secrets and environment variables
  tests.md            test strategy and coverage map
dev/
  Pipeline_Schedule_Visualizer_PRD.md
  Design_Data_Model_Architecture.md
  Reference_JSON_Schedule_Schema.md
  Reference_AI_Output_Contract.md
  Tracker_V1_Checklist.md
  Tracker_Sprint1_Plan.md
  Audit_Assumption_Risk.md
```
