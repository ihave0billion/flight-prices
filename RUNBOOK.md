# Daily Flight-Price Report — Runbook

This is the procedure the scheduled agent runs once per day. Follow it exactly.

## Goal
For each **active** route in `watches.json`, look up the current cheapest
round-trip fare on **Delta (DL)** and **United (UA)**, record it, classify it as
LOW / MID / HIGH against history, and deliver a report.

## Steps

1. **Load routes.** Read `watches.json`. Process only watches with
   `status: "active"`. Merge each watch with `defaults` for any missing field
   (cabin, stops, passengers, airlines, currency).

2. **Collect prices via the `google-flights` MCP.** For each active watch, and
   for each airline in its `airlines` list (DL, UA):
   - Call `search_flights` with: origin, destination, `depart_date`,
     `return_date` (round trip), cabin, passengers, stops, and **filter to that
     single airline** (use the server's airline-include parameter).
   - Take the **cheapest** matching round-trip itinerary.
   - Call `get_price_insights` (or `get_calendar_heatmap`) for the same route to
     read Google's own price level for today: `low`, `typical`, or `high`.
   - Call `get_flight_url` to get a booking link.
   - If an airline has no matching flights, record it with `price: null` and a
     short note.

3. **Write `data/today.json`** in exactly this shape:
   ```json
   {
     "date": "YYYY-MM-DD",
     "observations": [
       {
         "watch_id": "<watch id>",
         "airline": "DL",
         "price": 412,
         "currency": "USD",
         "stops": 1,
         "duration": "8h30m",
         "google_price_level": "typical",
         "url": "https://www.google.com/travel/flights/..."
       }
     ]
   }
   ```
   Use today's date in **US/Eastern**. One observation per (watch × airline).

4. **Generate the report.** Run:
   ```
   node scripts/report.mjs
   ```
   This merges today's prices into `history/<watch_id>.json`, classifies each
   price, writes `reports/<date>.md`, and prints the Markdown report.

5. **Commit the data.**
   ```
   git add history reports
   git commit -m "Daily flight report <date>"
   git push
   ```

6. **Deliver the report (GitHub issue).** For each active watch, post the
   route's section of the report to a GitHub issue titled
   `Flight prices: <ORIGIN>→<DEST> <depart>/<return>`:
   - If an open issue with that title exists, add the report as a new comment.
   - Otherwise create it (label `flight-report`).
   GitHub emails the repo owner automatically.

7. **Stop tracking purchased/paused routes.** For any watch whose `status` is
   `purchased` or `paused`, close its issue (if open) with a short note. Do not
   collect prices for it.

## Classification reference
- **Our level** (computed in `report.mjs`): percentile of today's price within
  our accumulated history for that route+airline. ≤25th = 🟢 LOW, ≤75th =
  🟡 MID, else 🔴 HIGH. Needs ≥2 observations; until then shows `N/A` and we
  lean on Google's level.
- **Google level**: Google Flights' native low/typical/high assessment — usable
  from day one, which covers the cold-start period before our history fills in.
