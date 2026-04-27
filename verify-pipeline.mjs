#!/usr/bin/env node
/**
 * verify-pipeline.mjs — Health check for job-forge pipeline integrity
 *
 * Supports both layouts:
 *   - Day-based: data/applications/YYYY-MM-DD.md (preferred)
 *   - Single-file: data/applications.md or applications.md (legacy)
 *
 * Checks:
 * 1. All statuses are canonical (from templates/states.yml when present, else built-in list)
 * 2. No duplicate company+role entries
 * 3. All report links point to existing files
 * 4. Scores match format X.XX/5 or N/A or DUP
 * 5. All rows have proper pipe-delimited format
 * 6. Tracker rows match templates/contracts.json
 * 7. No pending TSVs in tracker-additions/ (runs even when tracker file is missing)
 * 8. No markdown bold in score column
 * 9. Drift warning if states.yml ids differ from the built-in fallback list
 * 10. Ledger file verifies if .jobforge-ledger/events.jsonl exists
 * 11. Artifact index verifies if .jobforge-index.json exists
 * 12. Fact set verifies if .jobforge-facts.json exists
 *
 * Run: node verify-pipeline.mjs   (from repo root; same as npm run verify)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PROJECT_DIR, DATA_APPS_DIR, DATA_APPS_FILE, ROOT_APPS_FILE,
  usesDayFiles, readAllEntries, listDayFiles, dayFilePath,
} from './tracker-lib.mjs';
import { jobForgeLedgerPath, ledgerExists, verifyJobForgeLedger } from './lib/jobforge-ledger.mjs';
import { indexExists, jobForgeIndexPath, verifyJobForgeIndex } from './lib/jobforge-index.mjs';
import { factsExist, jobForgeFactsPath, verifyJobForgeFacts } from './lib/jobforge-facts.mjs';
import {
  canonicalStatusValues,
  formatContractIssues,
  validateTrackerRow,
} from './lib/jobforge-contracts.mjs';

const ADDITIONS_DIR = join(PROJECT_DIR, 'batch/tracker-additions');
const STATES_FILE = existsSync(join(PROJECT_DIR, 'templates/states.yml'))
  ? join(PROJECT_DIR, 'templates/states.yml')
  : join(PROJECT_DIR, 'states.yml');

const appsDisplay = usesDayFiles()
  ? relative(PROJECT_DIR, DATA_APPS_DIR)
  : existsSync(DATA_APPS_FILE)
    ? relative(PROJECT_DIR, DATA_APPS_FILE)
    : relative(PROJECT_DIR, ROOT_APPS_FILE);

const CANONICAL_STATUSES = [
  'evaluated', 'applied', 'contacted', 'responded', 'interview',
  'offer', 'rejected', 'discarded', 'failed', 'skip',
];

const ALIASES = {
  'sent': 'applied',
};

function loadStatesFromYaml(filePath) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, 'utf-8');
  const ids = new Set();
  const aliasToId = new Map();
  let currentId = null;
  for (const line of text.split('\n')) {
    const idLine = line.match(/^\s+- id:\s*(\S+)/);
    if (idLine) {
      currentId = idLine[1].toLowerCase();
      ids.add(currentId);
      continue;
    }
    const aliasLine = line.match(/^\s+aliases:\s*\[(.*)\]\s*$/);
    if (aliasLine && currentId) {
      const inner = aliasLine[1].trim();
      if (inner) {
        for (let raw of inner.split(',')) {
          raw = raw.trim().replace(/^['"]|['"]$/g, '');
          if (raw) aliasToId.set(raw.toLowerCase(), currentId);
        }
      }
    }
  }
  if (ids.size === 0) return null;
  return { ids, aliasToId };
}

const statesMeta = loadStatesFromYaml(STATES_FILE);
const CONTRACT_STATUSES = canonicalStatusValues(PROJECT_DIR);

function statusIsAllowed(statusOnlyLower) {
  if (statesMeta) {
    if (statesMeta.ids.has(statusOnlyLower)) return true;
    if (statesMeta.aliasToId.has(statusOnlyLower)) return true;
    return false;
  }
  return CANONICAL_STATUSES.includes(statusOnlyLower) || Boolean(ALIASES[statusOnlyLower]);
}

let errors = 0;
let warnings = 0;

function error(msg) { console.log(`❌ ${msg}`); errors++; }
function warn(msg) { console.log(`⚠️  ${msg}`); warnings++; }
function ok(msg) { console.log(`✅ ${msg}`); }

function checkPendingTrackerAdditions() {
  let pendingTsvs = 0;
  if (existsSync(ADDITIONS_DIR)) {
    const files = readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'));
    pendingTsvs = files.length;
    if (pendingTsvs > 0) {
      warn(`${pendingTsvs} pending TSVs in tracker-additions/ (not merged)`);
    }
  }
  if (pendingTsvs === 0) ok('No pending TSVs');
}

function verifyStatesYamlDrift() {
  let stateDrift = 0;
  if (statesMeta) {
    const builtin = new Set(CANONICAL_STATUSES);
    for (const id of statesMeta.ids) {
      if (!builtin.has(id)) {
        warn(`states.yml defines id "${id}" not in verify built-in list — extend CANONICAL_STATUSES if intentional`);
        stateDrift++;
      }
    }
    for (const id of builtin) {
      if (!statesMeta.ids.has(id)) {
        warn(`Built-in status "${id}" missing from ${STATES_FILE} — files may be out of sync`);
        stateDrift++;
      }
    }
    if (stateDrift === 0) ok('states.yml ids match verify built-in fallback list');
  } else if (existsSync(STATES_FILE)) {
    warn(`Could not parse state ids from ${STATES_FILE} — using built-in status list only`);
  }
}

function verifyLedgerIfPresent() {
  if (!ledgerExists(PROJECT_DIR)) {
    ok('Ledger not initialized');
    return;
  }
  const result = verifyJobForgeLedger(PROJECT_DIR);
  for (const issue of result.issues) {
    const prefix = issue.line ? `ledger line ${issue.line}` : 'ledger';
    const msg = `${prefix}: ${issue.code}: ${issue.message}`;
    if (issue.severity === 'error') error(msg);
    else warn(msg);
  }
  if (result.errors === 0) {
    ok(`Ledger valid (${result.eventCount} events at ${relative(PROJECT_DIR, jobForgeLedgerPath(PROJECT_DIR))})`);
  }
}

function verifyIndexIfPresent() {
  if (!indexExists(PROJECT_DIR)) {
    ok('Artifact index not initialized');
    return;
  }
  const result = verifyJobForgeIndex({ rebuild: false }, PROJECT_DIR);
  for (const issue of result.issues) {
    const msg = `index: ${issue.kind}: ${issue.message}`;
    if (issue.severity === 'error') error(msg);
    else warn(msg);
  }
  if (result.ok) {
    ok(`Artifact index valid (${result.records} records at ${relative(PROJECT_DIR, jobForgeIndexPath(PROJECT_DIR))})`);
  }
}

function verifyFactsIfPresent() {
  if (!factsExist(PROJECT_DIR)) {
    ok('Fact set not initialized');
    return;
  }
  const result = verifyJobForgeFacts({ rebuild: false }, PROJECT_DIR);
  for (const issue of result.issues) {
    const msg = `facts: ${issue.kind}: ${issue.message}`;
    if (issue.severity === 'error') error(msg);
    else warn(msg);
  }
  if (result.ok) {
    ok(`Fact set valid (${result.facts} facts at ${relative(PROJECT_DIR, jobForgeFactsPath(PROJECT_DIR))})`);
  }
}

// --- Read entries ---
const { entries, source } = readAllEntries();

if (entries.length === 0) {
  console.log('\n📊 No tracker entries found (expected data/applications/YYYY-MM-DD.md or data/applications.md).');
  console.log('   This is normal for a fresh setup.\n');
  checkPendingTrackerAdditions();
  verifyStatesYamlDrift();
  verifyLedgerIfPresent();
  verifyIndexIfPresent();
  verifyFactsIfPresent();
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Pipeline Health: ${errors} errors, ${warnings} warnings`);
  if (errors === 0 && warnings === 0) console.log('🟢 Pipeline is clean!');
  else if (errors === 0) console.log('🟡 Pipeline OK with warnings');
  else console.log('🔴 Pipeline has errors — fix before proceeding');
  process.exit(errors > 0 ? 1 : 0);
}

console.log(`\n📊 Checking ${entries.length} entries from ${source === 'day' ? 'day files' : 'single file'}\n`);

// --- Check 1: Canonical statuses ---
let badStatuses = 0;
// --- Check 6: Contract ---
for (const e of entries) {
  const clean = e.status.replace(/\*\*/g, '').trim().toLowerCase();
  const statusOnly = clean.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();

  if (!statusIsAllowed(statusOnly)) {
    error(`#${e.num}: Non-canonical status "${e.status}"`);
    badStatuses++;
  }

  if (e.status.includes('**')) {
    error(`#${e.num}: Status contains markdown bold: "${e.status}"`);
    badStatuses++;
  }

  if (/\d{4}-\d{2}-\d{2}/.test(e.status)) {
    error(`#${e.num}: Status contains date: "${e.status}" — dates go in date column`);
    badStatuses++;
  }
}
if (badStatuses === 0) ok('All statuses are canonical');

