import { MCPToolConfig } from '@starships/protocol';
import { MCPTool } from '@starships/models';

export class ToolRegistry {
  private userTools: Map<string, MCPTool[]> = new Map(); // userId -> tools[]
  private toolExecutors: Map<string, ToolExecutor> = new Map(); // toolName -> executor
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Register built-in tools
      await this.registerBuiltInTools();
      
      this.initialized = true;
      console.log('✅ Tool registry initialized with built-in tools');
    } catch (error) {
      console.error('❌ Failed to initialize tool registry:', error);
      throw error;
    }
  }

  async registerUserTools(userId: string, toolConfigs: MCPToolConfig[]): Promise<void> {
    try {
      const tools: MCPTool[] = [];

      for (const config of toolConfigs) {
        const tool: MCPTool = {
          id: `${userId}-${config.name}-${Date.now()}`,
          serverId: userId, // Using userId as serverId for simplicity
          name: config.name,
          description: config.description,
          parameters: config.parameters,
          permissions: config.permissions,
          category: config.category,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        tools.push(tool);

        // Register tool executor if not already registered
        if (!this.toolExecutors.has(config.name)) {
          const executor = this.createToolExecutor(config);
          this.toolExecutors.set(config.name, executor);
        }
      }

      this.userTools.set(userId, tools);
      console.log(`✅ Registered ${tools.length} tools for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to register tools for user ${userId}:`, error);
      throw error;
    }
  }

  async getUserTools(userId: string): Promise<MCPTool[]> {
    return this.userTools.get(userId) || [];
  }

  async getToolExecutor(toolName: string): Promise<ToolExecutor | null> {
    return this.toolExecutors.get(toolName) || null;
  }

  async cleanup(): Promise<void> {
    this.userTools.clear();
    this.toolExecutors.clear();
    this.initialized = false;
    console.log('✅ Tool registry cleaned up');
  }

  private async registerBuiltInTools(): Promise<void> {
    // Register common built-in tools
    const builtInTools = [
      {
        name: 'web_scraper',
        description: 'Scrape content from web pages',
        parameters: {
          url: { type: 'string', required: true },
          selector: { type: 'string', required: false },
          timeout: { type: 'number', required: false, default: 30000 }
        },
        permissions: ['web_access'],
        category: 'data' as const
      },
      {
        name: 'file_reader',
        description: 'Read and process files',
        parameters: {
          file_path: { type: 'string', required: true },
          encoding: { type: 'string', required: false, default: 'utf-8' }
        },
        permissions: ['file_access'],
        category: 'system' as const
      },
      {
        name: 'data_analyzer',
        description: 'Analyze structured data',
        parameters: {
          data: { type: 'object', required: true },
          analysis_type: { type: 'string', required: true }
        },
        permissions: ['data_processing'],
        category: 'analysis' as const
      },
      {
        name: 'email_sender',
        description: 'Send emails via SMTP',
        parameters: {
          to: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          body: { type: 'string', required: true },
          smtp_host: { type: 'string', required: true },
          smtp_port: { type: 'number', required: false, default: 587 },
          username: { type: 'string', required: true },
          password: { type: 'string', required: true }
        },
        permissions: ['email_access'],
        category: 'communication' as const
      }
    ];

    for (const toolConfig of builtInTools) {
      const executor = this.createToolExecutor(toolConfig);
      this.toolExecutors.set(toolConfig.name, executor);
    }

    console.log(`✅ Registered ${builtInTools.length} built-in tools`);
  }

  private createToolExecutor(config: MCPToolConfig): ToolExecutor {
    return new ToolExecutor(config.name, config.description, config.parameters);
  }
}

// Tool executor interface and implementation
export interface ToolExecutorResult {
  success: boolean;
  result?: any;
  error?: string;
  logs?: string[];
}

export class ToolExecutor {
  constructor(
    public name: string,
    public description: string,
    public parameters: Record<string, any>
  ) {}

  async execute(parameters: Record<string, any>): Promise<ToolExecutorResult> {
    try {
      // This is a simplified implementation
      // In practice, each tool would have its own specific execution logic
      
      switch (this.name) {
        case 'web_scraper':
          return await this.executeWebScraper(parameters);
        case 'file_reader':
          return await this.executeFileReader(parameters);
        case 'data_analyzer':
          return await this.executeDataAnalyzer(parameters);
        case 'email_sender':
          return await this.executeEmailSender(parameters);
        default:
          return {
            success: false,
            error: `Unknown tool: ${this.name}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        logs: [`Tool execution failed: ${error}`]
      };
    }
  }

  private async executeWebScraper(params: Record<string, any>): Promise<ToolExecutorResult> {
    // Placeholder implementation - would use actual web scraping library
    return {
      success: true,
      result: {
        url: params.url,
        content: `Scraped content from ${params.url}`,
        timestamp: new Date().toISOString()
      },
      logs: [`Scraped ${params.url}`]
    };
  }

  private async executeFileReader(params: Record<string, any>): Promise<ToolExecutorResult> {
    // Placeholder implementation - would use actual file system operations
    return {
      success: true,
      result: {
        file_path: params.file_path,
        content: `File content from ${params.file_path}`,
        size: 1024,
        encoding: params.encoding || 'utf-8'
      },
      logs: [`Read file ${params.file_path}`]
    };
  }

  private async executeDataAnalyzer(params: Record<string, any>): Promise<ToolExecutorResult> {
    // Placeholder implementation - would use actual data analysis libraries
    return {
      success: true,
      result: {
        analysis_type: params.analysis_type,
        summary: 'Data analysis completed',
        insights: ['Insight 1', 'Insight 2'],
        timestamp: new Date().toISOString()
      },
      logs: [`Analyzed data with ${params.analysis_type}`]
    };
  }

  private async executeEmailSender(params: Record<string, any>): Promise<ToolExecutorResult> {
    // Placeholder implementation - would use actual email sending library
    return {
      success: true,
      result: {
        to: params.to,
        subject: params.subject,
        message_id: `msg-${Date.now()}`,
        sent_at: new Date().toISOString()
      },
      logs: [`Email sent to ${params.to}`]
    };
  }
}