#!/usr/bin/env node
/**
 * render-report-header — output the canonical report.md header + `## Score`
 * section from a score JSON object. Saves the model from re-emitting the
 * standard boilerplate (header fields, JSON fencing, section labels) on
 * every evaluation.
 *
 * Typical usage from an agent:
 *
 *   # 1. Emit the score JSON per _shared.md
 *   # 2. Save it to /tmp/score.json (or pipe via stdin)
 *   # 3. Generate the header + score section:
 *        node scripts/render-report-header.mjs < /tmp/score.json > /tmp/header.md
 *   # 4. Append Blocks A-F + Extracted Keywords to /tmp/header.md
 *   # 5. Write the final file to reports/{num}-{slug}-{date}.md
 *
 * Input: JSON on stdin (or --score-json <path>) matching the schema in
 * `modes/_shared.md` → "Score Emission — EMIT-ONCE JSON".
 *
 * Output (to stdout): markdown starting with the `# Evaluation:` line and
 * ending right before `## A) Role Summary` (which the caller appends).
 */

import { readFileSync } from 'fs';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const scoreFile = arg('score-json');
let raw;
if (scoreFile) {
  raw = readFileSync(scoreFile, 'utf-8');
} else if (!process.stdin.isTTY) {
  raw = readFileSync(0, 'utf-8');
} else {
  console.error('usage: render-report-header [--score-json <path>] (or pipe JSON via stdin)');
  process.exit(2);
}

let score;
try {
  score = JSON.parse(raw);
} catch (e) {
  console.error(`invalid score JSON: ${e.message}`);
  process.exit(2);
}

const required = ['report_num', 'company', 'role', 'archetype', 'url', 'date', 'weighted_total'];
const missing = required.filter(k => score[k] === undefined);
if (missing.length) {
  console.error(`score JSON is missing required fields: ${missing.join(', ')}`);
  process.exit(2);
}

const pdfNote = score.pdf_threshold_met ? 'pending' : 'below threshold — no PDF';

process.stdout.write(`# Evaluation: ${score.company} — ${score.role}

**Date:** ${score.date}
**Archetype:** ${score.archetype}
**Score:** ${Number(score.weighted_total).toFixed(1)}/5
**URL:** ${score.url}
**PDF:** ${pdfNote}

---

## Score

\`\`\`json
${JSON.stringify(score, null, 2)}
\`\`\`

---

`);
