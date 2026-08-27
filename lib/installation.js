import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const INSTALLATION_SCHEMA_VERSION = 2;

export async function loadInstallation(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (
      parsed?.schemaVersion !== INSTALLATION_SCHEMA_VERSION
      || !parsed?.identityId
      || !parsed?.macId
      || !parsed?.controlSecret
      || !parsed?.tunnelToken
      || !parsed?.connectUrl
    ) return null;
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveInstallation(filePath, installation) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const value = { ...installation, schemaVersion: INSTALLATION_SCHEMA_VERSION };
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, filePath);
  await chmod(filePath, 0o600);
}
