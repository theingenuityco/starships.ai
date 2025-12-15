import { PlatformSecretRepository } from '@starships/models';

/**
 * PlatformSecretService
 *
 * Server-side helper for reading encrypted platform secrets from the DB.
 * Callers should treat these values as highly sensitive and avoid logging.
 */
export class PlatformSecretService {
  private repo: PlatformSecretRepository;

  constructor() {
    this.repo = new PlatformSecretRepository();
  }

  async getSecret(key: string): Promise<string | null> {
    if (!key?.trim()) return null;
    return this.repo.getDecryptedSecret(key.trim());
  }
}
