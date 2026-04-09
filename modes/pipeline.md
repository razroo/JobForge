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
3. **If there are 3+ pending URLs**, launch agents in parallel (Agent tool with `run_in_background`) to maximize speed.
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
