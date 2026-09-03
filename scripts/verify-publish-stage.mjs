import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { STAGE_FILES, STAGE_VERSION } from './build-publish-stage.mjs';

const executableFiles = new Set(['bin/darwin-arm64/frpc', 'bin/darwin-x64/frpc']);
const expectedManifestFiles = [
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'bin',
  'client',
  'cordis.patch.yml',
  'docs/PUBLISHING.md',
  'docs/README.zh.md',
  'docs/SELF_HOSTING.md',
  'lib',
  'scripts/fetch-frpc.mjs',
].sort();
const expectedManifestKeys = [
  'bugs',
  'description',
  'dsh',
  'engines',
  'exports',
  'files',
  'homepage',
  'keywords',
  'license',
  'main',
  'name',
  'os',
  'publishConfig',
  'repository',
  'scripts',
  'type',
  'version',
].sort();
const forbiddenExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.mobileprovision', '.sqlite']);
const forbiddenPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/u],
  ['npm token', /\bnpm_[A-Za-z0-9]{20,}\b|registry\.npmjs\.org\/:_authToken\s*=/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/u],
  ['credential URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/u],
  ['production IPv4 address', /\b(?!127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)(?:\d{1,3}\.){3}\d{1,3}\b/u],
  ['internal absolute path', /(?:\/Users\/[^/\s]+\/|\/home\/ubuntu\/|\/var\/backups\/dsh-remote)/u],
  ['local file package spec', /\bfile:(?:\/|\.\.?\/)/u],
];

function runCapture(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      const output = Buffer.concat(stdout).toString('utf8');
      const errors = Buffer.concat(stderr).toString('utf8');
      if (code === 0) resolveRun({ stdout: output, stderr: errors });
      else reject(new Error(`${command} exited with code ${code ?? 'none'}, signal ${signal ?? 'none'}\n${errors}`));
    });
  });
}

function publicPath(root, file) {
  return relative(root, file).split(sep).join('/');
}

async function walk(root, directory = root, files = [], directories = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Publish stage contains a symbolic link: ${publicPath(root, path)}`);
    if (entry.isDirectory()) {
      directories.push(path);
      await walk(root, path, files, directories);
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Publish stage contains a non-regular entry: ${publicPath(root, path)}`);
    }
  }
  return { files, directories };
}

