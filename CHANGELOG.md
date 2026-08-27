# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use semantic versioning with prerelease tags while the product is in beta.

## [Unreleased]

- Public GitHub repository metadata and the issue tracker are configured; npm publication is pending.
- Android production signing and public iOS distribution remain pending.

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
