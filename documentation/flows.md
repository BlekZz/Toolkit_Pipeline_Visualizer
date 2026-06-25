# Flows

> Status: V1 complete — verified against implementation as of 2026-06-26.

Only flows that touch state changes, trust-boundary crossings, or data integrity are documented here.
Read-only navigation (scrolling, resizing) is not a load-bearing flow.

---

## Flow 1: JSON Import

**Actor:** User  
**Precondition:** App is open. User has a JSON file or JSON text.  
**Success outcome:** Calendar renders the new schedule data.

| Step | Layer | Notes |
|---|---|---|
| 1 | UI | User opens Import panel → selects file via native file picker (or pastes text) |
| 2 | Browser → App | File read via FileReader API → raw JSON string in memory |
| **Trust boundary** | File system → browser | Native OS file access prompt; app does not request network permissions |
| 3 | Validation | `Zod.safeParse(rawJson)` → `ScheduleDocument` |
| 4a | If **invalid** | Show Zod error messages (with project/pipeline/schedule ids and field paths); **keep previous valid data visible** — no blank state |
| 4b | If **valid** | Replace React state with new `ScheduleDocument`; proceed to normalization |
| 5 | Normalization | `normalizeScheduleDocument(doc, viewContext)` → apply defaults, derive projectRefs, inject DTSTART, compute tag inheritance |
| 6 | Expansion | `expandRecurrence(occurrences, visibleRange)` → `CalendarOccurrence[]` for current view range only |
| 7 | Render | FullCalendar re-renders with new occurrences; active filters re-applied |

**State change:** entire `ScheduleDocument` in React state is replaced (or unchanged on validation failure).  
**Side effects:** none — no network call, no persistence, no file write.

---

## Flow 2: Calendar View Navigation

**Actor:** User  
**Precondition:** Valid data is loaded.  
**Success outcome:** Calendar shows occurrences for the new view/date without data loss.

| Step | Layer | Notes |
|---|---|---|
| 1 | UI | User clicks view switcher (Day / Week / Month) or navigation (prev / next / today / date picker) |
| 2 | State | Active view and date anchor update in React state |
| 3 | Expansion | Recurrence re-expanded for new visible range only |
| 4 | Render | FullCalendar re-renders; active filters preserved; date anchor preserved across view type changes |

**State change:** view context and date anchor only — `ScheduleDocument` untouched.  
**Side effects:** none.

**Boundary note:** display timezone updates when view context changes (e.g. switching from single-project view to global view changes display timezone to browser local).

---

## Flow 3: Filter Application

**Actor:** User  
**Precondition:** Valid data loaded; calendar visible.  
**Success outcome:** Calendar shows only occurrences matching the active filters.

| Step | Layer | Notes |
|---|---|---|
| 1 | UI | User selects values in filter panel (Project / Pipeline / Urgency / tag dimensions) |
| 2 | State | Filter state updates |
| 3 | Filter logic | Within one dimension: OR (multi-select). Across dimensions: AND. |
| 4 | Tag matching | Filter queries union of `occurrence.directTags + occurrence.inheritedTags` — a schedule with inherited `dataDomain: revenue` matches a `dataDomain = revenue` filter even if the schedule has no direct dataDomain. |
| 5 | Render | FullCalendar re-renders filtered occurrences; visible count badge updates |

**State change:** filter state only.  
**Side effects:** none.  
**Persistence:** active filters survive view-mode changes (Day → Week → Month).

---

## Flow 4: Occurrence Detail Inspection

**Actor:** User  
**Precondition:** At least one occurrence visible on calendar.  
**Success outcome:** User sees full metadata for the clicked occurrence.

| Step | Layer | Notes |
|---|---|---|
| 1 | UI | User clicks a calendar event chip |
| 2 | State | Detail panel opens; selected `occurrenceId` set in state |
| 3 | Render | Detail panel renders from `CalendarOccurrence` metadata (no re-fetch, no re-expand) |

**Detail panel zones:**
- Zone A (always visible): title, pipeline › project breadcrumb, scheduled start/end in display timezone, original `schedule.timezone` label, urgency badge, run type, duration
- Zone B (scrollable): recurrence mode + source rule, direct tags (solid chips), inherited tags (muted/outlined chips), source metadata
- Zone C (collapsed "Advanced"): dependency placeholder, output metadata, `assumptions`, `needsReview`, copyable ids (`occurrenceId`, `scheduleId`, `pipelineId`, `projectContexts[]`)

**State change:** panel open/close state only.  
**Side effects:** none — read-only.

---

## Out of Scope for V1

The following flows are intentionally absent:

| Flow | Why absent |
|---|---|
| Edit / drag-and-drop occurrence | V1.5+ |
| Save / export modified JSON | Milestone 3 |
| Run status overlay | Milestone 6 |
| Authentication / login | Milestone 7 |
