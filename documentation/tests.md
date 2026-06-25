# Tests

> Status: Section A complete — reflects V1 final test suite as of 2026-06-26.
> Section B is the aspirational coverage map (not all rows are implemented).
> Section C pending — fill after post-ship manual audit.

---

## Section A — Existing Coverage

29 tests passing as of V1. Run `npm run test` to verify.

CI gate: `npm run check` (TypeScript) must pass before merge to main. Unit tests on normalization and recurrence are blocking for "V1 Done" criteria.

### `src/lib/__tests__/normalize.test.ts` (16 tests)

| Use Case | Rule | Expected Behavior | Status |
|---|---|---|---|
| Default project timezone | Missing `timezone` → `Asia/Taipei` | `result.data.projects[0].timezone === 'Asia/Taipei'` | ✅ |
| Default durationSeconds | Missing `durationSeconds` → 300 | `def.durationSeconds === 300` | ✅ |
| projectRefs derivation (single project) | Pipeline referenced by 1 project | `projectRefs.length === 1`, projectId correct | ✅ |
| projectRefs derivation (two projects) | Pipeline referenced by 2 projects | `projectRefs.length === 2`, both ids present | ✅ |
| projectRefs empty for orphan pipeline | Pipeline in no project | `projectRefs.length === 0` | ✅ |
| projectRefs stripped from source | `pipeline.projectRefs` in source JSON | `console.warn` called, derived refs overwrite | ✅ |
| DTSTART injection | `mode: "rrule"` schedule | rrule string starts with `DTSTART;TZID=Asia/Taipei:` | ✅ |
| DTSTART overwrite | Source rrule has existing DTSTART | Only 1 DTSTART in final string; uses `schedule.timezone` | ✅ |
| No DTSTART for non-rrule | `mode: "simple"` schedule | No rrule field added | ✅ |
| Schedule direct tags | `tags.urgency` on schedule | `directTags.urgency === 'critical'` | ✅ |
| Pipeline inherited tags | `tags.dataDomain` on pipeline | `inheritedTags.dataDomain === ['revenue']` | ✅ |
| Custom tags independence | Both pipeline and schedule have `custom` | `directTags.custom !== inheritedTags.custom` | ✅ |
| displayTimezone — project mode | viewContext `{ mode: 'project', id }` | `displayTimezone === project.timezone` | ✅ |
| displayTimezone — pipeline mode | viewContext `{ mode: 'pipeline', id }` | `displayTimezone === pipeline.timezone` | ✅ |
| displayTimezone — global mode | viewContext `{ mode: 'global' }` | `displayTimezone === Intl...resolvedOptions().timeZone` | ✅ |
| No source mutation | Call normalize | `doc.pipelines[0].schedules.length` unchanged; no `projectRefs` on source | ✅ |

### `src/lib/__tests__/expand.test.ts` (13 tests)

| Use Case | Rule | Expected Behavior | Status |
|---|---|---|---|
| Simple weekly — all Mondays | `frequency: "weekly", byWeekday: ["MO"]` | All occurrences are weekday 1 (Monday) | ✅ |
| Simple weekly — count in July 2026 | July 2026 has 4 Mondays | `occurrences.length === 4` | ✅ |
| startDate respected | `startDate: 2026-07-13` (2nd Monday) | Jul 6 skipped; 3 occurrences returned | ✅ |
| endDate respected (inclusive) | `endDate: "2026-07-20"` | Jul 27 excluded; 3 occurrences returned | ✅ |
| Disabled schedule | `enabled: false` | `occurrences.length === 0` | ✅ |
| Simple daily | `frequency: "daily", interval: 1`, 7-day range | `occurrences.length === 7` | ✅ |
| Cron Monday 09:00 Taipei | `cron: "0 9 * * 1"` in Asia/Taipei | 4 Mondays; each at `01:00 UTC` | ✅ |
| RRULE vs simple parity | `FREQ=WEEKLY;BYDAY=MO` vs simple weekly | Same count and identical `scheduledStart` for all | ✅ |
| One-time in range | `startDateTime: 2026-07-15T14:00+08:00` | 1 occurrence at `06:00Z` | ✅ |
| One-time outside range | `startDateTime: 2026-08-01` with July range | `occurrences.length === 0` | ✅ |
| Occurrence ID format | Any occurrence | `id` matches `pipelineId::scheduleId::...Z` | ✅ |
| Shared pipeline → two projectContexts | Pipeline in 2 projects | 1 occurrence, `projectContexts.length === 2` | ✅ |
| Bounded by visible range | Daily since 2026-01-01, 7-day range | All occurrences within range bounds | ✅ |

---

## Section B — Proposed Tests

Derived from Phase 10 checklist and Phase 4/5 acceptance criteria. Each row is a test that must be written.

### Normalization (`src/lib/normalize.ts`)

