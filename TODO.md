# SQL Parrot — TODO / Next Plans

A running backlog of things worth doing, captured so they don't get lost. This
is a "what's next" list, not a commitment or a schedule.

Two things deliberately live elsewhere:

- **Dependency version bumps** are handled automatically by Dependabot, which
  files them as pull requests. They don't belong here.
- **Setup and contribution instructions** live in the README, not in this list.

## Next — Enforce linting (one project, three PRs in order)

Nothing runs lint today — no CI step and no git hook, so it only runs if someone
types `npm run lint` by hand. These three steps close that gap. They share one
decision (standardize the repo on ESLint 9 + flat config) and are done in order,
each as its own PR. The hook goes last.

1. **Migrate the frontend to ESLint 9 + flat config.** Rewrite
   `frontend/.eslintrc.cjs` as `frontend/eslint.config.js` and move ESLint 8 → 9.
   This unblocks two plugin updates that require ESLint 9:
   `eslint-plugin-react-hooks` (4 → 7) and `eslint-plugin-react-refresh`
   (0.4 → 0.5). This is the riskiest step and it sets the ESLint version baseline
   for the rest. Get `npm run lint` green before moving on. Expect a small
   cleanup pass — react-hooks 7 is stricter than 4.x.

2. **Add a backend ESLint config.** The backend has no lint setup at all. Add a
   fresh flat config on the same ESLint 9 baseline plus a `lint` script, and get
   it clean. Greenfield — no migration.

3. **Enforce lint on commit (husky + lint-staged).** Must be last: it runs the
   lint from steps 1–2, so those need to be green first. Wire a pre-commit hook
   that lints changed files. lint-staged only touches changed files, so
   pre-existing violations elsewhere won't block commits. Husky installs the hook
   automatically for anyone who clones and runs `npm install` (via its `prepare`
   script), so contributors get it for free.

## Someday / Watch

- **better-sqlite3 13.x.** A major version (requires Node ≥ 22, which we now
  meet on Node 24). Review the changelog for breaking changes before adopting;
  we currently stay on the 12.x line.
- **Express transitive advisories.** Denial-of-service advisories sit in
  Express's dependency chain (`body-parser`, `path-to-regexp`, `qs`). There is
  no direct-dependency fix available yet — Express is already at its latest
  release. Revisit when Express ships a patch.
