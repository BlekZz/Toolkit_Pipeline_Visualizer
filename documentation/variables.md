# Variables

> Status: complete for V1 — no secrets exist; this documents the intentional absence.

## Secret / Configuration Inventory

| Name | Used By | Scope | Source | Risk |
|---|---|---|---|---|
| — | — | — | — | No secrets in V1 |

V1 has no API keys, no environment variables, no `.env` file, and no backend.

## Build-Time Configuration

The only configuration that exists is in `vite.config.ts`:

| Setting | Purpose | Sensitive? |
|---|---|---|
| `server.port` | Local dev port (default 5173) | No |
| `base` | Public URL base path for production build | No |

No sensitive values appear in build config.

## Explicit Confirmations

- No secret is bundled client-side (there are no secrets at all)
- No API key, token, or credential exists in the codebase
- No `.env` file is required to run the app
- Sample JSON files in `src/data/` contain synthetic data only — no real pipeline metadata, real usernames, or real system credentials

## Pre-Go-Live Checklist

- [ ] `grep -r "password\|secret\|apiKey\|api_key\|token" src/` returns no results (excluding test fixtures)
- [ ] No `.env` file committed to the repo
- [ ] `vite.config.ts` contains no hardcoded URLs pointing to internal systems

## Future: V1.5+ / Milestone 7

When a backend is introduced (Milestone 7), this document must be updated to cover:
- Backend API keys / database credentials
- Session management / JWT secrets
- Deployment environment variables
- Rotation policy