// --- Check 2: Duplicates ---
const companyRoleMap = new Map();
let dupes = 0;
for (const e of entries) {
  const key = e.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '::' +
    e.role.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (!companyRoleMap.has(key)) companyRoleMap.set(key, []);
  companyRoleMap.get(key).push(e);
}
for (const [key, group] of companyRoleMap) {
  if (group.length > 1) {
    warn(`Possible duplicates: ${group.map(e => `#${e.num}`).join(', ')} (${group[0].company} — ${group[0].role})`);
    dupes++;
  }
}
if (dupes === 0) ok('No exact duplicates found');

// --- Check 3: Report links ---
let brokenReports = 0;
for (const e of entries) {
  const match = e.report.match(/\]\(([^)]+)\)/);
  if (!match) continue;
  const reportPath = join(PROJECT_DIR, match[1]);
  if (!existsSync(reportPath)) {
    error(`#${e.num}: Report not found: ${match[1]}`);
    brokenReports++;
  }
}
if (brokenReports === 0) ok('All report links valid');

// --- Check 4: Score format ---
let badScores = 0;
for (const e of entries) {
  const s = e.score.replace(/\*\*/g, '').trim();
  if (!/^\d+\.?\d*\/5$/.test(s) && s !== 'N/A' && s !== 'DUP') {
    error(`#${e.num}: Invalid score format: "${e.score}"`);
    badScores++;
  }
}
if (badScores === 0) ok('All scores valid');

