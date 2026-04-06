# Modes

Markdown prompts used with Claude Code together with the root [`CLAUDE.md`](../CLAUDE.md). Each file aligns with a `/job-forge …` entry point or shared behavior described there.

- **`_shared.md`** — Archetypes, scoring dimensions, negotiation scaffolding. Edit this first when you change how offers are classified or weighted.
- **Per-command files** — For example `auto-pipeline.md`, `scan.md`, `batch.md`, `tracker.md`. The full file map and how modes connect to the rest of the repo live in [**Architecture — Modes**](../docs/ARCHITECTURE.md#modes-modes).

To tailor profile-driven settings, portals, and templates, see [`docs/CUSTOMIZATION.md`](../docs/CUSTOMIZATION.md).

Contributors: see [`CONTRIBUTING.md`](../CONTRIBUTING.md) for branch workflow and the `npm run verify` gate; prefer one cohesive change per PR (for example a single mode or updates under `_shared.md` only).
