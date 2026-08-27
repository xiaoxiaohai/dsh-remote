# Contributing

Thank you for improving DSH Remote. This repository is prepared as a minimal, public plugin-only source tree. The hosted Server and companion-app source are outside this repository.

## Requirements

- macOS for runtime testing;
- Node.js 22 or newer;
- DeepSeek Harness `0.1.0-rc.8` or newer for clean-profile testing;
- `tar` and network access to official GitHub release assets when packaging FRPC.

## Development setup

```bash
npm test
npm run check:docs
npm run check:secrets
npm run fetch-frpc
npm pack --dry-run --ignore-scripts
npm run pack:verify
```

The generated `bin/` directory and npm tarballs are ignored. Do not commit FRPC binaries, local state, credentials, QR links, `.env` files, databases, signing material, logs, or production deployment details.

## Pull requests

A pull request should:

1. explain the user-visible problem and security impact;
2. keep installation opt-in and management loopback-only;
3. add or update automated tests;
4. keep `README.md` and `README.zh.md` aligned when behavior changes;
5. update `CHANGELOG.md`;
6. pass all checks without publishing an npm package.

Use small English commit messages. No Contributor License Agreement is currently required; contributions are accepted under the repository's MIT License.

## Security reports

Follow [SECURITY.md](SECURITY.md). Do not file a public issue for a vulnerability or include real credentials, identifiers, private logs, or user data in a test case.
