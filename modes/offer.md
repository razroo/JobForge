# Mode: offer — Full Evaluation A-F

When the candidate pastes an offer (text or URL), ALWAYS deliver all 6 blocks:

## Emit-once rule — REQUIRED

Before writing any of the blocks below, **emit the Score JSON block first** (per `_shared.md` → "Score Emission — EMIT-ONCE JSON"). The blocks that follow reference the JSON's score keys and rationales; they do NOT re-enumerate the 10 dimensions.

Workflow:

1. Detect archetype (Step 0 below).
2. `cv.md` is already in your context via `opencode.json:instructions` — **do NOT Read it again**. If you need detailed proof points beyond cv.md, Read `article-digest.md` (if it exists) — once, not per block.
3. Decide the 10 scores. **Do not narrate this process in thinking.** Write the scores straight into the JSON block.
4. Emit the JSON block exactly once.
5. Then write Blocks A-F referencing the JSON — not parallel to it.

Re-scoring mid-report is banned. If you change your mind on a dimension, update the JSON and regenerate the prose from it — don't keep two copies in sync.

## Step 0 — Archetype Detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If it's a hybrid, indicate the 2 closest ones. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Build a table with these rows.

- Detected archetype.
- Domain (platform/agentic/LLMOps/ML/enterprise).
- Function (build/consult/manage/deploy).
- Seniority.
- Remote (full/hybrid/onsite).
- Team size (if mentioned).
- TL;DR in 1 sentence.

## Match the CV (Block B)

**cv.md is already in your context** (via opencode.json:instructions) — use it directly, don't Read it again. Build a table mapping each JD requirement to exact lines from the CV.

**Adapt the proof points to the archetype.**

- For FDE: prioritize proof points about fast delivery and client-facing work.
- For SA: prioritize system design and integrations.
- For PM: prioritize product discovery and metrics.
- For LLMOps: prioritize evals, observability, pipelines.
- For Agentic: prioritize multi-agent, HITL, orchestration.
- For Transformation: prioritize change management, adoption, scaling.

**Gaps** section with a mitigation strategy for each one. For each gap, answer in order.

1. Classify it as a hard blocker or an optional requirement.
2. Identify any adjacent experience the candidate can demonstrate.
3. Identify any portfolio project that covers the gap.
4. Write a concrete mitigation plan (a cover-letter phrase or a quick project).

## Compute level and strategy (Block C)

1. **Compare detected level** in the JD against the candidate's calibrated level for that archetype.
2. **"Sell senior without lying" plan**: specific phrases adapted to the archetype, concrete achievements to highlight, how to position founder experience as an advantage.
3. **"If I get downleveled" plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria.

## Compute comp and demand (Block D)

**Check first:** If `reports/deep-{company-slug}-*.md` exists, read it — deep research may already have comp data, funding info, and hiring signals. Use it as a starting point instead of duplicating WebSearch effort.

Use WebSearch for:
- Current salaries for the role (Glassdoor, Levels.fyi, Blind)
- Company compensation reputation
- Role demand trend

Table with data and cited sources. If no data is available, say so instead of making things up.

## List the customization plan (Block E)

Build a table with these columns: # | Section | Current State | Proposed Change | Why.

| # | Section | Current State | Proposed Change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 changes to the CV + Top 5 changes to LinkedIn to maximize match.

## List interview-prep stories (Block F)

Map 6-10 STAR+R stories to JD requirements (STAR + **Reflection**).

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, manage it actively — not just append:

1. **Check for existing stories** that cover the same theme (e.g., "technical leadership", "delivery under pressure"). Use the `**Best for questions about:**` tags to match.
2. **If a new story covers the same theme as an existing one**, compare them. Keep the one with stronger quantified results and broader applicability. Update the match count on the keeper. Remove the weaker one.
3. **If a new story covers a NEW theme**, append it.
4. **Update match counts**: Each story MUST have a `**Matched N evaluations:**` line listing which reports used it (e.g., `Matched 5 evaluations: #012, #045, #078, #102, #115`). Stories with 5+ matches are the most versatile — practice them first.
5. **Cap at 10-12 stories max.** If adding a new story would exceed 12, retire the story with the fewest matches and narrowest applicability. Move retired stories to a `## Retired` section at the bottom (don't delete — keep them for niche roles).
6. **Tag archetypes**: Each story MUST have `**Archetypes:**` listing which role archetypes it's strongest for (e.g., `LLMOps, Platform`).

The goal is a curated bank of 10 versatile stories, not an ever-growing log.

**Frame story selection by archetype.**

- FDE: emphasize delivery speed and client-facing work.
- SA: emphasize architecture decisions.
- PM: emphasize discovery and trade-offs.
- LLMOps: emphasize metrics, evals, production hardening.
- Agentic: emphasize orchestration, error handling, HITL.
- Transformation: emphasize adoption, organizational change.

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g., "Why did you sell your company?", "Do you have direct reports?")

---

## Run post-evaluation steps

**ALWAYS** after generating blocks A-F:

### Save the report .md (step 1)

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X.X/5}
**URL:** {original offer URL}
**PDF:** {path or pending}

---

## Score

{the JSON block emitted per _shared.md, verbatim, inside a fenced ```json block}

---

## A) Role Summary
(full content of block A — reference scores by key, do not re-enumerate dimensions)

## B) CV Match
(full content of block B)

## C) Level and Strategy
(full content of block C)

## D) Comp and Demand
(full content of block D)

## E) Customization Plan
(full content of block E)

## F) Interview Prep Plan
(full content of block F)

## G) Draft Application Answers
(only if `draft_answers_threshold_met` in the JSON — draft answers for the application form)

---

## Extracted Keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### Global Score

**Use the Canonical Scoring Model from `modes/_shared.md`.** The per-dimension breakdown lives in the JSON block (`## Score` section of the report). Don't repeat it as a prose table — that's the duplication we're eliminating. If you need to reference a specific dimension in the narrative, quote its score and rationale from the JSON inline: *"Seniority fit (3/5 — Senior IC, no formal mgmt) is the main gap."*

### Append to the tracker (step 2)

**ALWAYS** register in `data/applications/` (the day file for the current date, e.g., `data/applications/2026-04-13.md`):
- Next sequential number
- Current date
- Company
- Role
- Score: weighted total from the Canonical Scoring Model (1-5)
- Status: `Evaluated`
- PDF: ❌ (or ✅ if auto-pipeline generated PDF)
- Report: relative link to the report .md (e.g., `[001](reports/001-company-2026-01-01.md)`)

**Tracker format:**

```markdown
| # | Date | Company | Role | Score | Status | PDF | Report |
```
