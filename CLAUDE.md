# Claude Code Guidelines — job-search-agent

## Planning Files

Planning and migration documents (files matching `PLAN_*.md`) are ephemeral working documents,
not permanent project artifacts. They belong in `.gitignore`, not in version control.

### Rules

1. **Every `PLAN_*.md` file must be added to `.gitignore` before or at the time it is created.**
2. **When a planning file is deleted, remove its entry from `.gitignore` at the same time.**
   Do not leave stale `.gitignore` entries for files that no longer exist.
3. Completed migration docs (e.g. `MIGRATION_COMPLETE.md`, `*_MIGRATION.md`) follow the same
   rule — add to `.gitignore`, clean up the entry when the file is removed.

### Rationale

Planning files often contain implementation details, personal context, or intermediate decisions
that are not useful to future contributors and create noise in the repo history. Keeping
`.gitignore` tidy ensures it remains a reliable signal of what is intentionally excluded.

## General Preferences

- Do not commit `.env` or `prompts/profile.js` — these contain private data and are gitignored.
- Prefer environment variables over hardcoded values for anything personal or deployment-specific.
- When removing a dependency, also remove any now-dead env var references from `.env.example`.
