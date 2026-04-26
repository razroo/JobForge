#!/usr/bin/env node
/**
 * merge-tracker.mjs — Merge batch tracker additions into the application tracker
 *
 * Supports both layouts:
 *   - Day-based: data/applications/YYYY-MM-DD.md (preferred)
 *   - Single-file: data/applications.md or applications.md (legacy)
 *
 * Handles multiple TSV formats:
 * - 9-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes
 * - 8-col: num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport (no notes)
 * - Pipe-delimited (markdown table row): | col | col | ... |
 *
 * Dedup: company normalized + role fuzzy match + report number match
 * If duplicate with higher score → update in-place, update report link
 * Validates status against templates/states.yml when present (else built-in labels)
 *
 * Run: node merge-tracker.mjs [--dry-run] [--verify]   (from repo root)
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PROJECT_DIR, DATA_APPS_DIR, DATA_APPS_FILE, ROOT_APPS_FILE,
  usesDayFiles, ensureDayDir, getHeader, formatAppLine, parseAppLine,
  readAllEntries, writeToDayFiles, listDayFiles, dayFilePath,
} from './tracker-lib.mjs';
import {
  DEFAULT_STATES, loadCanonicalStates, buildStatusDetectionRegex,
} from './lib/canonical-states.mjs';
import { recordTrackerMergeResult } from './lib/jobforge-ledger.mjs';
import { formatContractIssues, parseTrackerRow } from './lib/jobforge-contracts.mjs';

const ADDITIONS_DIR = join(PROJECT_DIR, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`merge-tracker.mjs — merge batch/tracker-additions/*.tsv into the tracker

Supports day-based (data/applications/YYYY-MM-DD.md) and single-file layouts.
Moves processed files to batch/tracker-additions/merged/.

Usage:
  node merge-tracker.mjs [--dry-run] [--verify]
  npm run merge [-- --dry-run] [--verify]

Options:
  --dry-run    Show actions without writing the tracker or moving TSVs
  --verify     After merge, run verify-pipeline.mjs (ignored with --dry-run)

If the tracker file is missing but TSVs exist, creates the tracker
with an empty table header. If batch/tracker-additions/ is missing or has
no .tsv files, exits successfully with nothing to do.

Run from the repository root.`);
  process.exit(0);
}

const CANONICAL_STATES = loadCanonicalStates(PROJECT_DIR) || DEFAULT_STATES;
const STATUS_DETECT_RE = buildStatusDetectionRegex(CANONICAL_STATES);

// Lifecycle precedence — higher value means the status represents a later
// stage of the application and should override an earlier stage on merge,
// independent of score. Evaluated (pure eval, no action) is the baseline;
// any action state outranks it. This fixes a historical bug where a higher-
// score Evaluated row would silently block an Applied/Failed/SKIP outcome
// from propagating because the merge considered score alone.
const STATUS_PRECEDENCE = {
  'Evaluated': 0,
  'SKIP': 1,
  'Discarded': 1,
  'Contacted': 2,
  'Failed': 2,
  'Applied': 3,
  'Responded': 4,
  'Rejected': 4,
  'Interview': 5,
  'Offer': 6,
};

function statusRank(s) {
  return STATUS_PRECEDENCE[s] ?? 0;
}

function validateStatus(status) {
  const clean = status.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();

  for (const valid of CANONICAL_STATES) {
    if (valid.toLowerCase() === lower) return valid;
  }

  const aliases = {
    'hold': 'Evaluated',
    'applied': 'Applied', 'sent': 'Applied',
    'skip': 'SKIP',
  };

  if (aliases[lower]) return aliases[lower];

  if (/^(dup(licate)?|repost)/i.test(lower)) return 'Discarded';

  console.warn(`⚠️  Non-canonical status "${status}" → defaulting to "Evaluated"`);
  return 'Evaluated';
}

function normalizeCompany(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Generic seniority + engineering words that appear across most SWE roles
// and carry no role-specialty signal. A "discriminator" is any remaining
// word longer than 3 chars (e.g. "Observability", "Telemetry", "Platform").
const ROLE_STOPWORDS = new Set([
  'staff', 'senior', 'principal', 'lead', 'junior',
  'software', 'engineer', 'engineering', 'developer',
  'backend', 'frontend', 'fullstack', 'full-stack', 'full', 'stack',
  'technical', 'applied',
]);

function roleFuzzyMatch(a, b) {
  // Split on whitespace AND role punctuation (commas, colons, dashes, parens)
  // so "Staff SWE, Observability K8s" tokenizes past the comma.
  const split = (s) => s.toLowerCase()
    .split(/[\s,:\-()\/]+/)
    .map(w => w.trim())
    .filter(w => w.length > 3 && !ROLE_STOPWORDS.has(w));

  const wordsA = split(a);
  const wordsB = split(b);

  // Match on discriminator-word overlap only. Prevents "Staff Software
  // Engineer, ML Observability" and "Staff Backend Engineer, Adaptive
  // Telemetry" from colliding (same company, different specialty) while
  // still collapsing re-evaluations of the same role (same discriminators).
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= 2;
}

function extractReportNum(reportStr) {
  const m = reportStr.match(/\[(\d+)\]/);
  return m ? parseInt(m[1]) : null;
}

function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Parse a TSV file content into a structured addition object.
 */
