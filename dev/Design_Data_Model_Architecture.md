# Data Model Architecture

## Core Decision

V1 should use an entity-reference model, not a strict nested tree.

Reason:

- A project represents a business intent, not the sole owner of pipelines.
- A pipeline can be reused by multiple projects.
- A schedule must belong to exactly one pipeline.
- Calendar views, Mermaid exports, and future validation scripts should all be generated from the same normalized graph.

Recommended model:

```text
Project --references many--> Pipeline --owns many--> Schedule
```

## Entity Meanings

### Project

Project is a business-intent view. It answers:

- Why are we tracking this set of pipelines?
- Which stakeholder or business use case does this serve?
- Are the referenced pipelines enough to support the workflow?
- Do schedules overlap or leave gaps from the project's operational perspective?

Project is not the canonical owner of pipeline data. It references pipelines.

### Pipeline

Pipeline is the reusable data-operation unit. It answers:

- What data flow or processing loop is this?
- What are the source and target systems?
- Who debugs it when it breaks?
- How critical is silent failure?
- Does it have fallback, backup, notification, or validation coverage?

Pipeline owns schedules. A pipeline may appear in multiple projects.

### Schedule

Schedule is the formal execution definition. It answers:

- When does this run?
- How is it triggered?
- What output should it produce?
- What evidence or artifact can later validate success?
- What is the operational urgency and maintenance window?

`job` is allowed as a UI and AI conversation alias, but schema, code, and documentation should use `schedule`.

## Timezone Rules

### Storage Defaults

- Project, pipeline, and schedule all store a `timezone` field.
- Creating a project defaults timezone to `Asia/Taipei`.
- Creating a pipeline inside a project defaults pipeline timezone to that project timezone.
- Creating a schedule inside a pipeline defaults schedule timezone to that pipeline timezone.
- Pipeline timezone and all child schedule timezones must match (validation error if mismatched).

### DST Handling

UTC instant is preserved (absolute time is fixed). When a recurring schedule crosses a DST boundary, the wall-clock local time may shift by one hour. This is intentional — the schedule is anchored to an absolute UTC instant, not to a local clock face.

For regions without DST (Asia/Taipei, Asia/Singapore, etc.) this has no effect.

### Display Timezone — View-Context Rules

The calendar converts all occurrences to a **display timezone** that depends on the active view context:

| View context | Display timezone |
|---|---|
| Single project view | `project.timezone` |
| Single pipeline view (standalone) | `pipeline.timezone` |
| Global view (all projects/pipelines) | Browser local timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) |

There is no timezone mismatch warning or blocking. All pipeline schedules are silently converted to the view's display timezone for rendering. The detail panel shows both the original `schedule.timezone` and the converted display time.

### No Timezone Alignment Workflow in V1

The original alignment workflow concept is replaced by transparent conversion. There is no prompt, no warning icon, and no validation error for project/pipeline timezone differences. V1.5 may revisit if users need to explicitly manage timezone context.

## Project-Pipeline References

Projects should not embed full pipeline objects. They should reference pipeline ids.

Example:

```json
{
  "projects": [
    {
      "id": "monthly-exec-reporting",
      "name": "Monthly Executive Reporting",
      "timezone": "Asia/Taipei",
      "pipelineRefs": [
        {
          "pipelineId": "sales-mart",
          "role": "primary",
          "notes": "Feeds monthly sales summary."
        }
      ]
    }
  ],
  "pipelines": [
    {
      "id": "sales-mart",
      "timezone": "Asia/Taipei",
      "schedules": []
    }
  ]
}
```

This avoids duplicated pipelines when the same pipeline supports multiple business intents.

### `pipeline.projectRefs` is Derived, Not Source

`pipeline.projectRefs[]` must NOT be present in source JSON. It is computed by the normalization layer by scanning all `project.pipelineRefs` and inverting the reference graph. The normalization layer attaches `projectRefs` to each pipeline's view model at runtime.

`project.pipelineRefs` is the single source of truth for all project-to-pipeline membership.

### Occurrence Deduplication

When a pipeline is referenced by multiple projects, the calendar displays **one event** per `(pipelineId, scheduleId, scheduledStart)`. The event's `extendedProps.projectContexts` carries an array of all project references that include this pipeline. Filter by project works by checking whether the target project id appears in `projectContexts`.

## Tag And Dimension Strategy

Dimensions should serve concrete data-operation decisions. Tags should help different roles answer different questions:

- Data team lead: risk, ownership, coverage, schedule density.
- Data engineer: source/target systems, failure paths, fallback, validation.
- Analyst: update timing, output location, stakeholder relevance.
- Intern: what runs, where output appears, who to ask, what needs review.

### Project Dimensions

Project dimensions should describe business intent and planning context:

- purpose: reporting, monitoring, migration, compliance, ad-hoc-analysis, operational-maintenance.
- stakeholder: sales, growth, finance, executive, product, ops.
- lifecycle: active, planning, paused, deprecated, experimental.
- priorityTier: tier-1, tier-2, tier-3.
- projectOwner: person or role accountable for the project view.
- custom: free-form labels.

Project should not directly own `dataDomain` as a hand-authored primary tag when the project is composed from many pipelines. Project-level data domains should be derived from referenced pipelines.

Derived project fields:

- derivedDataDomains: union of referenced pipeline data domains.
- derivedSourceSystems: union of referenced pipeline source systems.
- derivedTargetSystems: union of referenced pipeline target systems.
- derivedOwners: union of referenced pipeline owners.

