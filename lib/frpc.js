import { access, chmod, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, platform, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function quote(value) {
  return JSON.stringify(String(value));
}

function validHost(value) {
  const host = String(value ?? '');
  if (!host || /[\s\r\n"']/u.test(host)) throw new Error('invalid FRP server host');
  return host;
}

function validPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid port');
  return port;
}

export function createFrpcConfig(installation, localPort) {
  const macId = String(installation.macId);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(macId)) throw new Error('invalid Mac id');
  const serverHost = validHost(installation.frpServerHost);
  const serverPort = validPort(installation.frpServerPort);
  const dshPort = validPort(localPort);
  const internalDomain = validHost(installation.internalDomain);
  return [
    `serverAddr = ${quote(serverHost)}`,
    `serverPort = ${serverPort}`,
    `user = ${quote(macId)}`,
    'loginFailExit = false',
    'transport.protocol = "wss"',
    `metadatas.mac_id = ${quote(macId)}`,
    `metadatas.tunnel_token = ${quote(installation.tunnelToken)}`,
    '',
    '[transport.tls]',
    'enable = true',
    '',
    '[[proxies]]',
    `name = ${quote(`dsh-${macId}`)}`,
    'type = "http"',
    'localIP = "127.0.0.1"',
    `localPort = ${dshPort}`,
    `customDomains = [${quote(`${macId}.${internalDomain}`)}]`,
    `hostHeaderRewrite = ${quote(`127.0.0.1:${dshPort}`)}`,
    `requestHeaders.set.origin = ${quote(`http://127.0.0.1:${dshPort}`)}`,
    '',
  ].join('\n');
}

export async function writeFrpcConfig(filePath, installation, localPort) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, createFrpcConfig(installation, localPort), { mode: 0o600 });
  await chmod(filePath, 0o600);
}

export async function resolveFrpcPath(configuredPath) {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    configuredPath,
    process.env.DSH_REMOTE_FRPC,
    join(moduleDir, '..', 'bin', `${platform()}-${arch()}`, platform() === 'win32' ? 'frpc.exe' : 'frpc'),
    join(homedir(), '.dsh', 'dsh-remote', 'bin', platform() === 'win32' ? 'frpc.exe' : 'frpc'),
  ].filter(Boolean).map((candidate) => resolve(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next managed binary location.
    }
  }
  throw new Error('Managed frpc binary is unavailable. Install the platform bundle or configure frpcPath.');
}
