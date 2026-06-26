# V1 Implementation Checklist Draft

## V1 Definition

V1 is a local-first, read-only schedule visualization dashboard. It imports JSON, validates the shape, expands schedule recurrence inside the visible calendar range, and lets users inspect/filter schedules by project, pipeline, schedule, and tags.

V1 uses an entity-reference model:

- Projects reference pipelines through `pipelineRefs`.
- Pipelines own schedules.
- Schedules cannot exist outside pipelines.
- Pipelines can appear in multiple projects.

V1 does not include drag-and-drop editing, execution monitoring, notifications, authentication, database persistence, or production job execution.

## Phase 0: Project Setup

- Initialize application scaffold.
- Choose final frontend stack:
  - React
  - TypeScript
  - Vite
  - FullCalendar
  - rrule
  - cron-parser
  - Zod or Ajv
- Add local folder conventions:
  - `src/` for application code.
  - `src/data/` or `data/` for sample JSON.
  - `src/schema/` for validation schema.
  - `src/lib/` for recurrence and normalization helpers.
- Add npm scripts:
  - `dev`
  - `build`
  - `check`
  - `test` if tests are added.
- Add README quick start.

Acceptance criteria:

- App can run locally.
- TypeScript build/check command exists.
- Sample data location is defined.

## Phase 1: Core Data Model

- Define TypeScript types for:
  - root schedule document
  - project
  - pipeline
  - schedule
  - project-pipeline reference
  - recurrence modes
  - tag catalogs
  - direct tags
  - inherited tags
  - generated calendar occurrence
- Define official naming:
  - `schedule` is the formal schema/code term.
  - `job` can appear only in UI helper text or AI-facing explanation.
- Implement timezone defaults:
  - project defaults to `Asia/Taipei`.
  - pipeline created under a project defaults to project timezone.
  - schedule created under a pipeline defaults to pipeline timezone.
  - pipeline timezone must match all child schedule timezones (validation error).
  - Display timezone is view-context-dependent: single project → project.timezone, single pipeline → pipeline.timezone, global → browser Intl timezone.
- Implement DST strategy: UTC instant preserved (absolute). Occurrences in the DST missing hour are silently dropped.
- Implement default duration:
  - missing `durationSeconds` becomes `300`.
- Implement reference rules:
  - every schedule must be under a pipeline.
  - pipeline may exist without a project.
  - project references pipelines through `pipelineRefs`.
  - one pipeline can be referenced by multiple projects.
  - `pipeline.projectRefs` is derived by normalization — reject if found in source JSON (or strip with warning).
- Implement occurrence deduplication:
  - one `CalendarOccurrence` per `(pipelineId, scheduleId, scheduledStart)`.
  - occurrence carries `projectContexts[]` with all referencing project ids.
  - filter-by-project queries `projectContexts` membership.

Acceptance criteria:

- Types represent top-level `projects[]` and `pipelines[]`.
- No standalone schedule is accepted.
- A project can be created or represented with default `Asia/Taipei`.
- A pipeline can be reused by multiple projects without duplicating pipeline JSON.

## Phase 2: JSON Schema And Validation

- Validation engine: **Zod** (TypeScript-first, `z.discriminatedUnion` on `recurrence.mode` for three modes).
- Encode required fields:
  - `schemaVersion`
  - `metadata`
  - `projects`
  - `pipelines`
  - project `id`, `name`, `timezone`, `pipelineRefs`
  - pipeline `id`, `name`, `schedules`
  - schedule `id`, `title`, `enabled`, `schedule`
- Validate recurrence:
  - simple mode: valid frequency (`daily/weekly/monthly`), `byWeekday` for weekly, `byMonthDay` (-1 to 28) for monthly.
  - simple mode `monthly` with `byMonthDay` 29–31 is rejected (use rrule instead).
  - rrule mode: non-empty rrule string (DTSTART is not required in source; normalization injects it).
  - cron mode: valid cron expression + non-null timezone.
  - only one recurrence mode is canonical; reject if multiple are set.
- Validate defaultable fields:
  - missing project timezone defaults to `Asia/Taipei`.
  - missing pipeline timezone defaults to project timezone when created in project context.
  - missing schedule timezone defaults to pipeline timezone.
  - missing duration defaults to `300`.
- Validate references:
  - project `pipelineRefs` point to existing pipeline ids.
  - `pipeline.projectRefs` in source JSON → strip with warning (it is derived, not authored).
  - `schedule.dependencies.blockedByScheduleIds` must use `pipelineId::scheduleId` format.
- Validate timezone:
  - pipeline timezone must equal all child schedule timezones (error).
  - project ↔ pipeline timezone mismatch is allowed silently (display layer handles conversion).
