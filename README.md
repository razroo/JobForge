# JobForge

> AI-powered job search pipeline built on opencode. Evaluate offers, generate tailored CVs, scan portals, negotiate offers, and track everything -- powered by AI agents.

![opencode](https://img.shields.io/badge/opencode-000?style=flat&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Geometra](https://img.shields.io/badge/Geometra_MCP-4A90D9?style=flat&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Made in USA](https://img.shields.io/badge/Made_in-USA_%F0%9F%87%BA%F0%9F%87%B8-red?style=flat)

<p align="center">
  <img src="demo/demo.gif" alt="JobForge Demo" width="800">
</p>

<p align="center"><em>Paste a job URL. Get a scored evaluation, tailored CV, and tracked application — in seconds.</em></p>

---

## Quick Start

```bash
npx --package=job-forge create-job-forge my-job-search
cd my-job-search
npm install
opencode
```

The scaffolded `opencode.json` already has the Geometra MCP (browser automation + PDF) and Gmail MCP (reading replies) wired up — they launch automatically the first time opencode starts. `npm install` also materializes symlinks for every supported agent harness — OpenCode, Cursor, Claude Code, and Codex — so you can run `opencode`, `cursor`, `claude`, or `codex` in the same project and each picks up the shared MCP config and instructions.

Then fill in `cv.md`, `config/profile.yml`, and `portals.yml` with your personal data, paste a job URL into opencode, and JobForge evaluates + tracks it.

**Upgrade later:** `npm run update-harness` (pulls latest `job-forge` from npm, re-syncs symlinks, prints the resolved version)

Full setup guide and alternative install paths (including contributing to the harness itself): **[docs/SETUP.md](docs/SETUP.md)**.

---

## What Is This

JobForge turns opencode into a full job search command center. Instead of manually tracking applications in a spreadsheet, you get an AI-powered pipeline that:

- **Evaluates offers** with a unified 10-dimension weighted scoring system
- **Generates tailored PDFs** -- ATS-optimized CVs with anti-AI-detection writing rules
- **Scans portals** with fuzzy dedup (catches reposts with new URLs)
- **Processes in batch** -- evaluate 10+ offers in parallel with sub-agents
- **Tracks everything** with pipeline integrity checks and canonical state management
- **Manages follow-ups** -- timing-based nudges so you never miss a window
- **Learns from rejections** -- pattern analysis across all rejections by stage, archetype, and score
- **Negotiates offers** -- structured comp breakdown, leverage assessment, counter-offer strategy

> **Important: This is NOT a spray-and-pray tool.** The whole point is to apply only where there's a real match. The scoring system helps you focus on high-fit opportunities instead of wasting everyone's time. Always review before submitting.

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Pipeline** | Paste a URL, get a full evaluation + PDF + tracker entry |
| **Unified Scoring** | 10 weighted dimensions, consistent across all modes, with calibration anchors |
| **Anti-AI-Detection CVs** | Writing rules that avoid ATS filters on Indeed, LinkedIn, Workday |
| **6-Block Evaluation** | Role summary, CV match, level strategy, comp research, personalization, interview prep (STAR+R) |
| **Interview Story Bank** | Curated bank of 10-12 stories with match counts, archetype tags, and automatic pruning |
| **Follow-Up System** | Timing-based nudges: Applied 7+ days ago nudge, Interviewed 1 day ago thank-you note, email scanning via Gmail MCP |
| **Gmail Integration** | MCP server configured to retrieve emails for interview callbacks, offer responses, and application status updates |
| **Rejection Analysis** | Captures stage + reason, surfaces patterns (archetype gaps, scoring miscalibration) |
| **Offer Negotiation** | Total comp breakdown, equity valuation, leverage from pipeline, counter-offer scripts |
| **Deep Research** | Company research that feeds back into scores and interview prep |
| **Smart LinkedIn Outreach** | Reads evaluation reports to craft targeted messages using top proof points |
| **Portal Scanner** | 45+ companies pre-configured with fuzzy dedup for reposts |
| **Batch Processing** | Parallel evaluation with `opencode run` workers, with honest verification flagging |
| **Pipeline Integrity** | Automated merge, dedup, status normalization, health checks |
| **Cost-Aware Agent Routing** | Three subagents (`@general-free`, `@general-paid`, `@glm-minimal`) with per-task model tiers; procedural work runs on free-tier models, quality-sensitive work on paid. See [Subagent Routing in AGENTS.md](AGENTS.md) for the task-to-agent mapping. |
| **Automatic Model Fallback** | When a model rate-limits or 5xx's, [`@razroo/opencode-model-fallback`](https://www.npmjs.com/package/@razroo/opencode-model-fallback) rotates the agent through a configured `fallback_models` chain and replays the request. Ships with sensible defaults: free-tier agents fall back to another free model then to paid as an escape hatch, paid agents fall back to a different paid provider. |
| **Token Cost Visibility** | `job-forge tokens --days 1` for per-session breakdown; `job-forge session-report --since-minutes 60 --log` to flag sessions over budget and append history to `data/token-usage.tsv`. Auto-logged after every batch run. |

## Usage

```
/job-forge                → Show all available commands
/job-forge {paste a JD}   → Full auto-pipeline (evaluate + PDF + tracker)
/job-forge scan           → Scan portals for new offers
/job-forge pdf            → Generate ATS-optimized CV
/job-forge batch          → Batch evaluate multiple offers
/job-forge tracker        → View application status
/job-forge apply          → Fill application forms with AI
/job-forge pipeline       → Process pending URLs
/job-forge contact        → LinkedIn outreach (uses evaluation report)
/job-forge deep           → Deep company research (feeds back into scores)
/job-forge followup       → Check what needs follow-up action
/job-forge rejection      → Record/analyze rejection patterns
/job-forge negotiation    → Structured offer negotiation
/job-forge training       → Evaluate a course/cert
/job-forge project        → Evaluate a portfolio project
```

Or just paste a job URL or description directly -- JobForge auto-detects it and runs the full pipeline.

> **The system is designed to be customized by opencode itself.** Modes, archetypes, scoring weights, negotiation scripts -- just ask opencode to change them: "Change the archetypes to backend engineering roles", "Add these 5 companies to portals.yml", "Update my profile with this CV I'm pasting".

## How It Works

```
You paste a job URL or description
        │
        ▼
┌──────────────────┐
│  Archetype       │  Classifies: LLMOps / Agentic / PM / SA / FDE / Transformation
│  Detection       │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A-F Evaluation   │  Match, gaps, comp research, STAR stories
│  (reads cv.md)    │  Unified 10-dimension scoring model
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Report  PDF  Tracker
  .md   .pdf   .tsv
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Apply  Follow  Negotiate
        up      (if offer)
```

## Project Structure

**Your personal project** (after `npx --package=job-forge create-job-forge my-search`):

```
my-search/
├── package.json                  # depends on "job-forge": "^2.0.0" (npm registry)
├── opencode.json                 # thin config — enables MCPs + states.yml
├── cv.md                         # your CV (personal)
├── article-digest.md             # your proof points (optional, personal)
├── portals.yml                   # companies to scan (personal)
├── config/profile.yml            # your identity, target roles (personal)
├── data/                         # applications, pipeline, scan history (personal, gitignored)
├── reports/                      # generated evaluation reports (personal, gitignored)
├── batch/{batch-input,batch-state}.tsv, tracker-additions/, logs/   # personal
├── AGENTS.md                     # personal overrides (opencode + codex)
├── CLAUDE.md                     # personal overrides (Claude Code), @-imports CLAUDE.harness.md
│
│ # ↓ symlinks into node_modules/job-forge/, regenerated by postinstall sync.mjs
├── AGENTS.harness.md             # → harness instructions (loaded via opencode.json)
├── CLAUDE.harness.md             # → harness instructions (imported from personal CLAUDE.md)
├── .mcp.json                     # → Claude Code MCP config
├── .codex/config.toml            # → Codex MCP config
├── .cursor/mcp.json              # → Cursor MCP config
├── .cursor/rules/main.mdc        # → Cursor always-apply rule
├── .opencode/skills/job-forge.md # → skill router
├── .opencode/agents/             # → @general-free, @general-paid, @glm-minimal
├── modes/                        # → _shared.md + skill modes
├── templates/                    # → states.yml, portals.example.yml, cv-template.html
├── batch/batch-prompt.md         # → batch worker prompt
├── batch/batch-runner.sh         # → parallel orchestrator
│
└── node_modules/job-forge/       # the harness (from npm: `job-forge@2.x`)
```

Symlinks are regenerated on every `npm install` via the package's `postinstall` hook. You never have to know about harness internals — just edit `cv.md`, `portals.yml`, and `config/profile.yml`.

**The harness itself** (this repo, what gets published as `job-forge` on npm):

```
JobForge/
├── iso/                          # ← SOURCE OF TRUTH for harness configuration
│   ├── instructions.md           # → AGENTS.md + CLAUDE.md (Claude Code / Codex / Cursor)
│   ├── mcp.json                  # → .mcp.json + .cursor/mcp.json + .codex/config.toml + opencode.json
│   ├── agents/*.md               # → .opencode/agents/*.md (general-free, general-paid, glm-minimal)
│   ├── commands/job-forge.md     # → .opencode/skills/job-forge.md
│   └── config.json               # per-harness top-level extras (e.g. opencode `instructions` array)
│
├── package.json                  # bin: job-forge, create-job-forge; prepack runs iso-harness
├── bin/
│   ├── job-forge.mjs             # CLI dispatcher (merge/verify/pdf/tokens/sync/...)
│   ├── sync.mjs                  # postinstall: creates symlinks in consumer project
│   └── create-job-forge.mjs      # scaffolder
├── modes/                        # _shared.md + 16 skill modes
├── templates/                    # cv-template.html, portals.example.yml, states.yml
├── config/profile.example.yml    # template for consumer's profile.yml
├── batch/{batch-prompt.md,batch-runner.sh}   # batch orchestrator
├── scripts/
│   ├── token-usage-report.mjs    # opencode cost analyzer
│   └── release/check-source.mjs  # version gate for npm publish
├── tracker-lib.mjs / merge-tracker.mjs / dedup-tracker.mjs / verify-pipeline.mjs
├── normalize-statuses.mjs / generate-pdf.mjs / cv-sync-check.mjs
├── dashboard/                    # optional Go TUI
├── fonts/                        # Space Grotesk + DM Sans (for PDF)
├── docs/                         # architecture, setup, customization
└── .github/workflows/            # quality.yml + release.yml (CI publish to npm)
```

All per-harness config trees (`.opencode/`, `.cursor/`, `.claude/`, `.codex/`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `opencode.json`) are **generated** from `iso/` by [`@razroo/iso-harness`](https://www.npmjs.com/package/@razroo/iso-harness) and gitignored in this repo. `npm run build:config` regenerates them locally; `prepack` regenerates them into the tarball at publish time so consumers get everything pre-baked.

## Documentation

Index and cross-links: [docs/README.md](docs/README.md).

- [Setup](docs/SETUP.md) — both install paths, profile, CV, portals, verify, token tracking, troubleshooting
- [Architecture](docs/ARCHITECTURE.md) — package architecture, modes, evaluation flow, batch runner, pipeline scripts
- [Customization](docs/CUSTOMIZATION.md) — archetypes, scanner keywords, CV template, states, customizing symlinked modes
- [Model Routing](docs/MODEL-ROUTING.md) — the three cost-tiered subagents, why the architecture exists, and how to swap models or add your own
- [Contributing](CONTRIBUTING.md) — branch workflow, quality gate, and ideas for PRs

## License

MIT
