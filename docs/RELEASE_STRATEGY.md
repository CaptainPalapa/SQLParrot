# Release & Distribution Strategy

Research notes for SQL Parrot release process. Review and decide on approach.

---

## 1. Desktop App Distribution (.exe, .dmg, .AppImage)

### Where to Host Binaries

**GitHub Releases** is the standard approach for open source projects:
- Unlimited file size and bandwidth (no limits on binary downloads)
- Direct integration with GitHub Actions
- Semantic versioning support built-in
- Users download from the Releases page

**Not Recommended:**
- Checking binaries into the repo (bloats git history, wastes clone time)
- External hosting (adds complexity, potential linkrot)

### Automation with Tauri Action

Tauri has an official GitHub Action ([tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action)) that:
- Builds for Windows, macOS (x64 + ARM), and Linux
- Uploads binaries directly to GitHub Releases
- Generates `latest.json` for auto-update support
- Uses matrix strategy for parallel cross-platform builds

**Workflow Example:**
```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    strategy:
      matrix:
        platform: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: tauri-apps/tauri-action@v0
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'SQL Parrot v__VERSION__'
          releaseBody: 'See CHANGELOG.md for details.'
```

**Reference:** [Tauri v2 GitHub Distribution Docs](https://v2.tauri.app/distribute/pipelines/github/)

---

## 2. Docker Image Distribution

### GitHub Container Registry (ghcr.io) vs Docker Hub

| Aspect | ghcr.io | Docker Hub |
|--------|---------|------------|
| **Pull Limits** | None for public | 100/day anonymous |
| **GitHub Integration** | Native with Actions | Requires config |
| **Visibility** | Good for GitHub users | Industry standard |
| **Access in China** | Blocked without VPN | Works |
| **Cost** | Free for public | Free tier limits |

**Recommendation:** Use **ghcr.io** since we're already on GitHub. Avoids Docker Hub's pull rate limits.

### Pushing to ghcr.io

```yaml
name: Publish Docker
on:
  push:
    tags:
      - 'v*'

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to ghcr.io
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ghcr.io/captainpalapa/sqlparrot:latest
            ghcr.io/captainpalapa/sqlparrot:${{ github.ref_name }}
```

**References:**
- [ghcr.io vs Docker Hub Comparison](https://dev.to/github/github-container-registry-better-than-docker-hub-1o9k)
- [JFrog Comparison](https://jfrog.com/devops-tools/article/comparing-docker-hub-and-github-container-registry/)

---

## 3. Release Process Best Practices

### Semantic Versioning

Use `MAJOR.MINOR.PATCH`:
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes

### Automated Releases with Release Please

[Release Please](https://github.com/google-github-actions/release-please-action) (by Google) automates:
- Version bumping based on commit messages
- CHANGELOG.md generation
- GitHub Release creation

**Requires:** Conventional Commits format
```
feat: add password protection for UI
fix: correct healthcheck in Docker
docs: update architecture section
```

**Workflow:**
```yaml
name: Release Please
on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: google-github-actions/release-please-action@v4
        with:
          release-type: node
```

### Changelog

Maintain `CHANGELOG.md` with:
- Version number and date
- Grouped by: Added, Changed, Fixed, Removed
- Link to GitHub compare between versions

### Security

- Enable **Dependabot** for dependency updates
- Add **Dependency Review** action to scan PRs
- Consider signing releases with GPG
- Enable **Immutable Releases** in GitHub settings (prevents tampering)

---

## 4. Recommended Setup for SQL Parrot

### Phase 1: Manual Releases (Now)
1. Create release manually on GitHub
2. Build locally: `npm run tauri build`
3. Upload .exe/.msi to release
4. Tag with version: `git tag v1.0.0 && git push --tags`

### Phase 2: Semi-Automated (Soon)
1. Add GitHub Action for Tauri builds on tag push
2. Add GitHub Action for Docker push to ghcr.io
3. Write CHANGELOG.md manually

### Phase 3: Fully Automated (Later)
1. Adopt Conventional Commits
2. Add Release Please for auto-versioning
3. Combine all workflows to trigger on release

---

## 5. Quick Wins to Do Now

- [ ] Create first GitHub Release manually with current .exe
- [ ] Add basic Tauri build workflow (triggers on tags)
- [ ] Add Docker push workflow (triggers on tags)
- [ ] Create CHANGELOG.md
- [ ] Address Dependabot vulnerabilities (7 flagged)
- [ ] Enable immutable releases in repo settings

---

## Sources

- [GitHub Releases Docs](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Tauri Action](https://github.com/tauri-apps/tauri-action)
- [Release Please](https://github.com/google-github-actions/release-please-action)
- [10up Open Source Best Practices](https://10up.github.io/Open-Source-Best-Practices/releasing/)
- [Semantic Release Workflow](https://lahirumw.github.io/2025-02-05-semantic-release-workflow-githubactions/)
