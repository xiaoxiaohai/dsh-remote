# Privacy Notice

## Scope

This notice describes the `@musitoolbox/dsh-remote` plugin and its optional hosted beta at `https://remote.musitoolbox.com`. It is a technical beta notice, not a promise of a general-availability service. No npm version has been published yet.

## Consent and activation

Installing the plugin does not contact the DSH Remote service, register the Mac, create remote credentials, or start FRPC. The default bundle sets `enabled: false` and `autoStart: false`.

The first network registration happens only after the user opens DSH on the local loopback page and clicks **Enable phone access** in Settings.

## Data handled by the hosted beta

After activation, the hosted service may process:

- an anonymous identity identifier and a random Mac routing identifier;
- an optional Mac display name;
- phone public-key material and its fingerprint, platform, user-chosen display name, authorization time, and recent-use time;
- hashed control, tunnel, pairing, and session credentials, plus expiry and revocation state;
- network metadata normally visible to an HTTPS service, such as source IP, user agent, request path, timestamp, response status, and byte count;
- DSH Web HTTP and WebSocket traffic while proxying it between the phone and Mac.

The gateway necessarily handles proxied DSH Web content in memory. TLS protects the public network hops, but this beta does not add application-level end-to-end encryption that hides DSH page or conversation traffic from the hosted gateway operator.

## Data not intentionally collected by the plugin

The plugin does not add analytics, advertising identifiers, contact-list access, location collection, or model-training telemetry. It does not intentionally write proxied DSH response bodies to its own application logs. The QR pairing fragment is not sent in the initial landing-page HTTP request, but it is later submitted to the pairing API as part of authorization.

DeepSeek Harness, the selected model provider, the phone operating system, and a self-hosted gateway may have their own data behavior outside this plugin.

## Local data

The Mac stores `installation.json` and `frpc.toml` under `~/.dsh/dsh-remote/` by default. They contain active credentials and are written with mode `0600`. Do not sync, publish, attach, or paste these files.

## Retention and deletion

Phone sessions expire or can be revoked. QR rotation revokes existing phone access. The current beta does not provide account recovery or a complete self-service deletion flow for the anonymous identity and historical revoked records. Hosted operational-log retention is not yet governed by a published retention schedule.

Do not use the hosted beta if these limitations are unacceptable. A compatible self-hosted service gives its operator control over storage and retention; see [Self-hosting](docs/SELF_HOSTING.md).

## Security incidents and questions

Use the private process in [SECURITY.md](SECURITY.md) for sensitive reports. Never publish credentials, QR links, session cookies, production logs, or personal data in a public issue.
