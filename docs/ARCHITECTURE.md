# Architecture

## Package architecture (v2.0.0+)

JobForge ships as an npm package at [`job-forge`](https://www.npmjs.com/package/job-forge). There are two kinds of repo involved:

- **Harness** — this repo, `razroo/JobForge`. Published to npm. Contains `iso/` (single source of truth), modes, scripts, skill router, templates, fonts, dashboard, and bin entries. Per-harness config trees are **generated** from `iso/` by [`@razroo/iso-harness`](https://www.npmjs.com/package/@razroo/iso-harness) — gitignored here, baked into the tarball by `prepack` at publish time, and landed in consumer projects via symlinks.
- **Consumer project** — what users interact with day-to-day. Scaffolded via `npx --package=job-forge create-job-forge <dir>`, or hand-authored with `job-forge` listed in `package.json` dependencies.

The consumer's project root contains personal data plus symlinks into `node_modules/job-forge/`:

```
my-search/
├── package.json                      # depends on "job-forge": "^2.0.0"
├── opencode.json                     # instructions: ["templates/states.yml"]
├── cv.md                             # personal
├── config/profile.yml                # personal
├── portals.yml                       # personal
├── data/                             # personal (gitignored)
├── .jobforge-ledger/                  # local workflow events (personal, gitignored)
├── reports/                          # personal (gitignored)
├── AGENTS.md                         # personal overrides (opencode + codex)
├── CLAUDE.md                         # personal overrides (Claude Code); @-imports CLAUDE.harness.md
│
│ # ↓ symlinks regenerated on every `npm install` by bin/sync.mjs
├── AGENTS.harness.md                 # → node_modules/job-forge/AGENTS.md
├── CLAUDE.harness.md                 # → node_modules/job-forge/CLAUDE.md
├── .mcp.json                         # → Claude Code MCP config
├── .codex/config.toml                # → Codex MCP config
├── .cursor/mcp.json                  # → Cursor MCP config
├── .cursor/rules/main.mdc            # → Cursor always-apply rule
├── .opencode/skills/job-forge.md     # → skill router
├── .opencode/agents/                 # → @general-free, @general-paid, @glm-minimal
├── modes/                            # → mode files
├── templates/                        # → states.yml, portals.example.yml, cv-template.html
├── batch/batch-prompt.md             # → batch worker prompt
├── batch/batch-runner.sh             # → parallel orchestrator
└── node_modules/job-forge/           # harness, installed from npm
```

Symlinks are created by the harness's `postinstall` hook (`bin/sync.mjs`) on every `npm install`. Real files at those paths are preserved — if a user locally customizes a mode file, the sync skips that symlink and warns.

The consumer's `opencode.json` loads a small set of stable files as always-present instructions: `AGENTS.harness.md` (harness operational rules), `templates/states.yml` (canonical application states), `modes/_shared.md` (scoring model), and `cv.md` (the candidate's CV). Caching these in the prefix means agents never Read them as tool calls. Churning content (score calibration anchors, specific mode files) stays out of `instructions` and is Read on demand.

The skill router (`.opencode/skills/job-forge.md`) loads mode and data files on demand, keeping per-session input tokens low (~20-40K for most modes instead of ~130-170K when everything was force-loaded).

**Cost-tiered subagents** live in `.opencode/agents/` (`general-free`, `general-paid`, `glm-minimal`). On OpenCode, JobForge pins all three tiers to `opencode-go/deepseek-v4-flash` by default, while the tiers still differ by tool surface, reasoning budget, and task prompt. See [MODEL-ROUTING.md](MODEL-ROUTING.md) for the routing architecture, why it exists, and how to customize.

**Multi-harness support.** Because `iso/` is the single source of truth, publishing ships config for OpenCode, Cursor, Claude Code, and Codex in one tarball. Consumers run any of `opencode`, `cursor`, `claude`, or `codex` in the project and each picks up the shared MCP config + instructions via the symlinks above.

**Upgrading** the harness in a consumer project is `npm run update-harness` — pulls the latest `job-forge` from npm, refreshes pinned MCPs, re-runs symlink sync, and prints the resolved version.

## System Overview

```
                    ┌─────────────────────────────────┐
                    │            Agent                │
                    │   (reads AGENTS.md + modes/*.md) │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
     ┌──────▼──────┐   ┌──────▼──────┐   ┌───────────▼────────┐
     │ Single Eval  │   │ Portal Scan │   │   Batch Process    │
     │ (auto-pipe)  │   │  (scan.md)  │   │   (batch-runner)   │
     └──────┬──────┘   └──────┬──────┘   └───────────┬────────┘
            │                  │                       │
            │           ┌─────────▼─────────┐          ┌────▼─────┐
            │           │ data/pipeline.md  │          │ N workers│
            │           │    (URL inbox)    │          │ (opencode run)
            │           └─────────┬─────────┘          └────┬─────┘
            │                                          │
     ┌──────▼──────────────────────────────────────────▼──────┐
     │                    Output Pipeline                      │
     │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐  │
     │  │ Report.md│  │  PDF (HTML  │  │ Tracker TSV       │  │
     │  │ (A-F eval)│  │ → Geometra) │  │ (merge-tracker)  │  │
     │  └──────────┘  └────────────┘  └───────────────────┘  │
     └────────────────────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
│  data/applications/   │
                     │  (day-based tracker)  │
                    └──────────────────────┘
```

## Modes (`modes/`)

Markdown mode files in `modes/` define how the workflow behaves together with the root `AGENTS.md`. **`_shared.md`** is the shared layer (archetypes, scoring dimensions, negotiation scaffolding); the rest align with `/job-forge` command entry points listed in `AGENTS.md`.

| File | Focus |
|------|--------|
| `_shared.md` | Archetypes, evaluation axes, shared prompts |
| `auto-pipeline.md` | Default path: evaluate, report, PDF, tracker |
| `offer.md` | Single-offer analysis |
| `compare.md` | Comparing multiple offers |
| `contact.md` | Outreach (e.g. LinkedIn) |
| `deep.md` | Company research |
| `pdf.md` | CV / PDF generation |
| `training.md` | Courses and certifications |
| `project.md` | Portfolio projects |
| `tracker.md` | Application tracker review |
| `apply.md` | Application forms |
| `scan.md` | Portal / job-board scanning |
| `pipeline.md` | Pending URL inbox |
| `batch.md` | Parallel batch runs (`batch/batch-runner.sh`) |
| `followup.md` | Follow-up triage |
| `rejection.md` | Rejection handling |
| `negotiation.md` | Offer negotiation |

For customization (archetypes, weights, tone), start with `_shared.md` and [CUSTOMIZATION.md](CUSTOMIZATION.md).

## Evaluation Flow (Single Offer)

1. **Input**: User pastes JD text or URL
2. **Extract**: Geometra MCP/WebFetch extracts JD from URL
3. **Classify**: Detect archetype (one row from the archetype table in `modes/_shared.md`)
4. **Evaluate**: 6 blocks (A-F).
   - A: Role summary.
   - B: CV match (gaps + mitigation).
   - C: Level strategy.
   - D: Comp research (WebSearch).
   - E: CV personalization plan.
   - F: Interview prep (STAR stories).
5. **Score**: Weighted average across 10 dimensions (1-5)
6. **Report**: Save as `reports/{num}-{company}-{date}.md`
7. **PDF**: Generate ATS-optimized CV (`generate-pdf.mjs`)
8. **Track**: Write one TSV per evaluation under `batch/tracker-additions/` (see [AGENTS.md](../AGENTS.md) TSV layout); fold rows into `data/applications.md` with `npm run merge` / `merge-tracker.mjs` when you are ready (not automatic in every workflow)

## Batch Processing

The batch system processes multiple offers in parallel:

```
batch-input.tsv    ->  batch-runner.sh  ->  N x opencode run workers
(id, url, source, notes) (iso-orchestrator) (self-contained prompt)
                           |
                    batch-state.tsv + .jobforge-runs/
                    (progress + durable workflow record)
```

Each worker is a headless opencode instance (`opencode run`) that receives the full `batch-prompt.md` as context. Workers produce:
- Report .md
- PDF
- Tracker TSV line

The orchestrator manages parallelism, state, retries, and resume. The default
runner delegates to `scripts/batch-orchestrator.mjs`, which uses
`@razroo/iso-orchestrator` for bounded bundle fan-out, idempotent bundle steps,
and mutexed report-number/state writes. Set `JOBFORGE_LEGACY_BATCH_RUNNER=1`
only if you need the old shell loop.

**Local batch artifacts:** `batch/batch-input.tsv`, `batch/batch-state.tsv`, `batch/logs/`, `batch/tracker-additions/*.tsv`, and `.jobforge-runs/` are created when you run the runner; they are gitignored (with `.gitkeep` in `batch/logs/` and `batch/tracker-additions/`). A fresh clone ships `batch/batch-runner.sh` and `batch/batch-prompt.md` only until you add an input file — see [`batch/README.md`](../batch/README.md) and `batch/batch-runner.sh --help` for the TSV layout and workflow.

## Data Flow

```
cv.md                    →  Evaluation context
article-digest.md        →  Proof points for matching
config/profile.yml       →  Candidate identity
portals.yml              →  Scanner configuration
data/pipeline.md        →  Pending URLs and `local:jds/...` inbox (see modes/pipeline.md)
.jobforge-ledger/events.jsonl → Append-only workflow events for cheap local duplicate/status checks
jds/*.md                 →  Saved job descriptions referenced from the pipeline (`local:jds/{file}`)
templates/states.yml     →  Canonical status values
templates/cv-template.html → PDF generation template
examples/*.md            →  Fictional layouts only (not read by scripts; see examples/README.md)
```

Create `data/pipeline.md` when you start using the URL inbox (`/job-forge pipeline`); format and `local:jds/...` lines are described in [`modes/pipeline.md`](../modes/pipeline.md).

## File Naming Conventions

- Reports: `{###}-{company-slug}-{YYYY-MM-DD}.md` (3-digit zero-padded)
- PDFs: `cv-candidate-{company-slug}-{YYYY-MM-DD}.pdf`
- Tracker TSVs: `batch/tracker-additions/{num}-{company-slug}.tsv` (one file per evaluation; merged files move under `batch/tracker-additions/merged/`)
- Ledger: `.jobforge-ledger/events.jsonl` (created by `job-forge ledger:rebuild`, `tracker-line --write`, or `merge`; gitignored personal state)

## Pipeline Integrity

From the project root, `npx job-forge verify` (or `npm run verify`) runs `verify-pipeline.mjs`. When a tracker file exists, it validates canonical statuses (using `templates/states.yml` when that file is present and parseable), warns on probable duplicate company/role rows, checks that report column markdown links resolve to files in the repo, validates score column format (`X.X/5`, `N/A`, or `DUP`), rejects table rows with too few columns, flags markdown bold inside the score column, and warns if any `batch/tracker-additions/*.tsv` files are still waiting to be merged. If `.jobforge-ledger/events.jsonl` exists, verify also validates the append-only ledger. It also compares state ids from `templates/states.yml` to an internal fallback list and warns when the two sets drift. **Fresh clone:** the command exits successfully when neither `data/applications.md` nor root `applications.md` exists yet; pending-TSV and states-drift checks still run so contributors see unmerged batch output early. Optional setup validation after you add `cv.md` and `config/profile.yml`: `npm run sync-check` (`cv-sync-check.mjs`).

**`verify-pipeline.mjs` checks (same order as the script header):**

1. Status column uses canonical ids (from `templates/states.yml` when parseable, else built-in ids and aliases), with no markdown bold and no dates embedded in the status cell.
2. Warn when multiple rows share the same normalized company + role (possible duplicates).
3. Report column markdown links resolve to files under the repo root.
4. Score column matches `X.X/5`, `N/A`, or `DUP`.
5. Table data rows have enough pipe-delimited columns.
6. No unmerged `batch/tracker-additions/*.tsv` files (warns if any remain).
7. Score column has no markdown bold.
8. Warn when state ids in `templates/states.yml` drift from the script’s built-in fallback list (or when the file exists but ids failed to parse).
9. Validate `.jobforge-ledger/events.jsonl` when present.

When the tracker file is missing, checks 1–5 and 7 are skipped; checks 6 and 8 still run.

## Contributing touchpoints

Prefer one focused change per pull request: a single mode under `modes/`, one repository-root `.mjs` utility, documentation under `docs/`, fictional samples under [`examples/`](../examples/README.md), templates such as [`templates/portals.example.yml`](../templates/portals.example.yml), the batch flow described in [`batch/README.md`](../batch/README.md), or the Go TUI under `dashboard/` — not a repo-wide refactor across 3+ of those at once. Branch workflow, the verify + dashboard build gate, and starter ideas are in [CONTRIBUTING.md](../CONTRIBUTING.md) (**What to Contribute** and **Development**). To look for in-repo `TODO`, `FIXME`, or `HACK` markers before choosing a task, use the `rg` one-liner in [CONTRIBUTING.md — Optional: scripted agent iterations](../CONTRIBUTING.md#optional-scripted-agent-iterations). Upstream PRs MUST stay generic: do not commit real candidate data (`cv.md`, `config/profile.yml`, personalized `portals.yml`, `data/applications.md`, `reports/`, or similar paths called out in CONTRIBUTING and `.gitignore`).

**PR / maintainer gate:** Before opening a pull request against `razroo/JobForge`, run `npm run verify` and `npm run build:dashboard` (or `(cd dashboard && go build .)`) from the harness repo root (same as [CONTRIBUTING.md](../CONTRIBUTING.md#development)). For optional scripted iterations that repeat that gate and commit one small change per pass, see [`scripts/cursor-agent-loop.sh`](../scripts/cursor-agent-loop.sh) (environment variables and usage in the script header; overview in [CONTRIBUTING.md](../CONTRIBUTING.md#optional-scripted-agent-iterations)).

Scripts maintain data consistency. In a consumer project they're invoked via the `job-forge` CLI (`npx job-forge <cmd>`); in the harness repo they're also directly runnable as `node <script>.mjs`.

| Script (in harness) | CLI | Purpose |
|---------------------|-----|---------|
| `merge-tracker.mjs` | `npx job-forge merge` | Merges TSV rows from `batch/tracker-additions/` into day files under `data/applications/`, or `data/applications.md` when the directory is absent |
| `verify-pipeline.mjs` | `npx job-forge verify` | Health check — see the verify paragraph above |
| `dedup-tracker.mjs` | `npx job-forge dedup` | Removes duplicate entries by company+role |
| `normalize-statuses.mjs` | `npx job-forge normalize` | Maps status aliases to canonical values |
| `generate-pdf.mjs` | `npx job-forge pdf` | Renders HTML to PDF via Geometra MCP (`geometra_generate_pdf`) or standalone Playwright/Chromium (`npx job-forge pdf <input.html> <output.pdf>`) |
| `cv-sync-check.mjs` | `npx job-forge sync-check` | Setup lint: `cv.md` + `config/profile.yml`, hardcoded-metric scan on `modes/_shared.md` and `batch/batch-prompt.md`, optional `article-digest.md` freshness |
| `scripts/token-usage-report.mjs` | `npx job-forge tokens` | Per-session opencode token/cost report from the SQLite DB |
| `scripts/trace.mjs` | `npx job-forge trace:list` / `trace:stats` / `trace:show` | Local transcript observability via `@razroo/iso-trace`; common commands default to OpenCode sessions for the consumer project |
| `scripts/telemetry.mjs` | `npx job-forge telemetry:status` / `telemetry:show` | JobForge operational telemetry derived from OpenCode traces plus tracker TSV state |
| `scripts/guard.mjs` | `npx job-forge guard:audit` / `guard:explain` | Deterministic `@razroo/iso-guard` policy audits over local OpenCode traces |
| `scripts/ledger.mjs` | `npx job-forge ledger:status` / `ledger:has` / `ledger:rebuild` | Deterministic `@razroo/iso-ledger` state over tracker, TSV, and pipeline files |
| `tracker-lib.mjs` | _(library)_ | Shared helpers for reading/writing day-based tracker files — imported by merge/dedup/verify/normalize |
| `bin/sync.mjs` | `npx job-forge sync` | Creates the harness symlinks in a consumer project (also runs as `postinstall`) |
| `bin/create-job-forge.mjs` | `npx create-job-forge <dir>` | Scaffolds a new personal project |

All scripts resolve the consumer project dir via `process.env.JOB_FORGE_PROJECT || process.cwd()`, so running the CLI from anywhere in the consumer project Just Works.

## Dashboard TUI

The `dashboard/` directory contains a standalone Go TUI application that visualizes the pipeline.

**Repo root:** The program needs the path to the JobForge checkout (the directory that contains `modes/`, `reports/`, and the tracker). Flag `-path` sets that directory (default `.`, i.e. the process working directory). If you run the binary from inside `dashboard/` after `go build`, use `-path ..` so the tracker is found.

**Tracker file:** Day-based directory `data/applications/` (preferred) with `YYYY-MM-DD.md` files. Falls back to single-file `data/applications.md` or root `applications.md` for legacy setups.

**Build / run** (see also [SETUP.md](SETUP.md#build-dashboard-optional)):

```bash
cd dashboard && go build -o job-forge-dashboard .
./job-forge-dashboard -path ..
```

**UI:**

- Filter tabs: All, Evaluated, Applied, Interview, Top ≥4, SKIP
- Sort modes: Score, Date, Company, Status
- Grouped/flat view
- Lazy-loaded report previews
- Inline status picker; on-screen key hints at the bottom of the pipeline view
