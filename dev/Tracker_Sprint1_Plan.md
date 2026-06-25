---
name: Sprint 1 Plan — Foundation
generated_by: pm-execution / sprint-plan
date: 2026-06-25
status: DRAFT
---

# Sprint 1 Plan — Foundation

## Sprint Goal

**Scaffold the app, define the TypeScript data model, implement Zod validation, and produce verified sample data — so Phase 4 normalization can begin with a working foundation.**

---

## Team & Capacity

| Parameter | Value |
|---|---|
| Team size | 1 developer (solo) |
| Sprint duration | 2 weeks |
| Working days | 10 |
| Hours/day | 6 (realistic for focused work) |
| Raw capacity | 60h |
| Buffer (15%) | 9h — bugs, review, unexpected edge cases |
| **Net available** | **51h** |

---

## Committed Stories

### Phase 0 — Project Scaffold (4h)

| Task | Est. | Notes |
|---|---|---|
| `npm create vite@latest` with React + TypeScript template | 0.5h | |
| Install deps: FullCalendar (daygrid, timegrid, interaction), rrule, cron-parser, Zod | 1h | Pin versions. Confirm peer deps. |
| Create folder structure: `src/data/`, `src/schema/`, `src/lib/` | 0.5h | |
| Add npm scripts: `dev`, `build`, `check` (tsc --noEmit), `test` placeholder | 0.5h | |
| README skeleton: purpose, quick start, JSON format pointer | 1h | |
| Verify: `npm run dev` renders blank React app without errors | 0.5h | |

**Phase 0 total: 4h**
**Acceptance: App runs locally. TypeScript check passes. Folder structure exists.**

---

### Phase 1 — Core Data Model (8h)

| Task | Est. | Notes |
|---|---|---|
| Types: `Project`, `Pipeline`, `Schedule` (top-level fields only) | 1.5h | |
| Types: `SimpleRecurrence`, `RRuleRecurrence`, `CronRecurrence`, `OneTimeSchedule` | 1.5h | Discriminated union on `mode` |
| Types: `DirectTags`, `InheritedTags`, `TagCatalog` | 1h | Tag dimensions from PRD |
| Types: `CalendarOccurrence` (flattened render unit) | 1h | `pipelineId::scheduleId::scheduledStart` id format |
| Timezone default constants: `DEFAULT_TIMEZONE = "Asia/Taipei"`, `DEFAULT_DURATION_SECONDS = 300` | 0.5h | |
| `ScheduleDocument` root type (top-level wrapper with `schemaVersion`, `metadata`, `projects[]`, `pipelines[]`) | 1h | |
| TypeScript compile check — all types valid, no `any` | 1.5h | |

**Phase 1 total: 8h**
**Acceptance: Types cover all entities. `CalendarOccurrence` typed. No `any`. tsc passes.**

---

### Phase 2 — Zod Validation Schema (10h)

| Task | Est. | Notes |
|---|---|---|
| Zod schemas for `Project` (id, name, timezone default, pipelineRefs) | 1h | |
| Zod schemas for `Pipeline` (id, name, timezone, schedules[]) | 1h | |
| Zod discriminatedUnion for recurrence modes (simple/rrule/cron) | 2h | Most complex part. Test all 3 paths. |
| Zod schema for `Schedule` (id, title, enabled, recurrence, startDate, endDate, durationSeconds default) | 1.5h | |
| Default handling: missing timezone → inherit from parent; missing duration → 300 | 1h | `.transform()` or `.default()` |
| Reference validation: `pipelineRefs` must point to existing pipeline ids | 1.5h | Cross-entity validation in top-level schema |
| Pipeline timezone must equal all child schedule timezones (error, not warning) | 1h | |
| Strip `pipeline.projectRefs` in source JSON with console warning | 0.5h | |
| Human-readable error messages: include project/pipeline/schedule id and field path | 0.5h | |

**Phase 2 total: 10h**
**Acceptance: Valid sample JSON passes. Invalid recurrence fails with useful error. Missing duration normalizes to 300. Timezone mismatch between pipeline and schedule fails.**

---

### Phase 3 — Sample Data + AI Contract (6h)

| Task | Est. | Notes |
|---|---|---|
| Canonical `sample-schedules.json`: 2 projects, 4 pipelines, 1 shared pipeline | 2h | Follow `Reference_JSON_Schedule_Schema.md` exactly |
| Cover: 1 simple weekly, 1 RRULE, 1 cron, 1 one-time | 1h | All recurrence modes in V1 |
| Include: `needsReview`, `assumptions`, direct tags, inherited tag examples | 0.5h | |
| Run sample JSON through Zod validation — zero errors | 0.5h | |
| `dev/Reference_AI_Output_Contract.md`: rules for AI-generated JSON | 2h | See Phase 3 acceptance criteria in checklist |

**Phase 3 total: 6h**
**Acceptance: Sample JSON validates cleanly. Another AI can produce importable JSON from the contract doc.**

---

## Stretch Goals (if capacity allows)

Phases 4–5 are stretch. Only start if Phases 0–3 are done with buffer remaining.

| Phase | Stretch Task | Est. |
|---|---|---|
| Phase 4 | Implement `normalizeScheduleDocument` skeleton (defaults + projectRefs derivation only) | 6h |
| Phase 5 | Implement `expandRecurrence` for `simple` weekly mode only (the simplest case) | 5h |

**Stretch total: 11h** — fits in the 51h budget if Phase 0–3 stay on track.

---

## Story Summary

| Phase | Hours | Status |
|---|---|---|
| Phase 0: Scaffold | 4h | ☐ |
| Phase 1: Data Model | 8h | ☐ |
| Phase 2: Zod Schema | 10h | ☐ |
| Phase 3: Sample Data | 6h | ☐ |
| **Committed total** | **28h** | |
| Stretch (Phase 4–5 partial) | 11h | ☐ stretch |
| Buffer | 12h | reserved |
| **Total** | **51h net** | |

---

## Dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3
                                 └──► Phase 4 (stretch)
                                           └──► Phase 5 (stretch)
```

No external dependencies. All work is local.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Zod discriminatedUnion for 3 recurrence modes is more complex than estimated | Medium | Medium | Spike in Phase 2 first. If >2h, drop error message polish and defer to Sprint 2. |
| Cross-entity reference validation (pipelineRefs) in Zod is hard to express cleanly | Medium | Low | Use `.superRefine()` on the root schema. If unwieldy, implement as a separate validation pass post-parse. |
| Sample data creation reveals schema gaps | Low | Medium | Use sample data creation as a spec review. Update Zod schema before marking Phase 3 done. |
| Phase 4 normalization is larger than the stretch estimate | High | Low | It IS a stretch goal. Drop cleanly if Phase 0–3 take longer. Sprint 2 starts at Phase 4. |

---

## Sprint 2 Preview

Sprint 2 will cover:
- Phase 4: Normalization layer (`normalizeScheduleDocument` complete)
- Phase 5: Recurrence expansion (all 3 modes + one-time)
- Phase 6 start: Calendar UI shell + FullCalendar integration

Sprint 2 planning: update after Sprint 1 retrospective.
