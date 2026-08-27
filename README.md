# DSH Remote

English | [中文](README.zh.md)

> **Publication status:** `@musitoolbox/dsh-remote` is a prepared beta package and is **not yet published** to npm or a GitHub repository. The install command below is planned and will not work until an authorized owner publishes the package.

DSH Remote lets a phone open the existing DeepSeek Harness Web interface running on a Mac. The plugin registers an anonymous Mac only after local user consent, starts a verified FRPC process, and adds QR pairing plus authorized-phone controls to DSH Settings.

This is a hosted beta, not a general-availability remote-access service. Read [Security](SECURITY.md) and [Privacy](PRIVACY.md) before enabling it.

## What it provides

- Explicit opt-in: installation alone makes no registration request and opens no tunnel.
- A local **Settings → Phone access** card with QR pairing, pause, rotation, and per-phone revocation.
- The existing DSH Web HTTP and WebSocket interface instead of a second task/approval protocol.
- A managed FRPC `0.70.1` transport restricted to the local DSH Web port.
- Verified package artifacts for both `darwin-x64` and `darwin-arm64`.
- A model-visible, read-only `remote-access` Skill for phone, Android, iPhone, mobile, QR-pairing, and remote-DSH questions.
- A self-hosted service override for operators with a compatible DSH Remote Server.

The Skill explains safe local setup. It cannot start the tunnel, change configuration, or prove that remote access is running. The local settings card remains the source of truth.

## Requirements

- macOS on Intel (`darwin-x64`) or Apple Silicon (`darwin-arm64`);
- Node.js 22 or newer;
- DeepSeek Harness `0.1.0-rc.8` or newer;
- the DSH Web profile;
- a compatible phone companion and a network path to the selected service.

Windows and Linux hosts are not supported by this package.

## Planned npm installation

After the beta is published:

```bash
dsh plugin --profile web add @musitoolbox/dsh-remote@beta
dsh --profile web --dump-config
dsh web
```

Confirm that the dump contains the `dsh-remote` row with:

```yaml
serviceUrl: https://remote.musitoolbox.com
enabled: false
autoStart: false
```

Restart a running `dsh web` process after adding or updating the plugin.

### Test from this source tree

Before npm publication, a developer can build the verified binaries and install the local directory:

```bash
npm run fetch-frpc
npm test
dsh plugin --profile web add /absolute/path/to/dsh-remote-plugin
dsh --profile web --dump-config
dsh web
```

Use a disposable DSH profile for release checks. Do not replace an existing user profile during packaging tests.

## First connection

1. Open DSH Web through its local loopback address on the Mac.
2. Open **Settings → Phone access**.
3. Review the hosted operator shown in the configuration.
4. Click **Enable phone access**. This is the first action that registers the Mac, writes local credentials, and starts FRPC.
5. Scan the displayed QR code with a compatible phone companion.
6. Confirm the phone appears under **Authorized phones**.

Treat a QR URL as a credential. Do not paste it into chat, issues, screenshots, analytics, or logs.

## Update and removal

Planned update command:

```bash
dsh plugin --profile web update @musitoolbox/dsh-remote@beta
```

Before removal, revoke phones or rotate the QR from the local settings page, then pause access. Removing a local package does not itself delete hosted anonymous records.

```bash
dsh plugin --profile web remove @musitoolbox/dsh-remote
```

Local state is stored under `~/.dsh/dsh-remote/` by default. It contains active credentials with mode `0600`; inspect and remove it only after access has been revoked and DSH is stopped.

## Data path and trust

```text
Phone HTTPS/WSS
  → selected DSH Remote Gateway
  → authenticated FRP virtual host
  → FRPC on the Mac
  → local DSH Web HTTP/WebSocket
```

The hosted gateway transports DSH page and conversation traffic. Public network hops use TLS, but the beta does not add application-level end-to-end encryption that hides proxied DSH content from the gateway operator. Use [a compatible self-hosted service](docs/SELF_HOSTING.md) when that trust model is not acceptable.

Management RPC is loopback-only, and the settings client does not inject on the remote page. The proxy targets only `127.0.0.1:<DSH Web port>` and FRPC is started directly without a shell.

## Agent discovery

Once installed, the plugin registers the `remote-access` Skill. Its routing text covers phone, mobile, Android, iPhone, iOS, QR pairing, remote DSH Web, and connection troubleshooting. It tells the Agent to explain local UI steps without silently starting a process or asking for credentials.

The Skill helps only after installation. Before installation, discovery still depends on a public repository, npm metadata, web search, and community catalog listings. This project does not claim official DSH endorsement or a guaranteed search position.

## Self-hosting

Override `serviceUrl` in the Web profile's user patch while keeping the first-use opt-in boundary. See [Self-hosting](docs/SELF_HOSTING.md). This repository contains only the plugin; it does not contain the compatible Server.

## Development and package verification

```bash
node --version
npm test
npm run check:docs
npm run check:secrets
npm run fetch-frpc
npm pack --dry-run --ignore-scripts
npm run pack:verify
```

`bin/` is generated and ignored by Git. The pack script downloads official FRP archives, verifies pinned SHA-256 hashes, and includes the upstream Apache-2.0 license. See [Third-Party Notices](THIRD_PARTY_NOTICES.md) and [Contributing](CONTRIBUTING.md).

## Beta limitations

- The package and GitHub repository are not published yet.
- The hosted service has no general-availability SLA, formal retention schedule, account recovery, or full self-service identity deletion.
- The Android companion still requires production release signing before a stable public launch.
- Public iOS distribution and physical-device completion remain pending.
- The settings card is currently Chinese; English UI localization remains pending.
- A trusted gateway operator can process proxied DSH Web traffic.
- Only macOS and DSH `0.1.0-rc.8` or newer are tested.

See [Changelog](CHANGELOG.md), [Publishing Checklist](docs/PUBLISHING.md), and [Security Policy](SECURITY.md).

## License

The plugin source is available under the [MIT License](LICENSE), Copyright © 2026 MusiToolbox. Packaged FRPC binaries remain under Apache-2.0.
