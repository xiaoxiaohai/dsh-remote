import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, rm, writeFile, chmod } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export const STAGE_VERSION = '0.4.0-beta.2';

export const SOURCE_FILES = Object.freeze([
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
]);

export const STAGE_FILES = Object.freeze(SOURCE_FILES
  .map((file) => file === 'README.zh.md' ? 'docs/README.zh.md' : file)
  .sort());

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executableFiles = new Set(['bin/darwin-arm64/frpc', 'bin/darwin-x64/frpc']);
const allowedManifestKeys = Object.freeze([
  'name',
  'version',
  'description',
  'license',
  'repository',
  'homepage',
  'bugs',
  'type',
  'main',
  'exports',
  'keywords',
  'engines',
  'os',
  'files',
  'scripts',
  'publishConfig',
  'dsh',
]);

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

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function replaceOnce(body, before, after, label) {
  const first = body.indexOf(before);
  if (first < 0 || body.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label} must contain exactly one ${JSON.stringify(before)}`);
  }
  return body.slice(0, first) + after + body.slice(first + before.length);
}

function rewriteMovedMarkdownLinks(body) {
  let rewritten = 0;
  const output = body.replace(/\]\(([^)]+)\)/gu, (match, target) => {
    if (!target || target.startsWith('#') || /^[a-z]+:/iu.test(target)) return match;
    rewritten += 1;
    const movedTarget = target.startsWith('docs/') ? target.slice('docs/'.length) : `../${target}`;
    return `](${movedTarget})`;
  });
  if (rewritten === 0) throw new Error('README.zh.md has no relative links to rewrite');
  return output;
}

async function assertMissing(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Publish staging output already exists: ${path}`);
}

async function assertNoSymlinkComponents(sourceDir, sourceFile) {
  let current = sourceDir;
  for (const component of sourceFile.split('/')) {
    current = join(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error(`Source path contains a symbolic link: ${sourceFile}`);
  }
}

async function assertCleanRepository(sourceDir) {
  const root = (await runCapture('git', ['rev-parse', '--show-toplevel'], sourceDir)).stdout.trim();
  if (resolve(root) !== sourceDir) throw new Error(`Source is not the Git repository root: ${sourceDir}`);
  const status = (await runCapture('git', ['status', '--porcelain=v1', '--untracked-files=all'], sourceDir)).stdout;
  if (status.trim()) throw new Error(`Refusing to stage a dirty Git worktree:\n${status}`);
  return (await runCapture('git', ['rev-parse', 'HEAD'], sourceDir)).stdout.trim();
}

function createStageManifest(sourceManifest) {
  if (sourceManifest.name !== '@musitoolbox/dsh-remote' || sourceManifest.version !== STAGE_VERSION) {
    throw new Error(`Source package must be @musitoolbox/dsh-remote@${STAGE_VERSION}`);
  }
  const unexpectedKeys = Object.keys(sourceManifest).filter((key) => !allowedManifestKeys.includes(key));
  if (unexpectedKeys.length > 0) throw new Error(`Source package contains unapproved manifest keys: ${unexpectedKeys.join(', ')}`);
  if (!Array.isArray(sourceManifest.files)) throw new Error('Source package files whitelist is missing');
  const manifest = Object.fromEntries(allowedManifestKeys
    .filter((key) => Object.hasOwn(sourceManifest, key))
    .map((key) => [key, structuredClone(sourceManifest[key])]));
  manifest.files = sourceManifest.files
    .map((file) => file === 'README.zh.md' ? 'docs/README.zh.md' : file);
  manifest.scripts = { 'fetch-frpc': 'node scripts/fetch-frpc.mjs all' };
  return manifest;
}

async function transformedBytes(sourceDir, sourceFile) {
  if (sourceFile === 'package.json') {
    const sourceManifest = JSON.parse(await readFile(join(sourceDir, sourceFile), 'utf8'));
    return Buffer.from(`${JSON.stringify(createStageManifest(sourceManifest), null, 2)}\n`);
  }
  if (sourceFile === 'README.md') {
    const body = await readFile(join(sourceDir, sourceFile), 'utf8');
    return Buffer.from(replaceOnce(body, '[中文](README.zh.md)', '[中文](docs/README.zh.md)', 'README.md'));
  }
  if (sourceFile === 'README.zh.md') {
    const body = await readFile(join(sourceDir, sourceFile), 'utf8');
    return Buffer.from(rewriteMovedMarkdownLinks(body));
  }
  return readFile(join(sourceDir, sourceFile));
}

export async function buildPublishStage({
  sourceDir = packageRoot,
  outputDir,
  requireClean = true,
} = {}) {
  if (!outputDir) throw new Error('An output directory is required');
  const source = await realpath(resolve(sourceDir));
  const requestedOutput = resolve(outputDir);
  const parent = await realpath(dirname(requestedOutput));
  const output = join(parent, basename(requestedOutput));
  if (isInside(source, output)) throw new Error('Publish staging output must be outside the source repository');
  await assertMissing(output);

  const commit = requireClean ? await assertCleanRepository(source) : null;
  await mkdir(output, { mode: 0o700 });

  try {
    for (const sourceFile of SOURCE_FILES) {
      const sourcePath = join(source, sourceFile);
      await assertNoSymlinkComponents(source, sourceFile);
      const metadata = await lstat(sourcePath);
      if (!metadata.isFile()) throw new Error(`Source entry is not a regular file: ${sourceFile}`);
      const canonical = await realpath(sourcePath);
      if (!isInside(source, canonical)) throw new Error(`Source entry escapes the repository: ${sourceFile}`);

      const stageFile = sourceFile === 'README.zh.md' ? 'docs/README.zh.md' : sourceFile;
      const destination = join(output, stageFile);
      await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
      if (sourceFile === 'README.md' || sourceFile === 'README.zh.md' || sourceFile === 'package.json') {
        await writeFile(destination, await transformedBytes(source, sourceFile), { flag: 'wx', mode: 0o600 });
      } else {
        await copyFile(sourcePath, destination, constants.COPYFILE_EXCL);
      }
      await chmod(destination, executableFiles.has(stageFile) ? 0o755 : 0o644);
    }
    await chmod(output, 0o700);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }

  const result = {
    name: '@musitoolbox/dsh-remote',
    version: STAGE_VERSION,
    sourceCommit: commit,
    outputDir: output,
    fileCount: STAGE_FILES.length,
  };
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const outputDir = process.argv[2];
  if (!outputDir) throw new Error('Usage: node scripts/build-publish-stage.mjs <new-output-directory>');
  console.log(JSON.stringify(await buildPublishStage({ outputDir }), null, 2));
}
