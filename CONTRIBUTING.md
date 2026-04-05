# Contributing to JobForge

Thanks for your interest in contributing! JobForge is built with Claude Code, and you can use it for development too.

## Quick Start

1. Fork the repo
2. Create a branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test with a fresh clone (see [docs/SETUP.md](docs/SETUP.md))
5. Commit and push
6. Open a Pull Request

## What to Contribute

**Good first contributions:**
- Add companies to `templates/portals.example.yml`
- Improve documentation
- Add example CVs for different roles (in `examples/`)
- Report bugs via [Issues](https://github.com/CharlieGreenman/JobForge/issues)

**Bigger contributions:**
- New evaluation dimensions or scoring logic
- Dashboard TUI features (in `dashboard/`)
- New skill modes (in `modes/`)
- Script improvements (`.mjs` utilities)

## Guidelines

- Scripts should handle missing files gracefully (check `existsSync` before `readFileSync`)
- Dashboard changes require `go build` — test with real data before submitting
- Don't commit personal data (cv.md, profile.yml, applications.md, reports/)

## Development

```bash
# Scripts
node verify-pipeline.mjs     # Health check
node cv-sync-check.mjs        # Config check

# Dashboard
cd dashboard && go build -o job-forge-dashboard .
./job-forge-dashboard --path .
```

## Need Help?

- [Open an issue](https://github.com/CharlieGreenman/JobForge/issues)
- [Read the architecture docs](docs/ARCHITECTURE.md)
