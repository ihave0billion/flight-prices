#!/usr/bin/env node
// Daily flight-price report generator.
//
// Reads today's observations (collected from the google-flights MCP by the
// daily agent and written to data/today.json), merges them into the per-route
// price history under history/, classifies each price as LOW / MID / HIGH based
// on our accumulated history, and renders a Markdown report to reports/<date>.md.
// The rendered report is also printed to stdout so the agent can post it as a
// GitHub issue body.
//
// Usage: node scripts/report.mjs [YYYY-MM-DD]
//   The date arg is optional; defaults to data/today.json's "date" field.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_DIR = join(ROOT, "history");
const REPORTS_DIR = join(ROOT, "reports");
const TODAY_FILE = join(ROOT, "data", "today.json");
const WATCHES_FILE = join(ROOT, "watches.json");

const AIRLINE_NAMES = { DL: "Delta", UA: "United" };

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function historyPath(watchId) {
  return join(HISTORY_DIR, `${watchId}.json`);
}

// Merge one observation into a route's history, replacing any prior entry with
// the same date+airline (so re-running a day is idempotent).
function mergeObservation(history, obs) {
  const filtered = history.filter(
    (h) => !(h.date === obs.date && h.airline === obs.airline)
  );
  filtered.push(obs);
  filtered.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return filtered;
}

// Classify today's price against the historical distribution for this
// route+airline. Returns { level, percentile, isLowestSeen, n }.
function classify(history, obs) {
  const series = history
    .filter((h) => h.airline === obs.airline && typeof h.price === "number")
    .map((h) => h.price);
  const n = series.length;
  if (n <= 1) {
    return { level: "N/A", percentile: null, isLowestSeen: true, n };
  }
  const below = series.filter((p) => p < obs.price).length;
  const percentile = below / series.length; // 0 = cheapest we've seen
  let level;
  if (percentile <= 0.25) level = "LOW";
  else if (percentile <= 0.75) level = "MID";
  else level = "HIGH";
  const priorMin = Math.min(...series.filter((p) => p !== obs.price), Infinity);
  const isLowestSeen = obs.price <= priorMin;
  return { level, percentile, isLowestSeen, n };
}

// Direction vs the most recent prior observation for this route+airline.
function trend(history, obs) {
  const prior = history
    .filter((h) => h.airline === obs.airline && h.date < obs.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!prior) return { arrow: "—", delta: null };
  const delta = obs.price - prior.price;
  const arrow = delta < 0 ? "↓" : delta > 0 ? "↑" : "→";
  return { arrow, delta };
}

function levelEmoji(level) {
  return { LOW: "🟢", MID: "🟡", HIGH: "🔴", "N/A": "⚪" }[level] || "⚪";
}

function googleEmoji(g) {
  return { low: "🟢", typical: "🟡", high: "🔴" }[g] || "⚪";
}

function fmtMoney(p, ccy = "USD") {
  if (typeof p !== "number") return "—";
  const sym = ccy === "USD" ? "$" : "";
  return `${sym}${p.toLocaleString("en-US")}`;
}

function fmtPct(p) {
  return p === null ? "—" : `${Math.round(p * 100)}th`;
}

function main() {
  const today = readJson(TODAY_FILE, null);
  if (!today || !Array.isArray(today.observations)) {
    console.error(
      "No data/today.json with an observations[] array. The daily agent must collect prices first."
    );
    process.exit(1);
  }
  const date = process.argv[2] || today.date;
  if (!date) {
    console.error("No date provided and none in data/today.json.");
    process.exit(1);
  }

  const watchesDoc = readJson(WATCHES_FILE, { watches: [] });
  const watchById = Object.fromEntries((watchesDoc.watches || []).map((w) => [w.id, w]));

  ensureDir(HISTORY_DIR);
  ensureDir(REPORTS_DIR);

  // Group observations by watch.
  const byWatch = {};
  for (const obs of today.observations) {
    obs.date = date;
    (byWatch[obs.watch_id] ||= []).push(obs);
  }

  const sections = [];
  let goodDeals = 0;

  for (const [watchId, observations] of Object.entries(byWatch)) {
    let history = readJson(historyPath(watchId), []);
    const watch = watchById[watchId] || {};
    const ccy = watch.currency || watchesDoc.defaults?.currency || "USD";

    const rows = [];
    for (const obs of observations) {
      history = mergeObservation(history, obs);
    }
    // Classify against the merged history (which now includes today).
    for (const obs of observations.sort((a, b) =>
      (a.airline > b.airline ? 1 : -1)
    )) {
      const c = classify(history, obs);
      const t = trend(history, obs);
      if (c.level === "LOW" || obs.google_price_level === "low") goodDeals++;
      const series = history
        .filter((h) => h.airline === obs.airline && typeof h.price === "number")
        .map((h) => h.price);
      const lo = Math.min(...series);
      const hi = Math.max(...series);
      const flags = [];
      if (c.isLowestSeen && c.n > 1) flags.push("**lowest seen!**");
      rows.push(
        `| ${AIRLINE_NAMES[obs.airline] || obs.airline} | ${fmtMoney(obs.price, ccy)} | ` +
          `${levelEmoji(c.level)} ${c.level} | ${googleEmoji(obs.google_price_level)} ${obs.google_price_level || "—"} | ` +
          `${t.arrow}${t.delta !== null ? " " + fmtMoney(Math.abs(t.delta), ccy) : ""} | ` +
          `${fmtMoney(lo, ccy)} / ${fmtMoney(hi, ccy)} | ${obs.stops ?? "—"} | ` +
          `${obs.url ? `[book](${obs.url})` : "—"} |`
      );
    }

    writeFileSync(historyPath(watchId), JSON.stringify(history, null, 2) + "\n");

    const title = watch.origin
      ? `${watch.origin} → ${watch.destination}  (${watch.depart_date} → ${watch.return_date})`
      : watchId;
    sections.push(
      `### ${title}\n\n` +
        `| Airline | Price | Our level | Google | Trend | Low/High seen | Stops | Link |\n` +
        `|---|---|---|---|---|---|---|---|\n` +
        rows.join("\n")
    );
  }

  const header =
    `# ✈️ Flight Price Report — ${date}\n\n` +
    `Tracking **Delta** and **United** round-trip fares. ` +
    `Levels are based on our accumulated price history (🟢 LOW = bottom 25%, 🟡 MID, 🔴 HIGH = top 25%) ` +
    `plus Google's own price insight.\n\n` +
    (goodDeals > 0
      ? `> 🟢 **${goodDeals} fare(s) flagged LOW today — possible good time to buy.**\n\n`
      : `> No fares are at a low point today.\n\n`);

  const md = header + sections.join("\n\n") + "\n";
  const outPath = join(REPORTS_DIR, `${date}.md`);
  writeFileSync(outPath, md);
  process.stdout.write(md);
  console.error(`\nWrote ${outPath} and updated history for ${Object.keys(byWatch).length} route(s).`);
}

main();
