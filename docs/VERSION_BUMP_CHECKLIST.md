# Version Bump Checklist

**IMPORTANT:** When bumping the version number, you MUST update it in ALL of these locations:

## Required Updates

- [ ] **`package.json`** (root) - Update `"version"` field
- [ ] **`frontend/src/constants/version.js`** - Update `APP_VERSION` constant
- [ ] **`src-tauri/Cargo.toml`** - Update `version = "X.Y.Z"` field
- [ ] **`src-tauri/tauri.conf.json`** - Update `"version": "X.Y.Z"` field
- [ ] **`CHANGELOG.md`** - Add new version entry with changes

## Verification Steps

After updating all version numbers:

- [ ] Run `npm test` to ensure tests still pass
- [ ] Run `cd frontend && npm run build` to verify frontend builds
- [ ] Check that About panel displays correct version (if running dev server)
- [ ] Verify Tauri app version (if building desktop app)

## Git Workflow

1. Update all version files
2. Update CHANGELOG.md
3. Commit with message: `chore: bump version to X.Y.Z`
4. Create and push tag: `git tag -a vX.Y.Z -m "vX.Y.Z: [description]" && git push origin vX.Y.Z`

## Notes

- The version in `frontend/src/constants/version.js` is displayed in the About panel
- Tauri uses the version from `Cargo.toml` and `tauri.conf.json` for the desktop app
- All versions should match exactly (e.g., "1.4.0" not "1.4" or "v1.4.0")