function parseTsvContent(content, filename) {
  content = content.trim();
  if (!content) return null;

  const format = detectTrackerRowFormat(content);
  const parsed = parseTrackerRow(content, format, {
    projectDir: PROJECT_DIR,
    normalizeStatus: validateStatus,
  });

  if (!parsed.validation.ok) {
    console.warn(`⚠️  Skipping ${filename}: tracker contract failed (${format}) — ${formatContractIssues(parsed.validation)}`);
    return null;
  }

  const addition = {
    ...parsed.validation.record,
    num: Number(parsed.validation.record.num),
  };

  if (isNaN(addition.num) || addition.num === 0) {
    console.warn(`⚠️  Skipping ${filename}: invalid entry number`);
    return null;
  }

  return addition;
}

function detectTrackerRowFormat(content) {
  if (content.startsWith('|')) return 'markdown';

  const parts = content.split('\t');
  const col4 = (parts[4] || '').trim();
  const col5 = (parts[5] || '').trim();
  const col4LooksLikeScore = /^\d+\.?\d*\/5$/.test(col4) || col4 === 'N/A' || col4 === 'DUP';
  const col5LooksLikeStatus = STATUS_DETECT_RE.test(col5);

  return col4LooksLikeScore && col5LooksLikeStatus ? 'day-tsv' : 'tsv';
}

// ---- Main ----

if (!existsSync(ADDITIONS_DIR)) {
  console.log('✅ No pending additions to merge.');
  process.exit(0);
}

const tsvFiles = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
if (tsvFiles.length === 0) {
  console.log('✅ No pending additions to merge.');
  process.exit(0);
}

// Initialize tracker
const layout = usesDayFiles() ? 'day' : 'single';
let appLines;
let existingApps;
let maxNum;

if (layout === 'day') {
  ensureDayDir();
  ({ entries: existingApps, maxNum } = readAllEntries());
} else {
  // Single-file mode
  const APPS_FILE = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
  const appsDisplay = relative(PROJECT_DIR, APPS_FILE).replace(/\\/g, '/');

  if (!existsSync(APPS_FILE)) {
    if (DRY_RUN) {
      console.log('(dry-run) Would create data/applications.md with empty tracker header.');
    } else {
      console.log('No tracker file yet; creating data/applications.md with empty header.');
      mkdirSync(join(PROJECT_DIR, 'data'), { recursive: true });
      writeFileSync(DATA_APPS_FILE, getHeader() + '\n', 'utf-8');
    }
  }

  const filePath = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
  appLines = readFileSync(filePath, 'utf-8').split('\n');
  existingApps = [];
  maxNum = 0;
  for (const line of appLines) {
    if (line.startsWith('|') && !line.includes('---') && !line.includes('Company')) {
      const app = parseAppLine(line);
      if (app) {
        existingApps.push(app);
        if (app.num > maxNum) maxNum = app.num;
      }
    }
  }
}

const appsDisplay = layout === 'day' ? relative(PROJECT_DIR, DATA_APPS_DIR) : relative(PROJECT_DIR, existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE);
console.log(`📊 ${appsDisplay}: ${existingApps.length} existing entries, max #${maxNum}`);

tsvFiles.sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, '')) || 0;
  const numB = parseInt(b.replace(/\D/g, '')) || 0;
  return numA - numB;
});

console.log(`📥 Found ${tsvFiles.length} pending additions`);

let added = 0;
let updated = 0;
let skipped = 0;
const newEntries = [];
const ledgerRecords = [];

