# Maintainer Publishing Checklist

This file prepares a release; it does not authorize one. CI and repository scripts never publish packages or change npm registry metadata. An authorized human owner performs every npm write operation.

## Immutable beta.1 history

`0.4.0-beta.1` was the first npm publication. Its runtime tarball matched the reviewed candidate, but its npm metadata exposed three release-process defects:

- npm created both `beta` and `latest` dist-tags;
- npm selected root `README.zh.md` instead of English `README.md` for the package page;
- publishing an absolute tarball path preserved local `_resolved` and `_from` values in public version metadata.

The local path was not a credential, and it was not present in the tarball. Do not unpublish or try to replace beta.1. Publish a corrected follow-up, remove the unintended `latest` tag, and deprecate beta.1 after the replacement is verified.

## One-time repository and account setup

1. Confirm the public GitHub repository has a clean, plugin-only history.
2. Confirm `repository`, `homepage`, and `bugs` in `package.json` match the real repository.
3. Keep GitHub Private Vulnerability Reporting enabled.
4. Keep the `dsh-plugin` GitHub topic.
5. Protect the default branch and require both CI jobs.
6. Confirm the `musitoolbox` npm scope is owned by the publisher.
7. Require the publisher's verified email and `auth-and-writes` two-factor authentication.
8. Use only `https://registry.npmjs.org/`; do not publish to a mirror.

## Beta release gates

- Hosted-service privacy and retention text reflects the real deployment.
- Exposed or transcript-copied FRP credentials have been rotated.
- The hosted Android companion is Release-signed before it is presented as a public download.
- Public iOS claims are limited to distribution that actually exists.
- A clean DSH `0.1.0-rc.8` or newer Web profile installs the candidate and remains network-idle until a local user clicks enable.
- Both Intel and Apple Silicon FRPC artifacts are present and verified.
- The candidate version does not already exist on the official npm registry.
- No GitHub URL, npm version, release, marketplace listing, or CI result is claimed before it exists.

### Current `0.4.0-beta.2` candidate evidence

As of 2026-09-02, the Android download is Release-signed `0.4.0-beta.1` and its Digital Asset Links certificate matches. The earlier FRP tunnel credential has been rotated. GitHub required CI, branch protection, the `dsh-plugin` topic, and Private Vulnerability Reporting are enabled. The plugin beta.2 changes only release metadata and staging; runtime code and opt-in defaults remain unchanged.

## Build and inspect the source package

```bash
node --version
npm run fetch-frpc
npm test
npm run check:docs
npm run check:secrets
npm pack --dry-run --ignore-scripts
npm run pack:verify
git diff --check
git status --short
```

The final `git status --short` output must be empty. Review the source-package whitelist and hashes. The source repository keeps bilingual root READMEs, so it is not the directory used for npm publication.

## Build the sanitized publication directory

Create a new protected parent directory. The staging command refuses an existing output, an output inside the repository, a dirty Git worktree, symlinks, unapproved files, unsafe modes, missing FRPC, or the wrong version.

```bash
STAGE_PARENT="$(mktemp -d)"
chmod 700 "$STAGE_PARENT"
STAGE="$STAGE_PARENT/package"
npm run stage:build -- "$STAGE"
npm run stage:verify -- "$STAGE"
npm pack --json --ignore-scripts --pack-destination "$STAGE_PARENT" "$STAGE"
```

The staged package:

- contains only the reviewed file whitelist;
- has English `README.md` at its root;
- moves the Chinese translation to `docs/README.zh.md` and rewrites its local links;
- removes development and lifecycle scripts except the explicit FRPC fetch utility;
- contains no `readme`, `_resolved`, `_from`, local absolute path, token, or private operations data in `package.json`;
- makes npm directory-manifest preparation select English `README.md` without local resolution metadata.

Record the exact tarball SHA-256, SHA-1, SHA-512 integrity, size, and file list. Install that tarball in a disposable DSH profile and confirm the plugin loads as disabled without registration or FRPC startup.

## Human-controlled beta.2 publication

Repository automation and Agents must not run the following write command. After every gate passes, the authorized npm owner changes into the verified **directory**, not the tarball path, and runs:

```bash
cd "$STAGE"
npm whoami --registry=https://registry.npmjs.org/
npm publish . \
  --ignore-scripts \
  --access public \
  --tag beta \
  --registry=https://registry.npmjs.org/
```

Complete npm 2FA without sharing a password, token, one-time code, passkey prompt, or recovery code. Directory publication is required: publishing a tarball path can add local `_resolved` and `_from` metadata.

## Human-controlled beta.1 cleanup

Only after beta.2 is present and independently verified, the npm owner runs:

```bash
npm dist-tag rm @musitoolbox/dsh-remote latest \
  --registry=https://registry.npmjs.org/
npm deprecate @musitoolbox/dsh-remote@0.4.0-beta.1 \
  "Superseded by 0.4.0-beta.2; install @musitoolbox/dsh-remote@beta." \
  --registry=https://registry.npmjs.org/
```

Do not unpublish beta.1. Its exact version remains available as immutable history, with a clear deprecation warning.

## Independent registry verification

A successful CLI message is not enough. Read the official registry again and confirm:

- `beta` resolves to `0.4.0-beta.2`;
- no `latest` dist-tag remains;
- access is public and the repository, homepage, issue tracker, MIT license, OS, and Node requirements are correct;
- beta.2 `readmeFilename` is `README.md` and its README begins in English;
- beta.2 has no `_resolved`, `_from`, local path, or unexpected manifest field;
- the downloaded registry tarball is byte-for-byte identical to the recorded staging tarball;
- all staged files, modes, FRPC binaries, Apache-2.0 license, bundle defaults, and read-only Skill are intact;
- beta.1 shows the replacement deprecation message.

Then install `@musitoolbox/dsh-remote@beta` from the official registry in another clean DSH profile:

```bash
npm_config_registry=https://registry.npmjs.org/ \
  dsh plugin --profile dsh-remote-release-check add @musitoolbox/dsh-remote@beta
dsh --profile dsh-remote-release-check --dump-config
```

Start that disposable profile on a separate loopback port. Confirm `phase = disabled`, identity and Mac IDs are empty, no registration state is created, no FRPC process starts, and hosted registration counts remain unchanged. Stop the disposable process afterward.

## Discovery after publication

- Keep accurate English and Chinese descriptions in the GitHub repository.
- Submit the repository and npm mapping only to maintained DSH community catalogs.
- Request curation only after the security and app-signing gates pass.
- Never promise official DSH endorsement or manipulate rankings.

## Failed release

Prefer a fixed follow-up version and `npm deprecate` for a bad beta. Do not silently replace or unpublish an immutable npm version. Coordinate any credential rotation or hosted-service rollback separately from npm metadata.
