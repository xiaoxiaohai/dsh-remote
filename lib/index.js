import { RemoteAccessManager } from './manager.js';

export const name = 'dsh-remote';
export const inject = ['connection', 'webServer', 'skills'];
const CHANNEL = '/dsh-remote';
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

export const REMOTE_ACCESS_SKILL = Object.freeze({
  name: 'remote-access',
  description: 'Use when the user wants phone or mobile access to DeepSeek Harness, including Android, iPhone, iOS, QR pairing, remote DSH Web, or DSH Remote connection troubleshooting.',
  whenToUse: 'Use for requests about opening, controlling, or troubleshooting DSH from a phone or another network.',
  source: 'bundled',
  content: `# DSH Remote access

DSH Remote is an opt-in plugin for opening the existing DSH Web interface from a phone.

- The hosted beta is configured for https://remote.musitoolbox.com.
- Installation alone does not register the Mac or start a tunnel.
- The user must open DSH on its local loopback page, go to Settings > Phone access, and click “Enable phone access”.
- Never claim remote access is running only because this skill is available. The local settings card is the source of truth.
- Never ask the user to paste a QR URL, pairing fragment, control secret, tunnel token, session cookie, or private key into chat.
- Do not run shell commands, start FRPC, or change configuration on behalf of this skill. Explain the UI steps and let the user perform the explicit local action.
- The plugin forwards only the local DSH Web HTTP and WebSocket service. Management RPC remains loopback-only.
- For a self-hosted deployment, direct the user to the package's SELF_HOSTING.md and require an HTTPS service origin.
`,
});

function ok(value) {
  return { ok: true, value };
}

function fail(message) {
  return {
    ok: false,
    error: {
      code: 'bad-request',
      message,
      details: { issues: [{ message }] },
    },
  };
}

function authorizationId(payload) {
  const value = payload?.authorizationId;
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error('A valid authorizationId is required.');
  return value.toLowerCase();
}

export function apply(ctx, config = {}, internals = {}) {
  ctx.skills.register(REMOTE_ACCESS_SKILL);

  const log = typeof ctx.logger === 'function' ? ctx.logger(name) : (ctx.logger ?? console);
  const dshPort = internals.dshPort ?? ctx.webServer?.port;
  if (!dshPort) throw new Error('dsh-remote cannot read the DSH Web port');
  const manager = internals.manager ?? new RemoteAccessManager({ config, dshPort, log, spawn: internals.spawn });

  const disposeRpc = ctx.connection.rpc.handle(CHANNEL, async (endpoint, payload) => {
    try {
      if (endpoint === 'remote.status') return ok(manager.snapshot());
      if (endpoint === 'remote.start') return ok(await manager.start());
      if (endpoint === 'remote.stop') return ok(await manager.stop());
      if (endpoint === 'remote.authorizations') return ok(await manager.refreshAuthorizations());
      if (endpoint === 'remote.revoke-authorization') return ok(await manager.revokeAuthorization(authorizationId(payload)));
      if (endpoint === 'remote.rotate-pairing') return ok(await manager.rotatePairing());
      if (endpoint === 'remote.create-join-token') return ok(await manager.createJoinToken());
      return fail('Unknown dsh-remote endpoint');
    } catch (error) {
      log.error?.(`dsh-remote: ${endpoint} failed: ${error.message}`);
      return fail(error.message);
    }
  }, { authority: 'loopback' });

  void manager.initialize().catch((error) => log.error?.(`dsh-remote initialization failed: ${error.message}`));
  ctx.effect(() => async () => {
    try { disposeRpc(); } catch { /* already disposed */ }
    await manager.stop();
  }, 'dsh-remote: stop managed FRP client');
}
