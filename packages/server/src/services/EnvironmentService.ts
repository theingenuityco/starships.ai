import { NotFoundError } from '@starships/errors';
import { EnvironmentRepository } from '@starships/models';
import type { EnvironmentSummary, CreateEnvironmentVariableRequest, UpdateEnvironmentVariableRequest } from '@starships/protocol';

export class EnvironmentService {
  private environmentRepository: EnvironmentRepository;

  constructor() {
    this.environmentRepository = new EnvironmentRepository();
  }

  async createEnvironmentVariable(
    starshipId: string,
    data: CreateEnvironmentVariableRequest,
    createdBy: string
  ): Promise<EnvironmentSummary> {
    const environment = await this.environmentRepository.create({
      starshipId,
      key: data.key,
      value: data.value,
      description: data.description,
      createdBy,
    });

    return {
      id: environment.id,
      starshipId: environment.starshipId,
      key: environment.key,
      description: environment.description,
      createdAt: environment.createdAt,
      updatedAt: environment.updatedAt,
      createdBy: environment.createdBy,
    };
  }

  async updateEnvironmentVariable(
    starshipId: string,
    key: string,
    data: UpdateEnvironmentVariableRequest,
    updatedBy: string
  ): Promise<EnvironmentSummary> {
    const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);
    if (!existing) {
      throw new NotFoundError('Environment variable', key);
    }

    const updated = await this.environmentRepository.update(existing.id, {
      value: data.value,
      description: data.description,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundError('Environment variable', key);
    }

    return {
      id: updated.id,
      starshipId: updated.starshipId,
      key: updated.key,
      description: updated.description,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
    };
  }

  async updateEnvironmentVariableById(
    starshipId: string,
    environmentId: string,
    data: UpdateEnvironmentVariableRequest,
    updatedBy: string
  ): Promise<EnvironmentSummary> {
    const updated = await this.environmentRepository.update(environmentId, {
      value: data.value,
      description: data.description,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundError('Environment variable', environmentId);
    }

    // Verify it belongs to the correct starship
    if (updated.starshipId !== starshipId) {
      throw new NotFoundError('Environment variable', environmentId);
    }

    return {
      id: updated.id,
      starshipId: updated.starshipId,
      key: updated.key,
      description: updated.description,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      createdBy: updated.createdBy,
    };
  }

  async deleteEnvironmentVariable(starshipId: string, key: string): Promise<boolean> {
    return this.environmentRepository.deleteByStarshipAndKey(starshipId, key);
  }

  async deleteEnvironmentVariableById(starshipId: string, environmentId: string): Promise<boolean> {
    // First verify the environment variable exists and belongs to the starship
    const variables = await this.environmentRepository.findByStarship(starshipId);
    const variable = variables.find((v) => v.id === environmentId);

    if (!variable) {
      return false;
    }

    return this.environmentRepository.delete(environmentId);
  }

  async getEnvironmentVariables(starshipId: string): Promise<EnvironmentSummary[]> {
    return this.environmentRepository.findByStarship(starshipId);
  }

  async getDecryptedEnvironment(starshipId: string): Promise<Record<string, string>> {
    return this.environmentRepository.getDecryptedEnvironment(starshipId);
  }
}