function assertManifestValueIsPublic(value, path = 'package.json') {
  if (typeof value === 'string') {
    for (const [kind, pattern] of forbiddenPatterns) {
      if (pattern.test(value)) throw new Error(`${path} contains ${kind}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertManifestValueIsPublic(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '_resolved' || key === '_from' || key === 'readme') throw new Error(`package.json contains forbidden metadata key ${key}`);
      assertManifestValueIsPublic(child, `${path}.${key}`);
    }
  }
}

async function assertMarkdownLinks(root, files) {
  const available = new Set(files.map((file) => publicPath(root, file)));
  for (const file of files.filter((item) => extname(item).toLowerCase() === '.md')) {
    const body = await readFile(file, 'utf8');
    for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1].trim();
      if (!target || target.startsWith('#') || /^[a-z]+:/iu.test(target)) continue;
      const local = resolve(dirname(file), decodeURIComponent(target.split('#', 1)[0]));
      const rel = publicPath(root, local);
      if (!available.has(rel)) throw new Error(`${publicPath(root, file)} has a missing local link: ${target}`);
    }
  }
}

async function assertPreparedManifest(root) {
  const globalRoot = (await runCapture('npm', ['root', '--global'], root)).stdout.trim();
  const modulePath = join(globalRoot, 'npm', 'node_modules', '@npmcli', 'package-json');
  const require = createRequire(import.meta.url);
  const packageJson = require(modulePath);
  const pkg = await packageJson.fix(root, { changes: [] });
  const { content } = await pkg.prepare();
  if (content.readmeFilename !== 'README.md') throw new Error(`Directory publish selected ${content.readmeFilename ?? 'no README'} instead of README.md`);
  if (!String(content.readme).startsWith('# DSH Remote\n\nEnglish |')) throw new Error('Directory publish did not select the English README content');
  if (content._resolved !== undefined || content._from !== undefined) throw new Error('Directory publish manifest contains local resolution metadata');
  return { readmeFilename: content.readmeFilename, localResolutionMetadata: false };
}

async function verifyDirectory(stageDir, { requireSecureRoot = true } = {}) {
  const supplied = resolve(stageDir);
  const rootMetadata = await lstat(supplied);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) throw new Error('Publish stage must be a real directory');
  if (requireSecureRoot && (rootMetadata.mode & 0o777) !== 0o700) throw new Error('Publish stage root must have mode 0700');
  const root = await realpath(supplied);
  const { files, directories } = await walk(root);
  const relativeFiles = files.map((file) => publicPath(root, file)).sort();
  if (JSON.stringify(relativeFiles) !== JSON.stringify(STAGE_FILES)) {
    const missing = STAGE_FILES.filter((file) => !relativeFiles.includes(file));
    const extra = relativeFiles.filter((file) => !STAGE_FILES.includes(file));
    throw new Error(`Publish stage whitelist mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  }

  for (const directory of directories) {
    const mode = (await lstat(directory)).mode & 0o777;
    if (mode !== 0o755) throw new Error(`${publicPath(root, directory)} directory mode is ${mode.toString(8)}, expected 755`);
  }
  for (const file of files) {
    const rel = publicPath(root, file);
    const metadata = await lstat(file);
    const mode = metadata.mode & 0o777;
    const expectedMode = executableFiles.has(rel) ? 0o755 : 0o644;
    if (mode !== expectedMode) throw new Error(`${rel} mode is ${mode.toString(8)}, expected ${expectedMode.toString(8)}`);
    if (forbiddenExtensions.has(extname(rel).toLowerCase()) || /^\.env(?:\.|$)/u.test(rel.split('/').at(-1))) {
      throw new Error(`Publish stage contains a forbidden sensitive filename: ${rel}`);
    }
    const bytes = await readFile(file);
    if (bytes.includes(0)) continue;
    const body = bytes.toString('utf8');
    for (const [kind, pattern] of forbiddenPatterns) {
      if (pattern.test(body)) throw new Error(`${rel} contains ${kind}`);
    }
  }

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedManifestKeys)) throw new Error('Publish stage package.json contains missing or unapproved top-level fields');
  if (manifest.name !== '@musitoolbox/dsh-remote' || manifest.version !== STAGE_VERSION) throw new Error('Publish stage package identity mismatch');
  if (manifest.publishConfig?.access !== 'public' || manifest.publishConfig?.registry !== 'https://registry.npmjs.org/' || manifest.publishConfig?.tag !== 'beta') {
    throw new Error('Publish stage target is not official npm public beta');
  }
  if (JSON.stringify([...manifest.files].sort()) !== JSON.stringify(expectedManifestFiles)) throw new Error('Publish stage package.json files whitelist mismatch');
  if (JSON.stringify(manifest.scripts) !== JSON.stringify({ 'fetch-frpc': 'node scripts/fetch-frpc.mjs all' })) {
    throw new Error('Publish stage contains development or lifecycle scripts');
  }
  assertManifestValueIsPublic(manifest);

  const english = await readFile(join(root, 'README.md'), 'utf8');
  const chinese = await readFile(join(root, 'docs', 'README.zh.md'), 'utf8');
  if (!english.startsWith('# DSH Remote\n\nEnglish | [中文](docs/README.zh.md)')) throw new Error('Staged English README link is incorrect');
  if (!chinese.startsWith('# DSH Remote\n\n[English](../README.md) | 中文')) throw new Error('Staged Chinese README link is incorrect');
  await assertMarkdownLinks(root, files);

  const bundle = await readFile(join(root, 'cordis.patch.yml'), 'utf8');
  for (const expected of ['name: "@musitoolbox/dsh-remote"', 'serviceUrl: https://remote.musitoolbox.com', 'enabled: false', 'autoStart: false']) {
    if (!bundle.includes(expected)) throw new Error(`Staged bundle is missing ${expected}`);
  }
  const host = await readFile(join(root, 'lib', 'index.js'), 'utf8');
  if (!host.includes("name: 'remote-access'") || !host.includes('ctx.skills.register(REMOTE_ACCESS_SKILL)')) throw new Error('Staged host is missing the read-only discovery skill');
  for (const target of ['darwin-x64', 'darwin-arm64']) {
    const binary = await readFile(join(root, 'bin', target, 'frpc'));
    if (binary.length < 1_000_000 || binary.subarray(0, 4).toString('hex') !== 'cffaedfe') throw new Error(`${target} FRPC is not a valid Mach-O executable`);
  }
  const license = await readFile(join(root, 'bin', 'frp-LICENSE'), 'utf8');
  if (!license.includes('Apache License') || !license.includes('Version 2.0')) throw new Error('FRP Apache-2.0 license is missing');

  return { root, files, relativeFiles, manifest };
}

export async function verifyPublishStage(stageDir) {
  const verified = await verifyDirectory(stageDir);
  const prepared = await assertPreparedManifest(verified.root);
  const workDir = await mkdtemp(join(tmpdir(), 'dsh-remote-stage-pack-'));
  try {
    const packed = await runCapture('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', workDir, verified.root], verified.root);
    const result = JSON.parse(packed.stdout)[0];
    const archive = join(workDir, result.filename);
    const resultFiles = result.files.map((file) => file.path).sort();
    if (JSON.stringify(resultFiles) !== JSON.stringify(STAGE_FILES)) throw new Error('Staged npm tarball whitelist differs from the verified directory');
    for (const item of result.files) {
      const expectedMode = executableFiles.has(item.path) ? 0o755 : 0o644;
      if ((item.mode & 0o777) !== expectedMode) throw new Error(`${item.path} tar mode is ${(item.mode & 0o777).toString(8)}, expected ${expectedMode.toString(8)}`);
    }

    const extractDir = join(workDir, 'extract');
    await mkdir(extractDir, { recursive: true });
    await runCapture('tar', ['-xzf', archive, '-C', extractDir], workDir);
    await verifyDirectory(join(extractDir, 'package'), { requireSecureRoot: false });

    const bytes = await readFile(archive);
    return {
      name: result.name,
      version: result.version,
      filename: result.filename,
      size: result.size,
      unpackedSize: result.unpackedSize,
      entryCount: result.entryCount,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sha1: createHash('sha1').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      files: resultFiles,
      prepared,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const stageDir = process.argv[2];
  if (!stageDir) throw new Error('Usage: node scripts/verify-publish-stage.mjs <publish-stage-directory>');
  console.log(JSON.stringify(await verifyPublishStage(stageDir), null, 2));
}
