# Repository Instructions

These instructions apply to the entire repository.

## Change Log

- Update `CHANGELOG.md` whenever completing a code, configuration, database, documentation, or user-visible behavior change.
- Add a new entry for each released version using the format `## x.y.z - YYYY-MM-DD`.
- Keep entries concise and grouped with standard headings when useful: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.
- The changelog entry must describe the meaningful change that was made in the same work session as the version bump.

## Versioning

- Update the app version every time repository changes are completed.
- The canonical app version is `Client/package.json`'s `version` field. Keep `Client/package-lock.json` in sync when that version changes.
- Follow Semantic Versioning:
  - Patch (`x.y.z + 1`) for bug fixes, internal improvements, documentation, maintenance, and non-breaking polish.
  - Minor (`x.y + 1.0`) for new backward-compatible features or notable user-facing enhancements.
  - Major (`x + 1.0.0`) for breaking changes, incompatible data/API changes, or major behavior resets.
- Use the root scripts when practical:
  - `npm run release:patch`
  - `npm run release:minor`
  - `npm run release:major`
- The version number in `CHANGELOG.md` must match the version committed in `Client/package.json`.

## Before Finishing

- Confirm `CHANGELOG.md`, `Client/package.json`, and `Client/package-lock.json` all agree on the version for the completed change.
- Mention the version bump and changelog entry in the final response.
