#!/usr/bin/env node
/**
 * sync.mjs — Create/refresh harness symlinks in the consumer's project.
 *
 * When job-forge is installed as an npm dependency, opencode needs to see
 * certain files at the *consumer project root* (not inside node_modules):
 *
 *   .opencode/skills/job-forge.md   ← opencode loads skills from here
 *   modes/                           ← skill router Read's modes/{mode}.md
 *   templates/                       ← opencode.json instructions reference it
 *   batch/batch-prompt.md            ← batch worker prompt template
 *   batch/batch-runner.sh            ← batch orchestrator
 *   .cursor/mcp.json                 ← Cursor MCP config (Geometra + Gmail)
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
  // Cursor IDE: MCP servers (Geometra + Gmail) — mirrors opencode.json mcp entries
  { src: '.cursor/mcp.json', dst: '.cursor/mcp.json' },
  { src: '.opencode/skills/job-forge.md', dst: '.opencode/skills/job-forge.md' },
  // Subagent definitions (general-free, general-paid, glm-minimal) that the
  // orchestrator can delegate to for cost-aware model routing. See each
  // agent's frontmatter for its role. Users can override individually by
  // replacing the symlink with a local file.
  { src: '.opencode/agents',               dst: '.opencode/agents' },
  { src: 'modes',                          dst: 'modes' },
  { src: 'templates',                      dst: 'templates' },
  { src: 'batch/batch-prompt.md',          dst: 'batch/batch-prompt.md' },
  { src: 'batch/batch-runner.sh',          dst: 'batch/batch-runner.sh' },
  { src: 'batch/README.md',                dst: 'batch/README.md' },
  // Harness AGENTS.md surfaced at project root as AGENTS.harness.md so
  // opencode.json:instructions can reference it. The consumer's own
  // AGENTS.md stays fully personal; opencode combines both into context.
  { src: 'AGENTS.md',                      dst: 'AGENTS.harness.md' },
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
