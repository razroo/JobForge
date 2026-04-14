#!/usr/bin/env node
/**
 * token-usage-report.mjs — Query opencode's SQLite DB for per-session token usage.
 *
 * Outputs a day-by-day breakdown of sessions, tokens, cost, and model usage.
 * Helps identify which sessions / models are consuming the most tokens.
 *
 * Usage:
 *   node scripts/token-usage-report.mjs                  # last 7 days
 *   node scripts/token-usage-report.mjs --days 1         # today only
 *   node scripts/token-usage-report.mjs --days 30        # last 30 days
 *   node scripts/token-usage-report.mjs --tsv            # TSV output for data/token-usage.tsv
 *   node scripts/token-usage-report.mjs --session <id>   # drill into one session
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Consumer's project dir (for locating data/token-usage.tsv).
const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const OPENCODE = process.env.OPENCODE_BIN || '/Users/charlie/.opencode/bin/opencode';

// ---------- CLI args ----------

const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function flagVal(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const DAYS = parseInt(flagVal('days') || '7', 10);
const TSV_MODE = flag('tsv');
const SESSION_ID = flagVal('session');
const APPEND_LOG = flag('append');

// ---------- Helpers ----------

function query(sql) {
  const cmd = `cd "${PROJECT_DIR}" && "${OPENCODE}" db "${sql.replace(/"/g, '\\"')}" --format json 2>/dev/null`;
  try {
    const out = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
    return out ? JSON.parse(out) : [];
  } catch {
    return [];
  }
}

function fmtNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n) { return `$${n.toFixed(4)}`; }

function epochToDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function epochToTime(ms) {
  return new Date(ms).toISOString().slice(11, 19);
}

// ---------- Queries ----------

const cutoffMs = Date.now() - DAYS * 86400000;

if (SESSION_ID) {
  // Drill into one session: show per-message token breakdown
  const messages = query(`
    SELECT
      json_extract(data, '$.tokens.input') as input_tokens,
      json_extract(data, '$.tokens.output') as output_tokens,
      json_extract(data, '$.tokens.cache.read') as cache_read,
      json_extract(data, '$.tokens.cache.write') as cache_write,
      json_extract(data, '$.cost') as cost,
      json_extract(data, '$.modelID') as model,
      json_extract(data, '$.providerID') as provider,
      time_created
    FROM message
    WHERE session_id = '${SESSION_ID}'
      AND json_extract(data, '$.tokens.input') > 0
    ORDER BY time_created ASC
  `);

  const session = query(`SELECT title, time_created FROM session WHERE id = '${SESSION_ID}'`);
  const title = session[0]?.title || SESSION_ID;
  const created = session[0]?.time_created ? epochToDate(session[0].time_created) : '?';

  console.log(`\nSession: ${title}`);
  console.log(`Date: ${created}  |  Messages with tokens: ${messages.length}`);
  console.log('─'.repeat(110));
  console.log(
    'Time'.padEnd(10),
    'Model'.padEnd(25),
    'Input'.padStart(10),
    'Output'.padStart(10),
    'CacheRd'.padStart(10),
    'CacheWr'.padStart(10),
    'Cost'.padStart(10),
    'CumCost'.padStart(10),
  );
  console.log('─'.repeat(110));

  let cumCost = 0;
  for (const m of messages) {
    cumCost += m.cost || 0;
    console.log(
      epochToTime(m.time_created).padEnd(10),
      `${m.provider}/${m.model}`.padEnd(25),
      fmtNum(m.input_tokens || 0).padStart(10),
      fmtNum(m.output_tokens || 0).padStart(10),
      fmtNum(m.cache_read || 0).padStart(10),
      fmtNum(m.cache_write || 0).padStart(10),
      fmtCost(m.cost || 0).padStart(10),
      fmtCost(cumCost).padStart(10),
    );
  }

  const totals = messages.reduce((acc, m) => {
    acc.input += m.input_tokens || 0;
    acc.output += m.output_tokens || 0;
    acc.cacheRead += m.cache_read || 0;
    acc.cacheWrite += m.cache_write || 0;
    acc.cost += m.cost || 0;
    return acc;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });

  console.log('─'.repeat(110));
  console.log(
    'TOTAL'.padEnd(10),
    ''.padEnd(25),
    fmtNum(totals.input).padStart(10),
    fmtNum(totals.output).padStart(10),
    fmtNum(totals.cacheRead).padStart(10),
    fmtNum(totals.cacheWrite).padStart(10),
    fmtCost(totals.cost).padStart(10),
  );
  process.exit(0);
}

// ---------- Day-by-day summary ----------

const sessions = query(`
  SELECT
    s.id,
    s.title,
    s.time_created,
    SUM(json_extract(m.data, '$.tokens.input')) as total_input,
    SUM(json_extract(m.data, '$.tokens.output')) as total_output,
    SUM(json_extract(m.data, '$.tokens.cache.read')) as total_cache_read,
    SUM(json_extract(m.data, '$.tokens.cache.write')) as total_cache_write,
    SUM(json_extract(m.data, '$.cost')) as total_cost,
    COUNT(CASE WHEN json_extract(m.data, '$.tokens.input') > 0 THEN 1 END) as msg_count,
    GROUP_CONCAT(DISTINCT json_extract(m.data, '$.modelID')) as models
  FROM session s
  JOIN message m ON m.session_id = s.id
  WHERE s.time_created >= ${cutoffMs}
    AND json_extract(m.data, '$.role') = 'assistant'
  GROUP BY s.id
  ORDER BY s.time_created DESC
`);

if (TSV_MODE || APPEND_LOG) {
  // TSV output: one row per session
  const header = 'date\ttime\tsession_id\ttitle\tmodels\tmessages\tinput_tokens\toutput_tokens\tcache_read\tcache_write\tcost';
  const rows = sessions.map(s => [
    epochToDate(s.time_created),
    epochToTime(s.time_created),
    s.id,
    (s.title || '').replace(/\t/g, ' '),
    (s.models || '').replace(/\t/g, ' '),
    s.msg_count || 0,
    s.total_input || 0,
    s.total_output || 0,
    s.total_cache_read || 0,
    s.total_cache_write || 0,
    (s.total_cost || 0).toFixed(4),
  ].join('\t'));

  if (APPEND_LOG) {
    const logFile = join(PROJECT_DIR, 'data', 'token-usage.tsv');
    const existing = existsSync(logFile) ? '' : header + '\n';
    writeFileSync(logFile, existing + rows.join('\n') + '\n', { flag: 'a' });
    console.log(`Appended ${rows.length} sessions to ${logFile}`);
  } else {
    console.log(header);
    rows.forEach(r => console.log(r));
  }
  process.exit(0);
}

// ---------- Pretty print: group by day ----------

const byDay = new Map();
for (const s of sessions) {
  const day = epochToDate(s.time_created);
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(s);
}

for (const [day, daySessions] of byDay) {
  const dayTotals = daySessions.reduce((acc, s) => {
    acc.input += s.total_input || 0;
    acc.output += s.total_output || 0;
    acc.cacheRead += s.total_cache_read || 0;
    acc.cacheWrite += s.total_cache_write || 0;
    acc.cost += s.total_cost || 0;
    acc.msgs += s.msg_count || 0;
    return acc;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, msgs: 0 });

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  ${day}  |  ${daySessions.length} sessions  |  ${dayTotals.msgs} messages  |  Input: ${fmtNum(dayTotals.input)}  |  CacheRd: ${fmtNum(dayTotals.cacheRead)}  |  Cost: ${fmtCost(dayTotals.cost)}`);
  console.log('─'.repeat(90));
  console.log(
    '  Time'.padEnd(10),
    'Title'.padEnd(40),
    'Input'.padStart(8),
    'Output'.padStart(8),
    'CacheRd'.padStart(9),
    'Cost'.padStart(9),
    'Msgs'.padStart(6),
  );
  console.log('─'.repeat(90));

  for (const s of daySessions) {
    const title = (s.title || '(untitled)').slice(0, 38);
    console.log(
      `  ${epochToTime(s.time_created)}`.padEnd(10),
      title.padEnd(40),
      fmtNum(s.total_input || 0).padStart(8),
      fmtNum(s.total_output || 0).padStart(8),
      fmtNum(s.total_cache_read || 0).padStart(9),
      fmtCost(s.total_cost || 0).padStart(9),
      String(s.msg_count || 0).padStart(6),
    );
  }
}

// ---------- Grand totals ----------

const grand = sessions.reduce((acc, s) => {
  acc.input += s.total_input || 0;
  acc.output += s.total_output || 0;
  acc.cacheRead += s.total_cache_read || 0;
  acc.cacheWrite += s.total_cache_write || 0;
  acc.cost += s.total_cost || 0;
  acc.msgs += s.msg_count || 0;
  return acc;
}, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, msgs: 0 });

console.log(`\n${'═'.repeat(90)}`);
console.log(`  TOTAL (${DAYS} days)  |  ${sessions.length} sessions  |  ${grand.msgs} messages`);
console.log(`  Input: ${fmtNum(grand.input)}  |  Output: ${fmtNum(grand.output)}  |  CacheRd: ${fmtNum(grand.cacheRead)}  |  CacheWr: ${fmtNum(grand.cacheWrite)}`);
console.log(`  Cost: ${fmtCost(grand.cost)}`);
console.log('═'.repeat(90));

// ---------- Model breakdown ----------

const modelStats = query(`
  SELECT
    json_extract(m.data, '$.providerID') || '/' || json_extract(m.data, '$.modelID') as model,
    SUM(json_extract(m.data, '$.tokens.input')) as total_input,
    SUM(json_extract(m.data, '$.tokens.output')) as total_output,
    SUM(json_extract(m.data, '$.tokens.cache.read')) as total_cache_read,
    SUM(json_extract(m.data, '$.cost')) as total_cost,
    COUNT(*) as msg_count
  FROM message m
  JOIN session s ON s.id = m.session_id
  WHERE s.time_created >= ${cutoffMs}
    AND json_extract(m.data, '$.tokens.input') > 0
  GROUP BY model
  ORDER BY total_cost DESC
`);

if (modelStats.length) {
  console.log(`\nModel breakdown:`);
  console.log('─'.repeat(80));
  console.log(
    '  Model'.padEnd(35),
    'Input'.padStart(9),
    'Output'.padStart(9),
    'CacheRd'.padStart(9),
    'Cost'.padStart(10),
    'Msgs'.padStart(7),
  );
  console.log('─'.repeat(80));
  for (const m of modelStats) {
    console.log(
      `  ${(m.model || '?').slice(0, 33)}`.padEnd(35),
      fmtNum(m.total_input || 0).padStart(9),
      fmtNum(m.total_output || 0).padStart(9),
      fmtNum(m.total_cache_read || 0).padStart(9),
      fmtCost(m.total_cost || 0).padStart(10),
      String(m.msg_count || 0).padStart(7),
    );
  }
}

// ---------- Top sessions by cost ----------

const topSessions = sessions.slice().sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0)).slice(0, 10);
if (topSessions.length) {
  console.log(`\nTop ${topSessions.length} sessions by cost:`);
  console.log('─'.repeat(90));
  for (const s of topSessions) {
    const title = (s.title || '(untitled)').slice(0, 50);
    console.log(
      `  ${fmtCost(s.total_cost || 0).padStart(9)}  ${epochToDate(s.time_created)}  ${title}  (${fmtNum(s.total_input || 0)} in, ${s.msg_count} msgs)`,
    );
  }
}
