# Security Policy

## Beta status

`@musitoolbox/dsh-remote` is a beta remote-access plugin. It runs a local network client and can carry the DSH Web interface through a configured gateway. Review the source and the [privacy notice](PRIVACY.md) before enabling it. Do not use the hosted beta for regulated, highly confidential, or safety-critical work.

## Supported versions

Only the newest `0.4.x` beta release is intended to receive security fixes. No npm version has been published yet.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include a QR URL, pairing fragment, control secret, tunnel token, session cookie, private key, production log, or personal data in any issue.

Before the first public release, the repository owner must enable **GitHub Private Vulnerability Reporting** under **Settings → Security → Private vulnerability reporting**. After it is enabled, use [Security → Report a vulnerability](https://github.com/xiaoxiaohai/dsh-remote/security/advisories/new).

If private reporting is not available, stop and contact the repository owner through a private channel. The package must not be published until a private reporting path exists. Response and remediation are best effort; this beta has no guaranteed security-response SLA.

A useful report includes:

- affected plugin and DSH versions;
- macOS architecture (`darwin-x64` or `darwin-arm64`);
- whether the hosted beta or a self-hosted service was used;
- minimal reproduction steps with synthetic identifiers;
- expected and observed security boundaries;
- a proposed fix, if available.

## Security boundaries

- Installation alone does not register a Mac or start FRPC.
- The user must enable phone access from the local DSH settings page.
- Host management RPC uses `authority: loopback`; the client settings module does not load on a remote page.
- Service URLs must be HTTPS origins. Plain HTTP is accepted only for explicit loopback development.
- FRPC is started directly without a shell and forwards only the local DSH Web HTTP/WebSocket endpoint.
- QR fragments, Mac control secrets, tunnel tokens, and session secrets are separate credentials. Never paste them into chat or bug reports.
- The hosted gateway terminates TLS and transports DSH Web traffic. It is trusted infrastructure, not application-level end-to-end encryption.

## Dependency and artifact policy

The npm package carries FRPC `0.70.1` for Intel and Apple Silicon Macs. `scripts/fetch-frpc.mjs` downloads official upstream archives and verifies pinned SHA-256 values before packaging. The upstream Apache-2.0 license is included as `bin/frp-LICENSE` in the npm tarball.

CI must test and inspect a package, but it must never publish one automatically.
