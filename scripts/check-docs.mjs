import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const requiredFiles = [
  'README.md',
  'README.zh.md',
  'LICENSE',
  'SECURITY.md',
  'PRIVACY.md',
  'THIRD_PARTY_NOTICES.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'docs/SELF_HOSTING.md',
  'docs/PUBLISHING.md',
];

for (const file of requiredFiles) await access(join(root, file));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.name !== '@musitoolbox/dsh-remote') throw new Error('unexpected npm package name');
if (manifest.version !== '0.4.0-beta.2') throw new Error('unexpected beta version');
if (manifest.repository?.type !== 'git' || manifest.repository?.url !== 'git+https://github.com/xiaoxiaohai/dsh-remote.git') {
  throw new Error('unexpected GitHub repository metadata');
}
if (manifest.homepage !== 'https://github.com/xiaoxiaohai/dsh-remote#readme') throw new Error('unexpected package homepage');
if (manifest.bugs?.url !== 'https://github.com/xiaoxiaohai/dsh-remote/issues') throw new Error('unexpected issue tracker');
if (manifest.publishConfig?.registry !== 'https://registry.npmjs.org/' || manifest.publishConfig?.tag !== 'beta') {
  throw new Error('npm publish configuration is not pinned to the official beta registry');
}

const bundle = await readFile(join(root, 'cordis.patch.yml'), 'utf8');
for (const expected of ['name: "@musitoolbox/dsh-remote"', 'serviceUrl: https://remote.musitoolbox.com', 'enabled: false', 'autoStart: false']) {
  if (!bundle.includes(expected)) throw new Error(`bundle is missing ${expected}`);
}

const english = await readFile(join(root, 'README.md'), 'utf8');
const chinese = await readFile(join(root, 'README.zh.md'), 'utf8');
const sharedFacts = [
  '@musitoolbox/dsh-remote',
  'remote.musitoolbox.com',
  '0.1.0-rc.8',
  '0.4.0-beta.1',
  '0.4.0-beta.2',
  'darwin-x64',
  'darwin-arm64',
  'dsh plugin --profile web add @musitoolbox/dsh-remote@beta',
  'https://remote.musitoolbox.com/downloads/dsh-remote-android.apk',
  'https://github.com/xiaoxiaohai/dsh-remote',
];
for (const fact of sharedFacts) {
  if (!english.includes(fact)) throw new Error(`English README is missing ${fact}`);
  if (!chinese.includes(fact)) throw new Error(`Chinese README is missing ${fact}`);
}
if (!/official npm registry shows `0\.4\.0-beta\.2` under the `beta` tag/iu.test(english)) {
  throw new Error('English README must make npm installation conditional on official registry availability');
}
if (!/npm 官方 registry 已显示 `0\.4\.0-beta\.2` 和 `beta` tag/u.test(chinese)) {
  throw new Error('Chinese README must make npm installation conditional on official registry availability');
}
if (!/authorized human owner/iu.test(english) || !/获得授权的人类所有者/u.test(chinese)) {
  throw new Error('Both READMEs must keep publication human-controlled');
}
for (const stale of [/not yet published/iu, /尚未发布/u, /requires production release signing/iu, /仍需要正式 Release 签名/u]) {
  if (stale.test(english) || stale.test(chinese)) throw new Error(`stale release wording remains: ${stale}`);
}

async function markdownFiles(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'crew') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(path);
  }
  return output;
}

const markdown = await markdownFiles(root);
const missing = [];
for (const file of markdown) {
  const body = await readFile(file, 'utf8');
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const target = match[1].trim();
    if (!target || target.startsWith('#') || /^[a-z]+:/iu.test(target)) continue;
    const local = decodeURIComponent(target.split('#', 1)[0]);
    try { await access(resolve(dirname(file), local)); }
    catch { missing.push(`${relative(root, file)} -> ${target}`); }
  }
}
if (missing.length > 0) throw new Error(`missing local links:\n${missing.join('\n')}`);
console.log(`Documentation check passed: ${markdown.length} Markdown files, no missing local links, bilingual release facts match.`);
