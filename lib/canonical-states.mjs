/**
 * canonical-states.mjs — single source of truth for JobForge canonical states.
 *
 * `templates/states.yml` is the authoritative list. This module reads it
 * (when available) and provides a hardcoded fallback that MUST stay in sync
 * with the YAML for the belt-and-suspenders case where the file is missing.
 *
 * Consumers:
 *   - merge-tracker.mjs          — validation + TSV column-swap heuristic
 *   - normalize-statuses.mjs     — canonical list for direct matching
 *
 * The dashboard (Go) currently duplicates this list in
 *   dashboard/internal/ui/screens/pipeline.go  (statusOptions, statusGroupOrder, statusLabel)
 *   dashboard/internal/data/career.go          (NormalizeStatus, StatusPriority)
 * Full codegen from YAML on the Go side is a follow-up; for now those
 * copies carry KEEP IN SYNC comments.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Fallback canonical labels, in display order matching templates/states.yml.
 * Used when the YAML file can't be read. Keep in sync with the YAML.
 */
export const DEFAULT_STATES = [
  'Evaluated',
  'Applied',
  'Responded',
  'Contacted',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'Failed',
  'SKIP',
];

/**
 * Extra tokens the column-swap heuristic recognises as "this column looks
 * like a status". Canonical labels plus historical aliases the tracker has
 * been known to emit (duplicate/repost/hold). Kept here so that both
 * merge-tracker.mjs and any future consumer see the same alias set.
 */
const STATUS_DETECT_EXTRAS = ['duplicate', 'repost', 'hold'];

/**
 * Parse `templates/states.yml` and return the ordered list of canonical
 * labels. Returns null when the file is missing or contains no labels,
 * so callers can fall back to DEFAULT_STATES.
 *
 * The parser intentionally uses a line-regex rather than pulling in a
 * YAML dependency — job-forge has no runtime YAML parser and we don't
 * want to add one just for this.
 *
 * @param {string} repoRoot - repo root where `templates/states.yml` lives.
 *                            Also checks `states.yml` at the root as a legacy fallback.
 * @returns {string[] | null}
 */
export function loadCanonicalStates(repoRoot) {
  const candidates = [
    join(repoRoot, 'templates/states.yml'),
    join(repoRoot, 'states.yml'),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    let text;
    try {
      text = readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const labels = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s+label:\s*(.+)$/);
      if (!m) continue;
      const v = m[1].trim().replace(/^['"]|['"]$/g, '');
      if (v) labels.push(v);
    }
    if (labels.length > 0) return labels;
  }
  return null;
}

/**
 * Build the case-insensitive "does this column look like a status?" regex
 * used by merge-tracker.mjs to detect swapped status/score columns in
 * legacy TSVs.
 *
 * Matches at the start of the column text, case-insensitive. Includes the
 * canonical labels plus alias tokens (duplicate/repost/hold) that have
 * historically appeared in the status column.
 *
 * @param {string[]} states - canonical labels (typically the output of
 *                            loadCanonicalStates, or DEFAULT_STATES).
 * @returns {RegExp}
 */
export function buildStatusDetectionRegex(states) {
  const tokens = [
    ...states.map((s) => s.toLowerCase()),
    ...STATUS_DETECT_EXTRAS,
  ];
  // Dedupe while preserving order.
  const seen = new Set();
  const unique = [];
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t);
      unique.push(t);
    }
  }
  // Escape regex-special chars just in case a label ever contains one.
  const escaped = unique.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^(${escaped.join('|')})`, 'i');
}
