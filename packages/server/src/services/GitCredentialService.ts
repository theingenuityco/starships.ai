import { createSign } from 'node:crypto';
import type { GitCredentials } from '@starships/autopilot';
import { PlatformSecretService } from './PlatformSecretService';

/**
 * GitCredentialService
 *
 * Mints short-lived GitHub App installation tokens (~1h) for native code
 * execution: clone, push, and connector API calls. Installation tokens are
 * preferred over long-lived OAuth user tokens because a compromised sandbox has
 * a small, time-bounded blast radius.
 *
 * Flow: sign a 10-minute App JWT (RS256) with the App private key, then exchange
 * it at POST /app/installations/{installation_id}/access_tokens.
 *
 * Platform credentials are read from PLATFORM SECRETS (encrypted, in the DB,
 * managed at runtime via the platform-secrets admin), not env:
 *   - GH_APP_ID                   GitHub App id
 *   - GH_APP_PRIVATE_KEY_BASE64   base64-encoded PEM private key
 *
 * The per-starship installation id is resolved by the caller from the connector
 * instance metadata (set when the GitHub App is installed on the org/repo).
 */
export interface MintedGitToken extends GitCredentials {
  expiresAt: string;
}

const APP_ID_SECRET_KEY = 'GH_APP_ID';
const PRIVATE_KEY_SECRET_KEY = 'GH_APP_PRIVATE_KEY_BASE64';

export class GitCredentialService {
  private readonly platformSecrets = new PlatformSecretService();

  async isConfigured(): Promise<boolean> {
    const [appId, privateKey] = await Promise.all([
      this.platformSecrets.getSecret(APP_ID_SECRET_KEY),
      this.platformSecrets.getSecret(PRIVATE_KEY_SECRET_KEY),
    ]);
    return Boolean(appId && privateKey);
  }

  /** Mint an installation access token for the given installation id. */
  async getInstallationToken(installationId: string): Promise<MintedGitToken> {
    if (!installationId) {
      throw new Error('installationId is required to mint a GitHub installation token');
    }

    const [appId, privateKeyB64] = await Promise.all([
      this.platformSecrets.getSecret(APP_ID_SECRET_KEY),
      this.platformSecrets.getSecret(PRIVATE_KEY_SECRET_KEY),
    ]);
    const privateKeyPem = privateKeyB64 ? Buffer.from(privateKeyB64, 'base64').toString('utf-8') : '';
    if (!appId || !privateKeyPem) {
      throw new Error(`GitHub App is not configured (set ${APP_ID_SECRET_KEY} and ${PRIVATE_KEY_SECRET_KEY} platform secrets)`);
    }

    const appJwt = this.signAppJwt(appId, privateKeyPem);
    const res = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to mint GitHub installation token (${res.status}): ${text.slice(0, 500)}`);
    }

    const body = (await res.json()) as { token: string; expires_at: string };
    return { token: body.token, username: 'x-access-token', expiresAt: body.expires_at };
  }

  /** Sign a short-lived GitHub App JWT (RS256). */
  private signAppJwt(appId: string, privateKeyPem: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      // Allow 60s clock drift on iat per GitHub guidance.
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    };
    const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${encode(header)}.${encode(payload)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKeyPem).toString('base64url');
    return `${signingInput}.${signature}`;
  }
}
