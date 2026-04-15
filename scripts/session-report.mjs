#!/usr/bin/env node
/**
 * session-report — print a token/cost summary for the most-recent session(s)
 * and WARN if any session exceeded the cost budget.
 *
 * Ideal for a shell wrapper around `opencode`:
 *   opencode "$@"
 *   job-forge session-report --since-minutes 30
 *
 * Or at the end of a batch run (already wired into batch-runner.sh).
 *
 * Exits 0 always; prints warnings to stderr, summary to stdout.
 *
 * Usage:
 *   job-forge session-report                     # last 1 day
 *   job-forge session-report --since-minutes 30  # only sessions started in last 30 min
 *   job-forge session-report --warn-at 1.00      # warn threshold in dollars (default 1.00)
 *   job-forge session-report --log               # also append to data/token-usage.tsv
 */

import { execSync } from 'child_process';
import { existsSync, appendFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const OPENCODE = process.env.OPENCODE_BIN || '/Users/charlie/.opencode/bin/opencode';

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) return def;
  return process.argv[i + 1];
}

const SINCE_MIN = parseInt(arg('since-minutes', '1440'), 10);  // default 24h
const WARN_AT = parseFloat(arg('warn-at', '1.00'));
const LOG = process.argv.includes('--log');

const cutoffMs = Date.now() - SINCE_MIN * 60_000;

function query(sql) {
  const cmd = `cd "${PROJECT_DIR}" && "${OPENCODE}" db "${sql.replace(/"/g, '\\"')}" --format json 2>/dev/null`;
  try {
    const out = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
    return out ? JSON.parse(out) : [];
  } catch { return []; }
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtCost(n) { return `$${n.toFixed(4)}`; }

const sessions = query(`
  SELECT
    s.id,
    s.title,
    s.time_created,
    SUM(json_extract(m.data, '$.tokens.input')) as total_input,
    SUM(json_extract(m.data, '$.tokens.output')) as total_output,
    SUM(json_extract(m.data, '$.tokens.cache.read')) as total_cache_read,
    SUM(json_extract(m.data, '$.cost')) as total_cost,
    COUNT(CASE WHEN json_extract(m.data, '$.tokens.input') > 0 THEN 1 END) as msg_count
  FROM session s
  JOIN message m ON m.session_id = s.id
  WHERE s.time_created >= ${cutoffMs}
    AND json_extract(m.data, '$.role') = 'assistant'
  GROUP BY s.id
  ORDER BY s.time_created DESC
`);

if (!sessions.length) {
  console.log(`No sessions in the last ${SINCE_MIN} minutes.`);
  process.exit(0);
}

let totalCost = 0;
let totalMsgs = 0;
let warned = 0;
const expensive = [];

console.log(`\nSessions in the last ${SINCE_MIN} minutes (${sessions.length}):`);
console.log('─'.repeat(80));
for (const s of sessions) {
  totalCost += s.total_cost || 0;
  totalMsgs += s.msg_count || 0;
  if ((s.total_cost || 0) > WARN_AT) {
    warned++;
    expensive.push(s);
  }
  const title = (s.title || '(untitled)').slice(0, 50);
  console.log(
    `  ${fmtCost(s.total_cost || 0).padStart(9)}  ${title.padEnd(52)}  ${fmtNum(s.total_input || 0).padStart(6)} in, ${fmtNum(s.total_cache_read || 0).padStart(6)} cache, ${String(s.msg_count || 0).padStart(3)} msgs`
  );
}
console.log('─'.repeat(80));
console.log(`  Total: ${fmtCost(totalCost)} across ${totalMsgs} messages\n`);

if (warned) {
  console.error(`⚠️  ${warned} session(s) exceeded $${WARN_AT.toFixed(2)} budget:`);
  for (const s of expensive) {
    console.error(`   ${fmtCost(s.total_cost || 0)}  ${(s.title || '(untitled)').slice(0, 60)}  (id: ${s.id})`);
  }
  console.error(`   Drill in with: npx job-forge tokens --session <id>`);
  console.error(`   If a single session > $1 shows high cache_creation on most messages,`);
  console.error(`   the orchestrator likely didn't delegate — tighten AGENTS.md routing.\n`);
}

if (LOG) {
  const logFile = join(PROJECT_DIR, 'data', 'token-usage.tsv');
  const header = 'date\ttime\tsession_id\ttitle\tmessages\tinput_tokens\tcache_read\tcost\n';
  if (!existsSync(logFile)) writeFileSync(logFile, header, 'utf-8');
  for (const s of sessions) {
    const d = new Date(s.time_created);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 19);
    const row = [
      date, time, s.id,
      (s.title || '').replace(/\t/g, ' '),
      s.msg_count || 0,
      s.total_input || 0,
      s.total_cache_read || 0,
      (s.total_cost || 0).toFixed(4),
    ].join('\t') + '\n';
    appendFileSync(logFile, row);
  }
  console.log(`Logged ${sessions.length} session(s) to ${logFile}`);
}
