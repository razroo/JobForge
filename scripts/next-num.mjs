#!/usr/bin/env node
/**
 * next-num — print the next sequential report number (3-digit zero-padded).
 *
 * Reads reports/ and returns max(existing) + 1. Used by agents instead of
 * having the model figure this out by listing + parsing filenames.
 *
 * Usage:
 *   job-forge next-num              # prints e.g. "521"
 *   job-forge next-num --padded     # prints e.g. "521" (default, already padded)
 *   job-forge next-num --raw        # prints e.g. "521" without padding
 */

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = process.env.JOB_FORGE_PROJECT || process.cwd();
const REPORTS_DIR = join(PROJECT_DIR, 'reports');
const RAW = process.argv.includes('--raw');

let max = 0;
if (existsSync(REPORTS_DIR)) {
  for (const f of readdirSync(REPORTS_DIR)) {
    if (!f.endsWith('.md')) continue;
    const m = f.match(/^(\d+)-/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
}

const next = max + 1;
console.log(RAW ? String(next) : String(next).padStart(3, '0'));
