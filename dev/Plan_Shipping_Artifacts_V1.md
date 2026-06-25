---
name: Shipping Artifacts Plan — V1
generated_by: pm-ai-shipping / shipping-artifacts
date: 2026-06-25
status: PLANNED (produce these docs when V1 implementation is complete)
---

# Shipping Artifacts — V1 Documentation Set

This file defines what documentation must exist before V1 is considered reviewable and shippable.  
These docs live in `documentation/` (create this folder at project root when V1 implementation is underway).

Per the shipping-artifacts protocol: **core docs always; conditional docs only if the capability exists.**

---

## V1 Capability Inventory

Before listing docs, confirm what V1 actually has:

| Capability | Exists in V1? | Impact on doc set |
|---|---|---|
| Authentication / user roles | ❌ No (single local user, no auth) | `permissions.md` is minimal |
| Transactional email | ❌ No | `emails.md` → N/A |
| Server-side scheduled jobs / cron | ❌ No (client-only app) | `cron.md` → N/A |
| Public / SEO-indexed routes | ❌ No (local tool) | `seo.md` → N/A |
| Embedded AI agents / LLM workflows | ❌ No | `automation.md` → N/A |
| Secrets / environment variables | Minimal (no API keys; local JSON only) | `variables.md` is brief |
| User-facing flows with side effects | ✅ JSON import (replaces state) | `flows.md` needed |
| External data dependencies | ✅ user-provided JSON files | |

**V1 doc set = 5 core docs only.** No conditional docs apply.

---

## Core Documents to Produce

### 1. `documentation/architecture.md`

**Purpose:** Root document. What the system is and how it hangs together.

**Must capture:**
- Product overview: read-only schedule visualization; local-first; no backend
- Key assumption: user provides and maintains the JSON file; V1 does not sync with orchestrators
- Tech stack: React + TypeScript + Vite + FullCalendar + rrule + cron-parser + Zod
- Entity model: `Project --pipelineRefs→ Pipeline --owns→ Schedule` (with the key rule: pipeline can appear in multiple projects)
- Data flow: user imports JSON → Zod validates → `normalizeScheduleDocument` → `expandRecurrence(range)` → FullCalendar renders `CalendarOccurrence[]`
- Trust boundaries: everything runs in the browser; no server; no network calls; no data leaves the user's machine
- Known risks / limitations (reference `Audit_Assumption_Risk.md`):
  - JSON import is manual; no live sync
  - Quarter/Half/Year views deferred to Milestone 2
  - No auth; not for multi-user or sensitive pipeline data
- Related documents index (links to all other docs in this set)

**Reviewer use:** Entry point for anyone trying to understand the system before auditing code or reviewing PRs.

---

### 2. `documentation/flows.md`

**Purpose:** The load-bearing user journeys where data changes or trust boundaries are crossed.

**Must capture:**

**Flow 1: JSON Import**
- Actor: User
- Precondition: App is open; a valid (or invalid) JSON file exists
- Steps: User selects file or pastes → Zod parses → if invalid: show errors, keep previous data → if valid: replace app state → calendar re-renders
- Trust boundary: file system → browser memory (no server)
- State change: entire `ScheduleDocument` in React state is replaced
- Failure path: Zod errors displayed, last valid data remains visible (no blank state)

**Flow 2: View Navigation**
- Actor: User  
- Steps: View switcher → FullCalendar view changes → recurrence re-expanded for new date range → occurrences re-rendered
- State: active filters survive view changes; date anchor preserved

**Flow 3: Filter Application**
- Actor: User
- Steps: User selects filter dimension → filter state updates → occurrences filtered (AND across dimensions, OR within) → visible count updates
- Note: inherited tags are included in filter matching (schedule direct + pipeline inherited tags)

**Flow 4: Occurrence Detail Inspection**
- Actor: User
- Steps: User clicks occurrence → detail panel opens → Zone A/B/C content rendered from `CalendarOccurrence` metadata
- No side effects; read-only

**Anti-PRD rule applied:** Flows 2–4 have no permission checks, external side effects, or security surface. Flow 1 is included because it replaces app state.

---

### 3. `documentation/permissions.md`

