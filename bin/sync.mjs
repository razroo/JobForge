#!/usr/bin/env node
/**
 * sync.mjs — Create/refresh harness symlinks in the consumer's project.
 *
 * When job-forge is installed as an npm dependency, opencode / cursor /
 * claude code / codex need to see certain files at the *consumer project
 * root* (not inside node_modules). All of these are generated at publish
 * time by iso-harness from the harness's iso/ source; this script mirrors
 * them into the consumer's layout via symlinks.
 *
 * This script creates symlinks to the harness copies. Idempotent:
 *   - If the symlink already points to the harness, skip.
 *   - If a real file/dir exists at the target (user customized), warn and skip.
 *   - Otherwise create the symlink.
 *
 * Invoked automatically by `postinstall` in the package, or manually via
 * `npx job-forge sync`.
 *
 * Skipped when running inside the harness repo itself (detected by checking
 * whether the cwd contains the harness's own package.json with name=job-forge).
 */

import { existsSync, lstatSync, readlinkSync, symlinkSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

// Resolve the consumer's project root. During npm install, INIT_CWD is the
// directory from which npm install was run (the consumer project).
// Fallback to cwd.
const PROJECT_DIR = process.env.INIT_CWD || process.env.JOB_FORGE_PROJECT || process.cwd();

// Skip if we're inside the harness itself (avoid self-symlinking during dev).
const pkgJsonPath = join(PROJECT_DIR, 'package.json');
if (existsSync(pkgJsonPath)) {
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.name === 'job-forge' && PROJECT_DIR === PKG_ROOT) {
      console.log('job-forge sync: skipping (running inside harness repo).');
      process.exit(0);
    }
  } catch { /* ignore */ }
}

if (PROJECT_DIR === PKG_ROOT) {
  console.log('job-forge sync: skipping (PROJECT_DIR == PKG_ROOT).');
  process.exit(0);
}

// ---------- Symlink plan ----------

// Each entry: { source (inside harness), target (inside consumer project) }
const links = [
  // Cursor: MCP servers + always-apply rule (harness-level). Consumers can
  // add their own rules in .cursor/rules/ alongside this one.
  { src: '.cursor/mcp.json',               dst: '.cursor/mcp.json' },
  { src: '.cursor/rules/main.mdc',         dst: '.cursor/rules/main.mdc' },

  // Claude Code: MCP config (.mcp.json is what claude-code reads for
  // project-scoped MCP). No subagents/commands emitted because iso/agents/
  // and iso/commands/ are flagged claude: skip.
  { src: '.mcp.json',                      dst: '.mcp.json' },

  // Codex: MCP config.
  { src: '.codex/config.toml',             dst: '.codex/config.toml' },

  // OpenCode: skill router + subagent definitions. Users can override any
  // single subagent by replacing its symlink with a local file.
  { src: '.opencode/skills/job-forge.md',  dst: '.opencode/skills/job-forge.md' },
  { src: '.opencode/agents',               dst: '.opencode/agents' },

  // Shared content directories referenced by opencode.json instructions +
  // skill router (Read's modes/{mode}.md, etc).
  { src: 'modes',                          dst: 'modes' },
  { src: 'templates',                      dst: 'templates' },
  { src: 'batch/batch-prompt.md',          dst: 'batch/batch-prompt.md' },
  { src: 'batch/batch-runner.sh',          dst: 'batch/batch-runner.sh' },
  { src: 'batch/README.md',                dst: 'batch/README.md' },

  // Top-level instructions surfaced at project root with a `.harness`
  // suffix so the consumer's own AGENTS.md / CLAUDE.md stay fully personal.
  // The consumer's opencode.json / CLAUDE.md / AGENTS.md references the
  // .harness.md variants to pull in shared context.
  { src: 'AGENTS.md',                      dst: 'AGENTS.harness.md' },
  { src: 'CLAUDE.md',                      dst: 'CLAUDE.harness.md' },
];

let created = 0, skipped = 0, warned = 0;

for (const { src, dst } of links) {
  const absSrc = join(PKG_ROOT, src);
  const absDst = join(PROJECT_DIR, dst);

  if (!existsSync(absSrc)) {
    console.warn(`  skip: ${src} not found in harness`);
    continue;
  }

  // Ensure parent dir exists
  const parent = dirname(absDst);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

  // Check current state of target
  let stat = null;
  try { stat = lstatSync(absDst); } catch {}

  if (stat) {
    if (stat.isSymbolicLink()) {
      const current = readlinkSync(absDst);
      const expected = relative(dirname(absDst), absSrc);
      if (current === expected || resolve(dirname(absDst), current) === absSrc) {
        skipped++;
        continue;
      }
      // Points elsewhere — user may have pinned to a different version
      console.warn(`  warn: ${dst} is a symlink pointing elsewhere (${current}) — leaving alone`);
      warned++;
      continue;
    }
    // Real file/dir exists
    console.warn(`  warn: ${dst} already exists as a real file/dir — leaving alone`);
    warned++;
    continue;
  }

  // Create symlink (relative, so the project remains portable)
  const relSrc = relative(dirname(absDst), absSrc);
  const type = lstatSync(absSrc).isDirectory() ? 'dir' : 'file';
  try {
    symlinkSync(relSrc, absDst, type);
    console.log(`  linked: ${dst} → ${relSrc}`);
    created++;
  } catch (e) {
    console.error(`  error: failed to symlink ${dst}: ${e.message}`);
    warned++;
  }
}

console.log(`\njob-forge sync: ${created} created, ${skipped} up-to-date, ${warned} warnings (project: ${PROJECT_DIR})`);
