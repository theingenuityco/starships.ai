import { NotFoundError } from '@starships/errors';
import { ConnectorSecretRepository } from '@starships/models';
import type { ConnectorSecretSummary, CreateConnectorSecretRequest, UpdateConnectorSecretRequest } from '@starships/protocol';

export class ConnectorSecretService {
  private connectorSecretRepository: ConnectorSecretRepository;

  constructor() {
    this.connectorSecretRepository = new ConnectorSecretRepository();
  }

  async createConnectorSecret(starshipId: string, data: CreateConnectorSecretRequest, createdBy: string): Promise<ConnectorSecretSummary> {
    const created = await this.connectorSecretRepository.create({
      starshipId,
      key: data.key,
      value: data.value,
      description: data.description,
      createdBy,
    });

    return {
      id: created.id,
      starshipId: created.starshipId,
      key: created.key,
      description: created.description,
      connectorId: created.connectorId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      createdBy: created.createdBy,
    };
  }

  async updateConnectorSecretByKey(
    starshipId: string,
    key: string,
    data: UpdateConnectorSecretRequest,
    updatedBy: string
  ): Promise<ConnectorSecretSummary> {
    const existing = await this.connectorSecretRepository.findByStarshipAndKey(starshipId, key);
    if (!existing) {
      throw new NotFoundError('Connector secret', key);
    }

    const updated = await this.connectorSecretRepository.update(existing.id, {
      value: data.value,
      description: data.description,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundError('Connector secret', key);
    }

    return {
      id: updated.id,
      starshipId: updated.starshipId,
      key: updated.key,
      description: updated.description,
      connectorId: updated.connectorId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
    };
  }

  async deleteConnectorSecretByKey(starshipId: string, key: string): Promise<boolean> {
    return this.connectorSecretRepository.deleteByStarshipAndKey(starshipId, key);
  }

  async listConnectorSecrets(starshipId: string): Promise<ConnectorSecretSummary[]> {
    return this.connectorSecretRepository.findByStarship(starshipId);
  }

  async getDecryptedSecrets(starshipId: string): Promise<Record<string, string>> {
    return this.connectorSecretRepository.getDecryptedSecrets(starshipId);
  }
}
