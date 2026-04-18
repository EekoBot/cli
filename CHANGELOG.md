# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-04-18

### Added
- `eeko publish` — commits local widget files (`index.html`, `styles.css`, `script.js`, `widget.json`) to your Eeko component's Cloudflare Artifacts repo via the server-mediated `POST /api/merchant/components/:id/commit` endpoint. No git push token ever touches your machine.
- `eeko.config.json` — ties a local widget directory to a specific merchant component. Supports optional `apiHost` override.
- `eeko init` now prompts which merchant component the directory is for (fetched from your Eeko account) and scaffolds a canonical four-file widget layout plus `eeko.config.json`.

### Changed
- Scaffolded starter files now use canonical names (`styles.css`, `widget.json`) instead of legacy (`style.css`, `field.json`).

### Removed
- `eeko release` — posted to deleted `/api/merchant/components/:id/releases` and `/unreleased-tags` endpoints. Superseded by `eeko publish` + the new Artifacts-backed versioning flow (git tags + branches on the per-component repo).
- `src/utils/git.ts` — unused after the release command was removed.

## [0.1.1] - 2024-11-29

### Changed
- Replaced tiged with giget for template cloning (removes deprecated dependency warnings)

### Fixed
- Added link to [@eeko/sdk](https://github.com/EekoBot/sdk) in documentation

## [0.1.0] - 2024-11-29

### Added
- Initial release
- `eeko dev` - Local development server with Vite HMR
- `eeko test` - Send test events to widgets (trigger, chat, mount, unmount, update)
- `eeko init` - Create widget projects from GitHub templates
- `eeko build` - Validate widget structure
- WebSocket server for real-time event injection
- Automatic SDK injection into widgets
- Interactive keyboard shortcuts in dev mode (1-4 for test events)
- Automatic port selection when defaults are in use

[Unreleased]: https://github.com/EekoBot/cli/compare/0.4.0...HEAD
[0.4.0]: https://github.com/EekoBot/cli/compare/0.1.1...0.4.0
[0.1.1]: https://github.com/EekoBot/cli/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/EekoBot/cli/releases/tag/0.1.0
