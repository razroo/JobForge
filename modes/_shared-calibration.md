# Scoring Calibration Anchors

**This file is Read on-demand, NOT loaded into the global `instructions` prefix.** It lives separately from `_shared.md` because its contents churn as the candidate accumulates reports — keeping it out of the cached prefix means updates here don't bust the prompt cache for every unrelated session.

**When to Read this file:** right before assigning a final score during evaluation. Once per evaluation, not per dimension.

---

**Use these reference profiles to anchor scores and prevent drift over time.** When evaluating an offer, mentally compare it to these anchors before assigning a final score. Scores MUST be relative to the candidate's actual profile, not absolute.

<!-- [CUSTOMIZE] Replace these with real offers you've evaluated, or archetypes
     that represent clear score levels for YOUR situation. The examples below
     are generic starting points — after 10-20 evaluations, replace them with
     actual reports from your pipeline (e.g., "Report #045 — Anthropic — 4.7/5"). -->

| Score | What it looks like | Example anchor |
|-------|--------------------|----------------|
| **5.0** | Dream role. Exact archetype, 90%+ CV match, top-quartile comp, remote, strong brand, fast process. You'd accept immediately. | _Replace with your highest-scored report once you have one_ |
| **4.0** | Strong match. Right archetype, 75%+ match, fair comp, minor gaps that are easy to frame. Worth a tailored application. | _Replace with a real ~4.0 report_ |
| **3.0** | Moderate match. Adjacent archetype, 50-60% match, 2-4 hard gaps, comp unknown or median. Worth evaluating but not a priority. | _Replace with a real ~3.0 report_ |
| **2.0** | Weak match. Wrong seniority or archetype, major gaps, below-market comp signals. Discourage unless specific reason. | _Replace with a real ~2.0 report_ |
| **1.0** | No fit. Unrelated domain, entry-level, relocation-only, or red flags. Skip. | _Replace with a real ~1.0 report_ |

**Recalibration trigger:** After every 50 evaluations (or when you notice scores clustering — e.g., everything is 3.5-4.2), review the anchors table. Replace generic descriptions with actual reports. If your best offer so far is a 4.3, that's your effective ceiling — adjust the 5.0 anchor to reflect what a true dream role would actually look like for you.

**How to use during evaluation:** After computing the weighted score, sanity-check it against the anchors. "Is this really a 4.5? Is it as strong as [anchor report]?" If not, adjust. The anchors prevent both inflation (everything is 4+) and deflation (nothing breaks 3.5).
