#!/usr/bin/env node
/**
 * job-forge — CLI dispatcher for the job-forge harness.
 *
 * Runs the .mjs scripts shipped in this package against the consumer's cwd.
 * All scripts resolve the project dir via `process.env.JOB_FORGE_PROJECT ||
 * process.cwd()`, so running this bin from a consumer project Just Works.
 *
 * Usage:
 *   job-forge <command> [args...]
 *
 * Commands:
 *   merge          Run merge-tracker.mjs
 *   dedup          Run dedup-tracker.mjs
 *   verify         Run verify-pipeline.mjs
 *   normalize      Run normalize-statuses.mjs
 *   pdf            Run generate-pdf.mjs
 *   sync-check     Run cv-sync-check.mjs
 *   tokens         Run scripts/token-usage-report.mjs
 *   trace:*        Inspect local agent transcripts via iso-trace
 *   telemetry:*    Summarize JobForge pipeline status from traces + tracker files
 *   sync           Re-run the harness symlink sync (bin/sync.mjs)
 *   help, --help   Show this message
 */

import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();

const commands = {
  merge:        'merge-tracker.mjs',
  dedup:        'dedup-tracker.mjs',
  verify:       'verify-pipeline.mjs',
  normalize:    'normalize-statuses.mjs',
  pdf:          'generate-pdf.mjs',
  'sync-check': 'cv-sync-check.mjs',
  tokens:       'scripts/token-usage-report.mjs',
  sync:         'bin/sync.mjs',
  // Deterministic helpers — agents call these instead of deriving values
  // themselves, which saves thinking + Bash + verify tokens per invocation.
  'next-num':       'scripts/next-num.mjs',
  slugify:          'scripts/slugify.mjs',
  today:            'scripts/today.mjs',
  'tracker-line':   'scripts/tracker-line.mjs',
  // Auto-visibility into cost: run at end of session or batch to log usage
  // and warn on >$budget sessions. No opencode lifecycle hook exists, so
  // this is the closest to a SessionEnd trigger — wire it into your
  // shell wrapper around `opencode`, or into batch-runner.sh (already done).
  'session-report':       'scripts/session-report.mjs',
  'render-report-header': 'scripts/render-report-header.mjs',
};

const traceAliases = {
  'trace:list': 'list',
  'trace:stats': 'stats',
  'trace:show': 'show',
};

const telemetryAliases = {
  'telemetry:list': 'list',
  'telemetry:status': 'status',
  'telemetry:show': 'show',
  'telemetry:watch': 'watch',
};

const [, , cmd, ...rest] = process.argv;

function printHelp() {
  console.log(`job-forge — CLI for the job-forge harness

Usage:
  job-forge <command> [args...]

Commands:
  merge          Merge batch/tracker-additions/*.tsv into the tracker
  dedup          Remove duplicate entries from the tracker
  verify         Verify pipeline integrity (reports, URLs, dedup)
  normalize      Normalize status values across the tracker
  pdf            Generate ATS-optimized CV PDF from cv.md
  sync-check     Lint: verify cv.md and profile.yml are filled in
  tokens         Show opencode token usage and cost by session/day
  trace          Pass through to iso-trace (e.g. job-forge trace sources)
  trace:list     List recent local agent sessions (defaults: --since 7d --cwd project)
  trace:stats    Show trace stats (defaults: --since 7d --cwd project)
  trace:show ID  Show one trace by id or prefix
  telemetry:list    List recent JobForge runs with tasks/outcomes/issues
  telemetry:status  Show latest JobForge run + pending tracker state
  telemetry:show ID Show one run with child sessions, provider errors, next actions
  telemetry:watch   Watch latest run status
  sync           Re-create harness symlinks in the current project

Deterministic helpers (prefer these over LLM-derived values):
  next-num       Print next sequential report number (e.g. 521)
  slugify NAME   Convert a company/role name to a filename-safe slug
  today          Print today's date in YYYY-MM-DD
  tracker-line   Emit a 9-col TSV row for batch/tracker-additions/

Cost visibility:
  session-report        Summarize recent session costs, warn on >budget sessions
                        (e.g. job-forge session-report --since-minutes 60 --log)

Report assembly:
  render-report-header  Given a score JSON on stdin, print the canonical
                        report header + "## Score" section. Agents append
                        Blocks A-F after this instead of re-emitting the
                        standard boilerplate every evaluation.

Pass --help after a command to see its own flags, e.g.:
  job-forge merge --help
  job-forge tokens --days 1
  job-forge slugify "Anthropic, PBC"
  job-forge trace:list --since 24h
  job-forge trace:show ses_...
  job-forge telemetry:status
  job-forge telemetry:show ses_...

Project directory resolves to $JOB_FORGE_PROJECT or cwd.`);
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
}

if (cmd === 'trace' || traceAliases[cmd]) {
  const traceArgs = cmd === 'trace'
    ? (rest.length === 0 ? ['help'] : rest)
    : [traceAliases[cmd], ...rest];

  const scriptPath = join(PKG_ROOT, 'scripts/trace.mjs');
  const result = spawnSync(process.execPath, [scriptPath, ...traceArgs], {
    stdio: 'inherit',
    cwd: PROJECT_DIR,
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

if (cmd === 'telemetry' || telemetryAliases[cmd]) {
  const telemetryArgs = cmd === 'telemetry'
    ? (rest.length === 0 ? ['help'] : rest)
    : [telemetryAliases[cmd], ...rest];

  const scriptPath = join(PKG_ROOT, 'scripts/telemetry.mjs');
  const result = spawnSync(process.execPath, [scriptPath, ...telemetryArgs], {
    stdio: 'inherit',
    cwd: PROJECT_DIR,
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

const rel = commands[cmd];
if (!rel) {
  console.error(`Unknown command: ${cmd}\n`);
  printHelp();
  process.exit(2);
}

const scriptPath = join(PKG_ROOT, rel);
if (!existsSync(scriptPath)) {
  console.error(`Internal error: script ${rel} not found at ${scriptPath}`);
  process.exit(2);
}

const result = spawnSync(process.execPath, [scriptPath, ...rest], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
