#!/usr/bin/env node
/**
 * today — print today's date in YYYY-MM-DD (local time).
 *
 * Useful because agents sometimes lose track of the current date during
 * long sessions, or because the shell `date` command differs across
 * macOS/Linux. This guarantees the exact format used in tracker day
 * files and report filenames.
 *
 * Usage:
 *   job-forge today            # → 2026-04-15
 *   job-forge today --utc      # → 2026-04-15 (UTC day — useful for batch logs)
 */

const UTC = process.argv.includes('--utc');
const now = new Date();
const y = UTC ? now.getUTCFullYear()  : now.getFullYear();
const m = (UTC ? now.getUTCMonth() : now.getMonth()) + 1;
const d = UTC ? now.getUTCDate()      : now.getDate();
console.log(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
