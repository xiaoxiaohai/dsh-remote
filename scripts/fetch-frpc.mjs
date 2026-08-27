import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const FRPC_VERSION = '0.70.1';
export const TARGETS = Object.freeze({
  'darwin-x64': Object.freeze({
    asset: `frp_${FRPC_VERSION}_darwin_amd64.tar.gz`,
    sha256: 'cbf69cf26e5553e914e97d37f5d4367fa30f5f531d073a889465af4719281e25',
  }),
  'darwin-arm64': Object.freeze({
    asset: `frp_${FRPC_VERSION}_darwin_arm64.tar.gz`,
    sha256: 'cfa733b5a261c1647edee3c1fc4133d2542989b28f5602e81d47fc821d25c55f',
  }),
});

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with code ${code ?? 'none'} and signal ${signal ?? 'none'}`));
    });
  });
}

function requestedTargets(argument = 'all') {
  if (argument === 'all') return Object.keys(TARGETS);
  if (!Object.hasOwn(TARGETS, argument)) {
    throw new Error(`Unsupported FRP target: ${argument}. Supported targets: all, ${Object.keys(TARGETS).join(', ')}`);
  }
  return [argument];
}

async function download(targetName, target, workDir) {
  const response = await fetch(`https://github.com/fatedier/frp/releases/download/v${FRPC_VERSION}/${target.asset}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`FRP download for ${targetName} failed with HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_ARCHIVE_BYTES) throw new Error(`FRP archive for ${targetName} exceeds the size limit`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error(`FRP archive for ${targetName} exceeds the size limit`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== target.sha256) throw new Error(`FRP SHA-256 mismatch for ${targetName}`);

  const archive = join(workDir, target.asset);
  await writeFile(archive, bytes, { mode: 0o600 });
  const extracted = join(workDir, `extracted-${targetName}`);
  await mkdir(extracted, { recursive: true });
  const root = target.asset.slice(0, -'.tar.gz'.length);
  await run('tar', [
    '-xzf', archive,
    '-C', extracted,
    '--strip-components=1',
    `${root}/frpc`,
    `${root}/LICENSE`,
  ]);
  const binary = join(extracted, 'frpc');
  const binaryStat = await stat(binary);
  if (!binaryStat.isFile() || binaryStat.size < 1_000_000) throw new Error(`Extracted FRPC for ${targetName} is invalid`);
  const magic = (await readFile(binary)).subarray(0, 4).toString('hex');
  if (magic !== 'cffaedfe') throw new Error(`Extracted FRPC for ${targetName} is not a supported Mach-O executable`);
  return { targetName, binary, license: join(extracted, 'LICENSE'), sha256: actual };
}

export async function fetchFrpc(argument = 'all', packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const targetNames = requestedTargets(argument);
  const workDir = await mkdtemp(join(tmpdir(), 'dsh-remote-frpc-'));
  try {
    const artifacts = [];
    for (const targetName of targetNames) artifacts.push(await download(targetName, TARGETS[targetName], workDir));

    const licenseBodies = await Promise.all(artifacts.map((item) => readFile(item.license, 'utf8')));
    if (licenseBodies.some((body) => body !== licenseBodies[0])) throw new Error('FRP release targets carry different license texts');

    for (const artifact of artifacts) {
      const destination = join(packageDir, 'bin', artifact.targetName, 'frpc');
      await mkdir(dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.tmp`;
      await copyFile(artifact.binary, temporary);
      await chmod(temporary, 0o755);
      await rename(temporary, destination);
      console.log(`Installed verified frpc ${FRPC_VERSION} for ${artifact.targetName} (${artifact.sha256})`);
    }
    const licenseDestination = join(packageDir, 'bin', 'frp-LICENSE');
    await mkdir(dirname(licenseDestination), { recursive: true });
    await writeFile(licenseDestination, licenseBodies[0], { mode: 0o644 });
    await chmod(licenseDestination, 0o644);
    return artifacts.map(({ targetName, sha256 }) => ({ targetName, sha256 }));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await fetchFrpc(process.argv[2] ?? 'all');
}
