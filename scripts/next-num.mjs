#!/usr/bin/env node
/**
 * next-num — print the next sequential report number (3-digit zero-padded).
 *
 * Scans three sources to find the max and returns max + 1:
 *   1. reports/*.md                       — filename prefix `{num}-`
 *   2. data/applications/*.md             — `#` column of each table row
 *   3. batch/tracker-additions/*.tsv      — first tab-separated column (pending)
 *      batch/tracker-additions/merged/    — same, already consumed
 *
 * Why all three? Same-day batches can advance the counter without writing a
 * report (e.g., SKIP entries skip PDF + report). Deriving from reports/ alone
 * causes ID collisions when a later subagent picks a number already used in
 * a tracker row or TSV. Scanning all three sources is O(N) on a small
 * directory and eliminates the collision class.
 *
 * Usage:
 *   job-forge next-num              # prints e.g. "521"
 *   job-forge next-num --raw        # prints e.g. "521" without padding
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const REPORTS_DIR = join(PROJECT_DIR, 'reports');
const APPS_DIR = join(PROJECT_DIR, 'data', 'applications');
const TSV_DIR = join(PROJECT_DIR, 'batch', 'tracker-additions');
const TSV_MERGED_DIR = join(TSV_DIR, 'merged');
const RAW = process.argv.includes('--raw');

let max = 0;

// 1. reports/*.md
if (existsSync(REPORTS_DIR)) {
  for (const f of readdirSync(REPORTS_DIR)) {
    if (!f.endsWith('.md')) continue;
    const m = f.match(/^(\d+)-/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
}

// 2. data/applications/*.md — first `|` column of each table row
if (existsSync(APPS_DIR)) {
  for (const f of readdirSync(APPS_DIR)) {
    if (!f.endsWith('.md')) continue;
    const full = join(APPS_DIR, f);
    if (!statSync(full).isFile()) continue;
    const content = readFileSync(full, 'utf-8');
    for (const line of content.split('\n')) {
      // Match: "| 756 | 2026-04-18 | ..." — integer in first cell
      const m = line.match(/^\|\s*(\d+)\s*\|/);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
}

// 3. batch/tracker-additions/*.tsv (pending) + merged/*.tsv
for (const dir of [TSV_DIR, TSV_MERGED_DIR]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.tsv')) continue;
    const full = join(dir, f);
    if (!statSync(full).isFile()) continue;
    // Prefer the filename prefix (always present and canonical) over TSV
    // contents — avoids reading the file for the common case.
    const mName = f.match(/^(\d+)-/);
    if (mName) {
      const n = parseInt(mName[1], 10);
      if (n > max) max = n;
      continue;
    }
    // Fallback: parse first column of first non-empty line
    const content = readFileSync(full, 'utf-8');
    const firstLine = content.split('\n').find(l => l.trim().length > 0);
    if (!firstLine) continue;
    const cell = firstLine.split('\t')[0];
    const n = parseInt(cell, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
}

const next = max + 1;
console.log(RAW ? String(next) : String(next).padStart(3, '0'));
