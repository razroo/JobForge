#!/usr/bin/env node
/**
 * dedup-tracker.mjs — Remove duplicate entries from the application tracker
 *
 * Supports both layouts:
 *   - Day-based: data/applications/YYYY-MM-DD.md (preferred)
 *   - Single-file: data/applications.md or applications.md (legacy)
 *
 * Groups by normalized company + fuzzy role match.
 * Keeps entry with highest score. If discarded entry had more advanced status,
 * preserves that status. Merges notes.
 *
 * Run: node dedup-tracker.mjs [--dry-run]   (from repo root)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PROJECT_DIR, DATA_APPS_DIR, DATA_APPS_FILE, ROOT_APPS_FILE,
  usesDayFiles, ensureDayDir, getHeader, formatAppLine, parseAppLine,
  readAllEntries, writeToDayFiles, listDayFiles, dayFilePath,
} from './tracker-lib.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`dedup-tracker.mjs — remove duplicate tracker rows by company and role

Supports day-based (data/applications/YYYY-MM-DD.md) and single-file layouts.
Keeps the highest-scoring row per cluster; may promote status when a removed
row was further along in the pipeline. Merges notes where applicable.

Usage:
  node dedup-tracker.mjs [--dry-run]
  npm run dedup [-- --dry-run]

Exits successfully when no tracker exists (nothing to do).
Creates a .bak copy next to the tracker before writing (single-file mode).

Run from the repository root.`);
  process.exit(0);
}

const STATUS_RANK = {
  'skip': 0,
  'discarded': 0,
  'rejected': 1,
  'evaluated': 2,
  'applied': 3,
  'contacted': 3.5,
  'responded': 4,
  'interview': 5,
  'offer': 6,
};

function normalizeCompany(name) {
  return name.toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function normalizeRole(role) {
  return role.toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 /]/g, '')
    .trim();
}

function roleMatch(a, b) {
  const wordsA = normalizeRole(a).split(/\s+/).filter(w => w.length > 3);
  const wordsB = normalizeRole(b).split(/\s+/).filter(w => w.length > 3);
  const overlap = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  return overlap.length >= 2;
}

function parseScore(s) {
  const m = s.replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

// Read entries
const { entries, source } = readAllEntries();
if (entries.length === 0) {
  console.log('No tracker entries found. Nothing to dedup.');
  process.exit(0);
}

console.log(`📊 ${entries.length} entries loaded from ${source === 'day' ? 'day files' : 'single file'}`);

// Group by company+role
const groups = new Map();
for (const entry of entries) {
  const key = normalizeCompany(entry.company);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

// Find duplicates
let removed = 0;
const toRemove = new Set(); // entry.num values to remove
const statusUpdates = new Map(); // num → new status

for (const [company, companyEntries] of groups) {
  if (companyEntries.length < 2) continue;

  const processed = new Set();
  for (let i = 0; i < companyEntries.length; i++) {
    if (processed.has(i)) continue;
    const cluster = [companyEntries[i]];
    processed.add(i);

    for (let j = i + 1; j < companyEntries.length; j++) {
      if (processed.has(j)) continue;
      if (roleMatch(companyEntries[i].role, companyEntries[j].role)) {
        cluster.push(companyEntries[j]);
        processed.add(j);
      }
    }

    if (cluster.length < 2) continue;

    // Keep the one with highest score
    cluster.sort((a, b) => parseScore(b.score) - parseScore(a.score));
    const keeper = cluster[0];

    // Check if any removed entry has more advanced status
    let bestStatusRank = STATUS_RANK[keeper.status.toLowerCase()] || 0;
    let bestStatus = keeper.status;
    for (let k = 1; k < cluster.length; k++) {
      const rank = STATUS_RANK[cluster[k].status.toLowerCase()] || 0;
      if (rank > bestStatusRank) {
        bestStatusRank = rank;
        bestStatus = cluster[k].status;
      }
    }

    if (bestStatus !== keeper.status) {
      statusUpdates.set(keeper.num, bestStatus);
      console.log(`  📝 #${keeper.num}: status promoted to "${bestStatus}" (from #${cluster.find(e => e.status === bestStatus)?.num})`);
    }

    // Mark duplicates for removal
    for (let k = 1; k < cluster.length; k++) {
      const dup = cluster[k];
      toRemove.add(dup.num);
      removed++;
      console.log(`🗑️  Remove #${dup.num} (${dup.company} — ${dup.role}, ${dup.score}) → kept #${keeper.num} (${keeper.score})`);
    }
  }
}

console.log(`\n📊 ${removed} duplicates found`);

if (!DRY_RUN && (removed > 0 || statusUpdates.size > 0)) {
  if (source === 'day') {
    // Filter out removed entries and apply status updates, then rewrite
    const kept = entries
      .filter(e => !toRemove.has(e.num))
      .map(e => {
        if (statusUpdates.has(e.num)) {
          return { ...e, status: statusUpdates.get(e.num) };
        }
        return e;
      });
    writeToDayFiles(kept);
    console.log(`✅ Written to day files`);
  } else {
    // Single-file mode
    const APPS_FILE = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
    const appsDisplay = relative(PROJECT_DIR, APPS_FILE).replace(/\\/g, '/');
    copyFileSync(APPS_FILE, APPS_FILE + '.bak');

    let content = readFileSync(APPS_FILE, 'utf-8');
    const lines = content.split('\n');

    const updatedLines = [];
    for (const line of lines) {
      const app = parseAppLine(line);
      if (app && toRemove.has(app.num)) continue; // skip removed
      if (app && statusUpdates.has(app.num)) {
        const newStatus = statusUpdates.get(app.num);
        const parts = line.split('|').map(s => s.trim());
        parts[6] = newStatus;
        updatedLines.push('| ' + parts.slice(1, -1).join(' | ') + ' |');
      } else {
        updatedLines.push(line);
      }
    }

    writeFileSync(APPS_FILE, updatedLines.join('\n'));
    console.log(`✅ Written to ${appsDisplay} (backup: ${appsDisplay}.bak)`);
  }
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No duplicates found');
}
