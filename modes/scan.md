# Mode: scan — Portal Scanner (Offer Discovery)

Scans configured job portals, filters by title relevance, and adds new offers to the pipeline for later evaluation.

## Recommended Execution

Run as a subagent to avoid consuming main context:

```
Agent(
    subagent_type="general-purpose",
    prompt="[contents of this file + specific data]",
    run_in_background=True
)
```

## Read This Configuration

Read `portals.yml` which contains:
- `search_queries`: List of WebSearch queries with `site:` filters per portal (broad discovery)
- `tracked_companies`: Specific companies with `careers_url` for direct navigation
- `title_filter`: Positive/negative/seniority_boost keywords for title filtering

## Apply This Discovery Strategy (3 levels)

### Use Level 1 — Direct Geometra (PRIMARY)

**For each company in `tracked_companies`:** Connect to its `careers_url` with Geometra MCP (`geometra_connect` + `geometra_page_model` / `geometra_list_items`), read ALL visible job listings, and extract the title + URL of each one. Direct Geometra is the most reliable method because:

- It sees the page in real time (not cached Google results).
- It works with SPAs (Ashby, Lever, Workday).
- It detects new offers instantly.
- It doesn't depend on Google indexing.

**Every company MUST have a `careers_url` in portals.yml.** If it doesn't, search for it once, save it, and use it in future scans.

### Use Level 2 — Greenhouse API (COMPLEMENTARY)

For companies using Greenhouse, the JSON API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`) returns clean structured data. Use as a quick complement to Level 1 — it's faster than Geometra but only works with Greenhouse.

### Use Level 3 — WebSearch Queries (BROAD DISCOVERY)

The `search_queries` with `site:` filters cover portals broadly (all Ashby boards, all Greenhouse boards, all Lever boards, all Workday boards). Useful for discovering NEW companies not yet in `tracked_companies`, but results may be outdated.

**Execution priority:**
1. Level 1: Geometra → all `tracked_companies` with `careers_url`
2. Level 2: API → all `tracked_companies` with `api:`
3. Level 3: WebSearch → all `search_queries` with `enabled: true`

The levels are additive — all are executed, results are merged and deduplicated.

## Run This Workflow

1. **Read configuration**: `portals.yml`
2. **Read history**: `data/scan-history.tsv` → previously seen URLs
3. **Read dedup sources**: all day files in `data/applications/` + `data/pipeline.md`

4. **Level 1 — Geometra scan** (sequential, or ≤2 parallel via `task` subagents per Hard Limit #1 in `AGENTS.md`):
   For each company in `tracked_companies` with `enabled: true` and `careers_url` defined:
   a. `geometra_connect` to the `careers_url`
   b. `geometra_page_model` or `geometra_list_items` to read all job listings
   c. If the page has filters/departments, navigate the relevant sections
   d. For each job listing extract: `{title, url, company}`
   e. If the page paginates results, navigate additional pages
   f. Accumulate in candidates list
   g. If `careers_url` fails (404, redirect), try `scan_query` as fallback and note for URL update

5. **Level 2 — Greenhouse APIs** (WebFetch can batch freely — it's cheap and doesn't use Geometra sessions):
   For each company in `tracked_companies` with `api:` defined and `enabled: true`:
   a. WebFetch the API URL → JSON with job list
   b. For each job extract: `{title, url, company}`
   c. Accumulate in candidates list (dedup with Level 1)

6. **Level 3 — WebSearch queries** (WebSearch is parallel-safe; batch freely):
   For each query in `search_queries` with `enabled: true`:
   a. Execute WebSearch with the defined `query`
   b. From each result extract: `{title, url, company}`
      - **title**: from the result title (before " @ " or " | ")
      - **url**: result URL
      - **company**: after " @ " in the title, or extract from domain/path
   c. Accumulate in candidates list (dedup with Level 1+2)

6. **Filter by title** using `title_filter` from `portals.yml`:
   - At least 1 keyword from `positive` must appear in the title (case-insensitive)
   - 0 keywords from `negative` must appear
   - `seniority_boost` keywords give priority but are not required

7. **Deduplicate** against 3 sources (URL-exact + fuzzy company+role):

   **Layer 1 — URL-exact:**
   - `scan-history.tsv` → exact URL already seen
   - `pipeline.md` → exact URL already in pending or processed

   **Layer 2 — Company + role fuzzy match (catches reposts with new URLs):**
   - all day files in `data/applications/` → normalize company name (lowercase, strip non-alphanumeric) + fuzzy role match (2+ significant words in common, words > 3 chars). This is the same logic used in `dedup-tracker.mjs` and `merge-tracker.mjs`.
   - `scan-history.tsv` → same fuzzy match against company + title columns (not just URL). A role reposted on a new URL but with the same company and similar title is a duplicate.
   - `pipeline.md` → same fuzzy match against company + title in pending items that include metadata (format: `- [ ] {url} | {company} | {title}`)

   **Fuzzy match rules:**
   - Normalize company: `company.toLowerCase().replace(/[^a-z0-9]/g, '')`
   - Fuzzy role match: split both titles into words > 3 chars, match if 2+ words overlap (substring match, case-insensitive). E.g., "Senior AI Engineer" and "Staff AI Engineer" share "engineer" — only 1 overlap, not a match. But "AI Platform Engineer" and "AI Platform Eng" share "platform" + partial "engineer" — match.
   - When a fuzzy match is found but the URL is new, log it as `skipped_repost` (not `skipped_dup`) with a note referencing the original entry number.

8. **For each new offer that passes filters**:
   a. Add to `pipeline.md` section "Pending": `- [ ] {url} | {company} | {title}`
   b. Record in `scan-history.tsv`: `{url}\t{date}\t{query_name}\t{title}\t{company}\tadded`

9. **Offers filtered by title**: record in `scan-history.tsv` with status `skipped_title`
10. **Duplicate offers (URL-exact)**: record with status `skipped_dup`
11. **Duplicate offers (fuzzy repost)**: record with status `skipped_repost` and note `repost of #{original_entry_num}`

