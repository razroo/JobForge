# Mode: tracker — Application Tracker

Reads and displays the application tracker: day-based files in `data/applications/` (format: `YYYY-MM-DD.md`).

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
```

Possible states (canonical, per `templates/states.yml`):

`Evaluated` → `Applied` → `Contacted` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = the candidate submitted their application
- `Contacted` = the candidate proactively reached out to someone at the company (outbound, e.g., LinkedIn power move via `/job-forge contact`)
- `Responded` = a recruiter/company contacted back and the candidate responded (inbound)

If the user asks to update a status, edit the corresponding row in the day file where the entry exists.

Also display statistics:
- Total applications
- By status
- Average score
- % with generated PDF
- % with generated report

If any entries look overdue for follow-up (Applied 7+ days ago, Contacted 5+ days ago, Interviewed with no update 7+ days), mention it:
> "3 entries may need follow-up. Run `/job-forge followup` for details."

This is a passive hint — it does NOT change tracker behavior or output format.
