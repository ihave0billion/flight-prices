# flight-prices

Daily flight-price tracker for **Delta** and **United** round-trip fares, built
to run as a scheduled (cron) Claude Code agent.

## How it works
- `watches.json` — the routes to track (origin, destination, round-trip dates,
  per-route cabin/stops/passengers, and a `status` field). Only `active`
  watches are processed.
- `.mcp.json` — connects the `google-flights` MCP server (via `npx`, no API key)
  used to look up live prices.
- `scripts/report.mjs` — deterministic: merges today's prices into history,
  classifies each as 🟢 LOW / 🟡 MID / 🔴 HIGH, renders the Markdown report.
- `history/<watch_id>.json` — the durable price log (committed daily). This is
  the source of truth for historical classification, **not** the MCP's local
  SQLite (which does not survive a fresh cloud sandbox).
- `reports/<date>.md` — the dated reports.

## Daily job
See **RUNBOOK.md** for the exact step-by-step the scheduled agent must follow.

## Managing routes
- **Add a route:** add an entry to `watches.json` with `status: "active"`.
- **Stop after booking:** set that watch's `status` to `"purchased"` (or delete
  it). The job stops tracking it and closes its GitHub issue.
- **Pause temporarily:** set `status` to `"paused"`.

## Conventions
- All dates are **US/Eastern**.
- Airlines are referenced by IATA code: `DL` = Delta, `UA` = United.
