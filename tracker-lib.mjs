#!/usr/bin/env node
/**
 * tracker-lib.mjs — Shared helper for reading/writing day-based application tracker files.
 *
 * Layout:
 *   data/applications/YYYY-MM-DD.md  — one markdown table per day (preferred)
 *   data/applications.md              — legacy single-file (fallback)
 *
 * The directory `data/applications/` takes priority. If it exists and has .md files,
 * all reads/writes go through day files. If not, scripts fall back to the single file.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, relative } from 'path';

// Resolve the consumer's project directory. When installed as a package, the
// scripts live in node_modules/ but should operate on the consumer's cwd.
// JOB_FORGE_PROJECT env var overrides for tooling/tests.
const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
export const DATA_APPS_DIR = join(PROJECT_DIR, 'data', 'applications');
export const DATA_APPS_FILE = join(PROJECT_DIR, 'data', 'applications.md');
export const ROOT_APPS_FILE = join(PROJECT_DIR, 'applications.md');

const TABLE_HEADER = [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
].join('\n');

// ---------- Day file helpers ----------

/** Return YYYY-MM-DD from a Date object. */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** List all day .md files in data/applications/, sorted by filename (chronological). */
export function listDayFiles() {
  if (!existsSync(DATA_APPS_DIR)) return [];
  return readdirSync(DATA_APPS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
}

/** Path for a specific day file. */
export function dayFilePath(date) {
  return join(DATA_APPS_DIR, `${date}.md`);
}

/** Check whether the day-based directory layout is active (has at least one .md day file). */
export function usesDayFiles() {
  if (!existsSync(DATA_APPS_DIR)) return false;
  return listDayFiles().length > 0;
}

/**
 * Resolve the tracker layout: 'day' if data/applications/ with day files,
 * 'single' if a single-file tracker exists, or 'none'.
 */
export function resolveLayout() {
  if (usesDayFiles()) return 'day';
  if (existsSync(DATA_APPS_FILE)) return 'single-data';
  if (existsSync(ROOT_APPS_FILE)) return 'single-root';
  return 'none';
}

/**
 * Get the display path for the active tracker (for log messages).
 */
export function displayPath() {
  const layout = resolveLayout();
  if (layout === 'day') return relative(PROJECT_DIR, DATA_APPS_DIR);
  if (layout === 'single-data') return relative(PROJECT_DIR, DATA_APPS_FILE);
  if (layout === 'single-root') return relative(PROJECT_DIR, ROOT_APPS_FILE);
  return '(no tracker)';
}

// ---------- Reading ----------

/**
 * Parse a markdown table line into an app object.
 * Returns null for non-data lines (headers, separators, etc.)
 */
export function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9) return null;
  const num = parseInt(parts[1]);
  if (isNaN(num) || num === 0) return null;
  return {
    num, date: parts[2], company: parts[3], role: parts[4],
    score: parts[5], status: parts[6], pdf: parts[7], report: parts[8],
    notes: parts[9] || '', raw: line,
  };
}

/**
 * Read all application entries from either day files or the single-file tracker.
 * Returns { entries: App[], maxNum: number, source: 'day'|'single' }
 */
export function readAllEntries() {
  const layout = resolveLayout();
  const entries = [];
  let maxNum = 0;

  if (layout === 'day') {
    for (const file of listDayFiles()) {
      const content = readFileSync(join(DATA_APPS_DIR, file), 'utf-8');
      for (const line of content.split('\n')) {
        const app = parseAppLine(line);
        if (app) {
          app._sourceFile = file;
          entries.push(app);
          if (app.num > maxNum) maxNum = app.num;
        }
      }
    }
    return { entries, maxNum, source: 'day' };
  }

  const filePath = layout === 'single-data' ? DATA_APPS_FILE : ROOT_APPS_FILE;
  if (layout === 'none') return { entries: [], maxNum: 0, source: 'none' };

  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const app = parseAppLine(line);
    if (app) {
      app._sourceFile = filePath;
      entries.push(app);
      if (app.num > maxNum) maxNum = app.num;
    }
  }
  return { entries, maxNum, source: 'single' };
}