- Validate `tagCatalog`: advisory only — unknown tag values are accepted.
- Validate tag shape:
  - project tags stay in project-level dimensions.
  - pipeline tags stay in pipeline-level dimensions.
  - schedule tags stay in schedule-level dimensions.
- Produce human-readable errors:
  - include project id when available.
  - include pipeline id when available.
  - include schedule id when available.
  - include field path and reason.

Acceptance criteria:

- Valid sample JSON passes.
- Invalid recurrence reports a useful error.
- Missing duration does not fail; it normalizes to 300 seconds.
- Missing project timezone does not fail; it normalizes to `Asia/Taipei`.
- Missing pipeline or schedule timezone is normalized from context.
- Timezone mismatch between pipeline and schedule fails.

## Phase 3: Sample Data And AI Contract

- Create one canonical sample JSON file.
- Include at least:
  - 2 projects.
  - 4 pipelines.
  - at least one pipeline referenced by 2 projects.
  - 3 schedules per pipeline.
  - one simple weekly schedule.
  - one RRULE schedule.
  - one cron expression schedule.
  - one one-time schedule.
- Document AI output rules:
  - raw JSON only.
  - schedule must be under pipeline.
  - project references pipelines by id.
  - pipeline can be reused by multiple projects.
  - default project timezone is `Asia/Taipei`.
  - pipeline and schedule timezone must match.
  - default duration is 300 seconds.
  - schedule is official name; job is only alias.
- Include review flags:
  - `needsReview`
  - `assumptions`

Acceptance criteria:

- Another AI can read the schema doc and produce importable JSON.
- Sample JSON covers all recurrence modes used in V1.

## Phase 4: Normalization Layer

