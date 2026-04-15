#!/usr/bin/env node
/**
 * slugify — convert a company/role name to a filename-safe slug.
 *
 * Rule: lowercase, strip non-alphanumerics (collapse to single hyphens),
 * trim leading/trailing hyphens. Matches the convention used across
 * reports/{num}-{slug}-{date}.md.
 *
 * Usage:
 *   job-forge slugify "Anthropic, PBC"           # → anthropic-pbc
 *   job-forge slugify "OpenAI Co. — Austin"      # → openai-co-austin
 */

const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  console.error('usage: job-forge slugify <name>');
  process.exit(2);
}

const slug = input
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

console.log(slug);
