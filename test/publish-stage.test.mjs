import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_FILES, STAGE_FILES, buildPublishStage } from '../scripts/build-publish-stage.mjs';
import { verifyPublishStage } from '../scripts/verify-publish-stage.mjs';

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function missing(path) {
  try {
    await access(path, constants.F_OK);
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-remote-stage-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  await mkdir(source, { recursive: true });

  for (const file of SOURCE_FILES) {
    const target = join(source, file);
    await mkdir(dirname(target), { recursive: true });
    if (file === 'bin/frp-LICENSE') {
      await writeFile(target, 'Apache License\nVersion 2.0\n', { mode: 0o644 });
    } else if (file === 'bin/darwin-arm64/frpc' || file === 'bin/darwin-x64/frpc') {
      const binary = Buffer.alloc(1_000_004);
      Buffer.from('cffaedfe', 'hex').copy(binary);
      await writeFile(target, binary, { mode: 0o755 });
      await chmod(target, 0o755);
    } else {
      await copyFile(join(repository, file), target);
    }
  }

  const manifestPath = join(source, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = '0.4.0-beta.2';
  for (const file of ['CHANGELOG.md', 'CONTRIBUTING.md', 'docs/PUBLISHING.md']) {
    if (!manifest.files.includes(file)) manifest.files.push(file);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await run('git', ['init', '-q', '-b', 'fixture'], { cwd: source });
  await run('git', ['-c', 'user.name=Stage Test', '-c', 'user.email=stage-test@example.invalid', 'add', '--all'], { cwd: source });
  await run('git', ['-c', 'user.name=Stage Test', '-c', 'user.email=stage-test@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: source });
  return { root, source, output: join(root, 'publish-stage') };
}

test('sanitized staging selects English npm README and removes local metadata', async (t) => {
  const fixture = await createFixture(t);
  const built = await buildPublishStage({ sourceDir: fixture.source, outputDir: fixture.output });
  assert.match(built.sourceCommit, /^[a-f0-9]{40}$/u);
  assert.equal(built.version, '0.4.0-beta.2');
  assert.equal(built.fileCount, STAGE_FILES.length);
  assert.equal((await lstat(fixture.output)).mode & 0o777, 0o700);
  assert.equal(await missing(join(fixture.output, 'README.zh.md')), true);
  assert.equal(await missing(join(fixture.output, 'docs', 'README.zh.md')), false);

  const manifest = JSON.parse(await readFile(join(fixture.output, 'package.json'), 'utf8'));
  assert.equal(manifest.version, '0.4.0-beta.2');
  assert.equal(Object.hasOwn(manifest, '_resolved'), false);
  assert.equal(Object.hasOwn(manifest, '_from'), false);
  assert.equal(Object.hasOwn(manifest, 'readme'), false);
  assert.deepEqual(manifest.scripts, { 'fetch-frpc': 'node scripts/fetch-frpc.mjs all' });

  const verified = await verifyPublishStage(fixture.output);
  assert.equal(verified.name, '@musitoolbox/dsh-remote');
  assert.equal(verified.version, '0.4.0-beta.2');
  assert.equal(verified.entryCount, STAGE_FILES.length);
  assert.equal(verified.prepared.readmeFilename, 'README.md');
  assert.equal(verified.prepared.localResolutionMetadata, false);
  assert.match(verified.sha256, /^[a-f0-9]{64}$/u);
  assert.match(verified.sha1, /^[a-f0-9]{40}$/u);
  assert.match(verified.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/u);
  await assert.rejects(buildPublishStage({ sourceDir: fixture.source, outputDir: fixture.output }), /already exists/u);
});

test('production staging rejects a dirty Git worktree without creating output', async (t) => {
  const fixture = await createFixture(t);
  await writeFile(join(fixture.source, 'README.md'), '\nDirty fixture\n', { flag: 'a' });
  await assert.rejects(buildPublishStage({ sourceDir: fixture.source, outputDir: fixture.output }), /dirty Git worktree/u);
  assert.equal(await missing(fixture.output), true);
});

test('staging rejects symlinked source paths and removes partial output', async (t) => {
  const fixture = await createFixture(t);
  await rm(join(fixture.source, 'lib'), { recursive: true });
  await symlink(join(repository, 'lib'), join(fixture.source, 'lib'));
  await assert.rejects(buildPublishStage({ sourceDir: fixture.source, outputDir: fixture.output, requireClean: false }), /symbolic link/u);
  assert.equal(await missing(fixture.output), true);
});

test('stage verification rejects local resolution metadata', async (t) => {
  const fixture = await createFixture(t);
  await buildPublishStage({ sourceDir: fixture.source, outputDir: fixture.output });
  const manifestPath = join(fixture.output, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest._resolved = ['/', 'Users', 'example', 'private', 'publish-stage'].join('/');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await assert.rejects(verifyPublishStage(fixture.output), /internal absolute path|unapproved top-level fields|forbidden metadata/u);
});
