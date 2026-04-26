#!/usr/bin/env node
/**
 * tracker-line — emit a single 9-column TSV row for batch/tracker-additions/.
 *
 * Saves the agent from having to remember exact column order, delimiters,
 * or the status-before-score TSV convention. Writes to stdout by default,
 * or to batch/tracker-additions/{id}.tsv with --write.
 *
 * Column order matches merge-tracker.mjs:
 *   num \t date \t company \t role \t status \t score/5 \t pdf \t [num](reports/...) \t notes
 *
 * Usage:
 *   job-forge tracker-line \
 *     --num 521 --date 2026-04-15 \
 *     --company "Anthropic" --role "Manager, FDE" \
 *     --status Evaluated --score 4.2 \
 *     --pdf ✅ --slug anthropic-mgr-fde \
 *     --notes "Strong fit; founding team" \
 *     [--write]
 *
 * The --slug is used to build the report link; --num/--date/--slug together
 * reproduce the canonical `reports/{num}-{slug}-{date}.md` path.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { recordTrackerAdditionWritten } from '../lib/jobforge-ledger.mjs';

const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();

function arg(name, required = false) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || i + 1 >= process.argv.length) {
    if (required) {
      console.error(`missing --${name}`);
      process.exit(2);
    }
    return '';
  }
  return process.argv[i + 1];
}

const num = arg('num', true);
const date = arg('date', true);
const company = arg('company', true);
const role = arg('role', true);
const status = arg('status', true);
const score = arg('score', true);  // bare number like "4.2"; will be suffixed "/5"
const pdf = arg('pdf') || '❌';
const slug = arg('slug', true);
const notes = arg('notes') || '';
const write = process.argv.includes('--write');

const paddedNum = String(num).padStart(3, '0');
const reportLink = `[${num}](reports/${paddedNum}-${slug}-${date}.md)`;
const scoreField = score.includes('/') ? score : `${score}/5`;

const line = [num, date, company, role, status, scoreField, pdf, reportLink, notes].join('\t');

if (write) {
  const dir = join(PROJECT_DIR, 'batch/tracker-additions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${num}.tsv`);
  writeFileSync(path, line + '\n', 'utf-8');
  try {
    recordTrackerAdditionWritten({
      num, date, company, role, status, score: scoreField, pdf, report: reportLink, notes,
    }, { projectDir: PROJECT_DIR, sourceFile: path });
  } catch (error) {
    console.warn(`warning: could not append tracker-line ledger event: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.log(path);
} else {
  console.log(line);
}
