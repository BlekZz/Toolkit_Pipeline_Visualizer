# JSON Schedule Schema Draft

## Design Principles

- JSON 必須讓 AI 容易產生，也讓人類容易審查。
- V1 使用 entity-reference model，而不是純巢狀 tree。
- Project 是 business intent / view，可以引用多個 pipeline。
- Pipeline 是 reusable operational entity，可以被多個 project 引用。
- Schedule 是正式排程定義，必須屬於某個 pipeline。
- `job` 只作為 UI 或 AI 對話別名；schema、文件與程式碼使用 `schedule`。
- Recurrence 必須 deterministic，不依賴自然語言。
- Renderer 只展開目前 view range，不預先生成無限未來。
- V1 只描述 planned schedule，不描述實際執行成功失敗。

## Top-level Shape

```json
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "Data Team Schedule",
    "description": "Local planning calendar for data pipelines",
    "updatedAt": "2026-06-25T00:00:00+08:00"
  },
  "tagCatalog": {},
  "projects": [],
  "pipelines": []
}
```

## Project Shape

```json
{
  "id": "monthly-exec-reporting",
  "name": "Monthly Executive Reporting",
  "description": "Business-intent view for monthly executive reporting readiness.",
  "timezone": "Asia/Taipei",
  "tags": {
    "purpose": ["reporting"],
    "stakeholder": ["executive", "finance"],
    "lifecycle": "active",
    "priorityTier": "tier-1",
    "projectOwner": ["analytics-lead"],
    "custom": []
  },
  "pipelineRefs": [
    {
      "pipelineId": "sales-mart",
      "role": "primary",
      "notes": "Feeds the monthly revenue dashboard."
    }
  ]
}
```

## Pipeline Shape

```json
{
  "id": "sales-mart",
  "name": "Sales Mart",
  "description": "Builds and refreshes sales mart tables.",
  "timezone": "Asia/Taipei",
  "tags": {
    "dataDomain": ["revenue"],
    "pipelineType": ["transform", "reporting"],
    "sourceSystem": ["warehouse"],
    "targetSystem": ["dashboard", "mart"],
    "pipelineOwner": ["data-eng"],
    "escalationOwner": ["analytics-lead"],
    "cadenceClass": ["weekly"],
    "reliabilityCriticality": "business-critical",
    "failureModeRisk": ["silent-failure", "delayed-output"],
    "custom": ["mart"]
  },
  "operationalChecklist": {
    "hasFallback": false,
    "fallbackNotes": null,
    "hasBackup": true,
    "backupNotes": "Warehouse snapshots are retained.",
    "hasNotification": false,
    "notificationNotes": null,
    "hasValidation": false,
    "validationNotes": "Future script should check latest partition date.",
    "hasSilentFailureRisk": true,
    "silentFailureNotes": "Dashboard may show stale values without visible failure."
  },
  "dependencies": {
    "upstreamPipelineIds": [],
    "downstreamPipelineIds": []
  },
  "schedules": []
}
```

## Schedule Shape

```json
{
  "id": "weekly-sales-refresh",
  "title": "Weekly Sales Refresh",
  "description": "Refresh weekly sales marts and publish downstream summary tables.",
  "enabled": true,
  "timezone": "Asia/Taipei",
  "schedule": {
    "type": "recurring",
    "startDate": "2026-07-06",
    "time": "09:00",
    "durationSeconds": 300,
    "recurrence": {
      "mode": "simple",
      "frequency": "weekly",
      "interval": 1,
      "byWeekday": ["MO"],
      "endDate": null
    }
  },
  "tags": {
    "owner": ["data-eng"],
    "urgency": "high",
    "runType": "automated",
    "sourceType": ["cron"],
    "expectedDuration": "short",
    "maintenanceWindow": "business-hours",
    "reviewState": "confirmed",
    "environmentScope": "production",
    "custom": ["weekly-refresh"]
  },
  "operationalChecklist": {
    "hasFallback": false,
    "hasNotification": false,
    "hasValidation": false,
    "requiresManualCheck": false,
    "isBlocking": true,
    "canRetry": true
  },
  "output": {
    "outputDescription": "Weekly sales mart tables and summary dashboard inputs.",
    "outputLocation": "warehouse.sales_mart.weekly_sales",
    "outputFormat": "table",
    "outputNamingPattern": "partition_date=YYYY-MM-DD",
    "downstreamNotes": "Used by monthly executive reporting project."
  },
  "source": {
    "system": "cron",
    "reference": "sales_refresh.sh",
    "documentationUrl": null
  },
  "dependencies": {
    "blockedByScheduleIds": [],
    "blocksScheduleIds": []
  },
  "validation": {
    "mode": "none",
    "logUrl": null,
    "webhookKey": null,
    "scriptRef": null
  },
  "notes": "V1 only renders planned schedule.",
  "needsReview": false,
  "assumptions": []
}
```

