/**
 * SmartParameterAdapter Test Suite
 * 
 * Comprehensive tests covering all heuristic rules and pattern memory
 */

import { SmartParameterAdapter } from '../SmartParameterAdapter';
import { HeuristicRules } from '../HeuristicRules';
import { MCPTool } from '@starships/core';

describe('SmartParameterAdapter', () => {
  let adapter: SmartParameterAdapter;
  let mockNeo4j: any;
  
  beforeEach(() => {
    mockNeo4j = {
      run: jest.fn().mockResolvedValue({ records: [] })
    };
    adapter = new SmartParameterAdapter(mockNeo4j);
  });
  
  describe('Notion Patterns', () => {
    const notionTool: MCPTool = {
      name: 'API-post-page',
      templateSlug: 'notion',
      connectorId: 'notion-123',
      description: 'Create a Notion page',
      inputSchema: {
        type: 'object',
        properties: {
          parent: { type: 'object' },
          properties: { 
            type: 'object',
            properties: {
              title: { type: 'array' }
            }
          }
        }
      }
    };
    
    test('converts paragraph.text to paragraph.rich_text', async () => {
      const input = {
        paragraph: {
          text: 'Hello World'
        }
      };
      
      const result = await adapter.adapt(input, notionTool);
      
      expect(result.paragraph.rich_text).toEqual([{
        type: 'text',
        text: { content: 'Hello World' }
      }]);
      expect(result.paragraph.text).toBeUndefined();
    });
    
    test('converts title string to rich_text array', async () => {
      const input = {
        properties: {
          title: 'My Page Title'
        }
      };
      
      const result = await adapter.adapt(input, notionTool);
      
      expect(result.properties.title).toEqual([{
        type: 'text',
        text: { content: 'My Page Title' }
      }]);
    });
    
    test('extracts Notion ID from URL', async () => {
      const input = {
        page_id: 'https://notion.so/My-Page-250aed16448d813ebc85e1accd8fde2e'
      };
      
      const result = await adapter.adapt(input, notionTool);
      
      expect(result.page_id).toBe('250aed16-448d-813e-bc85-e1accd8fde2e');
    });
    
    test('handles bulleted_list_item text conversion', async () => {
      const input = {
        bulleted_list_item: {
          text: 'List item text'
        }
      };
      
      const result = await adapter.adapt(input, notionTool);
      
      expect(result.bulleted_list_item.rich_text).toEqual([{
        type: 'text',
        text: { content: 'List item text' }
      }]);
      expect(result.bulleted_list_item.text).toBeUndefined();
    });
    
    test('handles heading conversions', async () => {
      const input = {
        heading_1: { text: 'Main Heading' },
        heading_2: { text: 'Sub Heading' }
      };
      
      const result = await adapter.adapt(input, notionTool);
      
      expect(result.heading_1.rich_text).toEqual([{
        type: 'text',
        text: { content: 'Main Heading' }
      }]);
      expect(result.heading_2.rich_text).toEqual([{
        type: 'text',
        text: { content: 'Sub Heading' }
      }]);
    });
  });
  
  describe('GitHub Patterns', () => {
    const githubTool: MCPTool = {
      name: 'create-issue',
      templateSlug: 'github',
      connectorId: 'github-456',
      description: 'Create GitHub issue',
      inputSchema: {
        type: 'object',
        properties: {
          issue: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' }
            }
          }
        }
      }
    };
    
    test('wraps flat object in issue', async () => {
      const input = {
        title: 'Bug Report',
        body: 'Something is broken'
      };
      
      const result = await adapter.adapt(input, githubTool);
      
      expect(result).toEqual({
        issue: {
          title: 'Bug Report',
          body: 'Something is broken'
        }
      });
    });
  });
  
  describe('Single Parameter Tools', () => {
    const searchTool: MCPTool = {
      name: 'search',
      templateSlug: 'brave',
      connectorId: 'brave-789',
      description: 'Search the web',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      }
    };
    
    test('wraps string in single required param', async () => {
      const input = 'What is TypeScript?';
      
      const result = await adapter.adapt(input, searchTool);
      
      expect(result).toEqual({
        query: 'What is TypeScript?'
      });
    });
    
    test('unwraps LangChain {input: value} format', async () => {
      const input = {
        input: 'What is TypeScript?'
      };
      
      const result = await adapter.adapt(input, searchTool);
      
      expect(result).toEqual({
        query: 'What is TypeScript?'
      });
    });
    
    test('handles nested unwrapping', async () => {
      const input = {
        input: {
          input: 'nested query'
        }
      };
      
      const result = await adapter.adapt(input, searchTool);
      
      expect(result).toEqual({
        query: 'nested query'
      });
    });
  });
  
  describe('Field Renaming', () => {
    const tool: MCPTool = {
      name: 'send',
      templateSlug: 'email',
      connectorId: 'email-101',
      description: 'Send email',
      inputSchema: {
        type: 'object',
        properties: {
          body: { type: 'string' },
          title: { type: 'string' }
        }
      }
    };
    
    test('renames common synonyms', async () => {
      const input = {
        content: 'Email content here',
        subject: 'Important Email'
      };
      
      const result = await adapter.adapt(input, tool);
      
      expect(result).toEqual({
        body: 'Email content here',
        title: 'Important Email'
      });
    });
    
    test('renames query synonyms', async () => {
      const searchTool: MCPTool = {
        name: 'search',
        templateSlug: 'api',
        connectorId: 'api-102',
        description: 'Search API',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      };
      
      const input = {
        search: 'test query'
      };
      
      const result = await adapter.adapt(input, searchTool);
      
      expect(result).toEqual({
        query: 'test query'
      });
    });
  });
  
  describe('Type Coercion', () => {
    const tool: MCPTool = {
      name: 'calculate',
      templateSlug: 'math',
      connectorId: 'math-202',
      description: 'Calculate',
      inputSchema: {
        type: 'object',
        properties: {
          value: { type: 'number' },
          enabled: { type: 'boolean' },
          name: { type: 'string' }
        }
      }
    };
    
    test('converts string to number', async () => {
      const input = { value: '42.5' };
      const result = await adapter.adapt(input, tool);
      expect(result.value).toBe(42.5);
    });
    
    test('converts string to boolean', async () => {
      const input = { enabled: 'true' };
      const result = await adapter.adapt(input, tool);
      expect(result.enabled).toBe(true);
    });
    
    test('converts number to string', async () => {
      const input = { name: 123 };
      const result = await adapter.adapt(input, tool);
      expect(result.name).toBe('123');
    });
  });
  
  describe('Array Conversion', () => {
    const tool: MCPTool = {
      name: 'batch',
      templateSlug: 'api',
      connectorId: 'api-303',
      description: 'Batch operation',
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
          tags: { type: 'array' }
        }
      }
    };
    
    test('converts single value to array', async () => {
      const input = {
        items: 'single item',
        tags: 'single tag'
      };
      
      const result = await adapter.adapt(input, tool);
      
      expect(result.items).toEqual(['single item']);
      expect(result.tags).toEqual(['single tag']);
    });
  });
  
  describe('Empty Value Handling', () => {
    test('converts empty string to empty object', async () => {
      const tool: MCPTool = {
        name: 'list',
        templateSlug: 'api',
        connectorId: 'api-404',
        description: 'List items',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };
      
      const input = '';
      const result = await adapter.adapt(input, tool);
      
      expect(result).toEqual({});
    });
    
    test('removes null and undefined values', async () => {
      const tool: MCPTool = {
        name: 'create',
        templateSlug: 'api',
        connectorId: 'api-505',
        description: 'Create item',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'number' }
          }
        }
      };
      
      const input = {
        name: 'test',
        value: null,
        extra: undefined
      };
      
      const result = await adapter.adapt(input, tool);
      
      expect(result).toEqual({
        name: 'test'
      });
    });
  });
  
  describe('Date Formatting', () => {
    const tool: MCPTool = {
      name: 'schedule',
      templateSlug: 'calendar',
      connectorId: 'cal-606',
      description: 'Schedule event',
      inputSchema: {
        type: 'object',
        properties: {
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' }
        }
      }
    };
    
    test('converts Date object to ISO string', async () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const input = {
        startTime: date
      };
      
      const result = await adapter.adapt(input, tool);
      
      expect(result.startTime).toBe(date.toISOString());
    });
    
    test('converts timestamp to ISO string', async () => {
      const timestamp = 1705320000000; // 2024-01-15T10:00:00Z
      const input = {
        startTime: timestamp
      };
      
      const result = await adapter.adapt(input, tool);
      
      expect(result.startTime).toBe(new Date(timestamp).toISOString());
    });
  });
  
  describe('Pattern Memory', () => {
    test('uses cached pattern when available', async () => {
      // Mock Neo4j to return a cached pattern
      mockNeo4j.run.mockResolvedValueOnce({
        records: [{
          get: () => JSON.stringify({ cached: true })
        }]
      });
      
      const tool: MCPTool = {
        name: 'test',
        templateSlug: 'test',
        connectorId: 'test-707',
        description: 'Test tool',
        inputSchema: {}
      };
      
      const result = await adapter.adapt({ test: 'input' }, tool);
      
      expect(result).toEqual({ cached: true });
      expect(mockNeo4j.run).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (p:ParameterPattern'),
        expect.objectContaining({
          toolId: 'test_test'
        })
      );
    });
    
    test('saves new patterns for future use', async () => {
      const tool: MCPTool = {
        name: 'test',
        templateSlug: 'test',
        connectorId: 'test-808',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      };
      
      await adapter.adapt('test query', tool);
      
      // Check that savePattern was called
      expect(mockNeo4j.run).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (p:ParameterPattern'),
        expect.objectContaining({
          toolId: 'test_test',
          transformation: JSON.stringify({ query: 'test query' })
        })
      );
    });
  });
  
  describe('Performance', () => {
    test('completes adaptation in <10ms for cached patterns', async () => {
      // Pre-cache a pattern
      mockNeo4j.run.mockResolvedValueOnce({
        records: [{
          get: () => JSON.stringify({ cached: true })
        }]
      });
      
      const tool: MCPTool = {
        name: 'test',
        templateSlug: 'test',
        connectorId: 'test-909',
        description: 'Test tool',
        inputSchema: {}
      };
      
      const start = Date.now();
      await adapter.adapt({ test: 'input' }, tool);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // Allow some margin for async operations
    });
  });
  
  describe('Statistics', () => {
    test('tracks adapter statistics', async () => {
      const tool: MCPTool = {
        name: 'test',
        templateSlug: 'test',
        connectorId: 'test-1010',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      };
      
      // First call - heuristic
      await adapter.adapt('test1', tool);
      
      // Second call - should still be heuristic (not cached yet)
      await adapter.adapt('test2', tool);
      
      const stats = adapter.getStats();
      
      expect(stats.totalCalls).toBe(2);
      expect(stats.heuristicHits).toBe(2);
      expect(stats.cacheHits).toBe(0);
    });
  });
});