for (const file of tsvFiles) {
  const content = readFileSync(join(ADDITIONS_DIR, file), 'utf-8').trim();
  const addition = parseTsvContent(content, file);
  if (!addition) { skipped++; continue; }

  const reportNum = extractReportNum(addition.report);
  let duplicate = null;

  if (reportNum) {
    duplicate = existingApps.find(app => {
      const existingReportNum = extractReportNum(app.report);
      return existingReportNum === reportNum;
    });
  }

  if (!duplicate) {
    duplicate = existingApps.find(app => app.num === addition.num);
  }

  if (!duplicate) {
    const normCompany = normalizeCompany(addition.company);
    duplicate = existingApps.find(app => {
      if (normalizeCompany(app.company) !== normCompany) return false;
      return roleFuzzyMatch(addition.role, app.role);
    });
  }

  if (duplicate) {
    const newScore = parseScore(addition.score);
    const oldScore = parseScore(duplicate.score);
    const newRank = statusRank(addition.status);
    const oldRank = statusRank(duplicate.status);

    // Update if EITHER the lifecycle status advances (e.g. Evaluated → Applied)
    // OR the score improves. Never regress the status (Applied → Evaluated is
    // ignored). Same-rank same-score updates are skipped as no-op.
    const statusAdvances = newRank > oldRank;
    const statusRegresses = newRank < oldRank;
    const scoreImproves = newScore > oldScore;

    if (statusAdvances || (!statusRegresses && scoreImproves)) {
      const newStatus = statusAdvances ? addition.status : duplicate.status;
      const newPdf = statusAdvances ? addition.pdf : duplicate.pdf;
      const reason = statusAdvances
        ? `${duplicate.status}→${newStatus}`
        : `${oldScore}→${newScore}`;
      console.log(`🔄 Update: #${duplicate.num} ${addition.company} — ${addition.role} (${reason})`);

      if (layout === 'day') {
        duplicate.date = addition.date;
        duplicate.company = addition.company;
        duplicate.role = addition.role;
        duplicate.score = scoreImproves ? addition.score : duplicate.score;
        duplicate.status = newStatus;
        duplicate.pdf = newPdf;
        duplicate.report = addition.report;
        duplicate.notes = statusAdvances
          ? addition.notes
          : `Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`;
      } else {
        const lineIdx = appLines.indexOf(duplicate.raw);
        const outScore = scoreImproves ? addition.score : duplicate.score;
        const noteText = statusAdvances
          ? addition.notes
          : `Re-eval ${addition.date} (${oldScore}→${newScore}). ${addition.notes}`;
        if (lineIdx >= 0) {
          appLines[lineIdx] = `| ${duplicate.num} | ${addition.date} | ${addition.company} | ${addition.role} | ${outScore} | ${newStatus} | ${newPdf} | ${addition.report} | ${noteText} |`;
        }
      }
      updated++;
      ledgerRecords.push({ addition, outcome: 'updated', sourceFile: join(ADDITIONS_DIR, file), duplicateNum: duplicate.num, reason });
    } else if (statusRegresses) {
      console.log(`⏭️  Skip: ${addition.company} — ${addition.role} (existing #${duplicate.num} status ${duplicate.status} outranks new ${addition.status})`);
      skipped++;
      ledgerRecords.push({ addition, outcome: 'skipped', sourceFile: join(ADDITIONS_DIR, file), duplicateNum: duplicate.num, reason: 'status-regression' });
    } else {
      console.log(`⏭️  Skip: ${addition.company} — ${addition.role} (existing #${duplicate.num} ${oldScore} >= new ${newScore})`);
      skipped++;
      ledgerRecords.push({ addition, outcome: 'skipped', sourceFile: join(ADDITIONS_DIR, file), duplicateNum: duplicate.num, reason: 'no-improvement' });
    }
  } else {
    const entryNum = addition.num > maxNum ? addition.num : ++maxNum;
    if (addition.num > maxNum) maxNum = addition.num;

    newEntries.push({
      ...addition,
      num: entryNum,
    });
    added++;
    console.log(`➕ Add #${entryNum}: ${addition.company} — ${addition.role} (${addition.score})`);
    ledgerRecords.push({ addition: { ...addition, num: entryNum }, outcome: 'added', sourceFile: join(ADDITIONS_DIR, file), reason: 'new-entry' });
  }
}

// Write new entries
if (!DRY_RUN) {
  if (layout === 'day') {
    // Merge new entries into existing, then write day files
    existingApps.push(...newEntries);
    writeToDayFiles(existingApps);
  } else {
    // Single-file: insert new lines after header
    if (newEntries.length > 0) {
      let insertIdx = -1;
      for (let i = 0; i < appLines.length; i++) {
        if (appLines[i].includes('---') && appLines[i].startsWith('|')) {
          insertIdx = i + 1;
          break;
        }
      }
      if (insertIdx >= 0) {
        appLines.splice(insertIdx, 0, ...newEntries.map(formatAppLine));
      }
    }

    const APPS_FILE = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
    writeFileSync(APPS_FILE, appLines.join('\n'));
  }

  // Move processed files to merged/
  if (!existsSync(MERGED_DIR)) mkdirSync(MERGED_DIR, { recursive: true });
  for (const file of tsvFiles) {
    renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
  }
  console.log(`\n✅ Moved ${tsvFiles.length} TSVs to merged/`);

  let ledgerEvents = 0;
  for (const record of ledgerRecords) {
    try {
      const result = recordTrackerMergeResult(record.addition, {
        projectDir: PROJECT_DIR,
        sourceFile: record.sourceFile,
        outcome: record.outcome,
        duplicateNum: record.duplicateNum,
        reason: record.reason,
      });
      if (result.appended) ledgerEvents++;
    } catch (error) {
      console.warn(`⚠️  Could not append ledger event for ${record.sourceFile}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`🧾 Ledger: ${ledgerEvents} event(s) appended`);
}

console.log(`\n📊 Summary: +${added} added, 🔄${updated} updated, ⏭️${skipped} skipped`);
if (DRY_RUN) console.log('(dry-run — no changes written)');

// Optional verify — resolve verify-pipeline.mjs relative to this file (works whether
// installed as a package in node_modules or run from the repo root).
if (VERIFY && !DRY_RUN) {
  console.log('\n--- Running verification ---');
  const { execSync } = await import('child_process');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    execSync(`node ${join(here, 'verify-pipeline.mjs')}`, { stdio: 'inherit' });
  } catch (e) {
    process.exit(1);
  }
}
