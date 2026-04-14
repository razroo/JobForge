#!/usr/bin/env node
/**
 * create-job-forge — Scaffold a new job-forge personal project.
 *
 * Usage:
 *   npx create-job-forge <dir>            # scaffold into <dir>
 *   npx create-job-forge .                # scaffold into cwd
 *   npx create-job-forge <dir> --force    # overwrite existing files
 *
 * Creates the minimum a consumer needs:
 *   package.json           with job-forge as a dependency
 *   opencode.json          thin config enabling MCPs + states.yml instruction
 *   config/profile.yml     copied from profile.example.yml
 *   cv.md                  stub for the user to fill in
 *   portals.yml            copied from templates/portals.example.yml
 *   data/                  empty dir for tracker/pipeline/scan history
 *   reports/               empty dir for generated reports
 *   .gitignore             excludes personal data from sharing
 *   README.md              setup instructions
 *
 * After scaffold, prompts the user to run `npm install`, which triggers the
 * postinstall symlink sync.
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const HELP = args.includes('--help') || args.includes('-h');
const positional = args.filter(a => !a.startsWith('--'));

if (HELP || positional.length === 0) {
  console.log(`create-job-forge — scaffold a new job-forge personal project

Usage:
  npx create-job-forge <dir> [--force]

Examples:
  npx create-job-forge my-job-search
  npx create-job-forge .
  npx create-job-forge existing-project --force

Flags:
  --force   Overwrite files that already exist
  --help    Show this message

After scaffolding, cd into the directory and run:
  npm install                # pulls the harness and creates symlinks
  # Edit cv.md, config/profile.yml, portals.yml with your personal data
  opencode                   # start the TUI
`);
  process.exit(HELP ? 0 : 1);
}

const targetDir = resolve(positional[0]);
const name = basename(targetDir);

console.log(`\nScaffolding job-forge project in ${targetDir}\n`);

if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

function write(rel, content, { overwrite = FORCE } = {}) {
  const abs = join(targetDir, rel);
  if (existsSync(abs) && !overwrite) {
    console.log(`  skip: ${rel} (exists)`);
    return;
  }
  const parent = dirname(abs);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  console.log(`  create: ${rel}`);
}

function copy(srcRel, dstRel, { overwrite = FORCE } = {}) {
  const abs = join(targetDir, dstRel);
  const src = join(PKG_ROOT, srcRel);
  if (!existsSync(src)) {
    console.log(`  skip: ${dstRel} (template ${srcRel} not found)`);
    return;
  }
  if (existsSync(abs) && !overwrite) {
    console.log(`  skip: ${dstRel} (exists)`);
    return;
  }
  const parent = dirname(abs);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  copyFileSync(src, abs);
  console.log(`  create: ${dstRel}`);
}

// ---------- package.json ----------

const consumerPkg = {
  name,
  version: '0.1.0',
  private: true,
  scripts: {
    sync: 'job-forge sync',
    merge: 'job-forge merge',
    verify: 'job-forge verify',
    dedup: 'job-forge dedup',
    normalize: 'job-forge normalize',
    pdf: 'job-forge pdf',
    'sync-check': 'job-forge sync-check',
    tokens: 'job-forge tokens',
    'tokens:today': 'job-forge tokens --days 1',
    'tokens:log': 'job-forge tokens --days 1 --append',
  },
  dependencies: {
    'job-forge': 'github:razroo/JobForge',
  },
  engines: { node: '>=18' },
};
write('package.json', JSON.stringify(consumerPkg, null, 2) + '\n');

// ---------- opencode.json ----------

const opencodeCfg = {
  $schema: 'https://opencode.ai/config.json',
  instructions: ['templates/states.yml'],
  mcp: {
    geometra: {
      type: 'local',
      command: ['npx', '-y', '@geometra/mcp'],
      enabled: true,
    },
    gmail: {
      type: 'local',
      command: ['npx', '-y', '@razroo/gmail-mcp'],
      enabled: true,
    },
  },
};
write('opencode.json', JSON.stringify(opencodeCfg, null, 2) + '\n');

// ---------- AGENTS.md (auto-loaded by opencode on every session) ----------

write('AGENTS.md', `# AGENTS — ${name}

Personal job search project using the [job-forge](https://github.com/razroo/JobForge) harness. The harness lives in \`node_modules/job-forge/\`; most files you need are accessible through symlinks at the project root.

---

## Project Layout — start here

Before doing any work, remember where things live in *this* project:

| What | Where | Notes |
|------|-------|-------|
| Application tracker | \`data/applications/YYYY-MM-DD.md\` | **Day-based**. One markdown table per day. **There is NO \`applications.md\` — do not look for it.** |
| Inbox of pending URLs | \`data/pipeline.md\` | The queue for \`/job-forge pipeline\` |
| Scanner dedup history | \`data/scan-history.tsv\` | Only touch in \`/job-forge scan\` |
| Scanner config | \`portals.yml\` (project root) | Company configs |
| Profile / identity | \`config/profile.yml\` | Candidate name, email, target roles |
| CV | \`cv.md\` (project root) | Markdown, source of truth |
| Proof points | \`article-digest.md\` | Optional, at project root |
| Skill modes | \`modes/\` (symlink) | \`.md\` files, one per skill. Read \`modes/_shared.md\` for scoring and \`modes/{mode}.md\` for the mode. |
| Skill router | \`.opencode/skills/job-forge.md\` (symlink) | How \`/job-forge <mode>\` dispatches |
| Batch prompt template | \`batch/batch-prompt.md\` (symlink) | Used by \`batch/batch-runner.sh\` |
| Batch runner | \`batch/batch-runner.sh\` (symlink) | Parallel \`opencode run\` orchestrator |
| Batch input / state | \`batch/batch-input.tsv\`, \`batch/batch-state.tsv\` | Personal data |
| Generated reports | \`reports/{###}-{company-slug}-{YYYY-MM-DD}.md\` | Gitignored |
| Generated PDFs | \`output/\` | Gitignored |
| Templates | \`templates/\` (symlink) | \`cv-template.html\`, \`portals.example.yml\`, \`states.yml\` |
| Harness source | \`node_modules/job-forge/\` | Read this for harness internals; \`AGENTS.md\` there has the full operational guide |

**\`modes/\`, \`templates/\`, \`.opencode/skills/job-forge.md\`, \`batch/batch-prompt.md\`, \`batch/batch-runner.sh\`, and \`batch/README.md\` are all symlinks into \`node_modules/job-forge/\`.** Symlinks behave like real files for Read/Glob/Grep — no need to chase them into \`node_modules\` unless you want to see their real path.

When the user says something like "apply to N jobs", the candidates to apply to are either:
1. Entries in \`data/applications/*.md\` with status **Evaluated** (already scored, ready to submit)
2. URLs in \`data/pipeline.md\` that haven't been evaluated yet

Check both. Read today's day file (\`data/applications/$(date +%Y-%m-%d).md\`) plus the latest few day files for recent Evaluated entries.

---

## Session Hygiene — ALWAYS enforce

**Multi-job workflows MUST delegate each job to its own subagent.** This rule applies even when the user does NOT explicitly invoke \`/job-forge\`.

Whenever the user says any variation of "apply to N jobs", "process the pipeline", "batch evaluate", or similar phrasing that implies more than one application/evaluation in sequence:

1. **Do not drive all N jobs from this session.** Repeated \`geometra_fill_form\` / \`geometra_page_model\` calls accumulate in conversation history and invalidate prompt caching — each new message ends up re-processing 100K+ tokens of fresh history instead of reading from cache.
2. **Launch one subagent per job, in parallel batches of ≤5** (the Geometra MCP concurrency limit). Use the \`task\` tool / Agent with \`subagent_type="general-purpose"\`, passing the single URL and the relevant mode file content.
3. **This session acts as the orchestrator only**: plan, pick the jobs, dispatch subagents, aggregate results. No Geometra form-filling in this session unless it's a single one-off application.

**Verify after running:** \`npx job-forge tokens --session <id>\` — any message with \`cache_read < 5K\` and \`input > 50K\` is a cache-bust; next time split that work across subagents.

**Exception:** evaluation-only or tracker-only work (no Geometra, no repeated tool calls) can proceed in a single session. The rule targets tool-heavy multi-step loops.

---

## Personal additions

(Add project-specific rules below — e.g., model preferences, Geometra quirks, etc.)
`);

// ---------- Personal files (from templates) ----------

copy('config/profile.example.yml', 'config/profile.yml');
copy('templates/portals.example.yml', 'portals.yml');

// ---------- CV stub ----------

write('cv.md', `# Your Name

your.email@example.com · +1 (XXX) XXX-XXXX · City, Country
[LinkedIn](https://linkedin.com/in/you) · [GitHub](https://github.com/you)

## Summary

(One-paragraph pitch about who you are, what you've built, and what you're looking for.)

## Experience

### Current Company — Title
*Dates*

- Bullet describing impact with a metric.
- Bullet describing impact with a metric.

## Skills

(Comma-separated list grouped by category.)

## Education

Degree, Institution, Year
`);

// ---------- Empty personal dirs ----------

for (const dir of ['data', 'data/applications', 'reports', 'batch/tracker-additions']) {
  const abs = join(targetDir, dir);
  if (!existsSync(abs)) {
    mkdirSync(abs, { recursive: true });
    writeFileSync(join(abs, '.gitkeep'), '', 'utf-8');
    console.log(`  create: ${dir}/`);
  }
}

// ---------- .gitignore ----------

write('.gitignore', `# Personal data (your job search — don't share)
cv.md
article-digest.md
portals.yml
config/profile.yml
data/applications/
!data/applications/.gitkeep
data/applications.md
data/pipeline.md
data/scan-history.tsv
data/token-usage.tsv
reports/
!reports/.gitkeep
batch/batch-state.tsv
batch/batch-state.tsv.bak
batch/batch-input.tsv
batch/tracker-additions/
!batch/tracker-additions/.gitkeep
batch/logs/

# Harness symlinks (regenerated by npm install)
/modes
/templates
/.opencode/skills/job-forge.md
/batch/batch-prompt.md
/batch/batch-runner.sh
/batch/README.md

# Standard
node_modules/
.DS_Store
*.log
`);

// ---------- README ----------

write('README.md', `# ${name}

Personal job search project using the [job-forge](https://github.com/razroo/JobForge) harness.

## Setup

\`\`\`bash
npm install           # pulls the harness and creates symlinks to modes/, templates/, etc.
\`\`\`

Then fill in:

- \`cv.md\` — your CV in markdown
- \`config/profile.yml\` — your identity and target roles
- \`portals.yml\` — companies you want to scan

## Updating the harness

\`\`\`bash
npm update job-forge       # pulls the latest from razroo/JobForge
job-forge sync             # re-run if symlinks drift
\`\`\`

## Common commands

\`\`\`bash
job-forge merge            # merge batch/tracker-additions/*.tsv into the tracker
job-forge verify           # verify pipeline integrity
job-forge pdf cv.md out.pdf
job-forge tokens --days 1  # per-session opencode token usage
\`\`\`
`);

console.log(`
Done. Next steps:

  cd ${targetDir}
  npm install
  # edit cv.md, config/profile.yml, portals.yml
  opencode
`);
