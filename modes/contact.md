# Mode: contact — LinkedIn Power Move

## Step 0 — Load evaluation context

Check for an existing evaluation report before generating any message.

1. Identify the company + role (from user input, current conversation, or most recent evaluation).
2. Search `reports/` for a matching report (Grep case-insensitive by company name).
3. Read any matching report and extract these fields (all block references below point into `modes/offer.md`).
<!-- isolint-disable-next-line undefined-step-reference -->
   - **Archetype** detected (Step 0 of evaluation).
<!-- isolint-disable-next-line undefined-step-reference -->
   - **Top 3 proof points** from Block B (the JD requirements where CV match was strongest).
<!-- isolint-disable-next-line undefined-step-reference -->
   - **Score** and key gaps from Block B.
<!-- isolint-disable-next-line undefined-step-reference -->
   - **STAR stories** from Block F that are most relevant.
<!-- isolint-disable-next-line undefined-step-reference -->
   - **Case study** recommended in Block F.
4. Also read all day files in `data/applications/` to check current status of this application.
5. If NO report exists, inform the user and offer to run an evaluation first — or proceed with cv.md only.

The loaded evaluation context is what makes the outreach message specific instead of generic.

## Step 1 — Identify Targets

Use WebSearch to find:

- Hiring manager of the team.
- Recruiter assigned to the role.
- 2-3 peers on the team (people in a similar role).

## Step 2 — Select primary target

Choose the person who would most benefit from the candidate joining. Typically:

- For IC roles: the hiring manager or tech lead.
- For leadership roles: a peer or the person the role reports to.
- Avoid cold-messaging the recruiter first unless no other option — a warm intro from a team member is stronger.

## Step 3 — Generate message

Generate the message directly from the evaluation report, not generic claims.

Framework (3 sentences, max 300 characters for LinkedIn connection request):

<!-- isolint-disable-next-line undefined-step-reference -->
- **Sentence 1 (Hook)**: Something specific about their company or current challenge with AI — NOT generic. If the report's Block A identified the domain and function, reference it.
<!-- isolint-disable-next-line undefined-step-reference -->
- **Sentence 2 (Proof)**: The single strongest proof point from Block B's top matches. Use the exact framing that scored highest against the JD. If article-digest.md has a quantified metric for this proof point, use it.
- **Sentence 3 (Proposal)**: Quick chat, no pressure — "Would love to chat about [specific topic from the JD] for 15 min".

**Archetype-adapted framing** from the report — use the single row matching the detected archetype:

| Archetype | Emphasize |
|-----------|-----------|
| FDE | fast delivery, client-facing results |
| SA | system design, integration wins |
| PM | product discovery, stakeholder outcomes |
| LLMOps | production metrics, evals, observability |
| Agentic | orchestration, reliability, HITL |
| Transformation | adoption, change management, org impact |

## Step 4 — Generate Versions

Generate:
- EN (default)
<!-- isolint-disable-next-line undefined-step-reference -->
- **Follow-up variant**: A longer version (2-3 sentences) for LinkedIn InMail or email, where the 300-char limit doesn't apply. This version can include a second proof point and a link to the relevant case study from Block F.

## Step 5 — List Alternative Targets

List 2-3 backup contacts with justification for why they're strong second choices.

## Apply These Message Rules

- Max 300 characters for connection request version
- NO corporate-speak
- NO "I'm passionate about..."
- Something that makes them want to respond
- NEVER share phone number
- **Every claim must trace back to cv.md or article-digest.md** — no invented metrics
