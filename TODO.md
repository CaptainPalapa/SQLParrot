# SQL Parrot — TODO / Next Plans

A running backlog of things worth doing, captured so they don't get lost. This
is a "what's next" list, not a commitment or a schedule.

Two things deliberately live elsewhere:

- **Dependency version bumps** are handled automatically by Dependabot, which
  files them as pull requests. They don't belong here.
- **Setup and contribution instructions** live in the README, not in this list.

## Next

- **Migrate ESLint 8 → 9 with flat config.** Rewrite `frontend/.eslintrc.cjs`
  as `frontend/eslint.config.js`. This unblocks two plugin updates that require
  ESLint 9: `eslint-plugin-react-hooks` (4 → 7) and
  `eslint-plugin-react-refresh` (0.4 → 0.5).
- **Enforce linting on commit.** Nothing runs lint today — no CI step and no git
  hook, so it only runs if someone types `npm run lint` by hand. Wire in husky +
  lint-staged so a pre-commit hook lints changed files. Husky installs the hook
  automatically for anyone who clones and runs `npm install` (via its `prepare`
  script), so contributors get it for free.
- **Add a backend ESLint config.** The backend has no lint setup at all.

## Someday / Watch

- **better-sqlite3 13.x.** A major version (requires Node ≥ 22, which we now
  meet on Node 24). Review the changelog for breaking changes before adopting;
  we currently stay on the 12.x line.
- **Express transitive advisories.** Denial-of-service advisories sit in
  Express's dependency chain (`body-parser`, `path-to-regexp`, `qs`). There is
  no direct-dependency fix available yet — Express is already at its latest
  release. Revisit when Express ships a patch.
