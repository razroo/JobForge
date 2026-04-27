# Customization Guide

> **Note on customizing mode files.** In a consumer project (scaffolded via `npx create-job-forge`), `modes/` is a symlink to `node_modules/job-forge/modes/`. If you edit a file through the symlink you're editing the shared harness copy, which gets overwritten on the next `npm update job-forge`. To customize a specific mode file locally, **remove the symlink and replace it with a real copy**:
>
> ```bash
> cp node_modules/job-forge/modes/_shared.md modes/_shared.md.new
> rm modes/_shared.md               # remove the symlink (breaks the whole modes/ dir link)
> mkdir -p modes                    # recreate as a real dir
> cp node_modules/job-forge/modes/*.md modes/
> mv modes/_shared.md.new modes/_shared.md
> # edit modes/_shared.md — npx job-forge sync will leave it alone from now on
> ```
>
> A cleaner path is to keep customization in `config/profile.yml` where possible (the shared mode files already read from it). Open an issue against `razroo/JobForge` if a piece of personal data is currently stuck in a mode file and ought to be in `profile.yml`.

## Profile (config/profile.yml)

The `config/profile.yml` file is the single source of truth for your identity. All modes read from here.

Key sections:

- **candidate**: Name, email, phone, location, LinkedIn, portfolio.
- **target_roles**: Your North Star roles and archetypes.
- **narrative**: Your headline, exit story, superpowers, proof points.
- **compensation**: Target range, minimum, currency.
- **location**: Country, timezone, visa status, on-site availability.

## Target Roles (modes/_shared.md)

The archetype table in `_shared.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
4. **tracked_companies**: Companies to check directly

## CV Template (templates/cv-template.html)

The HTML template uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

To customize fonts/colors, edit the CSS in the template. Update font files in `fonts/` if switching fonts.

## Examples (`examples/`)

Fictional samples for structure and tone — not real candidates. See [`examples/README.md`](../examples/README.md) for markdown CVs, an optional article-digest example, and a sample report layout. Use them as templates, then replace every detail with your own before applying.

## Interview prep (`interview-prep/story-bank.md`)

Optional file that holds curated STAR+R stories across evaluations. Modes that produce interview prep (for example Block F in a single-offer evaluation) can append or reference stories here so you reuse the same narratives instead of starting from scratch before each interview. The shipped file is a scaffold with formatting comments; replace placeholders with your own content as the bank fills in. If you prefer a different path, keep the same structure and point your workflow at your copy.

## Negotiation Scripts (modes/_shared.md)

The negotiation section provides frameworks for salary discussions. Replace the example scripts with your own:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses

## Hooks (Optional)

JobForge can integrate with external systems via opencode hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'JobForge session started'"
      }]
    }]
  }
}
```

Save hooks in `.opencode/settings.json`.

## Application tracker layouts

The default harness uses **day-based** tracker files: `data/applications/YYYY-MM-DD.md` (one markdown table per calendar day).

Some forks use a **single** `data/applications.md` instead. That is fine if you document it in the project root `AGENTS.md` (or equivalent) and keep `npx job-forge merge` / `verify` aligned with whatever `merge-tracker.mjs` and `verify-pipeline.mjs` expect in your fork.

## Transcript observability (iso-trace)

To inspect real agent sessions locally (tool mix, redundant fetches, Geometra churn) without uploading transcripts, use the `job-forge trace:*` commands. JobForge depends on Razroo's [`@razroo/iso-trace`](https://github.com/razroo/iso/tree/main/packages/iso-trace), so consumer projects do not need to install it separately.

Common commands default to OpenCode sessions for the current project and use a 7-day window:

```bash
npx job-forge trace:list
npx job-forge trace:stats
npx job-forge trace:show <session-id-or-prefix>
```

Scaffolded projects also include npm aliases: `npm run trace:list`, `npm run trace:stats`, and `npm run trace:show -- <id>`.

For raw iso-trace commands, use `npx job-forge trace sources`, `npx job-forge trace where`, or any other `iso-trace` subcommand after `trace`.

## JobForge telemetry

Trace is the raw transcript view. Telemetry is the JobForge operational view: it summarizes task dispatches, child session outcomes, provider errors, policy issues, and pending tracker TSVs.

```bash
npx job-forge telemetry:list
npx job-forge telemetry:status
npx job-forge telemetry:show <session-id-or-prefix>
npx job-forge telemetry:watch
```

Telemetry is also local-only and passive. It reads OpenCode's SQLite DB and files under `batch/tracker-additions/`; agents do not need to remember to emit custom events.

## JobForge ledger

The ledger is append-only local workflow state backed by `@razroo/iso-ledger`. It is not an MCP and does not add prompt, tool-schema, or state-trace tokens. Use it when you want a cheap deterministic check before loading growing tracker files:

```bash
npx job-forge ledger:rebuild
npx job-forge ledger:status
npx job-forge ledger:has --company "Acme" --role "Staff Engineer" --status Applied
npx job-forge ledger:verify
```

`tracker-line --write` records tracker-addition events, `merge` records add/update/skip outcomes, and `ledger:rebuild` backfills events from `data/applications/`, `batch/tracker-additions/`, `batch/tracker-additions/merged/`, and `data/pipeline.md`.