| Use Case | Rule | Expected Behavior | Test Type |
|---|---|---|---|
| Project timezone default | Missing `project.timezone` → normalize to `Asia/Taipei` | `normalizedProject.timezone === "Asia/Taipei"` | Unit |
| Pipeline timezone cascade | Missing `pipeline.timezone` → inherit from project timezone | `normalizedPipeline.timezone === project.timezone` | Unit |
| Schedule timezone cascade | Missing `schedule.timezone` → inherit from pipeline timezone | `normalizedSchedule.timezone === pipeline.timezone` | Unit |
| Duration default | Missing `durationSeconds` → 300 | `occurrence.durationSeconds === 300` | Unit |
| projectRefs derivation | `pipeline.projectRefs` derived by inverting `project.pipelineRefs` | Pipeline A referenced by Project X and Y → `pipelineA.projectRefs = ["X", "Y"]` | Unit |
| projectRefs stripped from source | `pipeline.projectRefs` in source JSON → stripped with console.warn | No `projectRefs` on normalized pipeline; `console.warn` called once | Unit |
| Occurrence deduplication | Pipeline in 2 projects → 1 CalendarOccurrence | `occurrences.filter(o => o.pipelineId === "A").length === 1`; `occurrence.projectContexts.length === 2` | Unit |
| Tag inheritance — schedule wins | Schedule and pipeline both define `urgency` → schedule value wins | `occurrence.directTags.urgency === scheduleValue` | Unit |
| Tag inheritance — pipeline fills gap | Pipeline defines `dataDomain`; schedule does not → occurrence inherits | `occurrence.inheritedTags.dataDomain === pipelineValue` | Unit |
| Project context additive | Project tags appear in occurrence but do not override pipeline/schedule | `occurrence.projectContexts[0].tags.purpose` accessible; does not shadow `directTags` | Unit |
| DTSTART injection | `mode: "rrule"` schedule → normalization prepends `DTSTART;TZID=…` | Normalized rrule string starts with `DTSTART;TZID=Asia/Taipei:` | Unit |
| DTSTART overwrite | Source rrule already contains DTSTART → overwritten with canonical value | Only one DTSTART in final rrule string; uses `schedule.timezone` | Unit |

### Zod Validation (`src/schema/`)

| Use Case | Rule | Expected Behavior | Test Type |
|---|---|---|---|
| Valid sample JSON | Full sample file | `safeParse` result is `success: true` | Unit |
| Invalid recurrence mode | `recurrence.mode: "weekly"` (wrong value) | `safeParse` fails; error mentions `recurrence.mode`; includes scheduleId | Unit |
| Missing recurrence mode | `recurrence` object with no `mode` field | `safeParse` fails with actionable error | Unit |
| byMonthDay 29 rejected | `simple` monthly with `byMonthDay: 29` | Zod error: "use rrule for day 29–31" | Unit |
| byMonthDay -1 accepted | `simple` monthly with `byMonthDay: -1` | `safeParse` succeeds | Unit |
| Timezone mismatch | Pipeline `timezone: "Asia/Taipei"`, child schedule `timezone: "America/New_York"` | Zod error including both pipelineId and scheduleId | Unit |
| Missing duration accepted | Schedule with no `durationSeconds` | Parses successfully; `durationSeconds` defaults to 300 | Unit |
| pipelineRefs point to non-existent pipeline | `project.pipelineRefs[0].pipelineId: "does-not-exist"` | Zod error: unknown pipeline id | Unit |
| Standalone schedule rejected | Schedule not inside any pipeline | Schema rejects (schedules array only exists on pipeline) | Unit |

### Recurrence Expansion (`src/lib/expand.ts`)

| Use Case | Rule | Expected Behavior | Test Type |
|---|---|---|---|
| Simple weekly — Monday | `frequency: "weekly"`, `byWeekday: ["MO"]`, range = one month | Every Monday in range returned; no other days | Unit |
| Simple daily | `frequency: "daily"`, `interval: 1` | Every day in range | Unit |
| Simple monthly — 1st | `frequency: "monthly"`, `byMonthDay: 1` | 1st of each month in range | Unit |
| Simple monthly — last day | `frequency: "monthly"`, `byMonthDay: -1` | Last day of each month (handles Feb, 30/31 day months) | Unit |
| RRULE weekly Monday | `mode: "rrule"`, `rrule: "FREQ=WEEKLY;BYDAY=MO"` | Same occurrences as simple weekly Monday | Unit |
| Cron — Monday 09:00 | `mode: "cron"`, `cron: "0 9 * * 1"` | Every Monday at 09:00 in schedule.timezone | Unit |
| One-time | `type: "one_time"`, `startDateTime: "2026-07-01T14:00:00+08:00"` | Exactly one occurrence; only if date in range | Unit |
| Bounded by endDate | `endDate: "2026-08-31"`, range extends to September | No occurrences after Aug 31 | Unit |
| disabled schedule | `enabled: false` | Zero occurrences returned | Unit |
| Infinite recurrence bounded | Daily schedule, range = 7 days | Exactly 7 occurrences; no pre-generation beyond range | Unit |
| DST missing hour drop | US/Eastern timezone, spring-forward, cron `0 2 * * *` | Occurrence at 2 AM on spring-forward night silently dropped | Unit |
| Occurrence id format | Any occurrence | `id === "{pipelineId}::{scheduleId}::{scheduledStartUTC}Z"` | Unit |

### Integration (React Component)

| Use Case | Rule | Expected Behavior | Test Type |
|---|---|---|---|
| Import valid JSON | End-to-end flow | Calendar renders occurrences after import | Integration |
| Import invalid JSON | Zod errors displayed | Error list visible; previous data still shown | Integration |
| Filter by project | Select Project A | Only occurrences with Project A in `projectContexts` shown | Integration |
| Filter by inherited tag | Select `dataDomain = revenue` (pipeline-level tag) | Occurrences whose pipeline has `dataDomain: revenue` appear, even if schedule has no direct dataDomain | Integration |
| Clear filters | After filtering, click "Clear All" | All occurrences restored | Integration |
| View switch preserves filters | Day → Week → Month | Active filter state unchanged | Integration |

---

## Section C — Gaps

*Pending — fill in after Phase 10 manual verification to identify documented rules with no test coverage.*

| Documented Rule | Source | Test Status |
|---|---|---|
| (fill in after Phase 10) | | |

---

## Notes

- Produced by manual derivation from `architecture.md`, `flows.md`, and `dev/Tracker_V1_Checklist.md` Phase 4/5/10.
- Section A is the ground truth of what's actually tested; Section B is the aspirational map. Keep them separate.
- `tests.md` is a living document — update Section A each time a proposed test is implemented.
