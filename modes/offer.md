# Mode: offer — Full Evaluation A-F

When the candidate pastes an offer (text or URL), ALWAYS deliver all 6 blocks:

## Step 0 — Archetype Detection

Classify the offer into one of the 6 archetypes (see `_shared.md`). If it's a hybrid, indicate the 2 closest ones. This determines:
- Which proof points to prioritize in block B
- How to rewrite the summary in block E
- Which STAR stories to prepare in block F

## Block A — Role Summary

Table with:
- Detected archetype
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (if mentioned)
- TL;DR in 1 sentence

## Block B — CV Match

Read `cv.md`. Create a table with each JD requirement mapped to exact lines from the CV.

**Adapted to the archetype:**
- If FDE → prioritize proof points about fast delivery and client-facing work
- If SA → prioritize system design and integrations
- If PM → prioritize product discovery and metrics
- If LLMOps → prioritize evals, observability, pipelines
- If Agentic → prioritize multi-agent, HITL, orchestration
- If Transformation → prioritize change management, adoption, scaling

**Gaps** section with a mitigation strategy for each one. For each gap:
1. Is it a hard blocker or a nice-to-have?
2. Can the candidate demonstrate adjacent experience?
3. Is there a portfolio project that covers this gap?
4. Concrete mitigation plan (phrase for cover letter, quick project, etc.)

## Block C — Level and Strategy

1. **Detected level** in the JD vs **candidate's natural level for that archetype**
2. **"Sell senior without lying" plan**: specific phrases adapted to the archetype, concrete achievements to highlight, how to position founder experience as an advantage
3. **"If I get downleveled" plan**: accept if comp is fair, negotiate 6-month review, clear promotion criteria

## Block D — Comp and Demand

**First check:** If `reports/deep-{company-slug}-*.md` exists, read it — deep research may already have comp data, funding info, and hiring signals. Use it as a starting point instead of duplicating WebSearch effort.

Use WebSearch for:
- Current salaries for the role (Glassdoor, Levels.fyi, Blind)
- Company compensation reputation
- Role demand trend

Table with data and cited sources. If no data is available, say so instead of making things up.

## Block E — Customization Plan

| # | Section | Current State | Proposed Change | Why |
|---|---------|---------------|-----------------|-----|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 changes to the CV + Top 5 changes to LinkedIn to maximize match.

## Block F — Interview Prep Plan

6-10 STAR+R stories mapped to JD requirements (STAR + **Reflection**):

| # | JD Requirement | STAR+R Story | S | T | A | R | Reflection |
|---|----------------|--------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, manage it actively — not just append:

1. **Check for existing stories** that cover the same theme (e.g., "technical leadership", "delivery under pressure"). Use the `**Best for questions about:**` tags to match.
2. **If a new story covers the same theme as an existing one**, compare them. Keep the one with stronger quantified results and broader applicability. Update the match count on the keeper. Remove the weaker one.
3. **If a new story covers a NEW theme**, append it.
4. **Update match counts**: Each story should have a `**Matched N evaluations:**` line listing which reports used it (e.g., `Matched 5 evaluations: #012, #045, #078, #102, #115`). Stories that match many JDs are the most versatile — they should be practiced first.
5. **Cap at 10-12 stories max.** If adding a new story would exceed 12, retire the story with the fewest matches and narrowest applicability. Move retired stories to a `## Retired` section at the bottom (don't delete — they might be useful for niche roles).
6. **Tag archetypes**: Each story should have `**Archetypes:**` listing which role archetypes it's strongest for (e.g., `LLMOps, Platform`).

The goal is a curated bank of 10 versatile stories, not an ever-growing log.

**Selected and framed according to the archetype:**
- FDE → emphasize delivery speed and client-facing work
- SA → emphasize architecture decisions
- PM → emphasize discovery and trade-offs
- LLMOps → emphasize metrics, evals, production hardening
- Agentic → emphasize orchestration, error handling, HITL
- Transformation → emphasize adoption, organizational change

Also include:
- 1 recommended case study (which of their projects to present and how)
- Red-flag questions and how to answer them (e.g., "Why did you sell your company?", "Do you have direct reports?")

---

## Post-Evaluation

**ALWAYS** after generating blocks A-F:

### 1. Save report .md

Save the full evaluation to `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = next sequential number (3 digits, zero-padded)
- `{company-slug}` = company name in lowercase, no spaces (use hyphens)
- `{YYYY-MM-DD}` = current date

**Report format:**

```markdown
# Evaluation: {Company} — {Role}

**Date:** {YYYY-MM-DD}
**Archetype:** {detected}
**Score:** {X/5}
**PDF:** {path or pending}

---

## A) Role Summary
(full content of block A)

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
(only if score >= 4.5 — draft answers for the application form)

---

## Extracted Keywords
(list of 15-20 keywords from the JD for ATS optimization)
```

### Global Score

**Use the Canonical Scoring Model from `modes/_shared.md`.** All 10 weighted dimensions. Show the per-dimension breakdown in the report, then compute the weighted total as the final score.

### 2. Register in tracker

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
