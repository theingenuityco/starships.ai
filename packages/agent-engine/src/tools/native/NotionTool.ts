import { DynamicTool } from '@langchain/core/tools';
import { Client } from '@notionhq/client';
import { 
  PageObjectResponse, 
  DatabaseObjectResponse,
  BlockObjectResponse,
  PartialBlockObjectResponse 
} from '@notionhq/client/build/src/api-endpoints';

interface NotionSearchInput {
  action: 'search';
  query: string;
  filter?: 'page' | 'database';
}

interface NotionGetPageInput {
  action: 'get_page';
  pageId: string;
}

interface NotionCreatePageInput {
  action: 'create_page';
  title: string;
  content: string;
  parentPageId?: string;
  parentDatabaseId?: string;
}

interface NotionUpdatePageInput {
  action: 'update_page';
  pageId: string;
  title?: string;
  content?: string;
}

interface NotionListDatabasesInput {
  action: 'list_databases';
}

interface NotionQueryDatabaseInput {
  action: 'query_database';
  databaseId: string;
  filter?: any;
  sorts?: any[];
}

interface NotionCreateDatabaseEntryInput {
  action: 'create_database_entry';
  databaseId: string;
  properties: Record<string, any>;
}

interface NotionGetBlockChildrenInput {
  action: 'get_block_children';
  blockId: string;
}

type NotionToolInput = 
  | NotionSearchInput 
  | NotionGetPageInput 
  | NotionCreatePageInput 
  | NotionUpdatePageInput
  | NotionListDatabasesInput
  | NotionQueryDatabaseInput
  | NotionCreateDatabaseEntryInput
  | NotionGetBlockChildrenInput;

export class NotionTool {
  private notion: Client;

  constructor(apiKey: string) {
    this.notion = new Client({
      auth: apiKey,
    });
  }

  private async searchNotion(query: string, filter?: 'page' | 'database') {
    const response = await this.notion.search({
      query,
      filter: filter ? { property: 'object', value: filter } : undefined,
      page_size: 10,
    });
    return response.results;
  }

  private async getPage(pageId: string) {
    const page = await this.notion.pages.retrieve({ page_id: pageId });
    const blocks = await this.notion.blocks.children.list({ block_id: pageId });
    return { page, blocks: blocks.results };
  }

  private async createPage(title: string, content: string, parentPageId?: string, parentDatabaseId?: string) {
    let parent: { database_id: string } | { page_id: string } | { workspace: true } | undefined;
    
    if (parentDatabaseId) {
      parent = { database_id: parentDatabaseId };
    } else if (parentPageId) {
      parent = { page_id: parentPageId };
    } else {
      // If no parent is specified, try to find a suitable parent page
      // First, search for any existing pages to get a workspace page
      try {
        const searchResults = await this.notion.search({
          filter: { property: 'object', value: 'page' },
          page_size: 1,
        });
        
        if (searchResults.results.length > 0 && 'parent' in searchResults.results[0]) {
          const searchResult = searchResults.results[0];
          const resultParent = searchResult.parent;
          
          // Convert the parent to the correct format for page creation
          if ('database_id' in resultParent) {
            parent = { database_id: resultParent.database_id };
          } else if ('page_id' in resultParent) {
            parent = { page_id: resultParent.page_id };
          } else if ('workspace' in resultParent) {
            parent = { workspace: true };
          }
        }
      } catch (searchError) {
        console.error('Failed to find parent page:', searchError);
      }
      
      // If still no parent, default to workspace level
      if (!parent) {
        // Try workspace level as a fallback
        parent = { workspace: true };
      }
    }

    // Create the page
    const page = await this.notion.pages.create({
      parent,
      properties: parentDatabaseId ? {
        // For database pages, we need to match the database schema
        // This is a simplified version - real implementation would need to handle database schema
        Name: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      } : {
        // For regular pages
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
    });

    // Add content as blocks
    if (content) {
      const blocks = content.split('\n').map(paragraph => ({
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: {
                content: paragraph,
              },
            },
          ],
        },
      }));

