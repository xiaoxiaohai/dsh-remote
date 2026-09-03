import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { createFrpcConfig } from '../lib/frpc.js';
import { apply, inject, REMOTE_ACCESS_SKILL } from '../lib/index.js';
import { RemoteAccessManager } from '../lib/manager.js';
import { createServiceClient } from '../lib/service-client.js';
import { FRPC_VERSION, TARGETS } from '../scripts/fetch-frpc.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function missing(path) {
  try {
    await access(path, constants.F_OK);
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

test('public package identity and bundle default to explicit opt-in', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '@musitoolbox/dsh-remote');
  assert.equal(manifest.version, '0.4.0-beta.2');
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.os, ['darwin']);
  assert.equal(manifest.engines.node, '>=22');
  assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.equal(manifest.publishConfig.tag, 'beta');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.deepEqual(manifest.repository, {
    type: 'git',
    url: 'git+https://github.com/xiaoxiaohai/dsh-remote.git',
  });
  assert.equal(manifest.homepage, 'https://github.com/xiaoxiaohai/dsh-remote#readme');
  assert.deepEqual(manifest.bugs, { url: 'https://github.com/xiaoxiaohai/dsh-remote/issues' });

  const bundle = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(bundle, /name: "@musitoolbox\/dsh-remote"/u);
  assert.match(bundle, /serviceUrl: https:\/\/remote\.musitoolbox\.com/u);
  assert.match(bundle, /enabled: false/u);
  assert.match(bundle, /autoStart: false/u);
});

test('only the current remote-access runtime modules are present', async () => {
  const files = (await readdir(new URL('../lib/', import.meta.url))).sort();
  assert.deepEqual(files, ['frpc.js', 'index.js', 'installation.js', 'manager.js', 'service-client.js']);
  for (const old of ['approval.js', 'audit.js', 'danger.js', 'gateway.js', 'legacy-native-api.js', 'tasks.js', 'token.js']) {
    assert.equal(await missing(new URL(`../lib/${old}`, import.meta.url)), true, old);
  }
});

test('service URL requires an HTTPS origin except explicit loopback development', () => {
  assert.throws(() => createServiceClient({ serviceUrl: 'http://remote.example.com' }), /must use HTTPS/u);
  assert.throws(() => createServiceClient({ serviceUrl: 'https://remote.example.com/base' }), /must be an origin/u);
  const credentialUrl = ['https://user', 'password@remote.example.com'].join(':');
  assert.throws(() => createServiceClient({ serviceUrl: credentialUrl }), /must be an origin/u);
  assert.doesNotThrow(() => createServiceClient({ serviceUrl: 'http://127.0.0.1:8080', allowInsecureHTTP: true }));
});

