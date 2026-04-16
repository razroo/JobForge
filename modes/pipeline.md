# Mode: pipeline — URL Inbox (Second Brain)

Processes accumulated job offer URLs from `data/pipeline.md`. The user adds URLs at any time and then runs `/job-forge pipeline` to process them all.

## Workflow

1. **Read** `data/pipeline.md` → find `- [ ]` items in the "Pending" section
2. **For each pending URL**:
   a. Calculate the next sequential `REPORT_NUM` (read `reports/`, take the highest number + 1)
   b. **Extract JD** using Geometra MCP (geometra_connect + geometra_page_model) → WebFetch → WebSearch
   c. If the URL is not accessible → mark as `- [!]` with a note and continue
   d. **Run full auto-pipeline**: A-F Evaluation → Report .md → PDF (if score >= 3.0, per `_shared.md` thresholds) → Draft answers (if score >= 3.5) → Tracker
   e. **Move from "Pending" to "Processed"**: `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`
3. **Parallel dispatch — max 2 at a time** (Hard Limit #1 in `AGENTS.md`). For N pending URLs, run `ceil(N/2)` rounds of 2 `task` dispatches. Never 3+ in one message.
4. **When finished**, display a summary table:

```
| # | Company | Role | Score | PDF | Recommended action |
```

## pipeline.md Format

```markdown
## Pending
- [ ] https://jobs.example.com/posting/123
- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM
- [!] https://private.url/job — Error: login required

## Processed
- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅
- [x] #144 | https://boards.greenhouse.io/xyz/jobs/012 | BigCo | SA | 2.1/5 | PDF ❌
```

## Smart JD Detection from URL

1. **Geometra MCP (preferred):** `geometra_connect` + `geometra_page_model`. Works with all SPAs, uses fewer tokens than raw DOM snapshots.
2. **WebFetch (fallback):** For static pages or when Geometra is not available.
3. **WebSearch (last resort):** Search on secondary portals that index the JD.

**Special cases:**
- **LinkedIn**: May require login → mark `[!]` and ask the user to paste the text
- **PDF**: If the URL points to a PDF, read it directly with the Read tool
- **`local:` prefix**: Read the local file. Example: `local:jds/linkedin-pm-ai.md` → read `jds/linkedin-pm-ai.md`

## Automatic Numbering

1. List all files in `reports/`
2. Extract the number from the prefix (e.g., `142-medispend...` → 142)
3. New number = highest found + 1

## Source Synchronization

Before processing any URL, verify sync:
```bash
node cv-sync-check.mjs
```
If there is a desynchronization, warn the user before continuing.

## Pipeline runbook (follow literally when N ≥ 2)

```
Step 1  — Read data/pipeline.md; collect "- [ ]" URLs into `pending = [url_1, ..., url_N]`
Step 2  — Pre-flight cleanup (once, before loop):
            geometra_list_sessions()
            geometra_disconnect({ closeBrowser: true })
Step 3  — For round in ceil(N/2):
            pair = pending[round*2 : round*2 + 2]
            # ONE message, 1 or 2 task() calls. Never 3.
            task(process url pair[0])
            task(process url pair[1])  # only if pair has 2
            # WAIT for both returns before the next round.
Step 4  — Between rounds: geometra_list_sessions() + geometra_disconnect({closeBrowser: true})
Step 5  — Reconcile outcomes (Hard Limit #6):
            bash: node merge-tracker.mjs      # TSVs → correct day file
            bash: node verify-pipeline.mjs    # validate URL/status consistency
Step 6  — Display summary table; flag any verify-pipeline errors.
```

**Hard rules:**
- Max 2 `task` dispatches per message (Hard Limit #1).
- Never re-dispatch a URL whose previous subagent is still in-flight (Hard Limit #5).
- Orchestrator does not call `geometra_fill_form` / `geometra_page_model` in multi-URL runs (Hard Limit #4) — delegate.
- **The only edits allowed to `data/pipeline.md` are flipping `[ ]` → `[x]`** (inbox state) (Hard Limit #6). APPLIED / FAILED / SKIP outcomes go via `batch/tracker-additions/*.tsv` into the day file. Do NOT write application status to pipeline.md.
