# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning with prerelease tags while the product is in beta.

## [Unreleased]

## [0.4.0-beta.2] - 2026-09-02

### Fixed

- Added a deterministic, fail-closed staging workflow for human-controlled npm publication.
- The staged npm package keeps only English `README.md` at its root and moves the matching Chinese document to `docs/README.zh.md`, so npm selects English for the package page.
- Directory publication metadata is verified to exclude local `_resolved` and `_from` paths.
- Added explicit cleanup steps for the accidental beta.1 `latest` tag and beta.1 deprecation without unpublishing immutable history.

### Changed

- The npm package now includes the linked Changelog, Contributing guide, and Publishing checklist.
- Public GitHub repository metadata, the issue tracker, required CI, branch protection, the `dsh-plugin` topic, and Private Vulnerability Reporting are configured.
- The hosted Android companion is Release-signed `0.4.0-beta.1` with matching Digital Asset Links; public iOS distribution remains pending.

## [0.4.0-beta.1] - 2026-08-27

### Added

- Clean plugin-only public source layout under the MIT License.
- Read-only `remote-access` Skill for phone, mobile, Android, iPhone, QR-pairing, and remote-DSH discovery.
- Reproducible FRPC `0.70.1` packaging for `darwin-x64` and `darwin-arm64` with pinned archive hashes.
- Package whitelist, secret/publication scan, documentation checks, and non-publishing CI.
- English and Chinese user documentation plus security, privacy, self-hosting, contribution, and release guidance.

### Changed

- The hosted service remains preconfigured, but installation now defaults to `enabled: false` and `autoStart: false`.
- Registration, local credential creation, and FRPC startup occur only after the user clicks **Enable phone access** on the local settings page.
- Authorized-phone polling begins only after the tunnel reaches the running state.

### Removed

- Historical native task, approval, danger, audit, token, and gateway modules that are not loaded by the current remote-Web plugin.

Repository comparison links will be added when the first Git tag is created.