test('frpc config uses scoped credentials and forwards only local DSH Web', () => {
  const config = createFrpcConfig({
    macId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    tunnelToken: 'fixture-tunnel-token',
    frpServerHost: 'frp.example.com',
    frpServerPort: 7000,
    internalDomain: 'dsh.internal',
  }, 3080);
  assert.match(config, /transport\.protocol = "wss"/u);
  assert.match(config, /metadatas\.mac_id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"/u);
  assert.match(config, /localIP = "127\.0\.0\.1"/u);
  assert.match(config, /localPort = 3080/u);
  assert.match(config, /customDomains = \["aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa\.dsh\.internal"\]/u);
  assert.match(config, /hostHeaderRewrite = "127\.0\.0\.1:3080"/u);
  assert.match(config, /requestHeaders\.set\.origin = "http:\/\/127\.0\.0\.1:3080"/u);
  assert.doesNotMatch(config, /remotePort|0\.0\.0\.0/u);
  assert.throws(() => createFrpcConfig({
    macId: '------------------------------------',
    tunnelToken: 'fixture',
    frpServerHost: 'frp.example.com',
    frpServerPort: 7000,
    internalDomain: 'dsh.internal',
  }, 3080), /invalid Mac id/u);
  assert.throws(() => createFrpcConfig({
    macId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    tunnelToken: 'fixture',
    frpServerHost: 'frp.example.com\nunsafe = true',
    frpServerPort: 7000,
    internalDomain: 'dsh.internal',
  }, 3080), /invalid FRP server host/u);
});

test('disabled manager performs no registration until explicit start', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-opt-in-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const frpcPath = join(dir, 'frpc');
  await writeFile(frpcPath, '#!/bin/sh\n', { mode: 0o700 });
  await chmod(frpcPath, 0o700);

  const identityId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const macId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const authorizationId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
  const controlSecret = 'c'.repeat(43);
  const tunnelSecret = 't'.repeat(43);
  let requests = 0;
  let authorizations = [{ authorizationId, name: 'Test phone', platform: 'android', authorizedAt: 1, lastSeenAt: null }];
  const server = createServer(async (req, res) => {
    requests += 1;
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/v2/macs') {
      return res.end(JSON.stringify({
        identityId,
        macId,
        controlSecret,
        tunnelToken: tunnelSecret,
        connectUrl: `https://remote.example.com/connect/${macId}#fixture`,
        qrCodeDataUrl: 'data:image/png;base64,fixture',
        frpServerHost: 'frp.example.com',
        frpServerPort: 7000,
        internalDomain: 'dsh.internal',
      }));
    }
    assert.equal(req.headers.authorization, `Bearer ${controlSecret}`);
    if (req.method === 'GET' && req.url === `/v2/macs/${macId}/authorizations`) {
      return res.end(JSON.stringify({ authorizations }));
    }
    if (req.method === 'DELETE' && req.url === `/v2/macs/${macId}/authorizations/${authorizationId}`) {
      authorizations = [];
      return res.end(JSON.stringify({
        connectUrl: `https://remote.example.com/connect/${macId}#rotated`,
        qrCodeDataUrl: 'data:image/png;base64,rotated',
      }));
    }
    if (req.method === 'POST' && req.url === `/v2/macs/${macId}/pairing-token/rotate`) {
      authorizations = [];
      return res.end(JSON.stringify({
        connectUrl: `https://remote.example.com/connect/${macId}#new`,
        qrCodeDataUrl: 'data:image/png;base64,new',
      }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not-found' }));
  });
  const port = await listen(server);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal) => {
    queueMicrotask(() => child.emit('exit', 0, signal));
    return true;
  };
  let spawnCalls = 0;
  const warnings = [];
  const manager = new RemoteAccessManager({
    config: {
      serviceUrl: `http://127.0.0.1:${port}`,
      allowInsecureHTTP: true,
      enabled: false,
      autoStart: false,
      stateDir: dir,
      frpcPath,
    },
    dshPort: 3080,
    log: { warn(message) { warnings.push(message); } },
    spawn: (command, args, options) => {
      spawnCalls += 1;
      assert.equal(command, frpcPath);
      assert.deepEqual(args, ['-c', join(dir, 'frpc.toml')]);
      assert.equal(options.shell, undefined);
      return child;
    },
  });

  assert.equal((await manager.initialize()).phase, 'disabled');
  assert.equal(requests, 0);
  assert.equal(spawnCalls, 0);
  assert.equal(await missing(join(dir, 'installation.json')), true);
  assert.equal(await missing(join(dir, 'frpc.toml')), true);

  await manager.start();
  assert.equal(spawnCalls, 1);
  assert.equal(requests, 2);
  child.stdout.write('start proxy success');
  child.stderr.write(`failed metadata ${tunnelSecret} ${controlSecret}`);
  assert.equal(manager.snapshot().phase, 'running');
  assert.equal(manager.snapshot().authorizations.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[redacted-tunnel-token\].*\[redacted-control-secret\]/u);
  assert.doesNotMatch(warnings[0], new RegExp(`${tunnelSecret}|${controlSecret}`, 'u'));

  const persisted = JSON.parse(await readFile(join(dir, 'installation.json'), 'utf8'));
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.macId, macId);
  assert.equal((await stat(join(dir, 'installation.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(dir, 'frpc.toml'))).mode & 0o777, 0o600);

  await manager.revokeAuthorization(authorizationId);
  assert.deepEqual(manager.snapshot().authorizations, []);
  await manager.rotatePairing();
  assert.match(manager.snapshot().connectUrl, /#new$/u);
  await manager.stop();
  assert.equal(manager.snapshot().phase, 'stopped');
});

test('default plugin state follows an isolated DSH_HOME', () => {
  const previous = process.env.DSH_HOME;
  const isolatedHome = join(tmpdir(), 'dsh-home-fixture');
  process.env.DSH_HOME = isolatedHome;
  try {
    const manager = new RemoteAccessManager({ config: { enabled: false }, dshPort: 3080 });
    assert.equal(manager.stateDir, join(isolatedHome, 'dsh-remote'));
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
  }
});

test('legacy installation state is ignored rather than reused', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-remote-legacy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'installation.json'), JSON.stringify({
    deviceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    controlSecret: 'old-fixture',
    tunnelToken: 'old-fixture',
    connectUrl: 'https://old.example/connect',
  }));
  const manager = new RemoteAccessManager({ config: { enabled: false, stateDir: dir }, dshPort: 3080 });
  const snapshot = await manager.initialize();
  assert.equal(snapshot.phase, 'disabled');
  assert.equal(snapshot.macId, null);
});

test('host plugin registers loopback RPC and a read-only discovery skill', async () => {
  let registeredRpc;
  let registeredSkill;
  let disposed = false;
  const authorizationId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const manager = {
    snapshot: () => ({ phase: 'disabled' }),
    initialize: async () => ({ phase: 'disabled' }),
    start: async () => ({ phase: 'running' }),
    stop: async () => ({ phase: 'stopped' }),
    refreshAuthorizations: async () => ({ authorizations: [] }),
    revokeAuthorization: async () => ({ authorizations: [] }),
    rotatePairing: async () => ({ phase: 'running' }),
    createJoinToken: async () => ({ joinToken: 'fixture', expiresAt: 1 }),
  };
  const ctx = {
    webServer: { port: 3080 },
    logger: () => ({ error() {}, warn() {} }),
    skills: { register(skill) { registeredSkill = skill; return () => {}; } },
    connection: {
      rpc: {
        handle(channel, handler, options) {
          registeredRpc = { channel, handler, options };
          return () => { disposed = true; };
        },
      },
    },
    effect(factory) { this.dispose = factory(); },
  };

  apply(ctx, {}, { manager });
  await Promise.resolve();
  assert.deepEqual(inject, ['connection', 'webServer', 'skills']);
  assert.equal(registeredRpc.channel, '/dsh-remote');
  assert.deepEqual(registeredRpc.options, { authority: 'loopback' });
  assert.deepEqual(await registeredRpc.handler('remote.status', {}), { ok: true, value: { phase: 'disabled' } });
  assert.equal((await registeredRpc.handler('remote.revoke-authorization', {})).ok, false);
  assert.equal((await registeredRpc.handler('remote.revoke-authorization', { authorizationId })).ok, true);

  assert.equal(registeredSkill, REMOTE_ACCESS_SKILL);
  assert.equal(registeredSkill.name, 'remote-access');
  for (const term of ['phone', 'mobile', 'Android', 'iPhone', 'QR pairing', 'remote DSH']) {
    assert.match(registeredSkill.description, new RegExp(term, 'u'));
  }
  assert.match(registeredSkill.content, /must open DSH on its local loopback page/u);
  assert.match(registeredSkill.content, /Never ask the user to paste a QR URL/u);
  assert.match(registeredSkill.content, /Do not run shell commands/u);
  assert.doesNotMatch(registeredSkill.content, /remote\.start|child_process|spawn\(/u);

  await ctx.dispose();
  assert.equal(disposed, true);
});

test('settings client stays loopback-only and asks before first registration', async () => {
  const source = await readFile(new URL('../client/client.js', import.meta.url), 'utf8');
  assert.match(source, /手机访问尚未开启/u);
  assert.match(source, /只有点击开启后/u);
  assert.match(source, /if \(status\?\.phase !== "running"\) return undefined/u);
  assert.match(source, /disabled \? "开启手机访问" : "重试"/u);

  function injectedFor(hostname) {
    let plugin;
    let injected = 0;
    const window = {
      location: { hostname },
      __ModuleLoader__: {
        load(definition) { plugin = definition.factory(() => ({})); },
      },
    };
    runInNewContext(source, { window, navigator: {}, console });
    plugin.apply({
      connection: { rpc: { call() {} } },
      slots: { inject() { injected += 1; } },
    });
    return injected;
  }

  assert.equal(injectedFor('127.0.0.1'), 1);
  assert.equal(injectedFor('localhost'), 1);
  assert.equal(injectedFor('remote.example.com'), 0);
});

test('FRPC artifact metadata pins both supported Mac architectures', () => {
  assert.equal(FRPC_VERSION, '0.70.1');
  assert.deepEqual(Object.keys(TARGETS).sort(), ['darwin-arm64', 'darwin-x64']);
  for (const target of Object.values(TARGETS)) {
    assert.match(target.asset, /^frp_0\.70\.1_darwin_(?:amd64|arm64)\.tar\.gz$/u);
    assert.match(target.sha256, /^[0-9a-f]{64}$/u);
  }
});
