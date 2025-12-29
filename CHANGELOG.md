# Changelog

All notable changes to SQL Parrot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- UI password protection feature (optional)
  - Password setup dialog on first launch
  - Password entry gate for protected sessions
  - Password management modal in Settings
  - Support for Docker `UI_PASSWORD` environment variable
  - Session-based authentication with automatic timeout
  - Logout functionality

### Changed
- Button order in password setup (Set Password button now on right)
- Improved verification issues detection and display
- Fixed field name mapping for snapshot verification

### Fixed
- Verification modal now properly displays external snapshots
- Issues detection correctly maps backend response fields

## [1.1.0] - Previous Release

### Added
- Initial release features
- Snapshot management
- Group management
- History tracking

[Unreleased]: https://github.com/CaptainPalapa/SQLParrot/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/CaptainPalapa/SQLParrot/releases/tag/v1.1.0

