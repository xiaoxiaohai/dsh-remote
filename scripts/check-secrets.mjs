import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const skippedDirectories = new Set(['.git', 'bin', 'node_modules', 'coverage', 'crew']);
const forbiddenExtensions = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.mobileprovision', '.sqlite']);
const findings = [];

const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/u],
  ['npm token', /\bnpm_[A-Za-z0-9]{20,}\b|registry\.npmjs\.org\/:_authToken\s*=/u],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/u],
  ['credential URL', /https?:\/\/[^\s/@:]+:[^\s/@]+@/u],
  ['production IPv4 address', /\b(?!127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)(?:\d{1,3}\.){3}\d{1,3}\b/u],
  ['internal absolute path', /(?:\/Users\/[^/\s]+\/|\/home\/ubuntu\/|\/var\/backups\/dsh-remote)/u],
];

function publicRelative(file) {
  return relative(root, file).split(sep).join('/');
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      findings.push({ file: publicRelative(join(directory, entry.name)), line: 0, kind: 'symbolic link' });
      continue;
    }
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await walk(join(directory, entry.name));
      continue;
    }
    const file = join(directory, entry.name);
    const rel = publicRelative(file);
    if (rel === 'docs/crew/dod.md' || rel.endsWith('.tgz')) continue;
    if (forbiddenExtensions.has(extname(entry.name).toLowerCase()) || /^\.env(?:\.|$)/u.test(entry.name)) {
      findings.push({ file: rel, line: 0, kind: 'forbidden sensitive filename' });
      continue;
    }
    const buffer = await readFile(file);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString('utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const [kind, pattern] of patterns) {
        if (pattern.test(line)) findings.push({ file: rel, line: index + 1, kind });
      }
    });
  }
}

await walk(root);
if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.file}:${finding.line} ${finding.kind}`);
  throw new Error(`secret/publication scan found ${findings.length} issue(s)`);
}
console.log('Secret/publication scan passed: no high-confidence credentials or private production details found.');
