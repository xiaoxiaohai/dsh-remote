import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const expectedFiles = [
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'README.zh.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'bin/darwin-arm64/frpc',
  'bin/darwin-x64/frpc',
  'bin/frp-LICENSE',
  'client/client.js',
  'cordis.patch.yml',
  'docs/PUBLISHING.md',
  'docs/SELF_HOSTING.md',
  'lib/frpc.js',
  'lib/index.js',
  'lib/installation.js',
  'lib/manager.js',
  'lib/service-client.js',
  'package.json',
  'scripts/fetch-frpc.mjs',
].sort();

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { ...options, shell: false, windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
      else reject(new Error(`${command} exited with code ${code ?? 'none'}, signal ${signal ?? 'none'}\n${Buffer.concat(stderr).toString('utf8')}`));
    });
  });
}

const workDir = await mkdtemp(join(tmpdir(), 'dsh-remote-pack-'));
try {
  const pack = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', workDir], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const result = JSON.parse(pack.stdout)[0];
  const actualFiles = result.files.map((item) => item.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
    const extra = actualFiles.filter((file) => !expectedFiles.includes(file));
    throw new Error(`package whitelist mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }
  for (const item of result.files) {
    const mode = item.mode & 0o777;
    if ((mode & 0o022) !== 0) throw new Error(`${item.path} is group/world writable in the package`);
    if ((mode & 0o400) === 0) throw new Error(`${item.path} is not owner-readable in the package`);
    const executable = item.path === 'bin/darwin-x64/frpc' || item.path === 'bin/darwin-arm64/frpc';
    if (executable && (mode & 0o111) === 0) throw new Error(`${item.path} is not executable`);
    if (!executable && (mode & 0o111) !== 0) throw new Error(`${item.path} is unexpectedly executable`);
  }

  const archive = join(workDir, result.filename);
  const extractDir = join(workDir, 'extract');
  await mkdir(extractDir, { recursive: true });
  await run('tar', ['-xzf', archive, '-C', extractDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  const packageDir = join(extractDir, 'package');
  for (const file of actualFiles) {
    const metadata = await lstat(join(packageDir, file));
    if (!metadata.isFile()) throw new Error(`${file} is not a regular file`);
  }

  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  if (manifest.name !== '@musitoolbox/dsh-remote' || manifest.version !== '0.4.0-beta.2') throw new Error('packed identity mismatch');
  if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/' || manifest.publishConfig?.tag !== 'beta') throw new Error('packed publish target mismatch');
  if (manifest.repository?.url !== 'git+https://github.com/xiaoxiaohai/dsh-remote.git') throw new Error('packed repository metadata mismatch');
  if (manifest.homepage !== 'https://github.com/xiaoxiaohai/dsh-remote#readme') throw new Error('packed homepage mismatch');
  if (manifest.bugs?.url !== 'https://github.com/xiaoxiaohai/dsh-remote/issues') throw new Error('packed issue tracker mismatch');
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('packed DSH bundle manifest is missing');

  const bundle = await readFile(join(packageDir, 'cordis.patch.yml'), 'utf8');
  for (const text of ['@musitoolbox/dsh-remote', 'enabled: false', 'autoStart: false']) {
    if (!bundle.includes(text)) throw new Error(`packed bundle is missing ${text}`);
  }
  const host = await readFile(join(packageDir, 'lib/index.js'), 'utf8');
  if (!host.includes("name: 'remote-access'") || !host.includes("ctx.skills.register(REMOTE_ACCESS_SKILL)")) {
    throw new Error('packed host is missing the remote-access skill');
  }
  for (const target of ['darwin-x64', 'darwin-arm64']) {
    const binary = await readFile(join(packageDir, 'bin', target, 'frpc'));
    if (binary.subarray(0, 4).toString('hex') !== 'cffaedfe') throw new Error(`${target} FRPC is not Mach-O`);
  }
  const thirdPartyLicense = await readFile(join(packageDir, 'bin', 'frp-LICENSE'), 'utf8');
  if (!thirdPartyLicense.includes('Apache License') || !thirdPartyLicense.includes('Version 2.0')) throw new Error('FRP Apache-2.0 license is missing');

  const archiveBytes = await readFile(archive);
  const sha256 = createHash('sha256').update(archiveBytes).digest('hex');
  console.log(JSON.stringify({
    name: result.name,
    version: result.version,
    filename: result.filename,
    size: result.size,
    unpackedSize: result.unpackedSize,
    entryCount: result.entryCount,
    sha256,
    files: actualFiles,
  }, null, 2));
} finally {
  await rm(workDir, { recursive: true, force: true });
}