/**
 * Read all lines (including headers and blank lines) from either source.
 * For day files, returns { date, lines }[] array.
 * For single file, returns the file content split into lines.
 */
export function readAllRawLines() {
  const layout = resolveLayout();
  if (layout === 'day') {
    const result = [];
    for (const file of listDayFiles()) {
      const content = readFileSync(join(DATA_APPS_DIR, file), 'utf-8');
      result.push({ date: file.replace('.md', ''), lines: content.split('\n') });
    }
    return { type: 'day', days: result };
  }
  if (layout === 'none') return { type: 'none', lines: [] };
  const filePath = layout === 'single-data' ? DATA_APPS_FILE : ROOT_APPS_FILE;
  const content = readFileSync(filePath, 'utf-8');
  return { type: 'single', lines: content.split('\n'), path: filePath };
}

// ---------- Writing ----------

/**
 * Ensure the day-based directory exists and has the initial structure.
 * Creates data/applications/ if needed.
 */
export function ensureDayDir() {
  if (!existsSync(DATA_APPS_DIR)) {
    mkdirSync(DATA_APPS_DIR, { recursive: true });
  }
  const gitkeep = join(DATA_APPS_DIR, '.gitkeep');
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, '', 'utf-8');
  }
}

const HEADER_LINES = [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
];

/**
 * Get the day-file header (same format as the single-file header).
 */
export function getHeader() {
  return HEADER_LINES.join('\n');
}

/**
 * Format an app object as a markdown table row.
 */
export function formatAppLine(app) {
  return `| ${app.num} | ${app.date} | ${app.company} | ${app.role} | ${app.score} | ${app.status} | ${app.pdf} | ${app.report} | ${app.notes} |`;
}

/**
 * Initialize the tracker. If using day-based layout, creates the directory.
 * If using single-file layout, creates data/applications.md with empty header.
 * Returns 'day' or 'single' indicating which layout was initialized.
 */
export function initTracker() {
  if (usesDayFiles()) {
    ensureDayDir();
    return 'day';
  }
  // If no tracker exists at all, default to day-based layout
  if (!existsSync(DATA_APPS_FILE) && !existsSync(ROOT_APPS_FILE)) {
    ensureDayDir();
    return 'day';
  }
  // Single-file mode: an existing single-file tracker is present
  return 'single';
}

/**
 * Write entries to day files. Takes an array of app objects and distributes them
 * into the correct YYYY-MM-DD.md file based on app.date.
 * If a day file doesn't exist, it's created with the header.
 * Existing day files are rewritten with the provided entries plus any entries
 * not in the provided array (those are preserved).
 */
export function writeToDayFiles(entries) {
  ensureDayDir();

  // Group entries by date
  const byDate = new Map();
  for (const app of entries) {
    const date = app.date || toDateStr(new Date());
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(app);
  }

  // Merge with existing entries in each day file
  for (const [date, dayEntries] of byDate) {
    const path = dayFilePath(date);
    const existing = existsSync(path) ? readFileSync(path, 'utf-8').split('\n') : [];
    const existingNums = new Set(dayEntries.map(e => e.num));

    // Collect entries from file that aren't in the new set
    const preserved = [];
    for (const line of existing) {
      const app = parseAppLine(line);
      if (app && !existingNums.has(app.num)) {
        preserved.push(app);
      }
    }

    const allEntries = [...dayEntries, ...preserved].sort((a, b) => a.num - b.num);
    const lines = [
      ...HEADER_LINES,
      ...allEntries.map(formatAppLine),
    ];
    writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
  }
}

// ---------- Utility ----------

export { PROJECT_DIR, TABLE_HEADER };
