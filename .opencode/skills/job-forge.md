---
name: job-forge
description: AI job search command center -- evaluate offers, generate CVs, scan portals, track applications
user_invocable: true
args: mode
---

# job-forge -- Router

## Mode Routing

Determine the mode from `{{mode}}`:

| Input | Mode |
|-------|------|
| (empty / no args) | `discovery` -- Show command menu |
| JD text or URL (no sub-command) | **`auto-pipeline`** |
| `offer` | `offer` |
| `compare` | `compare` |
| `contact` | `contact` |
| `deep` | `deep` |
| `pdf` | `pdf` |
| `training` | `training` |
| `project` | `project` |
| `tracker` | `tracker` |
| `pipeline` | `pipeline` |
| `apply` | `apply` |
| `scan` | `scan` |
| `batch` | `batch` |
| `followup` | `followup` |
| `rejection` | `rejection` |
| `negotiation` | `negotiation` |

**Auto-pipeline detection:** If `{{mode}}` is not a known sub-command AND contains JD text (keywords: "responsibilities", "requirements", "qualifications", "about the role", "we're looking for", company name + role) or a URL to a JD, execute `auto-pipeline`.

If `{{mode}}` is not a sub-command AND doesn't look like a JD, show discovery.

---

## Discovery Mode (no arguments)

Show this menu:

```
job-forge -- Command Center

Available commands:
  /job-forge {JD}      → AUTO-PIPELINE: evaluate + report + PDF + tracker (paste text or URL)
  /job-forge pipeline  → Process pending URLs from inbox (data/pipeline.md)
  /job-forge offer     → Evaluation only A-F (no auto PDF)
  /job-forge compare   → Compare and rank multiple offers
  /job-forge contact   → LinkedIn power move: find contacts + draft message
  /job-forge deep      → Deep research prompt about company
  /job-forge pdf       → PDF only, ATS-optimized CV
  /job-forge training  → Evaluate course/cert against North Star
  /job-forge project   → Evaluate portfolio project idea
  /job-forge tracker   → Application status overview
  /job-forge followup  → Follow-up timing and nudges from the tracker
  /job-forge apply     → Live application assistant (reads form + generates answers)
  /job-forge scan      → Scan portals and discover new offers
  /job-forge batch     → Batch processing with parallel workers
  /job-forge negotiation → Negotiate a received offer (comp and terms)
  /job-forge rejection → Log a rejection or review rejection patterns

Inbox: add URLs to data/pipeline.md → /job-forge pipeline
Or paste a JD directly to run the full pipeline.

Token usage check (terminal, outside opencode):
  npx job-forge tokens --days 1        # today's sessions with input/cache breakdown
  npx job-forge tokens --session <id>  # drill into one session for cache-bust hunting
```

---

## Context Loading by Mode

**IMPORTANT: Only load files needed for the active mode.** Do NOT pre-load all data or mode files. This keeps token usage low.

After determining the mode, Read the necessary files before executing:

### Modes that require `_shared.md` + their mode file:
Read `modes/_shared.md` + `modes/{mode}.md`

Applies to: `auto-pipeline`, `offer`, `compare`, `pdf`, `contact`, `apply`, `pipeline`, `scan`, `batch`

### Standalone modes (only their mode file):
Read `modes/{mode}.md`

Applies to: `tracker`, `deep`, `training`, `project`, `followup`, `rejection`, `negotiation`

### Data files — load only when the mode needs them:

| File | Load when mode is... |
|------|---------------------|
| `data/applications.md` (or `data/applications/*.md` if day-based) | `tracker`, `followup`, `rejection`, `compare`, `auto-pipeline` (for dedup check), `batch` (for next number) |
| `data/pipeline.md` | `pipeline`, `scan` (to append new finds) |
| `data/scan-history.tsv` | `scan` only |
| `portals.yml` | `scan` only |
| `batch/batch-prompt.md` | `batch` only |
| `batch/batch-state.tsv` | `batch` only (for resume) |
| `config/profile.yml` | When `_shared.md` is loaded (it references profile) |
| `cv.md` | `pdf`, `auto-pipeline`, `apply` (when tailoring CV) |

**Do NOT read `data/scan-history.tsv` (70KB+), `portals.yml` (100KB+), or `data/applications.md` (grows over time) unless the mode explicitly needs them.**

### Modes delegated to subagent:
For `scan`, `apply` (with Geometra MCP), and `pipeline` (3+ URLs): launch as Agent with the content of `_shared.md` + `modes/{mode}.md` injected into the subagent prompt.

```
Agent(
  subagent_type="general-purpose",
  prompt="[content of modes/_shared.md]\n\n[content of modes/{mode}.md]\n\n[invocation-specific data]",
  description="job-forge {mode}"
)
```

Execute the instructions from the loaded mode file.

---

## Session Hygiene — REQUIRED for keeping token usage low

**Rule: multi-job workflows MUST delegate each job to its own subagent.**

Long interactive sessions (>100 messages) — especially with Geometra MCP doing repeated `geometra_fill_form` / `geometra_page_model` calls — accumulate conversation history that the model has to re-read on every turn. Tool results from Geometra disrupt prompt caching, so the full history is re-processed as *fresh* input tokens instead of cache reads. Observed symptom: `cache_read` drops to ~2K while `input_tokens` climbs to 100K+ per message.

This applies to:

- **`apply` mode with >1 job URL** → launch one subagent per URL (parallelize in batches of 5 — the Geometra MCP parallelism limit). Never run more than 1-2 applications in a single interactive session.
- **`batch` mode** → already uses `batch-runner.sh`'s parallel `opencode run` workers. Do not wrap `batch` in an interactive session that also does the form filling.
- **`pipeline` mode with 3+ URLs** → split into per-URL subagents.
- **Anything that calls `geometra_fill_form` more than twice in a row** should be split into subagents.

**Rationale:** A 300-message "apply to 20 jobs" session burns roughly 100K tokens of *fresh* input per message (history re-processed, cache busted). Twenty 30-message per-job subagents do the same work with each sub-session short enough that the cache actually holds — typically 5-10× lower effective token usage.

**Verify after running:** `npx job-forge tokens --session <id>` shows per-message input/cache. Messages with `cache_read < 5K` and `input > 50K` are cache-bust offenders — investigate what's disrupting the cache prefix (usually a mid-session tool schema change or a compact rerun).

**Also:** when the current session has only evaluation or tracker work (no Geometra / no long form flows), you can proceed in a single session. The rule targets tool-heavy multi-step work, not lightweight reads.