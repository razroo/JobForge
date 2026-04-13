# JobForge -- AI Job Search Pipeline

## What is JobForge

AI-powered job search automation built on opencode: pipeline tracking, offer evaluation, CV generation, portal scanning, batch processing.

**It will work out of the box, but it's designed to be made yours.** If the archetypes don't match your career, the modes are in the wrong language, or the scoring doesn't fit your priorities -- just ask. You (opencode) can edit any file in this system. The user says "change the archetypes to data engineering roles" and you do it. That's the whole point.

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

Fill in `config/profile.yml` with their answers. For archetypes, map their target roles to the closest matches and update `modes/_shared.md` if needed.

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

This system is designed to be customized by YOU (opencode). When the user asks you to change archetypes, translate modes, adjust scoring, add companies, or modify negotiation scripts -- do it directly. You read the same files you use, so you know exactly what to edit.

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

## OTP Handling -- REQUIRED

**When a job application requires email OTP verification (e.g., Greenhouse sends a code):**

1. Use `gmail_list_messages` with `q:"from:greenhouse"` to find the OTP email
2. Use `gmail_get_message` to read the email and extract the OTP code
3. Use `geometra_fill_otp` to enter the OTP code into the form
4. Submit the form

**This is the standard flow for Greenhouse applications.** Always check for OTP emails before reporting a submission as failed.

Example:
```
# Find the OTP email
gmail_list_messages({q: "from:greenhouse", maxResults: 5})

# Get the OTP code from the email
gmail_get_message({id: "19d84d63a273c271"})

# Enter the OTP
geometra_fill_otp({value: "ABC12345", sessionId: "..."})
```

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
- Report numbering: sequential 3-digit zero-padded, max existing + 1
- **RULE: After each batch of evaluations, run `node merge-tracker.mjs`** to merge tracker additions and avoid duplications.
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

1. **NEVER edit day files in `data/applications/` to ADD new entries** -- Write TSV in `batch/tracker-additions/` and `merge-tracker.mjs` handles the merge.
2. **YES you can edit day files in `data/applications/` to UPDATE status/notes of existing entries.**
3. All reports MUST include `**URL:**` in the header (between Score and PDF).
4. All statuses MUST be canonical (see `templates/states.yml`).
5. Health check: `node verify-pipeline.mjs`
6. Normalize statuses: `node normalize-statuses.mjs`
7. Dedup: `node dedup-tracker.mjs`

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
| `SKIP` | Doesn't fit, don't apply |

**RULES:**
- No markdown bold (`**`) in status field
- No dates in status field (use the date column)
- No extra text (use the notes column)
