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
   b. For each job extract: `{title, url, company, gh_slug, gh_id, updated_at}`
      - **`url`**: ALWAYS record the canonical Greenhouse URL: `https://job-boards.greenhouse.io/{gh_slug}/jobs/{gh_id}`. Do **NOT** use `absolute_url` when it points to a customer-skinned front-end (e.g. `pinterestcareers.com/jobs/?gh_jid=N`, `okta.com/company/careers/opportunity/N`, `samsara.com/company/careers/roles/N`, `zoominfo.com/careers?gh_jid=N`, `collibra.com/.../?gh_jid=N`, `careers.toasttab.com/jobs?gh_jid=N`, `careers.airbnb.com/positions/N`, `coinbase.com/careers/positions/N`, `instacart.careers/job/?gh_jid=N`, `pinterestcareers.com/jobs/?gh_jid=N`). These customer front-ends return shells or 403 to bots and cause downstream WebFetch-based verification to wrongly mark the role CLOSED.
      - **`gh_slug`**: the Greenhouse board slug (from the API URL that was fetched).
      - **`gh_id`**: `jobs[].id` from the API response.
      - **`updated_at`**: `jobs[].updated_at` — record for staleness detection (skip if older than 90 days, flag if older than 30).
   c. Accumulate in candidates list (dedup with Level 1). The pipeline.md entry MUST carry `| gh={gh_slug}/{gh_id}` at the end of the metadata so downstream evaluators can fall back to `https://boards-api.greenhouse.io/v1/boards/{gh_slug}/jobs/{gh_id}` when the canonical URL renders as a shell.

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
   a. Add to `pipeline.md` section "Pending": `- [ ] {url} | {company} | {title} | ats={ats}` — the `| ats={type}` suffix is REQUIRED for every entry (values: `greenhouse`, `ashby`, `workable`, `lever`, `workday`, `builtin`, `custom`, `unknown`). When the offer came from the Greenhouse API (Level 2), ALSO append `| gh={gh_slug}/{gh_id}` so downstream verification can hit the JSON endpoint. Example entries:
      - `- [ ] https://job-boards.greenhouse.io/webflow/jobs/7689676 | Webflow | Lead AI Engineer | ats=greenhouse | gh=webflow/7689676`
      - `- [ ] https://jobs.ashbyhq.com/everai/abc-123 | EverAI | Senior AI PM | ats=ashby`
      - `- [ ] https://jobs.lever.co/temporal/xyz | Temporal | Product Manager - AI | ats=lever`
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

## Structured Output — Required for Downstream Dispatch

Scan mode MUST write its ranked candidate list to a file, not just return it in prose. Downstream subagents (evaluators, applyers) must read URLs from this file, not from the scan subagent's return message. This prevents any hallucinated URL or ID from propagating.

**File location**: `batch/scan-output-{YYYY-MM-DD}.md`

**Format**: one markdown table per scan run, ordered by archetype-fit rank:

| rank | company | ats | role | gh_slug | gh_id | url | updated_at |
|------|---------|-----|------|---------|-------|-----|------------|
| 1    | Webflow | greenhouse | Lead AI Engineer | webflow | 7689676 | https://job-boards.greenhouse.io/webflow/jobs/7689676 | 2026-04-14 |
| 2    | EverAI  | ashby      | Senior AI PM     | -       | -       | https://jobs.ashbyhq.com/everai/abc-123 | 2026-04-15 |
| ... | ... | ... | ... | ... | ... | ... | ... |

**`ats` values** (one of): `greenhouse`, `ashby`, `workable`, `lever`, `workday`, `builtin`, `custom`, `unknown`. Every row MUST populate this column — it's what the apply subagent uses to pick the correct Gmail OTP sender query.

Every row MUST have:
- `ats` — the ATS platform hosting the posting. Inferred from the canonical URL host (e.g. `boards-api.greenhouse.io` / `job-boards.greenhouse.io` → `greenhouse`; `jobs.ashbyhq.com` → `ashby`; `jobs.lever.co` → `lever`; `myworkdayjobs.com` / `.wd5.myworkdayjobs.com` → `workday`; `apply.workable.com` / `jobs.workable.com` → `workable`; `builtin.com/jobs/` → `builtin`; company-own domains → `custom`; anything indeterminate → `unknown`).
- `url` in canonical form. For Greenhouse use `https://job-boards.greenhouse.io/{gh_slug}/jobs/{gh_id}` (matching the suffix in `data/pipeline.md`). For other ATSes use the platform's native URL (do not rewrite).
- `updated_at` in `YYYY-MM-DD` form (the most recent `updated_at` in the API response, or scan date when the source has no such field).

Additional columns — REQUIRED when available, `-` (dash) when not applicable:
- `gh_slug`, `gh_id` — Greenhouse-only. Copied verbatim from the Greenhouse API response (not reconstructed). For non-Greenhouse rows, emit `-` in both columns; `ats` + `url` are sufficient.

The scan subagent's return message MUST:
- Reference the file path (so orchestrators know where to read)
- Omit the ranked URL list from prose entirely (summary counts only)

**Rationale**: in a prior run, a scan subagent returned correct IDs in `scan-history.tsv` but hallucinated plausible-looking fake IDs in its prose-form top-30 list. The orchestrator trusted prose and dispatched 30 downstream subagents against fake URLs. File-based handoff prevents this class of error. Recording `ats` at scan time (rather than having the apply subagent infer it from the URL host) saves downstream re-parsing and keeps the OTP sender lookup deterministic.

## Output Summary

```
Portal Scan — {YYYY-MM-DD}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Queries executed: N
Offers found: N total
Filtered by title: N relevant
Duplicates: N (already evaluated or in pipeline)
New added to pipeline.md: N

NEXT STEP RECOMMENDATION:
- Structured candidate list written to: batch/scan-output-{YYYY-MM-DD}.md
- Downstream subagents MUST read URLs from that file, not from this return message
- Run /job-forge pipeline to evaluate the new offers.
```

## Verify Before Marking CLOSED (downstream rule)

**DO NOT mark a Greenhouse offer CLOSED based on a WebFetch/Geometra result alone.** Customer-skinned careers pages (`pinterestcareers.com`, `okta.com`, `samsara.com`, `zoominfo.com`, `collibra.com`, `careers.toasttab.com`, `careers.airbnb.com`, `coinbase.com`, `instacart.careers`, etc.) serve bot-hostile shells — a 403, a navbar-only response, or a client-side-only render. WebFetch sees "no JD" and mis-classifies as CLOSED.

**Correct verification order for any Greenhouse-sourced URL** (identified by a `| gh={slug}/{id}` suffix in `pipeline.md` or a `boards-api.greenhouse.io` / `job-boards.greenhouse.io` / `boards.greenhouse.io` host):

1. Try `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs/{id}`. This is the authoritative source.
   - **200 + JSON with `title` and `content`** → offer is LIVE. Use the JSON content as the JD. Do not mark CLOSED.
   - **404** → offer is genuinely closed. Mark CLOSED.
   - **Other non-2xx** → treat as transient (network/rate-limit); retry once. If still failing, mark `**Verification: unconfirmed**` and continue evaluation from whatever text is available. Do NOT mark CLOSED.
2. Only then fall back to WebFetch of the canonical `job-boards.greenhouse.io/{slug}/jobs/{id}` URL.
3. Only then fall back to Geometra on the same canonical URL.

**Rule of thumb:** Greenhouse postings with valid `gh_slug`/`gh_id` should be verified via the API first. A WebFetch failure on a customer-skinned domain is NOT evidence the role is closed.

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
