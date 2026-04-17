# Mode: deep — Deep Company Research

Structured company research that feeds directly into evaluations and interview prep.

## Step 0 — Check for existing evaluation

Check `reports/` for an existing evaluation of this company+role before researching. If found, load the report — deep research MUST build on what the evaluation already identified (archetype, gaps, proof points), not start from scratch.

## Scan These 6 Research Axes

### Scan Axis 1: AI Strategy
- What products/features use AI/ML?
- What's their AI stack? (models, infra, tools)
- Engineering blog — what do they publish?
- Papers or talks on AI?

### Scan Axis 2: Recent Moves (last 6 months)
- Relevant hires in AI/ML/product?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### Scan Axis 3: Engineering Culture
- How do they ship? (deploy cadence, CI/CD)
- Mono-repo or multi-repo?
- Languages/frameworks?
- Remote-first or office-first?
- Glassdoor/Blind reviews on eng culture?

### Scan Axis 4: Likely Challenges
- Scaling problems?
- Reliability, cost, latency challenges?
- Migrating anything? (infra, models, platforms)
- Pain points from reviews?

### Scan Axis 5: Competitors And Differentiation
- Main competitors?
- Moat/differentiator?
- Positioning vs competition?

### Scan Axis 6: Candidate Angle
cv.md is already in context via opencode.json:instructions — do NOT Read it again. Read profile.yml once if you need identity fields:
- What unique value does the candidate bring to this team?
- Which projects are most relevant?
- What story should they tell in the interview?

## Feed Research Back Into Evaluation

**The feedback loop is the key step that makes deep research actionable.**

After completing the 6 axes, update the evaluation if one exists:

1. **Score adjustments**: Deep research may reveal information that changes scoring dimensions.
   - Company reputation (axis 3: culture) → dimension #7.
   - Tech stack modernity (axis 1: AI strategy) → dimension #8.
   - Speed to offer (axis 2: recent moves, hiring pace) → dimension #9.
   - Cultural signals (axis 3: culture) → dimension #10.
   - Growth trajectory (axis 2: funding, launches) → dimension #5.

2. **Append a `## Deep Research` section to the existing report** with findings organized by axis. Include date of research so it can be refreshed.

<!-- isolint-disable-next-line undefined-step-reference -->
3. **Update Block F (Interview Plan)**: The "likely challenges" (axis 4) directly inform STAR story selection — pick stories that address the company's actual problems, not generic ones.

4. **Update contact targeting**: The "recent moves" (axis 2) often reveal who to reach out to (new hires, team leads mentioned in blog posts).

<!-- isolint-disable-next-line undefined-step-reference -->
If NO evaluation exists yet, save the research to `reports/deep-{company-slug}-{date}.md` so it's available when the user evaluates later. The evaluation mode MUST check for existing deep research before starting Block D (Comp & Demand).

## Output Format

```markdown
## Deep Research: [Company] — [Role]
**Date:** YYYY-MM-DD
**Linked report:** #NNN (if exists)

### 1. AI Strategy
(findings)

### 2. Recent Moves
(findings)

### 3. Engineering Culture
(findings)

### 4. Likely Challenges
(findings)

### 5. Competitors & Differentiation
(findings)

### 6. Candidate Angle
(findings)

### Score Impact
| Dimension | Before | After | Why |
|-----------|--------|-------|-----|
(only dimensions where research changed the score)
```
