# tech-notes

Flat scratchpad for cross-session debugging notes (no `Prefix_` naming — see `~/.claude/CLAUDE.md` §5 exceptions).

> Global technotes pointers: `~/.claude/technotes/windows.md`、`~/.claude/technotes/git.md`（SSOT 在池，本檔不複製池內容）

## 2026-07-03 — A14 (metabase MCP fix) not applicable to this project

`~/.claude/dev/Plan_ai_stack_optimization_actions.md` A14 and
`~/.claude/dev/Audit_ai_stack_usage_insight.md` Part 4.2 state that **both** ERP_ETL_Pipeline
and Toolkit_Pipeline_Visualizer have a `.mcp.json` with an inconsistent/broken `metabase` server
definition (npx vs. local `node`, missing `--all`, race condition on dual spawn).

Verified in this repo (2026-07-03):
- No `.mcp.json` at project root, and `git log --all -- .mcp.json` shows it was **never
  committed** at any point in this repo's history.
- No `mcp/` vendor directory, no `@cognitionai/metabase-mcp-server` under `node_modules`.
- No `.env` file, and `.gitignore` has no historical entry suggesting one existed and was
  removed.
- `.claude/settings.json` only lists PM plugins (`pm-execution`, `pm-ai-shipping`,
  `pm-product-discovery`) — no MCP config there either.
- Project scope confirms this is expected: per `CLAUDE.md` "V1 Boundaries", this app is
  **read-only, no database** — there is no reason for a Metabase MCP integration here.

**Conclusion**: the audit's claim of a metabase MCP in this project is not reproducible.
No `.mcp.json` was created and no launcher wrapper was added — per A14's own instruction
("如實記錄，不要硬改到過"), fabricating a metabase integration for a project with no database
would be scope creep beyond what the codebase justifies. If a future project need does require
Metabase, follow the canonical pattern already established in
`C:\Users\lolz_\Desktop\ERP_ETL_Pipeline\.mcp.json` (local `node` + `--all` + `dev/script/claude-mcp.ps1`
launcher) rather than the previous npx-based per-project drift.

A13 (persona agent cleanup) was confirmed already complete for this project — see
`CLAUDE.md` "Active Agents" section, dated 2026-07-03, and all 6 files under
`.claude/agents/` carry valid `model:`/`tools:` frontmatter from `bench_awesome-toolkit`.
