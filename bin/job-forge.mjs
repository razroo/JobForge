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
 *   sync           Re-run the harness symlink sync (bin/sync.mjs)
 *   help, --help   Show this message
 */

import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const commands = {
  merge:        'merge-tracker.mjs',
  dedup:        'dedup-tracker.mjs',
  verify:       'verify-pipeline.mjs',
  normalize:    'normalize-statuses.mjs',
  pdf:          'generate-pdf.mjs',
  'sync-check': 'cv-sync-check.mjs',
  tokens:       'scripts/token-usage-report.mjs',
  sync:         'bin/sync.mjs',
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
  sync           Re-create harness symlinks in the current project

Pass --help after a command to see its own flags, e.g.:
  job-forge merge --help
  job-forge tokens --days 1

Project directory resolves to $JOB_FORGE_PROJECT or cwd.`);
}

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  printHelp();
  process.exit(0);
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
