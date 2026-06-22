#!/usr/bin/env node
// Posts the per-route flight-price reports to GitHub issues, one issue per
// route. Reads data/issues.json (produced by report.mjs) and watches.json.
//
// - For each route reported today: comment on its existing open issue, or
//   create the issue if none exists.
// - For each watch marked `purchased` or `paused`: close its open issue.
//
// Requires the `gh` CLI authenticated via the GH_TOKEN env var (set by the
// GitHub Actions workflow). Run after report.mjs.

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function findOpenIssue(title) {
  const out = gh([
    "issue", "list", "--state", "open", "--limit", "100",
    "--search", `${title} in:title`, "--json", "number,title",
  ]);
  const list = JSON.parse(out);
  const hit = list.find((i) => i.title === title);
  return hit ? hit.number : null;
}

function writeTmp(body) {
  const dir = mkdtempSync(join(tmpdir(), "flt-"));
  const f = join(dir, "body.md");
  writeFileSync(f, body);
  return f;
}

function issueTitleFor(watch) {
  return watch.origin
    ? `Flight prices: ${watch.origin}→${watch.destination} ${watch.depart_date}/${watch.return_date}`
    : `Flight prices: ${watch.id}`;
}

const issues = readJson(join(ROOT, "data", "issues.json"), []);
const watchesDoc = readJson(join(ROOT, "watches.json"), { watches: [] });

// Post / update active routes.
for (const item of issues) {
  const bodyFile = writeTmp(item.body);
  const existing = findOpenIssue(item.issue_title);
  if (existing) {
    gh(["issue", "comment", String(existing), "--body-file", bodyFile]);
    console.log(`Commented on #${existing}: ${item.issue_title}`);
  } else {
    const out = gh([
      "issue", "create", "--title", item.issue_title, "--body-file", bodyFile,
    ]);
    console.log(`Created issue: ${item.issue_title}\n${out.trim()}`);
  }
}

// Close issues for purchased / paused routes.
for (const w of watchesDoc.watches || []) {
  if (w.status === "purchased" || w.status === "paused") {
    const title = issueTitleFor(w);
    const n = findOpenIssue(title);
    if (n) {
      gh([
        "issue", "close", String(n),
        "--comment", `Tracking stopped (watch status: ${w.status}).`,
      ]);
      console.log(`Closed #${n} (${w.status}): ${title}`);
    }
  }
}