// --- Check 5: Row format ---
let badRows = 0;
let contractFailures = 0;
// Re-read raw lines for format check
if (source === 'day') {
  for (const file of listDayFiles()) {
    const content = readFileSync(join(DATA_APPS_DIR, file), 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.startsWith('|')) continue;
      if (line.includes('---') || line.includes('Company')) continue;
      const parts = line.split('|');
      if (parts.length < 9) {
        error(`Row with <9 columns in ${file}: ${line.substring(0, 80)}...`);
        badRows++;
      }
    }
  }
} else {
  const filePath = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---') || line.includes('Company')) continue;
    const parts = line.split('|');
    if (parts.length < 9) {
      error(`Row with <9 columns: ${line.substring(0, 80)}...`);
      badRows++;
    }
  }
}
if (badRows === 0) ok('All rows properly formatted');

for (const e of entries) {
  const result = validateTrackerRow(contractRecordForEntry(e), {
    allowMissingReport: true,
    projectDir: PROJECT_DIR,
    normalizeStatus: normalizeStatusForContract,
  });
  if (!result.ok) {
    error(`#${e.num}: Tracker row contract failed: ${formatContractIssues(result)}`);
    contractFailures++;
  }
}
if (contractFailures === 0) ok('All tracker rows match iso-contract');

// --- Check 7: Pending TSVs ---
checkPendingTrackerAdditions();

// --- Check 8: Bold in scores ---
let boldScores = 0;
for (const e of entries) {
  if (e.score.includes('**')) {
    warn(`#${e.num}: Score has markdown bold: "${e.score}"`);
    boldScores++;
  }
}
if (boldScores === 0) ok('No bold in scores');

verifyStatesYamlDrift();
verifyLedgerIfPresent();
verifyIndexIfPresent();
verifyFactsIfPresent();

console.log('\n' + '='.repeat(50));
console.log(`📊 Pipeline Health: ${errors} errors, ${warnings} warnings`);
if (errors === 0 && warnings === 0) {
  console.log('🟢 Pipeline is clean!');
} else if (errors === 0) {
  console.log('🟡 Pipeline OK with warnings');
} else {
  console.log('🔴 Pipeline has errors — fix before proceeding');
}
process.exit(errors > 0 ? 1 : 0);

function normalizeStatusForContract(status) {
  const clean = status.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();
  const direct = CONTRACT_STATUSES.find((value) => value.toLowerCase() === lower);
  if (direct) return direct;
  if (ALIASES[lower] === 'applied') return 'Applied';
  return clean;
}

function contractRecordForEntry(entry) {
  const record = {
    num: entry.num,
    date: entry.date,
    company: entry.company,
    role: entry.role,
    score: entry.score,
    status: entry.status,
    pdf: entry.pdf,
    report: entry.report,
    notes: entry.notes,
  };
  if (!/\]\([^)]+\)/.test(String(record.report || ''))) {
    delete record.report;
  }
  return record;
}
