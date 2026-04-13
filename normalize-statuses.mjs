#!/usr/bin/env node
/**
 * normalize-statuses.mjs — Clean non-canonical states in the application tracker
 *
 * Supports both layouts:
 *   - Day-based: data/applications/YYYY-MM-DD.md (preferred)
 *   - Single-file: data/applications.md or applications.md (legacy)
 *
 * Maps all non-canonical statuses to canonical ones per templates/states.yml:
 *   Evaluated, Applied, Responded, Contacted, Interview, Offer, Rejected, Discarded, SKIP
 *
 * Also strips markdown bold (**) and dates from the status field,
 * moving DUPLICADO info to the notes column.
 *
 * Run: node normalize-statuses.mjs [--dry-run]   (from repo root)
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PROJECT_DIR, DATA_APPS_DIR, DATA_APPS_FILE, ROOT_APPS_FILE,
  usesDayFiles, ensureDayDir, parseAppLine, formatAppLine,
  readAllEntries, writeToDayFiles, listDayFiles,
} from './tracker-lib.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`normalize-statuses.mjs — map tracker status column to canonical labels

Supports day-based (data/applications/YYYY-MM-DD.md) and single-file layouts.
Uses templates/states.yml display labels when present. Strips markdown bold
and dates from the status field; moves duplicate/repost markers into notes
where applicable.

Usage:
  node normalize-statuses.mjs [--dry-run]
  npm run normalize [-- --dry-run]

Exits successfully when no tracker entries exist (nothing to do).
Creates a .bak copy next to the tracker before writing (single-file mode).

Run from the repository root.`);
  process.exit(0);
}

function normalizeStatus(raw) {
  let s = raw.replace(/\*\*/g, '').trim();
  const lower = s.toLowerCase();

  if (/^dup(licate)?/i.test(s)) {
    return { status: 'Discarded', moveToNotes: raw.trim() };
  }

  if (/^contacted$/i.test(s)) return { status: 'Contacted' };

  if (/^hold$/i.test(s)) return { status: 'Evaluated' };

  if (/^repost/i.test(s)) return { status: 'Discarded', moveToNotes: raw.trim() };

  if (s === '—' || s === '-' || s === '') return { status: 'Discarded' };

  const canonical = [
    'Evaluated', 'Applied', 'Contacted', 'Responded', 'Interview',
    'Offer', 'Rejected', 'Discarded', 'SKIP',
  ];
  for (const c of canonical) {
    if (lower === c.toLowerCase()) return { status: c };
  }

  if (['applied', 'sent'].includes(lower)) return { status: 'Applied' };
  if (['skip'].includes(lower)) return { status: 'SKIP' };

  return { status: null, unknown: true };
}

// Read entries
const { entries, source } = readAllEntries();

if (entries.length === 0) {
  console.log('No tracker entries found. Nothing to normalize.');
  process.exit(0);
}

let changes = 0;
let unknowns = [];
const updated = entries.map(app => {
  const result = normalizeStatus(app.status);

  if (result.unknown) {
    unknowns.push({ num: app.num, rawStatus: app.status });
    return app;
  }

  if (result.status === app.status) return app;

  changes++;
  console.log(`#${app.num}: "${app.status}" → "${result.status}"`);

  let notes = app.notes || '';
  if (result.moveToNotes && !notes.includes(result.moveToNotes)) {
    notes = result.moveToNotes + (notes ? '. ' + notes : '');
  }

  // Also strip bold from score
  const score = app.score ? app.score.replace(/\*\*/g, '') : app.score;

  return { ...app, status: result.status, notes, score };
});

if (unknowns.length > 0) {
  console.log(`\n⚠️  ${unknowns.length} unknown statuses:`);
  for (const u of unknowns) {
    console.log(`  #${u.num}: "${u.rawStatus}"`);
  }
}

console.log(`\n📊 ${changes} statuses normalized`);

if (!DRY_RUN && changes > 0) {
  if (source === 'day') {
    writeToDayFiles(updated);
    console.log('✅ Written to day files');
  } else {
    const APPS_FILE = existsSync(DATA_APPS_FILE) ? DATA_APPS_FILE : ROOT_APPS_FILE;
    const appsDisplay = relative(PROJECT_DIR, APPS_FILE).replace(/\\/g, '/');
    copyFileSync(APPS_FILE, APPS_FILE + '.bak');
    // Rewrite single-file
    const filePath = APPS_FILE;
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const updatedLines = [];
    for (const line of lines) {
      const app = parseAppLine(line);
      if (app) {
        const newApp = updated.find(u => u.num === app.num);
        if (newApp) {
          updatedLines.push(formatAppLine(newApp));
          continue;
        }
      }
      updatedLines.push(line);
    }
    writeFileSync(filePath, updatedLines.join('\n'));
    console.log(`✅ Written to ${appsDisplay} (backup: ${appsDisplay}.bak)`);
  }
} else if (DRY_RUN) {
  console.log('(dry-run — no changes written)');
} else {
  console.log('✅ No changes needed');
}
