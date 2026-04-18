# JobForge -- AI Job Search Pipeline

## Hard Limits — NEVER exceed these numbers

The Hard Limits below are non-negotiable numeric rules. If you catch yourself about to violate one, STOP and restructure.

1. **Max parallel subagents: 2.** Never emit 3+ `task` tool calls in a single message. For N jobs, run `ceil(N/2)` sequential rounds of 2. No exceptions — not for "urgent", not for "the user asked for 10".
2. **Max 1 application per company+role.** Before every `task` dispatch for `apply`, Grep ALL of the following for the URL and for `company+role`:
   - `data/pipeline.md`
   - all `data/applications/*.md` day files (not just today's — prior-day Applies count too)
   - `batch/tracker-additions/*.tsv` (pending outcomes not yet merged)
   - `batch/tracker-additions/merged/*.tsv` (outcomes already consumed into day files — catches same-day earlier-batch Applies that merge collapsed into an existing row)

   If any source shows an APPLIED / Applied outcome for this URL or company+role, skip that job and do not dispatch. **Why merged/ matters**: when two batches in the same day target the same role, `npx job-forge merge` updates the existing day-file row instead of creating a new one — so `grep data/applications/*.md` for the higher report number misses the earlier apply. The merged TSV is the only place the newer attempt's breadcrumb remains.
3. **Always clean Geometra sessions before dispatching.** Before every round of `task` dispatches that will use Geometra, call `geometra_list_sessions` then `geometra_disconnect({closeBrowser: true})`. Every round. The disconnect is a no-op when the pool is empty.
4. **Orchestrator does NOT fill forms.** This session MUST NOT call `geometra_fill_form`, `geometra_run_actions`, `geometra_pick_listbox_option`, or `geometra_fill_otp` when handling a multi-job request. If you need to, it means you MUST have delegated — `task` out the remaining work instead.
5. **Re-dispatch only AFTER the previous subagent returns.** Never fire the same company's `task` twice while the first is still in-flight. Wait for the return value, then decide if a retry is warranted.
6. **Application outcomes flow through TSVs, not `data/pipeline.md`.** When a subagent returns APPLIED / FAILED / SKIP, the outcome goes to `batch/tracker-additions/{num}-{slug}.tsv`. `npx job-forge merge` then consumes the TSVs into the correct `data/applications/YYYY-MM-DD.md` day file. `data/pipeline.md` only tracks URL inbox state (`[ ]` pending → `[x]` processed). **NEVER append APPLIED / FAILED status lines to `pipeline.md`** — that's the day file's job, via the TSV pathway. After any multi-apply run, the orchestrator MUST run `npx job-forge merge` followed by `npx job-forge verify` before ending the session.
7. **Load-bearing facts passed to downstream subagents must come from a file, not from a prior subagent's prose.** A URL, score, email ID, confirmation page snippet, JD salary range, exact answer submitted to a form question, or any other specific value that a downstream subagent will act on MUST originate from one of:
   - `data/pipeline.md` (URL inbox state)
   - `data/scan-history.tsv` (scan provenance)
   - `batch/scan-output-*.md` (scan-ranked candidates)
   - A report file (`reports/{num}-*.md`) with authoritative headers (`**URL:**`, `**Score:**`, etc.)
   - A TSV in `batch/tracker-additions/` (per-apply outcomes)

   **Not trustworthy by default**: anything quoted from a subagent's return message, any ID or score the orchestrator "remembers" from prose, any page-content snippet reproduced from a subagent's narrative. Subagents can hallucinate plausible-looking IDs, scores, and confirmation text. Before passing any such fact to another subagent, cross-check it exists in one of the authoritative files above, OR instruct the dispatching subagent to write its output to a structured file and re-read from that file.

   **Why**: on 2026-04-18, a scan subagent returned 30 fabricated Greenhouse IDs in prose (correct role titles, plausible-looking invented IDs that didn't exist in the API). The orchestrator dispatched 30 downstream subagents that all hit 404s. Verification rules downstream (Hard Limit #6, API-first verify) caught the symptom. This rule prevents the *shape* of the bug — hallucinations propagating through prose handoffs — across all quantitative / identifier / specific-fact claims, not just URLs.

Everything below is context and rationale. These seven numbers are the rules.

---

## Session Hygiene — ALWAYS enforce

**Multi-job workflows MUST delegate each job to its own subagent.** This rule applies even when the user does NOT explicitly invoke `/job-forge`.

Whenever the user says any variation of "apply to N jobs", "process the pipeline", "batch evaluate", or similar phrasing that implies more than one application/evaluation in sequence:

1. **Do not drive all N jobs from this session.** Repeated `geometra_fill_form` / `geometra_page_model` calls accumulate in conversation history and invalidate prompt caching — each new message ends up re-processing 100K+ tokens of fresh history instead of reading from cache.
2. **Launch one subagent per job, in parallel batches of ≤2** (see Hard Limits #1). Higher parallelism blows through free-tier rate limits and each subagent requires post-cleanup. Use the `task` tool / Agent with `subagent_type="general-purpose"`, passing the single URL and the relevant mode file content.
3. **This session acts as the orchestrator only**: plan, pick the jobs, dispatch subagents, aggregate results. No Geometra form-filling in this session unless it's a single one-off application.

**Why:** observed on a real run — a 341-msg "apply to 20 jobs" session had `cache_read ~1.8K` on 5 messages where input ballooned to 100K-144K tokens. A 40-msg orchestrator session that delegates instead stays under 40K input max with cache reads at full 100K+. Same work, ~5× fewer effective tokens.

**Verify after running:** `npx job-forge tokens --session <id>` — any message with `cache_read < 5K` and `input > 50K` is a cache-bust; next time split that work across subagents.

**Exception:** evaluation-only or tracker-only work (no Geometra, no repeated tool calls) can proceed in a single session. The rule targets tool-heavy multi-step loops.

**Before any batch-apply dispatch, run the Apply Preflight location filter from `modes/apply.md`** to exclude location-incompatible candidates. Catches the common case where an evaluated role has the right role-shape but a deal-breaking location that profile.yml already rules out.

---

## Subagent Routing — which agent for which task

The harness ships three subagents (see `.opencode/agents/`). The orchestrator MUST route work by cost tier, not pick the default for everything. **GLM 5.1 does not discount cache reads**, so running procedural work on it costs ~10× what it would on a cache-discounting model. Free-tier models handle procedural work fine (confirmed empirically: `opencode/big-pickle` processed 1000+ messages at $0 in prior runs).

| Task type | Subagent | Why |
|-----------|----------|-----|
| Drive Geometra form-fill / submit (atomic `run_actions`) | `@general-free` | Procedural; label-driven; deterministic |
| Merge TSVs, run `verify-pipeline.mjs`, dedup | `@general-free` | Script-driven; no writing quality needed |
| OTP retrieval via Gmail MCP + `geometra_fill_otp` | `@general-free` | Fixed-shape lookup + input |
| Scan portals, extract offer metadata, return structured records (see schema below) | `@general-free` | Structured output; no judgment |
| Evaluation narrative — Blocks A-F per `modes/offer.md` | `@general-paid` | Judgment + writing quality |
| Cover letter, "Why X?" answers, Section G drafts | `@general-paid` | Tone and specificity matter |
| STAR+R interview stories, story-bank curation | `@general-paid` | Quality signals seniority |
| LinkedIn outreach messages (`modes/contact.md`) | `@general-paid` | First impression |
| "Extract N fields from this text → JSON" (≤5K input) | `@glm-minimal` | One-shot transform; no context needed |
| "Classify this JD as archetype X/Y/Z" | `@glm-minimal` | Narrow, structured output |

**Example JSON shape for the "extract / emit JSON" subagent rows above** (use this exact key set when delegating a portal-scan / extract task):

```json
{
  "company": "Acme",
  "role": "Senior Backend Engineer",
  "location": "Remote (US)",
  "comp_range_usd": "180000-220000",
  "archetype": "backend-platform",
  "url": "https://..."
}
```

**Rule:** when you (the orchestrator) delegate a task, pick the cheapest agent that can do it well. Do NOT route every subagent through the same tier. Auto-pipeline mode MUST split a single job across `@general-paid` (evaluation) and `@general-free` (PDF gen + tracker + apply), not run it all on one model.

**When to break this rule:** if the user explicitly asks for "quality over cost" or flags a high-stakes application (top-tier company, offer-stage negotiation, executive search), route everything through `@general-paid`. Document the exception in the session.

### Pre-flight delegation (HARD RULE)

For any task that will involve **more than one tool call** — i.e., anything beyond a one-shot answer — the orchestrator's **first tool call MUST be `task`** (dispatching to a subagent). Not `Read`, not `Bash`, not `geometra_connect`, not `Grep`. The orchestrator plans and dispatches; subagents execute.

**Why this is absolute:** every tool call in the orchestrator accumulates in the top-level session's history and pollutes the cache prefix. Once the orchestrator has read three files and made two Geometra calls, delegating to a subagent no longer helps — the subagent inherits the bloated context. The only way to keep the orchestrator lean is to delegate *before* doing anything else.

**What counts as "more than one tool call":**
- Evaluating any offer (always ≥3 steps: fetch JD, score, write report)
- Any `/job-forge` mode invocation except `tracker` (read-only)
- Applying to a job
- Scanning portals
- Any batch operation

**Explicit exception:** trivial one-shot answers — "what does this error mean?", "read this file and summarize", "what's my next report number?" — can stay in the orchestrator. If the question can be answered in ≤1 tool call, do not delegate.

**Detection signal:** if you (orchestrator) find yourself about to make your 2nd tool call in a session that wasn't a trivial one-shot, STOP. Instead, `task` out the remaining work as a single delegated job.

---

## What is JobForge

AI-powered job search automation built on opencode: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

**It will work out of the box, but it's designed to be made yours.** Ask if the archetypes don't match your career. Ask if the modes are in the wrong language. Ask if the scoring doesn't fit your priorities. You (opencode) can edit any file in this system. The user says "change the archetypes to data engineering roles" and you do it. Customization is the whole point.

### Main Files

| File | Function |
|------|----------|
| `data/applications/` | Application tracker (day-based: `YYYY-MM-DD.md`) |
| `data/pipeline.md` | Inbox of pending URLs |
| `data/scan-history.tsv` | Scanner dedup history |
| `portals.yml` | Query and company config |
| `templates/cv-template.html` | HTML template for CVs |
| `generate-pdf.mjs` | Geometra MCP (`geometra_generate_pdf`): HTML to PDF |
| `article-digest.md` | Compact proof points from portfolio (optional) |
| `interview-prep/story-bank.md` | Accumulated STAR+R stories across evaluations |
| `reports/` | Evaluation reports (format: `{###}-{company-slug}-{YYYY-MM-DD}.md`) |

### First Run — Onboarding (IMPORTANT)

**Before doing ANYTHING else, check if the system is set up.** Run these checks silently every time a session starts:

1. Does `cv.md` exist?
2. Does `config/profile.yml` exist (not just profile.example.yml)?
3. Does `portals.yml` exist (not just templates/portals.example.yml)?

**If ANY of these is missing, enter onboarding mode.** Do NOT proceed with evaluations, scans, or any other mode until the basics are in place. Guide the user step by step:

#### Step 1: CV (required)
If `cv.md` is missing, ask:
> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft a CV for you
>
> Which do you prefer?"

Create `cv.md` from whatever they provide. Make it clean markdown with standard sections (Summary, Experience, Projects, Education, Skills).

#### Step 2: Profile (required)
If `config/profile.yml` is missing, copy from `config/profile.example.yml` and then ask:
> "I need a few details to personalize the system:
> - Your full name and email
> - Your location and timezone
> - What roles are you targeting? (e.g., 'Senior Backend Engineer', 'AI Product Manager')
> - Your salary target range
>
> I'll set everything up for you."

Fill in `config/profile.yml` with their answers. For archetypes, map their target roles to the closest matches and update `modes/_shared.md` when the existing archetypes do not cover their target roles.

#### Step 3: Portals (recommended)
If `portals.yml` is missing:
> "I'll set up the job scanner with 45+ pre-configured companies. Want me to customize the search keywords for your target roles?"

Copy `templates/portals.example.yml` → `portals.yml`. If they gave target roles in Step 2, update `title_filter.positive` to match.

#### Step 4: Tracker
If `data/applications/` directory doesn't exist, create it:
```bash
mkdir -p data/applications
```
The tracker stores entries in day-based files like `data/applications/2026-04-13.md`. Each file has the same table format:
```markdown
# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

#### Step 5: Ready
Once all files exist, confirm:
> "You're all set! You can now:
> - Paste a job URL to evaluate it
> - Run `/job-forge scan` to search portals
> - Run `/job-forge` to see all commands
>
> Everything is customizable — just ask me to change anything.
>
"

Then suggest automation:
> "Want me to scan for new offers automatically? I can set up a recurring scan every few days so you don't miss anything. Just say 'scan every 3 days' and I'll configure it."

If the user accepts, use the `/loop` or `/schedule` skill (if available) to set up a recurring `/job-forge scan`. If those aren't available, suggest adding a cron job or remind them to run `/job-forge scan` periodically.

### Personalization

JobForge is designed to be customized by YOU (opencode). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

**Common customization requests:**
- "Change the archetypes to [backend/frontend/data/devops] roles" → edit `modes/_shared.md`
- "Translate the modes to English" → edit all files in `modes/`
- "Add these companies to my portals" → edit `portals.yml`
- "Update my profile" → edit `config/profile.yml`
- "Change the CV template design" → edit `templates/cv-template.html`
- "Adjust the scoring weights" → edit `modes/_shared.md` and `batch/batch-prompt.md`

### Skill Modes

| If the user... | Mode |
|----------------|------|
| Pastes JD or URL | auto-pipeline (evaluate + report + PDF + tracker) |
| Asks to evaluate offer | `offer` |
| Asks to compare offers | `compare` |
| Wants LinkedIn outreach | `contact` |
| Asks for company research | `deep` |
| Wants to generate CV/PDF | `pdf` |
| Evaluates a course/cert | `training` |
| Evaluates portfolio project | `project` |
| Asks about application status | `tracker` |
| Fills out application form | `apply` |
| Searches for new offers | `scan` |
| Processes pending URLs | `pipeline` |
| Batch processes offers | `batch` |
| Asks what needs follow-up | `followup` |
| Reports a rejection | `rejection` |
| Receives a job offer | `negotiation` |

### CV Source of Truth

- `cv.md` in project root is the canonical CV
- `article-digest.md` has detailed proof points (optional)
- **NEVER hardcode metrics** -- read them from these files at evaluation time

---

## Ethical Use -- CRITICAL

**Applying to jobs via Geometra MCP is NOT impersonation.** The agent uses the user's credentials, CV, and information to apply on their behalf. This is the same as the user applying themselves — the agent is an extension of the user's will. Think of it as a browser automation tool that fills forms with the user's data.

**This system is designed for quality, not quantity.** The goal is to help the user find and apply to roles where there is a genuine match -- not to spam companies with mass applications.

- **Continuous pipeline for 3.0+ offers:** When scanning, evaluating, and applying — run the full pipeline end-to-end without pausing for confirmation. Scan → evaluate → fill form → submit for any offer scoring 3.0/5 or above. Do NOT stop between steps to ask "want me to continue?" — just do it.
- **Auto-submit:** For offers scoring 3.0+/5, fill and submit the application automatically. For offers below 3.0/5, mark as SKIP and move on.
- **Still respect quality:** Only apply where there is a genuine match (3.0+ ensures this). Auto-SKIP anything below 3.0.
- **Respect recruiters' time.** Every application a human reads costs someone's attention. Only send what's worth reading.

---

## Offer Verification -- MANDATORY

**When Geometra MCP is available** (interactive sessions), ALWAYS use it to verify offers:
1. `geometra_connect` to the URL (via proxy)
2. `geometra_page_model` to read structured page content
3. Only footer/navbar without JD = closed. Title + description + Apply = active.

**When Geometra MCP is NOT available** (batch workers via `opencode run`, headless environments):
1. Use WebFetch to retrieve the page content
2. Check for JD text, job title, and apply button/link in the response
3. If WebFetch returns only a shell/navbar (no JD content), mark the offer as `**Verification: unconfirmed**` in the report header
4. Do NOT skip the evaluation — proceed but flag the uncertainty so the user can verify manually before applying

The goal is to never waste time on closed offers, but also never silently assume a role is active when verification was incomplete.

---

## OTP Handling via Gmail MCP -- REQUIRED

When a form says "enter the code we sent to your email", you MUST retrieve the code from Gmail. NEVER ask the user to paste it. NEVER mark the application as failed without checking Gmail first.

**You have exactly two Gmail tools.** There is NO `gmail_search_messages` and NO `gmail_read_message`. Use only these:

| Tool | What it does | Key parameter |
|------|-------------|---------------|
| `gmail_list_messages` | Search emails. Returns message IDs + snippets. | `q` — Gmail search query string |
| `gmail_get_message` | Read one email by ID. Returns full headers + body. | `id` — message ID from step 1 |

**Step-by-step recipe (follow exactly):**

1. Reach the OTP step in the form. Do NOT close or abandon the session.
2. Wait ~5-10 seconds for the email to arrive.
3. Call `gmail_list_messages` with `q` set to the sender query from the Sender Lookup Table. Example:
   ```
   gmail_list_messages({ q: "from:greenhouse newer_than:10m", maxResults: 5 })
   ```
4. Take the `id` field from the first result. Call `gmail_get_message` with that `id`. Example:
   ```
   gmail_get_message({ id: "19d84d63a273c271" })
   ```
5. Find the code in the snippet or body. It is usually 6-8 characters near words like "security code" or "verification code".
6. Call `geometra_fill_otp` with the code. Example:
   ```
   geometra_fill_otp({ value: "ABC12345", sessionId: "..." })
   ```
7. Submit the form.

**Sender Lookup Table:**

| Portal | `q` value for `gmail_list_messages` |
|--------|-------------------------------------|
| Greenhouse | `from:greenhouse newer_than:10m` |
| Workday | `from:myworkday newer_than:10m` |
| Lever | `from:lever newer_than:10m` |
| Ashby | `from:ashby newer_than:10m` |
| SmartRecruiters | `from:smartrecruiters newer_than:10m` |
| Aggregator redirect (WeWorkRemotely / RemoteOK) | Detect the underlying ATS from the post-redirect URL, then use that row's sender query |
| Unknown | `newer_than:10m subject:(verify OR code OR confirm)` |

**Rules:**
- ALWAYS check Gmail before reporting a submission as failed.
- If "submit button did nothing", it usually means an OTP step appeared. Check Gmail.
- If no email after 10 seconds, retry `gmail_list_messages` once more with `newer_than:5m`.

---

## Geometra Form-Fill Patterns

### Validation State Lags Behind Actual Field State

**This is a known issue across Greenhouse, Ashby, and similar ATS portals.** The frontend validation does not always update synchronously with field input. A field can be correctly filled but still show `invalid: true` or "This field is required" in the schema for 3-10 seconds — or even permanently until the user interacts with another field.

**Common false-positive patterns:**
- `set_checked` / `geometra_set_checked` sets a checkbox to `checked: true`, but the schema still shows `invalid: true` with "This field is required." A known lag affects privacy policy / acknowledgment checkboxes.
- A dropdown/choice field is correctly picked, but the invalid flag persists.
- A text field is filled correctly, but validation error text remains until the user tabs or blurs the field.
- Combobox / autocomplete fields show stale "invalid" overlays after correct selection (Greenhouse, Ashby, Workday, Lever) but submit successfully.

**Rule: Do NOT get stuck in a fill loop.** If a field value looks correct (checked=true, value="No", "Yes") but `invalidCount` is unchanged:

1. **Try Submit anyway.** The major portals (Greenhouse, Workday, Lever, Ashby) allow submission with stale validation errors as long as the underlying value is correct.
2. **If Submit is disabled**, try interacting with a nearby field (Tab, click another input) to force validation recalculation.
3. **If a checkbox still shows invalid after `set_checked`**, try clicking it directly by coordinates (`geometra_click` with x,y) instead of the label-based toggle.
4. **For combobox fields**, pick the option via `geometra_pick_listbox_option` (preferred) rather than typing — typing into comboboxes often creates a stale autocomplete overlay that blocks confirmation.

**Decision tree for "field shows invalid after fill":**

```
Is the visible value correct?
├── YES → Try Submit (preferred action)
│         If Submit disabled → Tab away and back, then try Submit
│         Still blocked → try clicking a nearby field to force recalc
└── NO → Re-fill the field using the correct field id
```

**The `invalidCount` from schema is a heuristic, not ground truth.** Always prefer direct observation of field values over the invalid count. If Submit becomes enabled, ignore any remaining invalid fields — the portal accepted the data.

### Nested Scroll Containers (Greenhouse / Ashby)

The major ATS portals (Greenhouse, Workday, Lever, Ashby) use nested scrollable regions. A field's `visibleBounds` may show it as off-screen even when it is actually visible within a child scroll container. Geometra's `scroll_to` operates on the outermost page scroll, so it cannot reach fields in inner scroll regions.

**Signs you are dealing with nested scroll:**
- `scroll_to` reports `revealed: false` with `maxSteps` exhausted, but you can see the field in the page model
- A field's `y` coordinate in `bounds` is far outside the viewport, yet it is visible on screen
- Wheel events at one `y` coordinate scroll a different region than expected

**Workaround:**
1. Use `geometra_wheel` at a low `y` value (e.g., 360, near the top of the viewport) to scroll the outer container
2. Alternatively, click directly on the element using `geometra_click` with x,y coordinates derived from the element's `visibleBounds` center
3. Once in the correct scroll region, `scroll_to` within that region works correctly

### Corrupted Fields (Text Typed Into Listbox)

Sometimes text typed into the wrong field (e.g., an essay pasted into a listbox search field) corrupts the field state. The listbox shows the typed text as a search query and refuses to clear.

**Recovery:**
1. Find and click the "Clear selections" button (`role: "button"`, `name: "Clear selections"`) — this usually resets the field
2. After clearing, use `geometra_pick_listbox_option` to select the correct value
3. If "Clear selections" is not available, try pressing `Escape` multiple times or clicking outside the dropdown

### Parallel Form Submissions — Isolated Sessions Required

When running multiple application forms in parallel, each `geometra_connect` MUST use `isolated: true`. Without this flag, sessions share the Chromium browser pool and contaminate each other's localStorage, cookies, and autocomplete state — one job's email address can leak into another job's form.

**Correct parallel pattern:**
```javascript
geometra_connect({ pageUrl: "https://...", isolated: true, headless: true, slowMo: 350 })
```

**Wrong:** running `geometra_connect` without `isolated: true` when submitting multiple forms concurrently. The forms may share state and produce incorrect submissions.

### Session Reuse — When Subagents Cannot Reach Existing Sessions

Subagents launched via the `task` tool start with a fresh context and cannot automatically attach to Chromium sessions spawned by a previous orchestrator session. If you dispatch a subagent to fill a form in session `s16`, but `s16` was created by a previous opencode session, the subagent's MCP calls will silently fail (returning empty results) because the subagent's MCP server has no knowledge of `s16`.

**Rule:** When resuming work on forms that were opened in a previous opencode session, drive them from the current orchestrator session directly — do not delegate to a subagent.

**Session IDs persist** across the same opencode session. Within one orchestrator session, `geometra_list_sessions` correctly shows all active sessions (s16, s17, s18, and any other s-prefixed IDs from this session) and `geometra_fill_form`, `geometra_page_model`, and other tools work against those sessions. Subagents are only reliable for NEW form-fill sessions they open themselves.

### Stale Session Cleanup — MANDATORY

**Problem in one sentence:** if any previous subagent aborted (ran out of context, timed out, hit tool error), the Chromium session it opened is STUCK in the Geometra MCP pool, and the NEXT `geometra_connect` will fail with `Not connected`.

**Fix in one sentence:** ALWAYS run `geometra_list_sessions` + `geometra_disconnect` BEFORE `geometra_connect`. Every time. No exceptions except the one explicit exception below.

---

#### Rule 1 — Orchestrator pre-dispatch cleanup (DO THIS EVERY TIME)

Before dispatching ANY batch of subagents that will use Geometra (apply, scan, pipeline, batch, auto-pipeline), run these TWO tool calls IN ORDER, with these EXACT arguments:

```
Step 1:  geometra_list_sessions()
Step 2:  geometra_disconnect({ closeBrowser: true })
```

**DO NOT** think about whether cleanup is needed. **DO NOT** check if sessions look "fine". **DO NOT** skip Step 2 if Step 1 returns an empty list. Just run both, every time, before `task` dispatch. It costs ~100 tokens and prevents cascade failures.

**Then** dispatch your subagents.

**Single exception:** if you (the orchestrator) opened a session earlier in THIS SAME conversation and want a subagent to attach to it, skip cleanup and pass the exact `sessionId` to the subagent. This applies to interactive single-application flows only.

---

#### Rule 2 — Subagent pre-flight cleanup (DO THIS EVERY TIME)

Every subagent that uses Geometra must run these THREE tool calls as its FIRST three tool calls, in this order, with these EXACT arguments:

```
Step 1:  geometra_list_sessions()
Step 2:  geometra_disconnect({ closeBrowser: true })
Step 3:  geometra_connect({ pageUrl: "<the URL the orchestrator gave you>", isolated: true, headless: true, slowMo: 350 })
```

**DO NOT** skip Step 1 or Step 2. **DO NOT** think about whether it's needed. **DO NOT** look at `geometra_list_sessions` output and reason about it — just always call `geometra_disconnect({ closeBrowser: true })` next. The disconnect is a no-op if the pool is empty, and a poison-cure if it isn't.

**Single exception:** if the orchestrator's task prompt says literally "attach to sessionId X" or "use existing session X", skip Steps 1-3 and call `geometra_page_model({ sessionId: "X" })` directly.

---

#### Rule 3 — Routing high-value applications

When the orchestrator dispatches an `apply` (form-fill + submit), pick the subagent based on this table:

| Offer score | Subagent |
|-------------|----------|
| 3.0-3.9/5 | `@general-free` |
| 4.0+/5 | `@general-paid` |
| User said "top-tier", "dream job", "high-stakes" | `@general-paid` |
| Late-stage pipeline (already passed screens) | `@general-paid` |

**Why:** form-fill flows are 6+ steps. Free-tier models have smaller context windows and sometimes abort mid-flow when the form schema is large (Greenhouse, Workday). Paid tier has more headroom. Evaluation and procedural non-apply work stay on `@general-free` — only the `apply` step gets upgraded.

---

## Stack and Conventions

- Node.js (mjs modules), Geometra MCP (PDF + scraping + form filling), Gmail MCP (email), YAML (config), HTML/CSS (template), Markdown (data)

### MCP Configuration

**Current MCP servers** (configured in `opencode.json`):

| MCP | Package | Purpose |
|-----|---------|---------|
| `geometra` | `@geometra/mcp` | PDF generation, web scraping, form filling |
| `gmail` | `@razroo/gmail-mcp` | Email integration (drafts, send, labels, threads) |

```json
{
  "mcp": {
    "geometra": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@geometra/mcp"]
    },
    "gmail": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@razroo/gmail-mcp"]
    }
  }
}
```

To check or modify MCP settings, edit `opencode.json` in the project root.
- Scripts in `.mjs`, configuration in YAML
- Output in `output/` (gitignored), Reports in `reports/`
- JDs in `jds/` (referenced as `local:jds/{file}` in pipeline.md)
- Batch in `batch/` (gitignored except scripts and prompt)
- Report numbering: sequential 3-digit zero-padded. **Always use `npx job-forge next-num` to get the next number** — do NOT derive it yourself from `ls reports/`. The CLI scans all sources: `reports/*.md`, the `#` column of every `data/applications/*.md` day file, and pending + merged `batch/tracker-additions/*.tsv`. Deriving from `reports/` alone misses numbers assigned by prior-day tracker additions that were never written as report files (e.g., `SKIP` entries), which causes ID collisions downstream.
- **RULE: After each batch of evaluations, run `npx job-forge merge`** to merge tracker additions and avoid duplications.
- **RULE: NEVER create new entries in applications.md if company+role already exists.** Update the existing entry.
- **RULE: NEVER attribute commits to opencode (no `Co-Authored-By: opencode` or similar).** All commits must be attributed solely to the person making the commit (e.g., CharlieGreenman).

### TSV Format for Tracker Additions

Write one TSV file per evaluation to `batch/tracker-additions/{num}-{company-slug}.tsv`. Single line, 9 tab-separated columns:

```
{num}\t{date}\t{company}\t{role}\t{status}\t{score}/5\t{pdf_emoji}\t[{num}](reports/{num}-{slug}-{date}.md)\t{note}
```

**Column order (IMPORTANT -- status BEFORE score):**
1. `num` -- sequential number (integer)
2. `date` -- YYYY-MM-DD
3. `company` -- short company name
4. `role` -- job title
5. `status` -- canonical status (e.g., `Evaluated`)
6. `score` -- format `X.X/5` (e.g., `4.2/5`)
7. `pdf` -- `✅` or `❌`
8. `report` -- markdown link `[num](reports/...)`
9. `notes` -- one-line summary

**Note:** In applications.md, score comes BEFORE status. The merge script handles this column swap automatically.

### Pipeline Integrity

1. **NEVER edit day files in `data/applications/` to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `npx job-forge merge` handles the merge.
2. **YES you can edit day files in `data/applications/` to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `npx job-forge verify`
6. Normalize statuses: `npx job-forge normalize`
7. Dedup: `npx job-forge dedup`

### Canonical States (applications day files)

**Source of truth:** `templates/states.yml`

| State | When to use |
|-------|-------------|
| `Evaluated` | Report completed, pending decision |
| `Applied` | Application sent |
| `Responded` | Company responded |
| `Contacted` | Candidate proactively reached out (LinkedIn, email) — awaiting response |
| `Interview` | In interview process |
| `Offer` | Offer received |
| `Rejected` | Rejected by company |
| `Discarded` | Discarded by candidate or offer closed |
| `Failed` | Submission attempted but blocked by portal (spam-filter, anti-bot, broken form). May be recoverable via manual retry. |
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)