## Timezone Rules

- Project, pipeline, and schedule all store `timezone`. Default: `Asia/Taipei`.
- Pipeline timezone and all child schedule timezones must match (validation error).
- `pipeline.projectRefs` must NOT appear in source JSON — it is derived during normalization.
- DST handling: UTC instant is preserved (absolute). Wall-clock local time may shift at DST transitions.
- No timezone mismatch warning between project and pipeline — all occurrences are converted to the view's display timezone transparently.

### Display Timezone by View Context

| View context | Display timezone |
|---|---|
| Single project view | `project.timezone` |
| Single pipeline view | `pipeline.timezone` |
| Global / multi-project view | Browser local timezone |

The detail panel always shows both the original `schedule.timezone` and the display-converted time.

## Schedule Types

### One-time

```json
{
  "type": "one_time",
  "startDateTime": "2026-07-01T14:00:00+08:00",
  "durationSeconds": 300
}
```

### Recurring With Simple Rule — Weekly

```json
{
  "type": "recurring",
  "startDate": "2026-07-01",
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
```

`byWeekday` uses RFC 5545 two-letter abbreviations: `MO TU WE TH FR SA SU`. Multi-day arrays are supported for weekly frequency only (e.g. `["MO","WE","FR"]`). `byWeekday` in `monthly` context is not supported in simple mode — use rrule for "first Monday of month" patterns.

### Recurring With Simple Rule — Monthly

```json
{
  "type": "recurring",
  "startDate": "2026-07-01",
  "time": "09:00",
  "durationSeconds": 300,
  "recurrence": {
    "mode": "simple",
    "frequency": "monthly",
    "interval": 1,
    "byMonthDay": 1,
    "endDate": null
  }
}
```

`byMonthDay`: integer 1–28 for fixed day, or `-1` for last day of month. Values 29–31 are prohibited (use rrule for end-of-month anchoring with month-length safety). `byWeekday` is ignored when `frequency: "monthly"`.

### `endDate` Semantics

`endDate` is **inclusive** — the last day on which an occurrence may start. `endDate: "2026-12-31"` means the final occurrence can fall on December 31. Consistent with RFC 5545 RRULE UNTIL semantics.

### Recurring With RRULE

```json
{
  "type": "recurring",
  "startDate": "2026-07-01",
  "time": "09:00",
  "durationSeconds": 300,
  "recurrence": {
    "mode": "rrule",
    "rrule": "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
    "endDate": null
  }
}
```

The `rrule` string may omit `DTSTART`. The normalization layer always injects `DTSTART;TZID={schedule.timezone}:{startDate}T{time}:00` into the rrule string before passing it to the rrule library. If the source rrule string already contains `DTSTART`, the normalization layer overwrites it with the canonical value derived from `startDate` + `time` + `schedule.timezone`.

### Recurring With Cron Expression

```json
{
  "type": "recurring",
  "startDate": "2026-07-01",
  "durationSeconds": 300,
  "recurrence": {
    "mode": "cron",
    "cron": "0 9 * * 1",
    "endDate": null
  }
}
```

## Tag Catalog Draft