## Extract Title And Company From WebSearch Results

WebSearch results come in the format: `"Job Title @ Company"` or `"Job Title | Company"` or `"Job Title — Company"`.

Extraction patterns by portal:
- **Ashby**: `"Senior AI PM (Remote) @ EverAI"` → title: `Senior AI PM`, company: `EverAI`
- **Greenhouse**: `"AI Engineer at Anthropic"` → title: `AI Engineer`, company: `Anthropic`
- **Lever**: `"Product Manager - AI @ Temporal"` → title: `Product Manager - AI`, company: `Temporal`

Generic regex: `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`

## Resolve Private URLs

If a publicly inaccessible URL is found:
1. Save the JD to `jds/{company}-{role-slug}.md`
2. Add to pipeline.md as: `- [ ] local:jds/{company}-{role-slug}.md | {company} | {title}`

## Scan History

`data/scan-history.tsv` tracks ALL seen URLs:

```
url	first_seen	portal	title	company	status
https://...	2026-02-10	Ashby — AI PM	PM AI	Acme	added
https://...	2026-02-10	Greenhouse — SA	Junior Dev	BigCo	skipped_title
https://...	2026-02-10	Ashby — AI PM	SA AI	OldCo	skipped_dup
```

## Output Summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executed: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
New added to pipeline.md: N

  + {company} | {title} | {query_name}
  ...

→ Run /job-forge pipeline to evaluate the new offers.
```

## Update careers_url

Each company in `tracked_companies` MUST have a `careers_url` — the direct URL to its job listings page. The stored URL avoids searching for it every time.

**Known patterns by platform:**
- **Ashby:** `https://jobs.ashbyhq.com/{slug}`
- **Greenhouse:** `https://job-boards.greenhouse.io/{slug}` or `https://job-boards.eu.greenhouse.io/{slug}`
- **Lever:** `https://jobs.lever.co/{slug}`
- **Custom:** The company's own URL (e.g., `https://openai.com/careers`)

**If `careers_url` doesn't exist** for a company:
1. Try the pattern for its known platform
2. If that fails, do a quick WebSearch: `"{company}" careers jobs`
3. Navigate with Geometra (`geometra_connect`) to confirm it works
4. **Save the found URL in portals.yml** for future scans

**If `careers_url` returns 404 or redirect:**
1. Note in the output summary
2. Try scan_query as fallback
3. Flag for manual update

## Update portals.yml

- **ALWAYS save `careers_url`** when adding a new company
- Add new queries as interesting portals or roles are discovered
- Disable queries with `enabled: false` if they generate too much noise
- Adjust filtering keywords as target roles evolve
- Add companies to `tracked_companies` when you want to follow them closely
- Verify `careers_url` periodically — companies change ATS platforms
