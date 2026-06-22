# ✈️ flight-prices

Daily price tracker for **Delta** and **United** round-trip fares, designed to
run as a scheduled Claude Code agent (claude.ai/code, "always on").

Each day it looks up the cheapest DL and UA round-trip fare for every route you
track, records it, and tells you whether the current price is **🟢 LOW / 🟡 MID /
🔴 HIGH** — based on the price history we accumulate plus Google Flights' own
price insight. Results are delivered as a GitHub issue (which emails you) and
archived as a Markdown report.

## Quick start

1. **Connect the MCP** in claude.ai/code: the `google-flights` server is already
   declared in `.mcp.json` (runs via `npx`, no API key). Approve it once.
2. **Add a route** to `watches.json`:
   ```json
   {
     "id": "ord-lax-fall",
     "origin": "ORD",
     "destination": "LAX",
     "depart_date": "2026-09-10",
     "return_date": "2026-09-17",
     "status": "active"
   }
   ```
3. The scheduled job runs every morning (07:00 US/Eastern) and posts the report.

## Managing routes
- **Stop after booking:** set the watch's `status` to `"purchased"` (or delete
  it). Tracking stops and its issue is closed.
- **Pause:** set `status` to `"paused"`.

## Layout
| Path | Purpose |
|---|---|
| `watches.json` | Routes to track |
| `.mcp.json` | google-flights MCP connection |
| `scripts/report.mjs` | Merges prices, classifies LOW/MID/HIGH, renders report |
| `history/<id>.json` | Durable per-route price log (committed daily) |
| `reports/<date>.md` | Dated reports |
| `RUNBOOK.md` | Exact daily procedure for the agent |

See [CLAUDE.md](CLAUDE.md) and [RUNBOOK.md](RUNBOOK.md) for details.
