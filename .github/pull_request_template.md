## Summary

Describe the user-visible change and why it belongs in the plugin-only repository.

## Security and privacy

- [ ] Installation remains network-idle until the local user explicitly enables phone access.
- [ ] Management RPC and settings UI remain loopback-only.
- [ ] No credentials, QR URLs, private logs, production identifiers, signing material, or personal data are included.
- [ ] FRPC remains restricted to the local DSH Web endpoint and is not started through a shell.

## Validation

- [ ] `npm test`
- [ ] `npm run check:docs`
- [ ] `npm run check:secrets`
- [ ] `npm run fetch-frpc`
- [ ] `npm pack --dry-run --ignore-scripts`
- [ ] `npm run pack:verify`
- [ ] `git diff --check`

## Documentation

- [ ] `README.md` and `README.zh.md` still describe the same behavior.
- [ ] `CHANGELOG.md` is updated.
- [ ] The change does not claim an unpublished package, repository, marketplace listing, or official endorsement.