### Tag Inheritance and Override Rule

When generating a `CalendarOccurrence` view model:

1. Schedule direct tags are the authoritative values for any field they define.
2. Pipeline tags fill in any field not defined by the schedule.
3. Project context (from `projectContexts`) is additive — project tags do not override pipeline or schedule tags.
4. Filter logic searches the union of direct tags + inherited tags. A schedule with inherited `dataDomain: ["revenue"]` is returned by a `dataDomain = revenue` filter even if the schedule itself has no `dataDomain`.
5. The detail panel visually distinguishes direct tags (solid chip) from inherited tags (muted/outlined chip).

### tagCatalog Role

`tagCatalog` is advisory only. Unknown tag values are accepted and displayed as-is. The catalog is used for UI autocomplete and filter panel label generation. Validation does not fail on unknown values.

### Pipeline Dimensions

Pipeline dimensions should describe the data operation:

- projectRefs: **derived by normalization layer — do not put in source JSON** (see Project-Pipeline References section).
- dataDomain: revenue, acquisition, retention, finance, ops, product, experimentation.
- pipelineType: ingestion, transform, aggregation, export, reporting, quality-check, backfill.
- sourceSystem: postgres, bigquery, s3, google-sheets, third-party-api, manual-upload.
- targetSystem: warehouse, mart, dashboard, sheet, crm, notification, file-drop.
- pipelineOwner: person or role responsible for debugging.
- escalationOwner: person or role to contact when pipeline impacts business operations.
- cadenceClass: hourly, daily, weekly, monthly, ad-hoc, mixed.
- reliabilityCriticality: blocking, business-critical, important, best-effort, experimental.
- failureModeRisk: silent-failure, delayed-output, partial-output, duplicate-output, schema-drift, manual-risk.
- custom: free-form labels.

Reliability criticality guidance:

- blocking: downstream work cannot continue if this pipeline fails.
- business-critical: business reporting or operations are materially wrong if this fails.
- important: failure matters, but there is a reasonable manual or delayed workaround.
- best-effort: useful but not operationally required.
- experimental: still being evaluated; failure should not trigger production concern.

Pipeline operational checklist fields:

- hasFallback: whether an alternate path exists.
- fallbackNotes: what to do when the primary path fails.
- hasBackup: whether output or source data has a backup.
- backupNotes: where backup lives or how to restore.
- hasNotification: whether anyone is automatically notified.
- notificationNotes: channel, owner, or future webhook details.
- hasValidation: whether success can be validated.
- validationNotes: intended check, evidence, or future script idea.
- hasSilentFailureRisk: whether failure can look like success.
- silentFailureNotes: what blind spot exists.

### Schedule Dimensions

Schedule dimensions should describe one executable planned run:

- pipelineId: required.
- timezone: must match parent pipeline timezone.
- owner: person or role responsible for this schedule.
- urgency: low, medium, high, critical.
- runType: automated, manual, semi-automated.
- sourceType: cron, airflow, manual, external, webhook, script.
- maintenanceWindow: business-hours, off-hours, weekend, holiday-sensitive.
- reviewState: confirmed, needs-review, assumed, deprecated.
- expectedDuration: short, medium, long, or explicit `durationSeconds`.
- custom: free-form labels.

Schedule operational checklist fields:

- hasFallback: schedule-level fallback exists.
- hasNotification: schedule run notifies someone or somewhere.
- hasValidation: schedule output can be checked.
- requiresManualCheck: a human must inspect the result.
- isBlocking: downstream schedule or business process depends on this run.
- canRetry: run can be rerun safely.

Schedule output fields:

- outputDescription: human-readable output summary.
- outputLocation: folder, table, URL, bucket path, or file path.
- outputFormat: csv, xlsx, parquet, table, dashboard, json, pdf, other.
- outputNamingPattern: expected filename/table/partition naming convention.
- downstreamNotes: how the output is consumed by later nodes.

These fields prepare V2 validation scripts without forcing validation in V1.

## Normalization For Views

The app should create normalized view models:

- Project view model:
  - direct project fields.
  - referenced pipelines.
  - derived pipeline dimensions.
  - all schedules from referenced pipelines.
- Pipeline view model:
  - direct pipeline fields.
  - project refs.
  - schedules.
  - Mermaid graph nodes/edges.
- Schedule occurrence view model:
  - project context.
  - pipeline context.
  - schedule context.
  - direct tags.
  - inherited/derived tags.
  - timezone.

## Mermaid Export

Mermaid should be generated from normalized pipeline and project graph data.

Pipeline Mermaid view:

- Nodes: schedules, source systems, output artifacts, target systems.
- Edges: dependency, output handoff, or schedule order.
- Labels: schedule title, cadence, output format, criticality.

Project Mermaid view:

- Nodes: referenced pipelines and key schedules.
- Edges: pipeline dependencies, shared outputs, project workflow order.
- Derived project data domains can be shown as grouped subgraphs.

This feature should be planned after core calendar rendering is stable, but the data model must reserve fields now:

- pipeline dependencies.
- schedule outputs.
- schedule downstream notes.
- pipeline source/target systems.
- project pipeline references.

## Export Strategy

Calendar export and Mermaid export serve different purposes:

- Calendar export answers when things happen.
- Mermaid export answers how data flows and where dependencies or blind spots exist.

Calendar export should require a bounded date range:

- one day.
- one week.
- one month.
- one quarter.
- custom finite range.

Infinite recurrence should never be exported without a bounded range.