```json
{
  "project": {
    "purposes": ["reporting", "monitoring", "migration", "compliance", "ad-hoc-analysis", "operational-maintenance"],
    "stakeholders": ["sales", "growth", "finance", "executive", "product", "ops"],
    "lifecycles": ["planning", "active", "paused", "deprecated", "experimental"],
    "priorityTiers": ["tier-1", "tier-2", "tier-3"]
  },
  "pipeline": {
    "dataDomains": ["revenue", "acquisition", "retention", "finance", "ops", "product", "experimentation"],
    "pipelineTypes": ["ingestion", "transform", "aggregation", "export", "reporting", "quality-check", "backfill"],
    "sourceSystems": ["postgres", "bigquery", "s3", "google-sheets", "third-party-api", "manual-upload"],
    "targetSystems": ["warehouse", "mart", "dashboard", "sheet", "crm", "notification", "file-drop"],
    "cadenceClasses": ["hourly", "daily", "weekly", "monthly", "ad-hoc", "mixed"],
    "reliabilityCriticality": ["blocking", "business-critical", "important", "best-effort", "experimental"],
    "failureModeRisks": ["silent-failure", "delayed-output", "partial-output", "duplicate-output", "schema-drift", "manual-risk"]
  },
  "schedule": {
    "urgencies": ["low", "medium", "high", "critical"],
    "runTypes": ["automated", "manual", "semi-automated"],
    "sourceTypes": ["cron", "airflow", "manual", "external", "webhook", "script"],
    "expectedDurations": ["short", "medium", "long"],
    "maintenanceWindows": ["business-hours", "off-hours", "weekend", "holiday-sensitive"],
    "reviewStates": ["confirmed", "needs-review", "assumed", "deprecated"],
    "environmentScopes": ["development", "staging", "production", "all"]
  }
}
```

## Derived Dimensions

Projects should derive technical dimensions from referenced pipelines:

- derivedDataDomains
- derivedSourceSystems
- derivedTargetSystems
- derivedPipelineOwners
- derivedReliabilityCriticality
- derivedFailureModeRisks

These derived fields are view-model outputs, not manually maintained source JSON.

## Tag Inheritance And References

- `project.pipelineRefs` is the only source of project-to-pipeline membership. `pipeline.projectRefs` must NOT be in source JSON.
- Schedule occurrences inherit pipeline direct tags (for fields not set on the schedule). Project context is additive.
- Schedule direct tags always win over inherited pipeline tags for the same field.
- The calendar shows one event per `(pipelineId, scheduleId, scheduledStart)` even when multiple projects reference the pipeline. Filter by project queries the `projectContexts` array on the occurrence.
- `schedule.dependencies.blockedByScheduleIds` must use `pipelineId::scheduleId` format (not bare scheduleId) to be globally unambiguous.

## AI Output Contract

When an AI is asked to generate schedule JSON:

- Output raw JSON only.
- Do not wrap in markdown fences.
- Use `schemaVersion: "1.0"`.
- Use `projects[]` and `pipelines[]` as separate top-level arrays.
- Put project-to-pipeline membership in `project.pipelineRefs`.
- Put schedule definitions inside `pipeline.schedules`.
- Put `timezone` on project, pipeline, and schedule.
- Default unspecified timezone to `Asia/Taipei`.
- Ensure pipeline timezone equals all child schedule timezones.
- Project timezone ≠ pipeline timezone is allowed — do NOT set `needsReview` for this. Conversion is handled by the display layer.
- Do NOT put `pipeline.projectRefs` in generated JSON — it is derived by the app.
- If duration is unknown, set `durationSeconds` to `300`.
- If the user describes calendar-style recurrence, prefer `mode: "simple"`.
  - For monthly: use `byMonthDay` (e.g. `1` = 1st of month, `-1` = last day of month).
  - For "first Monday of month" or complex weekly-in-month patterns: use `mode: "rrule"`.
- If the user provides an RRULE, preserve it with `mode: "rrule"`. Do not add DTSTART — the app injects it.
- If the user provides a cron expression, preserve it with `mode: "cron"`. Cron is always interpreted in `schedule.timezone`.
- Do not invent validation settings unless the user provides them.

## Implementation Notes

- Occurrence id format: `pipelineId::scheduleId::scheduledStart` where `scheduledStart` is UTC ISO 8601 with Z suffix (e.g. `2026-07-07T01:00:00Z`).
- Renderer receives current visible range + timezone context, expands recurrence only inside that range. Never pre-generate occurrences outside visible range.
- Generated occurrences attach: `projectContexts[]`, pipeline context, schedule context, display timezone, direct tags, inherited tags, derived tags.
- `durationSeconds` defaults to `300` when missing.
- RRULE normalization: always inject `DTSTART;TZID={schedule.timezone}:{startDate}T{time}:00` before passing to rrule library.
- DST: UTC instant is preserved (absolute time). Occurrences in the "missing hour" of a DST transition are silently dropped in V1.
- `schemaVersion` migration tolerance: unknown top-level keys are ignored; unknown enum values are accepted as-is (advisory only).
- `tagCatalog` is advisory — used for UI autocomplete and filter labels only, not for validation.
- Filter logic: within one dimension, multiple selected values use OR. Across dimensions, active filters use AND.