**Purpose:** Who is allowed to do what.

**Must capture:**
- V1 has no authentication, no user roles, no server
- All operations are local browser operations by the implicit single user
- The only "permission" boundary: the browser's file system access prompt (native OS behavior; not app-controlled)
- Row-level security: N/A
- Access control matrix: N/A for V1 — document that this is intentional and note it as a V1.5+ concern

**Note:** This is intentionally short. Its value is the explicit record that "no auth is a conscious V1 decision" — not an oversight.

---

### 4. `documentation/variables.md`

**Purpose:** Configuration and secrets, mapped to risk.

**Must capture:**

| Name | Used By | Scope | Source | Risk |
|---|---|---|---|---|
| None | — | — | — | No secrets in V1 |

- Confirm: no API keys, no environment variables, no `.env` file
- Confirm: no secret is client-bundled (there are no secrets at all)
- Build-time config only: `vite.config.ts` (port, base path — no sensitive values)
- Pre-go-live checklist: verify no credentials appear in sample JSON files; verify no `console.log` leaking user file contents

---

### 5. `documentation/tests.md`

**Purpose:** Verification map — what's tested, what's proposed, what's a gap.

**Must capture (three sections):**

**Section A — Existing Coverage** (fill in after Phase 10)
- Format: use-case → rule → expected behavior → test file + line → status

**Section B — Proposed Tests** (can be drafted from Phase 10 checklist)

| Use Case | Rule | Expected Behavior | Test Type | Status |
|---|---|---|---|---|
| Default timezone | Missing project timezone → `Asia/Taipei` | Project normalizes with `Asia/Taipei` | Unit (normalizeScheduleDocument) | Proposed |
| Default duration | Missing `durationSeconds` → 300 | `CalendarOccurrence.durationSeconds === 300` | Unit | Proposed |
| Timezone mismatch | Pipeline tz ≠ schedule tz | Zod error with ids | Unit (Zod schema) | Proposed |
| Simple weekly recurrence | `mode: "simple"`, `frequency: "weekly"`, `byWeekday: ["MO"]` | Occurrences on every Monday in range | Unit (expandRecurrence) | Proposed |
| RRULE recurrence | `mode: "rrule"`, DTSTART injected | Same occurrences as simple weekly | Unit | Proposed |
| Cron recurrence | `0 9 * * 1` — Monday 09:00 | Occurrences every Monday at 09:00 | Unit | Proposed |
| Shared pipeline | One pipeline in 2 projects | 1 occurrence with `projectContexts.length === 2` | Unit (normalize) | Proposed |
| Import invalid JSON | Schema violation | Error displayed; previous data retained | Integration (React component) | Proposed |
| Filter by project | Filter project A | Only occurrences with project A in `projectContexts` | Integration | Proposed |
| Tag inheritance | Pipeline tag propagates to occurrence | Filter on pipeline tag returns schedule occurrence | Integration | Proposed |

**Section C — Gaps** (documented rules with no test)
- Fill in after Phase 10 to identify unverified rules

**CI requirement:** `npm run check` (TypeScript) must pass before merge. Unit tests on normalization and recurrence are blocking for V1 done criteria.

---

## Production Checklist

Before calling V1 "shippable":

- [ ] `documentation/architecture.md` written and accurate to final implementation
- [ ] `documentation/flows.md` matches actual app behavior (not the spec — the code)
- [ ] `documentation/permissions.md` confirms no-auth is explicit and intentional
- [ ] `documentation/variables.md` confirms no secrets
- [ ] `documentation/tests.md` Section A filled in (existing tests documented)
- [ ] `npm run check` passes
- [ ] `npm run build` produces artifact without errors
- [ ] Sample JSON imports cleanly with zero Zod errors
- [ ] Manual verification checklist in Phase 10 completed

---

## What This Set Excludes (and Why)

| Doc | Excluded Because |
|---|---|
| `emails.md` | V1 sends no email |
| `cron.md` | V1 has no server-side scheduled jobs |
| `seo.md` | V1 is a local tool, not publicly indexed |
| `automation.md` | V1 has no embedded AI agents or LLM calls |
