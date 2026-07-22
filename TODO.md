# SQL Parrot — TODO / Next Plans

A running backlog of things worth doing, captured so they don't get lost. This
is a "what's next" list, not a commitment or a schedule.

Two things deliberately live elsewhere:

- **Dependency version bumps** are handled automatically by Dependabot, which
  files them as pull requests. They don't belong here.
- **Setup and contribution instructions** live in the README, not in this list.

## Next — Refactor setState-in-effect patterns (frontend)

The frontend ESLint config temporarily turns off `react-hooks/set-state-in-effect`
(a React Compiler rule bundled with `eslint-plugin-react-hooks` 7). It fires on 7
working forms and modals — e.g. resetting a form when a modal closes, populating a
form when editing, `Modal`'s `setValue(initialValue)` on open, and `DatabaseSelector`
filter resets. Each is a legitimate flag (synchronous setState in an effect can
cascade renders), but fixing them properly changes UI behavior (deriving state,
`key`-based resets), so it was kept out of the lint-enablement PR. Do this as its
own change with test coverage, then remove the rule override in
`frontend/eslint.config.js`.

## Next — Two unwired features found during lint cleanup (frontend)

Enabling linting surfaced two features that were built but never connected to the
UI. The dead code was removed to get lint green; the features themselves are worth
deciding on:

- **Tab navigation callbacks.** `App.jsx` was passing an `onNavigateSettings`
  callback to `GroupsManager` and `onNavigateGroups` to `SettingsPanel`, but
  neither component ever called its callback — so there is no in-page "jump to
  Settings / jump to Groups" affordance. Either wire up buttons that call these,
  or leave navigation to the top tab bar (in which case nothing more is needed).
- **Metadata sync.** `SettingsPanel` had a `handleSyncMetadata` handler that calls
  the real `POST /api/metadata/sync` endpoint, but no button ever invoked it. If
  manual metadata sync is a wanted feature, add a control on the Metadata Storage
  card; otherwise the backend endpoint may be dead too and worth reviewing.

## Someday / Watch

- **better-sqlite3 13.x.** A major version (requires Node ≥ 22, which we now
  meet on Node 24). Review the changelog for breaking changes before adopting;
  we currently stay on the 12.x line.
- **Express transitive advisories.** Denial-of-service advisories sit in
  Express's dependency chain (`body-parser`, `path-to-regexp`, `qs`). There is
  no direct-dependency fix available yet — Express is already at its latest
  release. Revisit when Express ships a patch.
- **ESLint 10.** The repo is on ESLint 9 across all three configs. ESLint 10 is
  out, but `eslint-plugin-react` has no release that supports it yet (npm hard-
  refuses the install on a peer conflict), so 9 is the safe baseline. Move to 10
  when the plugin adds support — Dependabot should surface the bump then.
