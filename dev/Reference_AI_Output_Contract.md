# AI Output Contract — Schedule JSON

Rules for AI-generated pipeline schedule JSON. Any AI asked to produce schedule data must follow these rules to produce importable output.

## Output Rules

1. **Output raw JSON only.** Do not wrap in markdown fences, prose, or explanation.
2. Use `schemaVersion: "1.0"`.
3. Use `projects[]` and `pipelines[]` as separate top-level arrays.
4. Put project-to-pipeline membership in `project.pipelineRefs` (array of `{ pipelineId, role?, notes? }`).
5. Put schedule definitions inside `pipeline.schedules[]`.
6. **Do NOT put `pipeline.projectRefs` in generated JSON.** It is derived by the app and will be rejected.

## Timezone Rules

7. Every project, pipeline, and schedule must have a `timezone` field.
8. Default unspecified timezone to `"Asia/Taipei"`.
9. **Pipeline timezone must equal all child schedule timezones** — use the same value on all three.
10. Project timezone ≠ pipeline timezone is allowed — the app converts transparently. Do NOT set `needsReview: true` for a timezone difference between project and pipeline.

## Duration

11. If duration is unknown, set `durationSeconds: 300`.

## Naming

12. Use `schedule` as the field and entity name. `job` is a conversation alias only — never use it in JSON keys.

## Recurrence Modes

Pick **one** mode per schedule. Do not mix modes.

### simple — human-friendly recurrence

```json
{
  "mode": "simple",
  "frequency": "weekly",
  "interval": 1,
  "byWeekday": ["MO"],
  "endDate": null
}
```

- `frequency`: `"daily"` | `"weekly"` | `"monthly"`
- `byWeekday`: RFC 5545 two-letter codes (`MO TU WE TH FR SA SU`), weekly only
- `byMonthDay`: integer 1–28, or -1 for last day of month. **Never 29–31** — use `rrule` instead.
- For "first Monday of month" or complex weekly-in-month patterns: use `rrule`.

### rrule — RFC 5545 RRULE string

```json
{
  "mode": "rrule",
  "rrule": "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
  "endDate": null
}
```

- Do **not** add `DTSTART` — the app injects it from `schedule.startDate + time + timezone`.
- If the source already has a DTSTART, the app overwrites it.

### cron — cron expression

```json
{
  "mode": "cron",
  "cron": "0 9 * * 1",
  "endDate": null
}
```

- Cron is always interpreted in `schedule.timezone`.
- No timezone suffix in the cron string itself.

### one_time — single occurrence

```json
{
  "type": "one_time",
  "startDateTime": "2026-07-15T22:00:00+08:00",
  "durationSeconds": 900
}
```

- Use ISO 8601 with timezone offset.
- `type` is `"one_time"`, not `"recurring"`.

## Review Flags

13. Set `"needsReview": true` on any schedule where you are uncertain about correctness.
14. Use `"assumptions": ["...", "..."]` to document what you assumed when generating the schedule.

## Minimal Valid Example

```json
{
  "schemaVersion": "1.0",
  "metadata": { "name": "My Schedules", "updatedAt": "2026-06-25T00:00:00+08:00" },
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "timezone": "Asia/Taipei",
      "pipelineRefs": [{ "pipelineId": "my-pipeline", "role": "primary" }]
    }
  ],
  "pipelines": [
    {
      "id": "my-pipeline",
      "name": "My Pipeline",
      "timezone": "Asia/Taipei",
      "schedules": [
        {
          "id": "daily-run",
          "title": "Daily Run",
          "enabled": true,
          "timezone": "Asia/Taipei",
          "schedule": {
            "type": "recurring",
            "startDate": "2026-07-01",
            "time": "09:00",
            "durationSeconds": 300,
            "recurrence": { "mode": "simple", "frequency": "daily", "interval": 1, "endDate": null }
          }
        }
      ]
    }
  ]
}
```

## Common Mistakes to Avoid

| Mistake | Correct |
|---|---|
| `"projectRefs": [...]` on pipeline | Never — it is derived by the app |
| `byMonthDay: 31` in simple mode | Use `mode: "rrule"` with `BYMONTHDAY=31` |
| Different timezone on pipeline vs schedule | Always match them exactly |
| Wrapping output in markdown code block | Output raw JSON only |
| DTSTART in rrule string | Omit — app injects it |
| `"type": "job"` | Use `"type": "recurring"` or `"type": "one_time"` |
