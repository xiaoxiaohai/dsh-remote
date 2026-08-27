# Use a Self-Hosted DSH Remote Service

> Beta limitation: this plugin repository does not include the Server implementation. Self-hosting requires a separately obtained compatible Server. Do not assume that an arbitrary FRP server implements the DSH Remote authorization protocol.

## Compatibility contract

A compatible service must provide:

- an HTTPS origin for the `/v2` Mac registration and management APIs;
- independent random Mac control and tunnel credentials;
- signed phone pairing and revocable database sessions;
- FRP Login/NewProxy/Ping/NewWorkConn authorization scoped to one Mac routing identifier;
- an HTTP virtual host that routes only the registered Mac host;
- a public TLS endpoint for the phone and the FRPC WSS transport;
- a gateway that preserves DSH Web HTTP/WebSocket behavior while blocking loopback management RPC remotely.

Do not expose raw FRP control, vhost, authorization-plugin, database, or DSH loopback ports to the public Internet.

## Override the hosted origin

After installing the plugin, edit the Web profile's user patch:

```text
~/.dsh/profiles/web/cordis.patch.yml
```

Add an ID-targeted override after the bundle layer:

```yaml
- id: dsh-remote
  config:
    serviceUrl: https://remote.example.com
    enabled: false
    autoStart: false
```

Requirements:

- `serviceUrl` must be an HTTPS origin without credentials, path, query, or fragment.
- Plain HTTP is accepted only for explicit loopback development with `allowInsecureHTTP: true`.
- Keep `enabled` and `autoStart` false so the user retains the first-connection consent boundary.

Inspect the composed profile, then restart DSH Web:

```bash
dsh --profile web --dump-config
dsh web
```

Open the local DSH page, go to **Settings → Phone access**, review the configured operator, and click **Enable phone access**.

## Changing service operators

The plugin ignores a local installation record whose saved service URL differs from the configured origin. Changing the origin creates a separate registration on first explicit start. The old service may still retain its anonymous and revoked records; changing the local URL is not a remote deletion request.

## Operator checklist

Before allowing users:

- publish a privacy notice and private vulnerability-reporting path;
- use release-signed companion apps;
- rotate deployment credentials that have entered logs or support transcripts;
- keep Server, FRP, Node.js, Nginx, and the operating system patched;
- restrict state files and databases to the service account;
- back up and test recovery without copying secrets into tickets;
- monitor registration abuse, bandwidth, latency, certificate expiry, and storage growth;
- define retention, deletion, incident-response, and service-availability policies.
