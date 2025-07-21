import { getConnection } from '../connection';
import { ConnectorConfigTemplate } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class ConnectorConfigTemplateRepository {
  /**
   * Create a new configuration template
   */
  async create(
    template: Omit<ConnectorConfigTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ConnectorConfigTemplate> {
    if (!template.name || !template.category || !template.config) {
      throw new Error('Name, category, and config are required fields');
    }

    const connection = getConnection();
    const configTemplate: ConnectorConfigTemplate = {
      ...template,
      id: uuidv4(),
      usageCount: template.usageCount || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await connection.executeWrite(`CREATE (t:ConnectorConfigTemplate $props) RETURN t`, {
        props: {
          ...configTemplate,
          config: JSON.stringify(configTemplate.config),
        },
      });

      console.log(
        `[ConnectorConfigTemplateRepository] Created configuration template: ${configTemplate.name} (${configTemplate.id})`
      );
      return configTemplate;
    } catch (error) {
      console.error('[ConnectorConfigTemplateRepository] Error in create:', error);
      throw new Error(
        `Failed to create configuration template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get all configuration templates
   */
  async findAll(): Promise<ConnectorConfigTemplate[]> {
    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) RETURN t ORDER BY t.category, t.name'
      );

      return result.map((record) => this.nodeToTemplate(record.t));
    } catch (error) {
      console.error('[ConnectorConfigTemplateRepository] Error in findAll:', error);
      throw new Error(
        `Failed to retrieve configuration templates: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get configuration templates by category
   */
  async findByCategory(category: string): Promise<ConnectorConfigTemplate[]> {
    if (!category) {
      throw new Error('Category parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.category = $category RETURN t ORDER BY t.name',
        { category }
      );

      return result.map((record) => this.nodeToTemplate(record.t));
    } catch (error) {
      console.error(
        `[ConnectorConfigTemplateRepository] Error in findByCategory for category ${category}:`,
        error
      );
      throw new Error(
        `Failed to find configuration templates by category: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get public configuration templates
   */
  async findPublic(): Promise<ConnectorConfigTemplate[]> {
    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.isPublic = true RETURN t ORDER BY t.category, t.name'
      );

      return result.map((record) => this.nodeToTemplate(record.t));
    } catch (error) {
      console.error('[ConnectorConfigTemplateRepository] Error in findPublic:', error);
      throw new Error(
        `Failed to find public configuration templates: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get configuration templates by author
   */
  async findByAuthor(authorId: string): Promise<ConnectorConfigTemplate[]> {
    if (!authorId) {
      throw new Error('Author ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.authorId = $authorId RETURN t ORDER BY t.updatedAt DESC',
        { authorId }
      );

      return result.map((record) => this.nodeToTemplate(record.t));
    } catch (error) {
      console.error(
        `[ConnectorConfigTemplateRepository] Error in findByAuthor for authorId ${authorId}:`,
        error
      );
      throw new Error(
        `Failed to find configuration templates by author: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get configuration template by ID
   */
  async findById(id: string): Promise<ConnectorConfigTemplate | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeQuery<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id RETURN t',
        { id }
      );

      return result[0] ? this.nodeToTemplate(result[0].t) : null;
    } catch (error) {
      console.error(`[ConnectorConfigTemplateRepository] Error in findById for id ${id}:`, error);
      throw new Error(
        `Failed to retrieve configuration template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update configuration template
   */
  async update(
    id: string,
    updates: Partial<Omit<ConnectorConfigTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<ConnectorConfigTemplate | null> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      // Prepare updates with JSON stringified config if present
      const processedUpdates: any = { ...updates };
      if (updates.config) {
        processedUpdates.config = JSON.stringify(updates.config);
      }
      processedUpdates.updatedAt = new Date().toISOString();

      const result = await connection.executeWrite<{ t: any }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id SET t += $updates RETURN t',
        { id, updates: processedUpdates }
      );

      const updatedTemplate = result[0] ? this.nodeToTemplate(result[0].t) : null;
      if (updatedTemplate) {
        console.log(
          `[ConnectorConfigTemplateRepository] Updated configuration template: ${updatedTemplate.name} (${id})`
        );
      }

      return updatedTemplate;
    } catch (error) {
      console.error(`[ConnectorConfigTemplateRepository] Error in update for id ${id}:`, error);
      throw new Error(
        `Failed to update configuration template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Delete configuration template
   */
  async delete(id: string): Promise<boolean> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
        { id }
      );

      const deleted = result[0]?.deletedCount > 0;
      if (deleted) {
        console.log(
          `[ConnectorConfigTemplateRepository] Deleted configuration template with id: ${id}`
        );
      }

      return deleted;
    } catch (error) {
      console.error(`[ConnectorConfigTemplateRepository] Error in delete for id ${id}:`, error);
      throw new Error(
        `Failed to delete configuration template: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Increment usage count for a template
   */
  async incrementUsage(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID parameter is required');
    }

    const connection = getConnection();
    try {
      await connection.executeWrite(
        'MATCH (t:ConnectorConfigTemplate) WHERE t.id = $id SET t.usageCount = t.usageCount + 1, t.updatedAt = $updatedAt',
        { id, updatedAt: new Date().toISOString() }
      );

      console.log(
        `[ConnectorConfigTemplateRepository] Incremented usage count for template: ${id}`
      );
    } catch (error) {
      console.error(
        `[ConnectorConfigTemplateRepository] Error in incrementUsage for id ${id}:`,
        error
      );
      throw new Error(
        `Failed to increment usage count: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Search configuration templates
   */
  async search(query: string, category?: string): Promise<ConnectorConfigTemplate[]> {
    if (!query) {
      throw new Error('Search query parameter is required');
    }

    const connection = getConnection();
    try {
      let cypher = `
        MATCH (t:ConnectorConfigTemplate)
        WHERE (toLower(t.name) CONTAINS toLower($query) OR toLower(t.description) CONTAINS toLower($query) OR any(tag IN t.tags WHERE toLower(tag) CONTAINS toLower($query)))
      `;

      const parameters: any = { query };

      if (category) {
        cypher += ` AND t.category = $category`;
        parameters.category = category;
      }

      cypher += `
        RETURN t
        ORDER BY t.usageCount DESC, t.name
      `;

      const result = await connection.executeQuery<{ t: any }>(cypher, parameters);
      return result.map((record) => this.nodeToTemplate(record.t));
    } catch (error) {
      console.error(
        `[ConnectorConfigTemplateRepository] Error in search for query ${query}:`,
        error
      );
      throw new Error(
        `Failed to search configuration templates: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Convert Neo4j node to ConnectorConfigTemplate
   */
  private nodeToTemplate(node: any): ConnectorConfigTemplate {
    return {
      id: node.id,
      name: node.name,
      description: node.description || undefined,
      category: node.category,
      isPublic: node.isPublic || false,
      authorId: node.authorId,
      config: JSON.parse(node.config),
      tags: node.tags || [],
      usageCount: node.usageCount || 0,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }
}
