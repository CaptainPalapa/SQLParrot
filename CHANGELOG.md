# Changelog

All notable changes to SQL Parrot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Updated Codecov workflow to use GitHub App instead of token (requires Codecov GitHub App installation)

## [1.5.2] - 2026-01-08
*Security Dependency Updates & Vulnerability Mitigation*

### Security
- **Fixed Critical Security Vulnerabilities**
  - Updated `qs` from 6.13.0/6.14.0 to 6.14.1 (fixes GHSA-6rw7-vpxm-498p - DoS via arrayLimit bypass)
  - Updated `jws` from 3.2.2 to 3.2.3 (fixes GHSA-869p-cjfg-cm3x - HMAC signature verification bypass)
  - Updated `js-yaml` from 4.1.0 to 4.1.1 (fixes GHSA-mh29-5h37-fv8m - prototype pollution)
  - Updated `glob` from 10.4.5 to 10.5.0 (fixes GHSA-5j98-mcp5-4vw2 - command injection)
- **Dependency Updates**
  - Updated `supertest` from 7.1.4 to 7.2.2
  - Updated `mssql` in backend from 12.0.0 to 12.2.0 (matching root package.json)

### Added
- **Security Vulnerability Tests** (`tests/security-vulnerabilities.spec.js`)
  - Tests for qs arrayLimit DoS protection (GHSA-6rw7-vpxm-498p)
  - Tests for js-yaml prototype pollution protection (GHSA-mh29-5h37-fv8m)
  - Tests for jws HMAC verification (GHSA-869p-cjfg-cm3x)
  - Tests for glob command injection protection (GHSA-5j98-mcp5-4vw2)
  - Integration tests for Express query parsing with qs protection
  - Version verification tests for all patched dependencies
- Total test count: 92 tests (81 backend + 11 security, up from 81)

### Changed
- All security vulnerabilities resolved via `npm audit fix`
- No npm overrides used (relying on upstream package updates for compatibility)

## [1.5.1] - 2026-01-08

### Changed
- Updated Codecov badge in README to link to GitHub App installation page for improved coverage reporting reliability

## [1.5.0] - 2026-01-08
*Tailwind CSS v4 Migration & Modal Improvements*

### Changed
- **Tailwind CSS v4 Migration**
  - Migrated from Tailwind CSS v3.4.19 to v4.1.18
  - Updated PostCSS configuration to use @tailwindcss/postcss plugin
  - Replaced @tailwind directives with @import 'tailwindcss'
  - Converted @layer components to @utility directives
  - Removed autoprefixer (now handled by Tailwind v4 internally)

### Fixed
- Modal backdrop blur now properly visible with improved opacity (60%) and subtle blur (1px)
- ESC key handling added to PasswordManagementModal and ThemeSelector
- All modals now consistently support ESC key to close

### Added
- Comprehensive test coverage for modal components (38 new tests)
  - Modal.test.jsx: 30 tests covering ConfirmationModal, InputModal, and generic Modal
  - PasswordManagementModal.test.jsx: 7 tests covering ESC key, validation, and form behavior
  - Updated ThemeSelector.test.jsx with ESC key test
- Total test count: 142 tests (70 backend + 72 frontend, up from 104)

## [1.4.0] - 2026-01-05
*Dependency Updates & Dependabot Configuration*

### Changed
- **Major Dependency Updates**
  - lucide-react: 0.294.0 → 0.562.0
  - dotenv: 16.6.1 → 17.2.3
  - tailwindcss: 3.4.18 → 4.1.18
  - bcryptjs: 2.4.3 → 3.0.3
  - concurrently: 8.2.2 → 9.2.1
  - express: 4.18.2 → 4.22.1
- **Minor/Patch Updates**
  - mssql: 12.0.0 → 12.2.0
  - nodemon: 3.1.10 → 3.1.11
  - eslint-plugin-react-refresh: 0.4.23 → 0.4.26

### Added
- Dependabot configuration to manage dependency updates
- Automated dependency update workflow

### Fixed
- All tests passing (104 tests: 70 backend + 34 frontend)

## [1.3.0] - 2025-12-31
*Multi-Profile Support & Profile-Specific Groups*

### Added
- **Multi-Profile Support**
  - Profile selector dropdown in header (appears when 2+ profiles exist)
  - Switch between SQL Server connections without navigating to Settings
  - Group count badges per profile (e.g., `[3]`)

- **Profile-Specific Groups**
  - Groups are now tied to specific profiles
  - Groups filtered by active profile in UI
  - Migration automatically assigns existing groups to active profile

- **Profile Management UI**
  - New Profiles panel for managing connection profiles
  - Create, edit, delete connection profiles
  - Auto-test connection before save (with "Save Anyway" option)
  - Edit profile in-place from connection error banner
  - Profile deletion warns about associated groups

- **Connection Status Improvements**
  - Replaced blocking full-screen overlay with inline status messages
  - Blur overlay on groups list when offline (content visible but disabled)
  - Manual retry button (removed auto-retry)
  - Can navigate to other tabs while connection is unavailable

- **Keyboard Accessibility**
  - ESC key closes all modals (profile, group, delete confirmation)

- **Windows Installer**
  - Uninstaller now offers option to remove SQLite database (profiles, settings, history)

### Changed
- History messages use more natural language

### Fixed
- Health check performs actual SQL connection test
- HTTP error codes now properly detected in API client

### Code Quality
- Removed 120+ verbose console.log statements
- Both Node.js and Rust backends have full feature parity

## [1.2.0] - 2025-12-29
*UI Password Protection*

### Added
- **UI Password Protection** (optional)
  - Password setup dialog on first launch
  - Password gate for protected sessions
  - Password management in Settings (change/remove)
  - Session-based authentication with timeout
  - Docker `UI_PASSWORD` environment variable support
  - Logout functionality

## [1.1.0] - 2025-12-29
*Tauri Desktop App & SQLite Migration*

### Added
- **Tauri v2 Desktop Application** (Windows)
  - Native .exe with full feature parity
  - Rust backend with SQL Server connectivity
  - No Docker/Node.js dependencies required

- **Local SQLite Metadata Storage**
  - No SQL Server metadata database required
  - Portable, zero-configuration setup
  - User attribution for all operations

- **API Abstraction Layer**
  - Same React UI works with both Docker and Desktop deployments
  - Automatic runtime detection

- Light/Dark mode toggle
- Auto-create checkpoint after rollback option
- Connection resilience with reconnection UI
- SQL Parrot icons and splash screens

### Changed
- License: MIT → AGPL v3 + Commercial dual license
- Improved Docker deployment experience

### Fixed
- Snapshot rollback uses proper SQL Server RESTORE command
- GroupsManager shows config prompt instead of auto-reconnect
- Max history entries limit enforced

## [1.0.0] - Initial Release

### Added
- Initial release features
- Snapshot management
- Group management
- History tracking
- Theme system with 7 accent colors

[1.5.0]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.3.2...v1.4.0
[1.3.0]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.2.0...v1.3.0
[Unreleased]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.5.0...HEAD
[1.2.0]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.0.0.0...v1.1.0
[1.0.0]: https://github.com/CaptainPalapa/SQLParrot/releases/tag/v1.0.0.0
