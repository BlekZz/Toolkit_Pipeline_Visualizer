# Permissions

> Status: complete for V1 — no auth exists; this documents the intentional absence.

## V1 Access Model

V1 has no authentication, no user roles, and no server.

All operations are local browser operations by the implicit single user on their own machine.

| Dimension | V1 State |
|---|---|
| Authentication | None — no login, no session, no token |
| Authorization | None — single implicit user; all operations permitted |
| Roles / claims | None |
| Row-level security | N/A (no database) |
| Network access | None — app makes no outbound requests |
| Data storage | None — all state is in-memory; cleared on page refresh |
| File system | Read-only via browser FileReader API (user-initiated file pick only) |

## Why This Is Intentional

V1 is a local developer tool for a single user managing their own pipeline schedule JSON.
The absence of auth is a **deliberate V1 boundary**, not an oversight.

Relevant future milestone: Milestone 7 (Server and Collaboration) introduces auth, multi-user, and hosted deployment.

## Trust Model

The only external input V1 accepts is the user's JSON file.

Zod validation is the sole trust boundary:
- Malformed JSON → parse error shown; app state unchanged
- Schema violations → Zod error list shown; app state unchanged
- Valid JSON → loaded into React state; runs entirely in the browser

There is no way for a JSON file to make an outbound network request, access other files, or persist data beyond the current browser session.

## Pre-Go-Live Checklist

- [x] Confirm no credentials, API keys, or personal data appear in sample JSON files checked into the repo
- [x] Confirm no `console.log` statements output user file contents
- [x] Confirm no third-party analytics or telemetry are bundled