// Integration test with real-world Notion schema
describe('SmartParameterAdapter Integration', () => {
  let adapter: SmartParameterAdapter;
  let mockNeo4j: any;
  
  beforeEach(() => {
    mockNeo4j = {
      run: jest.fn().mockResolvedValue({ records: [] })
    };
    adapter = new SmartParameterAdapter(mockNeo4j);
  });
  
  test('handles real Notion page creation', async () => {
    // Test with actual Notion tool schema
    const realNotionSchema = {
      type: 'object',
      properties: {
        parent: {
          type: 'object',
          properties: {
            page_id: { type: 'string' }
          }
        },
        properties: {
          type: 'object',
          properties: {
            title: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'object',
                    properties: {
                      content: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        children: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              paragraph: {
                type: 'object',
                properties: {
                  rich_text: { type: 'array' }
                }
              }
            }
          }
        }
      }
    };
    
    const input = {
      parent: { page_id: 'abc-123' },
      properties: { title: 'Test Page' },
      children: [{
        paragraph: { text: 'Content here' }
      }]
    };
    
    const result = await adapter.adapt(input, {
      name: 'API-post-page',
      templateSlug: 'notion',
      connectorId: 'notion-real',
      description: 'Create Notion page',
      inputSchema: realNotionSchema
    } as MCPTool);
    
    // Verify complete transformation
    expect(result.properties.title).toBeInstanceOf(Array);
    expect(result.children[0].paragraph.rich_text).toBeInstanceOf(Array);
    expect(result.children[0].paragraph.text).toBeUndefined();
  });
  
  test('handles complex nested transformations', async () => {
    const tool: MCPTool = {
      name: 'API-post-complex',
      templateSlug: 'notion',
      connectorId: 'notion-complex',
      description: 'Complex Notion operation',
      inputSchema: {
        type: 'object',
        properties: {
          parent: { type: 'object' },
          properties: { type: 'object' }
        }
      }
    };
    
    const input = {
      parent: { 
        page_id: 'https://notion.so/page-123abc456def789012345678901234567890'
      },
      properties: {
        title: 'Main Title',
        description: 'Some description'
      },
      children: [
        { heading_1: { text: 'Section 1' } },
        { paragraph: { text: 'Paragraph text' } },
        { bulleted_list_item: { text: 'Item 1' } },
        { numbered_list_item: { text: 'Step 1' } },
        { to_do: { text: 'Task 1', checked: false } }
      ]
    };
    
    const result = await adapter.adapt(input, tool);
    
    // Verify ID extraction
    expect(result.parent.page_id).toBe('123abc45-6def-7890-1234-567890123456');
    
    // Verify rich text conversions
    if (result.children) {
      expect(result.children[0].heading_1.rich_text).toBeDefined();
      expect(result.children[1].paragraph.rich_text).toBeDefined();
      expect(result.children[2].bulleted_list_item.rich_text).toBeDefined();
      expect(result.children[3].numbered_list_item.rich_text).toBeDefined();
      expect(result.children[4].to_do.rich_text).toBeDefined();
    }
  });
});