## JobForge artifact contracts

Machine-readable artifact shapes live in `templates/contracts.json` and are enforced by `@razroo/iso-contract`. `job-forge tracker-line` renders tracker additions through the `jobforge.tracker-row` contract, `merge` validates pending TSV/table rows before writing tracker files, and `verify` validates existing tracker rows against the same contract. Custom forks can extend `templates/contracts.json`, but keep the tracker status enum aligned with `templates/states.yml`.

## JobForge role capabilities

Role capability boundaries live in `templates/capabilities.json` and are enforced locally by `@razroo/iso-capabilities`. Use `job-forge capabilities:explain <role>` to inspect a role and `job-forge capabilities:check <role> ...` to validate a tool, MCP, command, filesystem, or network boundary before changing agent frontmatter. Custom forks can extend the policy, but keep it aligned with `.opencode/agents/` and the routing rules in `iso/instructions.md`.

## JobForge context bundles

Mode/reference context bundles live in `templates/context.json` and are planned locally by `@razroo/iso-context`. Use `job-forge context:plan <mode>` to see the files and estimated tokens, `job-forge context:check <mode>` to fail on budget drift, and `job-forge context:render <mode>` when you intentionally need a compact markdown or JSON context bundle. This is not an MCP and does not add tool-schema tokens; rendered context only consumes prompt tokens when a workflow deliberately asks for it.

## JobForge artifact index

Artifact lookup policy lives in `templates/index.json` and is built locally by `@razroo/iso-index`. Use `job-forge index:has --key "company-role:acme:staff-engineer"` as a cheap duplicate/source prefilter, `job-forge index:query "acme"` to get compact source path/line pointers, and `job-forge index:verify` to validate `.jobforge-index.json`. Query, has, and verify rebuild the index on demand, so scaffolded projects need no setup. JobForge canonicalizes company/role and URL records through `templates/canon.json` before writing the index. This is not an MCP and does not add tool-schema tokens.

## JobForge identity canonicalization

URL, company, role, and company+role identity rules live in `templates/canon.json` and are enforced locally by `@razroo/iso-canon`. Use `job-forge canon:key company-role --company "OpenAI, Inc." --role "Senior SWE, AI Platform"` to derive the same duplicate key used by ledger/index helpers, and `job-forge canon:compare company "OpenAI, Inc." "Open AI"` to explain whether two values resolve to the same entity. Custom forks can extend aliases, suffixes, stop words, and match thresholds in `templates/canon.json`. This is not an MCP and does not add prompt or tool-schema tokens.

## JobForge consumer migrations

Consumer-project migrations live in `templates/migrations.json` and are applied locally by `@razroo/iso-migrate`. `job-forge sync` applies safe migrations automatically after refreshing symlinks; use `JOB_FORGE_SKIP_MIGRATIONS=1` to opt out. Use `job-forge migrate:plan`, `job-forge migrate:apply`, and `job-forge migrate:check` to inspect or enforce script/gitignore drift explicitly. This is not an MCP and does not add prompt or tool-schema tokens.

## JobForge guard audits

Guard audits run deterministic `@razroo/iso-guard` policies over the same local OpenCode traces. The default policy lives at `templates/guards/jobforge-baseline.yaml` and checks rules that are reliable from transcript data, including max two task dispatches per assistant message, no task-status polling via `task`, no raw proxy configuration in task prompts, and no child session task recursion.

```bash
npx job-forge guard:audit
npx job-forge guard:audit <session-id-or-prefix>
npx job-forge guard:explain
```

Use `--policy <path>` to audit with a custom policy. This does not add prompt, token, or MCP overhead; JobForge converts local trace rows into guard events inside the CLI process.

**Where Claude Code writes JSONL:** `~/.claude/projects/<encoded-cwd>/*.jsonl`.

**Direct CLI fallback:** `npx -y @razroo/iso-trace@latest stats --source "$HOME/.claude/projects/<encoded-dir>/<session>.jsonl"`

**Performance:** `iso-trace list --cwd /path/to/repo` walks all of `~/.claude/projects` before filtering; on large machines prefer `stats --source <one.jsonl>` or the library's `discoverSessions({ roots: ["<one encoded project dir>"] })` (see the iso-trace README).

## States (templates/states.yml)

The canonical states rarely need changing. Since `templates/` is a symlink into the harness in consumer projects, adding new states means contributing back to `razroo/JobForge` (see [CONTRIBUTING.md](../CONTRIBUTING.md)). If you're working in the harness repo directly (Path B), update:

1. `templates/states.yml`
2. `normalize-statuses.mjs` (alias mappings)
3. `modes/_shared.md` (any references)
4. `merge-tracker.mjs` — TSV merges validate the status column against labels in `templates/states.yml`; extend the parser or built-in fallbacks there if you add states before running `npx job-forge merge` / `npm run merge`; see [batch/README.md](../batch/README.md)
5. `verify-pipeline.mjs` — extend `CANONICAL_STATUSES` (and `ALIASES` when you add new status aliases) so the health check stays aligned with `states.yml`; see [Architecture — Pipeline Integrity](ARCHITECTURE.md#pipeline-integrity)
