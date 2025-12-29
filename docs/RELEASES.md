# Release Process

This document describes how to create releases for SQL Parrot.

## Version Numbering

SQL Parrot uses [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (0.X.0): New features, backward compatible
- **PATCH** (0.0.X): Bug fixes, backward compatible

## Version Files

Update these files when bumping versions:
- `package.json` (root)
- `frontend/package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `CHANGELOG.md` (add entry for new version)

## Creating a Release

### 1. Build the Application

For Windows (.exe and .msi):
```bash
npm run tauri:build
```

This creates installers in `src-tauri/target/release/bundle/`:
- `msi/` - Windows MSI installer
- `nsis/` - Windows NSIS installer (portable .exe)

### 2. Create a Git Tag

```bash
# Make sure all changes are committed
git add -A
git commit -m "Release v1.2.0"

# Create and push the tag
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

### 3. Create GitHub Release

1. Go to GitHub: https://github.com/CaptainPalapa/SQLParrot/releases/new
2. Select the tag you just created (e.g., `v1.2.0`)
3. Set the release title to the version (e.g., `v1.2.0`)
4. Copy the relevant section from `CHANGELOG.md` into the release description
5. Attach the build artifacts:
   - Upload the `.msi` file from `src-tauri/target/release/bundle/msi/`
   - Upload the `.exe` installer from `src-tauri/target/release/bundle/nsis/`
6. Click "Publish release"

## Automated Releases (Future)

You can set up GitHub Actions to automate building and releasing:
- Build on tag push
- Create release automatically
- Attach build artifacts

See GitHub Actions documentation for setting this up.