- Implement `normalizeScheduleDocument(doc, viewContext)`.
  - `viewContext` carries: `{ mode: "project" | "pipeline" | "global", id?: string }`
  - `displayTimezone` derived from viewContext: project → `project.timezone`, pipeline → `pipeline.timezone`, global → `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Apply defaults (in this order):
  1. project timezone → `Asia/Taipei`
  2. pipeline timezone → project timezone
  3. schedule timezone → pipeline timezone
  4. duration seconds → `300`
- Derive `pipeline.projectRefs` by inverting all `project.pipelineRefs` — do not read from source JSON.
- Compute inherited tags (schedule direct > pipeline inherited):
  - schedule direct tags take precedence for any field both define.
  - project context is additive (does not override).
- Inject RRULE DTSTART: for `mode: "rrule"`, prepend `DTSTART;TZID={timezone}:{startDate}T{time}:00\n` before passing to rrule library.
- Flatten hierarchy for rendering:
  - produce `CalendarOccurrence` with `projectContexts[]`, `pipelineId`, `scheduleId`, `displayTimezone`, `directTags`, `inheritedTags`.
  - one occurrence per `(pipelineId, scheduleId, scheduledStart)`.

Acceptance criteria additions:
- `pipeline.projectRefs` in source JSON is stripped with a console warning, not an error.
- Same pipeline in two projects produces one `CalendarOccurrence` with two entries in `projectContexts`.
- Filter by project A returns occurrences where `projectContexts` contains project A.

Acceptance criteria:

- Renderer receives flattened schedules.
- Filter logic can access both direct and inherited tags.
- Source JSON is not mutated during normalization.
- Same pipeline can generate occurrences in multiple project contexts.

## Phase 5: Recurrence Expansion

- Implement expansion by visible date range.
- Support one-time schedules.
- Support simple recurrence: daily, weekly (with `byWeekday`), monthly (with `byMonthDay`).
- Support RRULE recurrence (inject DTSTART from normalization before expanding).
- Support cron expression recurrence (interpret in `schedule.timezone`).
- DST handling: preserve UTC instant (absolute). If a cron/rrule occurrence lands in the DST missing hour, drop it silently.
- Respect: resolved schedule timezone, `startDate`, `endDate` (inclusive), `enabled` flag, `durationSeconds`.
- Generate occurrence ids:
  - `pipelineId::scheduleId::scheduledStart` where `scheduledStart` is UTC ISO 8601 with Z suffix.
- Attach metadata:
  - project id/name.
  - pipeline id/name.
  - schedule id/title.
  - direct tags.
  - inherited tags.
  - recurrence mode.

Acceptance criteria:

- Weekly Monday schedule appears on every Monday in visible range.
- Cron expression `0 9 * * 1` renders Mondays at 09:00.
- RRULE weekly Monday renders the same expected visible occurrences.
- Infinite recurrence is never pre-generated outside visible range.

## Phase 6: Calendar UI

> **Scope note (2026-06-25):** Quarter / Half-Year / Year views are deferred to Milestone 2.
> V1 delivers Day / Week / Month only — all natively supported by FullCalendar Community (Calendar tab).
> Rationale: custom multi-month grids would triple Phase 6 scope with unvalidated demand. See `Audit_Assumption_Risk.md` decision U3/F1.

> **Architecture update (2026-06-26):** Dual-tab UI added (ADR-001 + ADR-002).
> Zone A (top ≤33vh) = filters + header + tab switcher.
> Zone B = **Timeline tab** (SVAR React Gantt — Y: Project→Pipeline→Schedule hierarchy, X: continuous time) OR **Calendar tab** (FullCalendar Community — Day/Week/Month).
> Both tabs share the same `filteredOccs` from a single `expandRecurrence` call (365-day window).

- Build the main app shell. Desktop-first (min 1024px). Below 768px: show "Please use a desktop browser" banner.
- Add calendar views (V1 scope — Calendar tab: Day / Week / Month only):
  - Day (FullCalendar timeGridDay).
  - Week (FullCalendar timeGridWeek).
  - Month (FullCalendar dayGridMonth).
- Add Timeline tab (SVAR React Gantt): Y-axis hierarchy (Project → Pipeline → Schedule), X-axis = continuous time, horizontal scroll.
- Add tab switcher in Zone A header: Timeline | Calendar.
- Add navigation: previous, next, today, date picker (updates Gantt X-axis window).
- Render occurrences with density overflow:
  - Month cells: max 3 visible event chips; overflow shows "+N more" expanding inline.
  - Minimum visual duration floor: 30 min (5-min schedules still render as 30-min block).
  - Event chip: schedule title + urgency color + pipeline border stripe.
- Visual coding:
  - Primary color = urgency (critical=red, high=amber, medium=blue, low=gray).
  - Pipeline/project distinction = left border stripe color or event background tint per pipeline.
  - Source type = small icon slot (cron clock, airflow gear, manual hand).
- Add minimal first-run onboarding: hover tooltip on Project / Pipeline / Schedule entity labels.
- Show current date marker. Handle empty states (auto-load sample JSON on first open).

Acceptance criteria:

- Calendar renders sample data in Day / Week / Month views.
- Switching views does not lose data.
- Events remain attached to correct date and time.
- User can hover on entity labels to understand Project vs. Pipeline vs. Schedule.

## Phase 7: Filters And Tag UX

- Add filter panel (collapsible sections, default-open: Project / Pipeline / Urgency):
  - Section 1 — Project: project multi-select.
  - Section 2 — Pipeline: pipeline multi-select, data domain, pipeline type, source system, target system.
  - Section 3 — Schedule: urgency, owner, run type, source type, environment scope, maintenance window, review state, custom tags.
- Filter logic: within one dimension = OR (multi-select); across dimensions = AND.
- Tag inheritance in filter: searching any dimension queries the union of direct + inherited tags.
- Add search-within-filters input above the panel.
- Show active filter count badge on collapsed section headers.
- Support clear all. Show visible occurrence count.
- Active filters survive view-mode changes (day → week → month).
- Distinguish direct vs inherited tags in schedule detail panel (solid chip vs muted/outlined chip).

Acceptance criteria:

- Filtering by project shows all schedules under that project.
- Filtering by pipeline shows schedules under that pipeline.
- Filtering by project-level tag can still reveal schedule occurrences through inherited tags.
- Clearing filters restores full calendar.

## Phase 8: Detail Panel

- Add click behavior on calendar occurrence.
- Detail panel three-zone layout:
  - Zone A (always visible): title, pipeline › project breadcrumb, scheduled start/end in display timezone, original timezone label, urgency badge, run type, duration.
  - Zone B (scrollable): recurrence mode + source rule, direct tags (solid chips), inherited tags (muted/outlined chips), source metadata.
  - Zone C (collapsed "Advanced"): validation placeholder, dependency placeholder, output metadata, assumptions, needsReview, copyable ids (occurrenceId, scheduleId, pipelineId, projectContexts).
- Direct schedule tags and inherited pipeline tags are visually distinguished in Zone B.

Acceptance criteria:

- User can inspect why an occurrence appears.
- User can distinguish direct schedule tags from inherited project/pipeline tags.

## Phase 9: JSON Import Flow

- Provide initial sample-load behavior.
- Add JSON import input:
  - file picker or paste editor.
- Validate before render.
- Display validation errors.
- Keep last valid data visible if new import fails.
- Add export/download current normalized source JSON if practical.

Acceptance criteria:

- Valid JSON replaces the current dashboard.
- Invalid JSON shows actionable errors.
- User is not left with a blank app after failed import.

## Phase 10: Quality Checks

- Add unit tests or focused verification for:
  - default timezone.
  - default duration.
  - hierarchy validation.
  - tag inheritance.
  - simple recurrence.
  - RRULE recurrence.
  - cron recurrence.
- Add build/check command.
- Manually verify:
  - day view.
  - week view.
  - month view.
  - filter by project.
  - filter by inherited tag.
  - detail panel.

Acceptance criteria:

- `npm run check` or equivalent passes.
- Calendar renders without console-breaking errors.
- Sample data demonstrates all V1 capabilities.

## Phase 11: V1 Documentation

- Update README:
  - product purpose.
  - local run instructions.
  - JSON file format.
  - project timezone behavior.
  - default duration behavior.
  - schedule vs job naming.
- Keep PRD and schema docs aligned.
- Add AI prompt example for generating JSON.
- Add known limitations:
  - no drag-and-drop until V1.5.
  - no execution monitoring.
  - no notifications.
  - no database.

Acceptance criteria:

- A reviewer can run the app and understand the V1 boundary.
- A second AI can review the checklist and identify missing implementation details.

## Final V1 Done Criteria

- Local app runs.
- JSON import works.
- Project timezone defaults to `Asia/Taipei`.
- Pipeline and schedule timezone must match.
- Schedule duration defaults to 300 seconds.
- All schedules live under pipelines; projects reference pipelines.
- Pipelines can be reused across projects.
- Simple, RRULE, and cron recurrence render correctly within visible range.
- Calendar supports at least day, week, and month views.
- Filters work across project, pipeline, schedule, and inherited tags.
- Detail panel explains each occurrence.
- Documentation is current.

---

## Post-V1 UX Enhancements (2026-06-26)

Shipped after V1 core was complete. All items: TypeScript 0 errors, 29/29 tests passing.

### M2 Time Scales — ✅ Partial (Quarter + Year done; Half-Year removed)

- ✅ Timeline tab: Week / Month / Quarter / Year presets (localStorage-persisted via `psv-preset`)
- ✅ Calendar tab: multiMonthQuarter (3-month) + multiMonthYear (12-month) added via `@fullcalendar/multimonth`
- ❌ Half-Year view: removed by user decision (too granular between Quarter and Year)
- ⏳ Task grouping by owner / urgency: deferred

### M2 Search & Saved Presets — ✅ Complete

- ✅ Global text search (`filterState.searchText`) — matches schedule title, pipeline name, project name
- ✅ Persistent filter state (localStorage `psv-filter`, Sets serialized as arrays)
- ✅ Persistent active tab (`psv-tab`) and active preset (`psv-preset`)

### M5.5 Mermaid Diagram Panel — ✅ Complete

- ✅ `MermaidPanel.tsx`: Structure (flowchart LR, project subgraphs, classDef coloring) + Dependencies modes
- ✅ Mermaid render fix: replaced `sanitize()` (quoted IDs) with `safeId()` (alphanumeric only) — Structure diagram now renders SVG correctly
- ✅ Pan / zoom canvas: scroll wheel zooms (0.05×–10×), drag to pan, Reset button, zoom% display
- ✅ Copy raw Mermaid syntax button

### M3 JSON Export — ✅ Complete

- ✅ Export JSON button downloads `schedules.json` (raw `ParsedScheduleDocument`, not normalized)

### Schedule Frequency Auto-Filter — ✅ Complete

- ✅ `ScheduleFrequency` type added to `CalendarOccurrence` (`sub-daily | daily | weekly | monthly-or-less`)
- ✅ `classifyScheduleFrequency()` in `expand.ts`: simple→direct map, rrule→FREQ= parse, cron→gap heuristic
- ✅ FullCalendar month / quarter / year views hide `sub-daily` and `daily` schedules by default (Week / Day show all)
- ✅ `fcViewType` tracked from `datesSet` callback; filter applied in `fcEvents` useMemo

### Calendar Event → Popup Modal — ✅ Complete

- ✅ Calendar tab click now renders `OccurrencePopup` (centered modal, backdrop click closes)
- ✅ Timeline tab keeps `DetailPanel` (right-side fixed overlay)
- ✅ `DetailPanel` positioning bug fixed: was off-screen at desktop (flex child rendered below zone-b). Now always `position: fixed; right: 0; top: 52px; bottom: 0`
- ✅ CSS override inside `.occ-popup-card`: resets fixed positioning to static so panel flows in card

### SVAR Gantt Grid Visibility Fix — ✅ Complete

- ✅ Root cause: SVAR requires concrete pixel height — `flex: 1; min-height: 0` on the wrapper was insufficient
- ✅ Fix: `zone-b` changed to `position: relative`; `gantt-wrapper` and `fc-wrapper` changed to `position: absolute; inset: 0`

### Other UX Polish

- ✅ Header meta text shortened from `{proj}p · {pipe}pl · {sched}s · showing X / Y occ · TZ: Asia/Taipei` → `X / Y occ`
- ✅ `datesSet` callback: now captures `arg.view.type` into `fcViewType` state (was no-op before)
