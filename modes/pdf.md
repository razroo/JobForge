# Mode: pdf — ATS-Optimized PDF Generation

## Full Pipeline

1. Read `cv.md` as the source of truth
2. Ask the user for the JD if not already in context (text or URL)
3. Extract 15-20 keywords from the JD
4. Detect JD language → CV language (EN default)
5. Detect company location → paper format:
   - US/Canada → `letter`
   - Rest of the world → `a4`
6. Detect role archetype → adapt framing
7. Rewrite Professional Summary injecting JD keywords + exit narrative bridge ("Built and sold a business. Now applying systems thinking to [JD domain].")
8. Select the top 3-4 most relevant projects for the offer
9. Reorder experience bullets by relevance to the JD
10. Build competency grid from JD requirements (6-8 keyword phrases)
11. Inject keywords naturally into existing achievements (NEVER fabricate)
12. Generate complete HTML from template + personalized content
13. Write HTML to `/tmp/cv-candidate-{company}.html`
14. Run: `node generate-pdf.mjs /tmp/cv-candidate-{company}.html output/cv-candidate-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
15. Report: PDF path, page count, keyword coverage %

## ATS Rules (clean parsing)

- Single-column layout (no sidebars, no parallel columns)
- Standard headers: "Professional Summary", "Work Experience", "Education", "Skills", "Certifications", "Projects"
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- JD keywords distributed across: Summary (top 5), first bullet of each role, Skills section

## PDF Design

- **Fonts**: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Fonts self-hosted**: `fonts/`
- **Header**: name in Space Grotesk 24px bold + gradient line `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + contact row
- **Section headers**: Space Grotesk 13px, uppercase, letter-spacing 0.05em, cyan primary color
- **Body**: DM Sans 11px, line-height 1.5
- **Company names**: accent purple color `hsl(270,70%,45%)`
- **Margins**: 0.6in
- **Background**: pure white

## Section Order (optimized for "6-second recruiter scan")

1. Header (large name, gradient, contact, portfolio link)
2. Professional Summary (3-4 lines, keyword-dense)
3. Core Competencies (6-8 keyword phrases in flex-grid)
4. Work Experience (reverse chronological)
5. Projects (top 3-4 most relevant)
6. Education & Certifications
7. Skills (languages + technical)

## Keyword Injection Strategy (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "RAG pipelines" and CV says "LLM workflows with retrieval" → change to "RAG pipeline design and LLM orchestration workflows"
- JD says "MLOps" and CV says "observability, evals, error handling" → change to "MLOps and observability: evals, error handling, cost monitoring"
- JD says "stakeholder management" and CV says "collaborated with team" → change to "stakeholder management across engineering, operations, and business"

**NEVER add skills the candidate does not have. Only reformulate real experience using the exact vocabulary of the JD.**

## Writing Style — Anti-AI-Detection (CRITICAL)

ATS platforms (Indeed, LinkedIn, Workday) increasingly flag AI-generated CVs. The PDF generation MUST produce text that reads as human-written. This is not about deception — it's about ensuring the candidate's real experience isn't filtered out by an automated detector before a human ever sees it.

### Sentence structure
- **Vary sentence length deliberately.** Mix short punchy fragments ("Shipped in 3 weeks.") with longer compound sentences. AI text tends toward uniform medium-length sentences.
- **Start bullets differently.** Don't begin every bullet with a past-tense action verb. Mix structures: "Led...", "The team needed X, so I...", "After discovering Y, rebuilt Z to..."
- **Use the candidate's actual phrasing from cv.md when possible.** The candidate's own words have natural irregularities that AI-generated text lacks. Preserve their voice — reformulate for keywords, but don't rewrite the whole sentence.

### Word choice
- **Avoid AI-hallmark phrases.** Never use: "leveraged", "utilized", "spearheaded", "orchestrated" (as a metaphor for "managed"), "cutting-edge", "passionate about", "drive innovation", "synergy", "holistic approach", "navigate complex", "foster collaboration". These are the first things detectors look for.
- **Use plain, specific verbs.** "Built" not "architected". "Ran" not "orchestrated". "Fixed" not "remediated". "Cut costs by" not "optimized cost efficiency". The more specific and concrete, the more human it reads.
- **Preserve technical jargon as-is.** Real engineers say "k8s" not "Kubernetes orchestration platform". Keep the candidate's natural shorthand.

### Structure
- **Don't over-polish.** A real CV has minor asymmetries — one job has 4 bullets, another has 3. One bullet is 2 lines, the next is 1. Don't normalize everything to uniform length.
- **Keep the Professional Summary under 4 sentences.** AI-generated summaries tend to be dense paragraphs that try to cover everything. A human writes a tighter summary and lets the experience section do the work.
- **Don't repeat the same metric in both the summary and a bullet.** Humans don't do this. Pick the best place for each number.

### Self-check before generating HTML
After drafting all CV content, review it once for:
1. Do 3+ bullets start with the same word? → Rewrite the openings.
2. Are all bullets the same length (± 5 words)? → Vary them.
3. Does any sentence contain 2+ words from the AI-hallmark list above? → Rewrite.
4. Does the summary read like a paragraph from a cover letter? → Make it more telegraphic.

## HTML Template

Use the template in `cv-template.html`. Replace the `{{...}}` placeholders with personalized content:

| Placeholder | Content |
|-------------|---------|
| `{{LANG}}` | `en` or `es` |
| `{{PAGE_WIDTH}}` | `8.5in` (letter) or `210mm` (A4) |
| `{{NAME}}` | (from profile.yml) |
| `{{EMAIL}}` | (from profile.yml) |
| `{{LINKEDIN_URL}}` | (from profile.yml) |
| `{{LINKEDIN_DISPLAY}}` | (from profile.yml) |
| `{{PORTFOLIO_URL}}` | (from profile.yml) (or /es depending on language) |
| `{{PORTFOLIO_DISPLAY}}` | (from profile.yml) (or /es depending on language) |
| `{{LOCATION}}` | (from profile.yml) |
| `{{SECTION_SUMMARY}}` | Professional Summary / Resumen Profesional |
| `{{SUMMARY_TEXT}}` | Personalized summary with keywords |
| `{{SECTION_COMPETENCIES}}` | Core Competencies / Competencias Core |
| `{{COMPETENCIES}}` | `<span class="competency-tag">keyword</span>` × 6-8 |
| `{{SECTION_EXPERIENCE}}` | Work Experience / Experiencia Laboral |
| `{{EXPERIENCE}}` | HTML for each job with reordered bullets |
| `{{SECTION_PROJECTS}}` | Projects / Proyectos |
| `{{PROJECTS}}` | HTML for top 3-4 projects |
| `{{SECTION_EDUCATION}}` | Education / Formación |
| `{{EDUCATION}}` | HTML for education |
| `{{SECTION_CERTIFICATIONS}}` | Certifications / Certificaciones |
| `{{CERTIFICATIONS}}` | HTML for certifications |
| `{{SECTION_SKILLS}}` | Skills / Competencias |
| `{{SKILLS}}` | HTML for skills |

## Post-Generation

Update the tracker if the offer is already registered: change PDF from ❌ to ✅.
