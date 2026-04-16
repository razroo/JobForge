# Mode: apply — Live Application Assistant

Interactive mode for when the candidate is filling out an application form in Chrome. Reads what's on screen, loads prior context from the offer evaluation, and generates personalized answers for each form question.

## Session-length rule — REQUIRED

**If the candidate wants to apply to more than one job**, this mode MUST delegate each application to its own subagent with **max 2 in parallel** (Hard Limit #1 in `AGENTS.md`). For N jobs, run `ceil(N/2)` sequential rounds of 2. Never drive multi-job applications from a single interactive session: the accumulating Geometra tool results invalidate prompt caching and each message ends up re-processing 100K+ tokens of fresh history — see "Session Hygiene" in `.opencode/skills/job-forge.md`.

**DO NOT dispatch 3+ `task` calls in one message.** Two is the absolute ceiling. This is non-negotiable, even when the user asks for "apply to 10 jobs" — that becomes 5 rounds of 2, not one message with 10 dispatches.

For a single application interactively, carry on in the current session — the rule targets multi-job loops.

### Multi-job apply runbook (follow literally when N > 1)

```
Step 1  — Build the job list (N items)
Step 2  — Dedup: Grep data/pipeline.md + today's day file for each company+role. Drop any already APPLIED.
Step 3  — geometra_list_sessions() + geometra_disconnect({closeBrowser: true})  [once, before loop]
Step 4  — For round in ceil(N/2):
            pair = jobs[round*2 : round*2 + 2]
            # ONE message, 1 or 2 task() calls. Never 3.
            task(apply to pair[0])
            task(apply to pair[1])  # only if pair has 2
            # WAIT for both returns. Do not proceed until both done.
Step 5  — Between rounds: geometra_list_sessions() + geometra_disconnect({closeBrowser: true})
Step 6  — Reconcile outcomes (Hard Limit #6):
            bash: node merge-tracker.mjs       # TSVs → day file
            bash: node verify-pipeline.mjs     # validate
Step 7  — Summarize outcomes; do NOT auto-retry failures.
```

If a subagent fails, report it in the summary and let the user decide whether to retry. Never auto-retry in a way that could cause duplicate submissions.

**Outcome routing (Hard Limit #6 in `AGENTS.md`):**
- Subagents write `batch/tracker-additions/{num}-{slug}.tsv` — one TSV per job.
- Orchestrator runs `node merge-tracker.mjs` once at the end to consume TSVs into the right day file.
- **Do NOT** append APPLIED / FAILED / SKIP lines to `data/pipeline.md` — that file is the URL inbox only.

## Requirements

- **Best with Geometra MCP**: In visible proxy mode, the candidate sees the browser and opencode can interact with the page via `geometra_connect`, `geometra_form_schema`, and `geometra_fill_form`.
- **Without Geometra**: the candidate shares a screenshot or pastes the questions manually.

## Workflow

```
1. DETECT     → Read active Chrome tab (screenshot/URL/title)
2. IDENTIFY   → Extract company + role from the page
3. SEARCH     → Match against existing reports in reports/
4. LOAD       → Read full report + Section G (if it exists)
5. COMPARE    → Does the role on screen match the evaluated one? If changed → warn
6. ANALYZE    → Identify ALL visible form questions
7. GENERATE   → For each question, generate a personalized answer
8. PRESENT    → Show formatted answers for copy-paste
```

## Step 1 — Detect the offer

**With Geometra MCP:** `geometra_connect` to the active page, then `geometra_page_model` to read the title, URL, and visible content. **Do NOT also WebFetch the same URL** — Geometra's page model already contains the JD text. Each additional fetch re-pulls the same content into conversation history at full input cost.

**Without Geometra:** Ask the candidate to:
- Share a screenshot of the form (Read tool reads images)
- Or paste the form questions as text
- Or provide company + role so we can look it up

## Step 2 — Identify and search for context

1. Extract company name and role title from the page
2. Search in `reports/` by company name (Grep case-insensitive)
3. If there's a match → load the full report
4. If there's a Section G → load the previous draft answers as a base
5. If there's NO match → notify and offer to run a quick auto-pipeline

## Step 3 — Detect role changes

If the role on screen differs from the evaluated one:
- **Warn the candidate**: "The role has changed from [X] to [Y]. Do you want me to re-evaluate or adapt the answers to the new title?"
- **If adapt**: Adjust the answers to the new role without re-evaluating
- **If re-evaluate**: Run a full A-F evaluation, update the report, regenerate Section G
- **Update tracker**: Change the role title in the day file under `data/applications/` if applicable

## Step 4 — Analyze form questions

Identify ALL visible questions:
- Free text fields (cover letter, why this role, etc.)
- Dropdowns (how did you hear, work authorization, etc.)
- Yes/No (relocation, visa, etc.)
- Salary fields (range, expectation)
- Upload fields (resume, cover letter PDF)

Classify each question:
- **Already answered in Section G** → adapt the existing answer
- **New question** → generate an answer from the report + cv.md

## Step 5 — Generate answers

For each question, generate the answer following:

1. **Report context**: Use proof points from Block B, STAR stories from Block F
2. **Previous Section G**: If a draft answer exists, use it as a base and refine
3. **"I'm choosing you" tone**: Same framework as the auto-pipeline
4. **Specificity**: Reference something concrete from the JD visible on screen
5. **job-forge proof point**: Include in "Additional info" if there's a field for it

**Output format:**

```
## Answers for [Company] — [Role]

Based on: Report #NNN | Score: X.X/5 | Archetype: [type]

---

### 1. [Exact form question]
> [Answer ready for copy-paste]

### 2. [Next question]
> [Answer]

...

---

Notes:
- [Any observations about the role, changes, etc.]
- [Personalization suggestions the candidate should review]
```

## Step 5.5 — Submit the form (ATOMIC — REQUIRED)

When the candidate asks you to actually submit (or when running in auto-pipeline mode at score ≥ 3.0), follow these rules **strictly**. They exist because Greenhouse-style forms regenerate internal field IDs after any DOM-mutating action (especially file uploads), which breaks multi-call fill sequences and forces the model into a retry loop that burns tens of thousands of tokens.

### Rule A — One `run_actions` call, never split

Do the entire submission in a **single** `geometra_run_actions` call that chains all steps. Never split upload / fill / submit across multiple tool calls:

```
geometra_run_actions({
  sessionId: "...",
  actions: [
    { type: "upload_files",  fieldLabel: "Resume/CV", paths: ["/abs/path/cv.pdf"] },
    { type: "fill_fields",   valuesByLabel: { "First Name": "...", "Last Name": "...", ... } },
    { type: "pick_listbox_option", fieldLabel: "Country", value: "United States" },
    ... (one entry per choice/listbox) ...
    { type: "click",         labelOrText: "Submit application" }
  ]
})
```

### Rule B — Prefer `fieldLabel` over `fieldId`

Labels are stable across DOM refreshes; IDs are not. If `fieldLabel` works, use it everywhere. Only fall back to `fieldId` when two fields share the same label (rare — add a qualifier via sibling text instead).

### Rule C — On ANY session error, run recovery (ONCE)

**Trigger:** you see ANY of these error strings from a Geometra call:
- `Not connected`
- `session expired`
- `unknown session`
- `Failed to connect`
- `WebSocket` + `closed` / `error`

**Recovery sequence — run these FOUR calls in this EXACT order:**

```
Call 1:  geometra_list_sessions()
Call 2:  geometra_disconnect({ closeBrowser: true })
Call 3:  geometra_connect({
           pageUrl: "<the same URL as before>",
           isolated: true,
           headless: true,
           slowMo: 350
         })
Call 4:  geometra_run_actions({
           sessionId: "<new sessionId from Call 3>",
           actions: [... the EXACT same actions array you used before ...]
         })
```

### Rules for recovery

1. **Always run all 4 calls.** Do not skip Call 1 or Call 2 even if Call 1 shows an empty pool.
2. **Do not re-fetch the form schema.** Do not call `geometra_form_schema` between Call 3 and Call 4. Your labels haven't changed, so the same `actions` array still works.
3. **Do not edit the actions array.** Copy it verbatim from your first attempt. Do not re-pick fieldIds. Do not add or remove actions. Same array in, same array out.
4. **Only ONE retry.** If Call 4 ALSO fails, STOP. Return this exact message to the orchestrator:

   ```
   APPLY FAILED AFTER RECOVERY: <URL>
   Error 1: <first error message>
   Error 2: <error after recovery>
   Recommend: re-dispatch on @general-paid
   ```

   Do NOT try a third time. Do NOT try a different approach. The orchestrator will decide whether to re-dispatch on a bigger model.

### Rule D — Never re-fetch the schema mid-flow

`geometra_form_schema` returns hundreds of nested field IDs and pollutes context. Fetch it **at most once** per application, right after the initial `geometra_connect`, to discover the list of labels. After that, operate on labels only. Do not call `geometra_form_schema` again "to verify" — you're just paying for the same payload twice.

### Rule E — Never mix upload + separate fill

If you've uploaded a file with a dedicated `geometra_run_actions` call (e.g., the resume), and THEN try a separate `geometra_fill_form` or `geometra_fill_fields` call, the field IDs from the pre-upload schema are already stale. This was the primary failure mode on the Anthropic FDE apply trace — 4 retries, ~10K wasted tokens. The fix is Rule A: do everything in one shot.

### Exception — two-phase when the form has a post-upload conditional section

Some portals reveal additional fields ONLY after a file upload (e.g., Workday "parse my resume"). In that case, use exactly two `run_actions` calls: (1) upload + wait_for, (2) fill+submit. After the first call, call `geometra_form_schema` **once** to discover the newly-revealed labels, then run the second call using labels. Never more than two phases.

## Step 6 — Handle OTP verification (if prompted)

After the candidate (or Geometra) submits, many portals — Greenhouse, Workday, Lever, Ashby — gate submission behind an email verification code. If an OTP step appears:

1. **Do NOT stop and ask the candidate to paste the code manually.** Use the Gmail MCP.
2. Wait ~5-10 seconds for the email, then `gmail_list_messages` with a sender-scoped recency query (e.g. `from:greenhouse newer_than:10m`).
3. `gmail_get_message` on the most recent match, extract the code from the body.
4. `geometra_fill_otp` to enter it, then submit.

**Before reporting the submission as failed, always check Gmail.** A "submit did nothing" outcome usually means a silent OTP step — not a real failure.

Full sender-to-query table and fallback patterns: see "OTP Handling via Gmail MCP" in `AGENTS.md`.

## Step 7 — Post-apply (outcome recording)

Two cases, two different flows — do NOT mix them:

### Case A — Job already had a row in a day file (prior `Evaluated` status)

The row exists. You are UPDATING an existing entry, which is allowed (Pipeline Integrity rule #2 in `AGENTS.md`):

1. Find the existing row in `data/applications/YYYY-MM-DD.md` (or an older day file — use `rg` to locate it)
2. Edit the `Status` column from `Evaluated` to `Applied` (or `FAILED` / `SKIP`)
3. Append a confirmation note to the `Notes` column (e.g. OTP code, confirmation URL)
4. Do NOT write a TSV. The row is already there.

### Case B — Job had no prior evaluation row (fresh submission from pipeline or direct URL)

The row does NOT exist yet. You MUST go through the TSV pathway (Hard Limit #6 + Pipeline Integrity rule #1):

1. Write `batch/tracker-additions/{num}-{slug}.tsv` with the canonical 9-column format (see "TSV Format for Tracker Additions" in `AGENTS.md`)
2. At the end of the apply run, the orchestrator calls `node merge-tracker.mjs`, which inserts the row into today's day file
3. Do NOT manually add a row to the day file. Do NOT append an `APPLIED` line to `data/pipeline.md`.

### Both cases

- Update Section G of the report with the final answers
- Suggest next step: `/job-forge contact` for LinkedIn outreach — contact will automatically load this evaluation report and use the top proof points from Block B to craft targeted messages

## Scroll handling

If the form has more questions than are visible:
- Ask the candidate to scroll and share another screenshot
- Or paste the remaining questions
- Process in iterations until the entire form is covered
