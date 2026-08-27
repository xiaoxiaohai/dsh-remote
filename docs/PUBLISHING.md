# Maintainer Publishing Checklist

This file prepares a release; it does not authorize one. CI and repository scripts never publish packages.

## One-time repository setup

1. Confirm the public GitHub repository has a clean history.
2. Confirm `repository`, `homepage`, and `bugs` in `package.json` match the real repository.
3. Add comparison links in `CHANGELOG.md` after the first Git tag exists.
4. Enable GitHub Private Vulnerability Reporting.
5. Add the `dsh-plugin` GitHub topic.
6. Protect the default branch and require the CI workflow.
7. Confirm the `musitoolbox` npm scope is owned by the publisher and requires two-factor authentication.
8. Configure npm to publish only to `https://registry.npmjs.org/`; do not publish to a local mirror.

## Beta release gates

- Hosted-service privacy and retention text reflects the real deployment.
- Exposed or transcript-copied FRP credentials have been rotated.
- The Android companion is release-signed before it is presented as a general public download.
- Public iOS claims are limited to the distribution that actually exists.
- A clean DSH `0.1.0-rc.8` or newer Web profile installs the candidate and remains network-idle until a local user clicks enable.
- Both Intel and Apple Silicon FRPC artifacts are present and verified.
- No GitHub URL, npm version, release, marketplace listing, or CI result is claimed before it exists.

## Build and inspect

```bash
node --version
npm test
npm run check:docs
npm run check:secrets
npm run fetch-frpc
npm pack --dry-run --ignore-scripts
npm run pack:verify
git diff --check
git status --short
```

Review the printed tarball whitelist and SHA-256. Test the exact tarball in a disposable DSH profile before publication.

## Human-controlled publication

The repository automation must not run this command. After all gates pass, an authorized npm owner may run:

```bash
npm login --registry=https://registry.npmjs.org/
npm publish --access public --tag beta
```

Then independently read the registry result and install the published version in another clean profile:

```bash
dsh plugin --profile dsh-remote-release-check add @musitoolbox/dsh-remote@beta
dsh --profile dsh-remote-release-check --dump-config
```

A successful `npm publish` is not enough: verify the registry integrity value, package contents, bundle activation, opt-in behavior, and both architectures.

## Discovery after publication

- Add accurate English and Chinese descriptions to the GitHub repository.
- Submit the repository and npm mapping to a maintained DSH community catalog.
- Request curation only after the security and app-signing gates pass.
- Never promise official DSH endorsement or manipulate rankings.

## Failed release

Prefer a fixed follow-up version and `npm deprecate` for a bad beta. Do not silently replace an immutable npm version. Coordinate any credential rotation or hosted-service rollback separately from npm metadata.
