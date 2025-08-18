import { DynamicTool } from '@langchain/core/tools';
import { Octokit } from '@octokit/rest';

export class GitHubTool {
  private octokit: Octokit;
  private defaultRepo?: { owner: string; repo: string };

  constructor(apiKey: string, defaultRepo?: string) {
    this.octokit = new Octokit({ auth: apiKey });
    
    if (defaultRepo) {
      const [owner, repo] = defaultRepo.split('/');
      this.defaultRepo = { owner, repo };
    }
  }

  async saveFile(options: {
    title: string;
    content: string;
    path?: string;
    repo?: string;
    branch?: string;
    commitMessage?: string;
  }) {
    const [owner, repo] = options.repo?.split('/') || 
                          [this.defaultRepo?.owner, this.defaultRepo?.repo];
    
    if (!owner || !repo) {
      throw new Error('Repository not specified');
    }

    const path = options.path || `outputs/${Date.now()}-${options.title.toLowerCase().replace(/\s+/g, '-')}.md`;
    const branch = options.branch || 'main';
    
    // Check if file exists
    let sha: string | undefined;
    try {
      const existing = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref: branch
      });
      
      if (!Array.isArray(existing.data) && 'sha' in existing.data) {
        sha = existing.data.sha;
      }
    } catch (error) {
      // File doesn't exist, which is fine
    }

    // Create or update file
    const response = await this.octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: options.commitMessage || `Add file: ${options.title}`,
      content: Buffer.from(options.content).toString('base64'),
      branch,
      sha
    });

    return response.data;
  }

  async createWikiPage(options: {
    title: string;
    content: string;
    repo?: string;
  }) {
    const [owner, repo] = options.repo?.split('/') || 
                          [this.defaultRepo?.owner, this.defaultRepo?.repo];
    
    if (!owner || !repo) {
      throw new Error('Repository not specified');
    }

    // GitHub Wiki operations require git operations
    // For now, we'll create a wiki-style page in the repo
    return this.saveFile({
      ...options,
      path: `wiki/${options.title.toLowerCase().replace(/\s+/g, '-')}.md`
    });
  }

  async createIssue(options: {
    title: string;
    body: string;
    labels?: string[];
    repo?: string;
  }) {
    const [owner, repo] = options.repo?.split('/') || 
                          [this.defaultRepo?.owner, this.defaultRepo?.repo];
    
    if (!owner || !repo) {
      throw new Error('Repository not specified');
    }

    const response = await this.octokit.issues.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      labels: options.labels
    });

    return response.data;
  }

  toDynamicTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_storage',
      description: 'Interact with GitHub - save files, create wikis, manage issues and pull requests',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          
          switch (params.action) {
            case 'save_file':
              return JSON.stringify(await this.saveFile(params));
            
            case 'create_wiki':
              return JSON.stringify(await this.createWikiPage(params));
            
            case 'create_issue':
              return JSON.stringify(await this.createIssue(params));
            
            default:
              // Default to saving file
              return JSON.stringify(await this.saveFile({
                title: params.title || 'Untitled',
                content: params.content || input
              }));
          }
        } catch (error) {
          // Fallback to simple text save
          return JSON.stringify(await this.saveFile({
            title: 'Output',
            content: input
          }));
        }
      }
    });
  }
}