      if (blocks.length > 0) {
        await this.notion.blocks.children.append({
          block_id: page.id,
          children: blocks,
        });
      }
    }

    return page;
  }

  private async updatePage(pageId: string, title?: string, content?: string) {
    // Update page properties if title is provided
    if (title) {
      await this.notion.pages.update({
        page_id: pageId,
        properties: {
          title: {
            title: [
              {
                text: {
                  content: title,
                },
              },
            ],
          },
        },
      });
    }

    // Update page content if provided
    if (content) {
      // First, get existing blocks
      const existingBlocks = await this.notion.blocks.children.list({ block_id: pageId });
      
      // Delete existing blocks
      for (const block of existingBlocks.results) {
        if ('id' in block) {
          await this.notion.blocks.delete({ block_id: block.id });
        }
      }

      // Add new content
      const blocks = content.split('\n').map(paragraph => ({
        object: 'block' as const,
        type: 'paragraph' as const,
        paragraph: {
          rich_text: [
            {
              type: 'text' as const,
              text: {
                content: paragraph,
              },
            },
          ],
        },
      }));

      if (blocks.length > 0) {
        await this.notion.blocks.children.append({
          block_id: pageId,
          children: blocks,
        });
      }
    }

    return { success: true, pageId };
  }

  private async listDatabases() {
    const response = await this.notion.search({
      filter: { property: 'object', value: 'database' },
      page_size: 100,
    });
    return response.results.filter((item): item is DatabaseObjectResponse => 
      item.object === 'database'
    );
  }

  private async queryDatabase(databaseId: string, filter?: any, sorts?: any[]) {
    const response = await this.notion.databases.query({
      database_id: databaseId,
      filter,
      sorts,
      page_size: 100,
    });
    return response.results;
  }

  private async createDatabaseEntry(databaseId: string, properties: Record<string, any>) {
    const page = await this.notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });
    return page;
  }

  private async getBlockChildren(blockId: string) {
    const response = await this.notion.blocks.children.list({
      block_id: blockId,
      page_size: 100,
    });
    return response.results;
  }

  private extractTextFromBlocks(blocks: (BlockObjectResponse | PartialBlockObjectResponse)[]): string {
    let text = '';
    for (const block of blocks) {
      if ('type' in block) {
        switch (block.type) {
          case 'paragraph':
            if ('paragraph' in block && block.paragraph.rich_text) {
              text += block.paragraph.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'heading_1':
            if ('heading_1' in block && block.heading_1.rich_text) {
              text += '# ' + block.heading_1.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'heading_2':
            if ('heading_2' in block && block.heading_2.rich_text) {
              text += '## ' + block.heading_2.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'heading_3':
            if ('heading_3' in block && block.heading_3.rich_text) {
              text += '### ' + block.heading_3.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'bulleted_list_item':
            if ('bulleted_list_item' in block && block.bulleted_list_item.rich_text) {
              text += '• ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'numbered_list_item':
            if ('numbered_list_item' in block && block.numbered_list_item.rich_text) {
              text += '1. ' + block.numbered_list_item.rich_text.map(t => t.plain_text).join('') + '\n';
            }
            break;
          case 'code':
            if ('code' in block && block.code.rich_text) {
              text += '```' + (block.code.language || '') + '\n';
              text += block.code.rich_text.map(t => t.plain_text).join('') + '\n';
              text += '```\n';
            }
            break;
        }
      }
    }
    return text;
  }

  getTools(): DynamicTool[] {
    const tools: DynamicTool[] = [];

    tools.push(new DynamicTool({
      name: 'notion_tool',
      description: `Notion workspace tool for managing pages and databases. Use with JSON input containing an "action" field:
- {"action": "search", "query": ""} - List ALL pages (use empty query to get all pages)
- {"action": "search", "query": "meeting notes"} - Search for specific pages or databases
- {"action": "search", "query": "", "filter": "page"} - List only pages
- {"action": "get_page", "pageId": "..."} - Get page content
- {"action": "create_page", "title": "...", "content": "...", "parentPageId": "..."} - Create new page
- {"action": "update_page", "pageId": "...", "title": "...", "content": "..."} - Update existing page
- {"action": "list_databases"} - List only databases (NOT pages)
- {"action": "query_database", "databaseId": "..."} - Query database entries
- {"action": "create_database_entry", "databaseId": "...", "properties": {...}} - Add entry to database
IMPORTANT: To list all pages, use search with empty query: {"action": "search", "query": ""}`,
      func: async (input: string | any) => {
        try {
          let params: NotionToolInput;
          
          // Handle both string and object inputs
          if (typeof input === 'string') {
            try {
              params = JSON.parse(input) as NotionToolInput;
            } catch (parseError) {
              // Try to detect intent from plain text
              const lowerInput = input.toLowerCase();
              if (lowerInput.includes('search')) {
                const query = input.replace(/search/i, '').trim();
                params = { action: 'search', query };
              } else if (lowerInput.includes('list database')) {
                params = { action: 'list_databases' };
              } else {
                throw new Error('Invalid input. Please provide JSON with an "action" field.');
              }
            }
          } else if (typeof input === 'object' && input !== null) {
            // Input is already an object, use it directly
            params = input as NotionToolInput;
          } else {
            throw new Error('Invalid input type. Expected string or object.');
          }

          switch (params.action) {
            case 'search': {
              const results = await this.searchNotion(params.query, params.filter);
              return JSON.stringify({
                results: results.map((item: any) => ({
                  id: item.id,
                  type: item.object,
                  title: item.object === 'page' 
                    ? (item.properties?.title?.title?.[0]?.plain_text || 
                       item.properties?.Name?.title?.[0]?.plain_text || 
                       'Untitled')
                    : item.title?.[0]?.plain_text || 'Untitled',
                  url: item.url,
                  lastEdited: item.last_edited_time,
                })),
              });
            }

            case 'get_page': {
              const { page, blocks } = await this.getPage(params.pageId);
              const content = this.extractTextFromBlocks(blocks);
              return JSON.stringify({
                id: page.id,
                title: 'properties' in page && page.properties?.title 
                  ? (page.properties.title as any).title?.[0]?.plain_text || 'Untitled'
                  : 'Untitled',
                url: 'url' in page ? page.url : undefined,
                content,
                lastEdited: 'last_edited_time' in page ? page.last_edited_time : undefined,
              });
            }

            case 'create_page': {
              const page = await this.createPage(
                params.title,
                params.content,
                params.parentPageId,
                params.parentDatabaseId
              );
              return JSON.stringify({
                success: true,
                pageId: page.id,
                url: 'url' in page ? page.url : undefined,
              });
            }

            case 'update_page': {
              const result = await this.updatePage(
                params.pageId,
                params.title,
                params.content
              );
              return JSON.stringify(result);
            }

            case 'list_databases': {
              const databases = await this.listDatabases();
              return JSON.stringify({
                databases: databases.map(db => ({
                  id: db.id,
                  title: db.title?.[0]?.plain_text || 'Untitled',
                  url: db.url,
                  lastEdited: db.last_edited_time,
                })),
              });
            }

            case 'query_database': {
              const entries = await this.queryDatabase(
                params.databaseId,
                params.filter,
                params.sorts
              );
              return JSON.stringify({
                entries: entries.map((entry: any) => ({
                  id: entry.id,
                  properties: entry.properties,
                  url: entry.url,
                  lastEdited: entry.last_edited_time,
                })),
              });
            }

            case 'create_database_entry': {
              const entry = await this.createDatabaseEntry(
                params.databaseId,
                params.properties
              );
              return JSON.stringify({
                success: true,
                entryId: entry.id,
                url: 'url' in entry ? entry.url : undefined,
              });
            }

            case 'get_block_children': {
              const blocks = await this.getBlockChildren(params.blockId);
              const content = this.extractTextFromBlocks(blocks);
              return JSON.stringify({
                blockId: params.blockId,
                content,
                blocksCount: blocks.length,
              });
            }

            default:
              return JSON.stringify({
                error: 'Unknown action. Valid actions are: search, get_page, create_page, update_page, list_databases, query_database, create_database_entry, get_block_children',
              });
          }
        } catch (error) {
          return JSON.stringify({
            error: `Notion operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      },
    }));

    return tools;
  }

  toDynamicTool(): DynamicTool {
    return this.getTools()[0];
  }
}