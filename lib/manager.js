import { spawn as defaultSpawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServiceClient } from './service-client.js';
import { loadInstallation, saveInstallation } from './installation.js';
import { resolveFrpcPath, writeFrpcConfig } from './frpc.js';

function defaultStateDir() {
  const configuredHome = String(process.env.DSH_HOME ?? '').trim();
  const dshHome = configuredHome ? resolve(configuredHome) : join(homedir(), '.dsh');
  return join(dshHome, 'dsh-remote');
}

export class RemoteAccessManager {
  constructor({ config, dshPort, log = console, spawn = defaultSpawn }) {
    this.config = config;
    this.dshPort = dshPort;
    this.log = log;
    this.spawn = spawn;
    this.stateDir = resolve(config.stateDir ?? defaultStateDir());
    this.installationPath = join(this.stateDir, 'installation.json');
    this.frpcConfigPath = join(this.stateDir, 'frpc.toml');
    this.client = config.serviceUrl ? createServiceClient(config) : null;
    this.installation = null;
    this.authorizations = [];
    this.authorizationsLoaded = false;
    this.authorizationError = null;
    this.child = null;
    this.phase = config.enabled === false ? 'disabled' : 'stopped';
    this.error = null;
  }

  snapshot() {
    return {
      phase: this.phase,
      error: this.error,
      authorizationError: this.authorizationError,
      identityId: this.installation?.identityId ?? null,
      macId: this.installation?.macId ?? null,
      connectUrl: this.installation?.connectUrl ?? null,
      qrCodeDataUrl: this.installation?.qrCodeDataUrl ?? null,
      authorizations: this.authorizations,
      authorizationsLoaded: this.authorizationsLoaded,
      dshPort: this.dshPort,
    };
  }

  async initialize() {
    this.installation = await loadInstallation(this.installationPath);
    if (this.installation && this.config.serviceUrl && this.installation.serviceUrl !== this.config.serviceUrl) {
      this.installation = null;
    }
    if (this.config.enabled === true && this.config.autoStart !== false) await this.start();
    return this.snapshot();
  }

  async ensureInstallation() {
    if (this.installation) return this.installation;
    if (!this.client) throw new Error('Configure the DSH Remote service URL before starting remote access.');
    this.phase = 'registering';
    const registration = await this.client.register({ displayName: this.config.macName });
    this.installation = {
      serviceUrl: this.config.serviceUrl,
      identityId: registration.identityId,
      macId: registration.macId,
      controlSecret: registration.controlSecret,
      tunnelToken: registration.tunnelToken,
      connectUrl: registration.connectUrl,
      qrCodeDataUrl: registration.qrCodeDataUrl,
      frpServerHost: registration.frpServerHost,
      frpServerPort: registration.frpServerPort,
      internalDomain: registration.internalDomain,
    };
    await saveInstallation(this.installationPath, this.installation);
    return this.installation;
  }

  async refreshAuthorizations() {
    if (!this.client) throw new Error('Configure the DSH Remote service URL before loading authorized phones.');
    const installation = await this.ensureInstallation();
    try {
      const result = await this.client.listAuthorizations(installation);
      this.authorizations = Array.isArray(result.authorizations) ? result.authorizations : [];
      this.authorizationsLoaded = true;
      this.authorizationError = null;
    } catch (error) {
      this.authorizationError = error.message;
      throw error;
    }
    return this.snapshot();
  }

  async start() {
    if (this.child) return this.snapshot();
    this.error = null;
    try {
      const installation = await this.ensureInstallation();
      const frpcPath = await resolveFrpcPath(this.config.frpcPath);
      await writeFrpcConfig(this.frpcConfigPath, installation, this.dshPort);
      this.phase = 'starting';
      const child = this.spawn(frpcPath, ['-c', this.frpcConfigPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;
      const onOutput = (chunk) => {
        const line = String(chunk);
        if (/start proxy success|login to server success/iu.test(line)) this.phase = 'running';
        if (/error|failed/iu.test(line)) {
          const safeLine = line
            .replaceAll(installation.tunnelToken, '[redacted-tunnel-token]')
            .replaceAll(installation.controlSecret, '[redacted-control-secret]');
          this.log.warn?.(`dsh-remote frpc: ${safeLine.trim().slice(-500)}`);
        }
      };
      child.stdout?.on('data', onOutput);
      child.stderr?.on('data', onOutput);
      child.once('error', (error) => {
        this.child = null;
        this.phase = 'error';
        this.error = error.message;
      });
      child.once('exit', (code, signal) => {
        if (this.child === child) this.child = null;
        if (this.phase !== 'stopping' && this.phase !== 'stopped') {
          this.phase = code === 0 ? 'stopped' : 'error';
          this.error = code === 0 ? null : `frpc exited (code=${code}, signal=${signal ?? 'none'})`;
        }
      });
      try { await this.refreshAuthorizations(); } catch (error) {
        this.log.warn?.(`dsh-remote could not load authorized phones: ${error.message}`);
      }
      return this.snapshot();
    } catch (error) {
      this.phase = 'error';
      this.error = error.message;
      throw error;
    }
  }

  async stop() {
    const child = this.child;
    if (!child) {
      this.phase = this.config.enabled === false ? 'disabled' : 'stopped';
      return this.snapshot();
    }
    this.phase = 'stopping';
    await new Promise((resolveStop) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceTimer);
        clearTimeout(fallbackTimer);
        resolveStop();
      };
      const forceTimer = setTimeout(() => child.kill('SIGKILL'), 3_000);
      const fallbackTimer = setTimeout(finish, 4_000);
      child.once('exit', finish);
      child.kill('SIGTERM');
    });
    if (this.child === child) this.child = null;
    this.phase = 'stopped';
    this.error = null;
    return this.snapshot();
  }

  async revokeAuthorization(authorizationId) {
    if (!this.client) throw new Error('Configure the DSH Remote service URL before revoking a phone.');
    const installation = await this.ensureInstallation();
    const result = await this.client.revokeAuthorization(installation, authorizationId);
    installation.connectUrl = result.connectUrl;
    installation.qrCodeDataUrl = result.qrCodeDataUrl;
    this.authorizations = this.authorizations.filter((item) => item.authorizationId !== authorizationId);
    this.authorizationsLoaded = true;
    this.authorizationError = null;
    await saveInstallation(this.installationPath, installation);
    try { await this.refreshAuthorizations(); } catch (error) {
      this.log.warn?.(`dsh-remote revoked a phone but could not refresh the list: ${error.message}`);
    }
    return this.snapshot();
  }

  async rotatePairing() {
    if (!this.client) throw new Error('Configure the DSH Remote service URL before rotating the connection link.');
    const installation = await this.ensureInstallation();
    const result = await this.client.rotatePairing(installation);
    installation.connectUrl = result.connectUrl;
    installation.qrCodeDataUrl = result.qrCodeDataUrl;
    this.authorizations = [];
    this.authorizationsLoaded = true;
    this.authorizationError = null;
    await saveInstallation(this.installationPath, installation);
    return this.snapshot();
  }

  async createJoinToken() {
    if (!this.client) throw new Error('Configure the DSH Remote service URL before creating a Mac join code.');
    return this.client.createJoinToken(await this.ensureInstallation());
  }
}
