import { DynamicTool } from '@langchain/core/tools';
import { Octokit } from '@octokit/rest';
import { z } from 'zod';

/**
 * Create GitHub tools using Octokit
 * Similar to the Python langchain GitHub toolkit
 */
export class GitHubTools {
  private octokit: Octokit;
  private defaultOwner?: string;
  private defaultRepo?: string;
  private authenticatedUser?: string;

  constructor(apiKey: string, defaultOwner?: string, defaultRepo?: string) {
    this.octokit = new Octokit({
      auth: apiKey
    });
    this.defaultOwner = defaultOwner;
    this.defaultRepo = defaultRepo;
    
    // Fetch authenticated user info
    this.initializeUser();
  }

  /**
   * Initialize authenticated user information
   */
  private async initializeUser() {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      this.authenticatedUser = data.login;
      console.log(`[GitHubTools] Authenticated as user: ${this.authenticatedUser}`);
    } catch (error) {
      console.error('[GitHubTools] Failed to get authenticated user:', error);
    }
  }

  /**
   * Parse owner and repo from a string like "owner/repo" or use defaults
   */
  private parseRepo(repoString?: string): { owner: string; repo: string } {
    if (repoString && repoString.includes('/')) {
      const [owner, repo] = repoString.split('/');
      return { owner, repo };
    }
    
    if (!this.defaultOwner || !this.defaultRepo) {
      throw new Error('Repository must be specified as "owner/repo" or defaults must be set');
    }
    
    return { owner: this.defaultOwner, repo: this.defaultRepo };
  }

  /**
   * Get all available GitHub tools
   */
  getTools(): DynamicTool[] {
    return [
      this.getMyInfoTool(),
      this.listMyReposTool(),
      this.getRepoInfoTool(),
      this.listIssuesTool(),
      this.getIssueTool(),
      this.createIssueTool(),
      this.updateIssueTool(),
      this.listPullRequestsTool(),
      this.getPullRequestTool(),
      this.createPullRequestTool(),
      this.listBranchesTool(),
      this.getFileTool(),
      this.searchCodeTool(),
      this.listRepoContentTool()
    ];
  }

  /**
   * Tool to get authenticated user information
   */
  private getMyInfoTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_my_info',
      description: 'Get the GitHub username and profile information of the authenticated user. Use this to find out "what is my GitHub username" or "who am I on GitHub". No input required.',
      func: async (input: string) => {
        try {
          const { data } = await this.octokit.users.getAuthenticated();
          
          return JSON.stringify({
            username: data.login,
            name: data.name,
            email: data.email,
            bio: data.bio,
            company: data.company,
            location: data.location,
            public_repos: data.public_repos,
            followers: data.followers,
            following: data.following,
            created_at: data.created_at,
            html_url: data.html_url
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to list authenticated user's repositories
   */
  private listMyReposTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_list_my_repos',
      description: 'List all GitHub repositories owned by the authenticated user. Use this when asked to "show my repositories", "list my repos", or "what repos do I have". Input is optional - can be empty string or JSON with optional keys: visibility ("all", "public", "private"), sort ("created", "updated", "pushed", "full_name"), limit (number).',
      func: async (input: string | any) => {
        try {
          let params: any = {};
          
          // Handle different input types
          if (input) {
            if (typeof input === 'string' && input.trim && input.trim()) {
              try {
                params = JSON.parse(input);
              } catch {
                // If not JSON, treat as plain text and ignore
                params = {};
              }
            } else if (typeof input === 'object') {
              params = input;
            }
          }
          
          // Build API parameters - don't use 'type' with 'visibility'
          const apiParams: any = {
            sort: params.sort || 'updated',
            per_page: params.limit || 30
          };
          
          // Only add visibility if specified (don't mix with type)
          if (params.visibility) {
            apiParams.visibility = params.visibility;
          } else {
            // Use type only when visibility is not specified
            apiParams.type = 'owner';
          }
          
          const { data } = await this.octokit.repos.listForAuthenticatedUser(apiParams);
          
          const repos = data.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            private: repo.private,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            open_issues: repo.open_issues_count,
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            pushed_at: repo.pushed_at,
            html_url: repo.html_url,
            default_branch: repo.default_branch
          }));
          
          return JSON.stringify({
            count: repos.length,
            repositories: repos
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to get repository information
   */
  private getRepoInfoTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_get_repo',
      description: 'Get information about a GitHub repository. Input should be a repository name like "owner/repo".',
      func: async (input: string) => {
        try {
          const { owner, repo } = this.parseRepo(input);
          const { data } = await this.octokit.repos.get({ owner, repo });
          
          return JSON.stringify({
            name: data.name,
            full_name: data.full_name,
            description: data.description,
            stars: data.stargazers_count,
            forks: data.forks_count,
            open_issues: data.open_issues_count,
            language: data.language,
            default_branch: data.default_branch,
            created_at: data.created_at,
            updated_at: data.updated_at,
            html_url: data.html_url
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to list issues in a repository
   */
  private listIssuesTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_list_issues',
      description: 'List issues in a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), state (optional: "open", "closed", "all"), labels (optional: comma-separated), limit (optional: number).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.issues.listForRepo({
            owner,
            repo,
            state: params.state || 'open',
            labels: params.labels,
            per_page: params.limit || 10
          });
          
          const issues = data.map(issue => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            author: issue.user?.login,
            created_at: issue.created_at,
            labels: issue.labels.map((l: any) => typeof l === 'string' ? l : l.name),
            html_url: issue.html_url
          }));
          
          return JSON.stringify(issues, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to get a specific issue
   */
  private getIssueTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_get_issue',
      description: 'Get details about a specific GitHub issue. Input should be JSON with keys: repo (optional, format: "owner/repo"), issue_number (required).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.issues.get({
            owner,
            repo,
            issue_number: params.issue_number
          });
          
          return JSON.stringify({
            number: data.number,
            title: data.title,
            body: data.body,
            state: data.state,
            author: data.user?.login,
            assignees: data.assignees?.map(a => a.login),
            labels: data.labels.map((l: any) => typeof l === 'string' ? l : l.name),
            created_at: data.created_at,
            updated_at: data.updated_at,
            comments: data.comments,
            html_url: data.html_url
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to create a new issue
   */
  private createIssueTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_create_issue',
      description: 'Create a new issue in a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), title (required), body (optional), labels (optional: array of strings), assignees (optional: array of usernames).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.issues.create({
            owner,
            repo,
            title: params.title,
            body: params.body,
            labels: params.labels,
            assignees: params.assignees
          });
          
          return JSON.stringify({
            number: data.number,
            title: data.title,
            state: data.state,
            html_url: data.html_url,
            created_at: data.created_at
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to update an existing issue
   */
  private updateIssueTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_update_issue',
      description: 'Update an existing GitHub issue. Input should be JSON with keys: repo (optional, format: "owner/repo"), issue_number (required), title (optional), body (optional), state (optional: "open" or "closed"), labels (optional), assignees (optional).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.issues.update({
            owner,
            repo,
            issue_number: params.issue_number,
            title: params.title,
            body: params.body,
            state: params.state,
            labels: params.labels,
            assignees: params.assignees
          });
          
          return JSON.stringify({
            number: data.number,
            title: data.title,
            state: data.state,
            html_url: data.html_url,
            updated_at: data.updated_at
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to list pull requests
   */
  private listPullRequestsTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_list_prs',
      description: 'List pull requests in a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), state (optional: "open", "closed", "all"), limit (optional: number).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.pulls.list({
            owner,
            repo,
            state: params.state || 'open',
            per_page: params.limit || 10
          });
          
          const prs = data.map(pr => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            author: pr.user?.login,
            created_at: pr.created_at,
            draft: pr.draft,
            html_url: pr.html_url,
            head: pr.head.ref,
            base: pr.base.ref
          }));
          
          return JSON.stringify(prs, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to get a specific pull request
   */
  private getPullRequestTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_get_pr',
      description: 'Get details about a specific GitHub pull request. Input should be JSON with keys: repo (optional, format: "owner/repo"), pr_number (required).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.pulls.get({
            owner,
            repo,
            pull_number: params.pr_number
          });
          
          return JSON.stringify({
            number: data.number,
            title: data.title,
            body: data.body,
            state: data.state,
            author: data.user?.login,
            created_at: data.created_at,
            updated_at: data.updated_at,
            merged: data.merged,
            merged_at: data.merged_at,
            draft: data.draft,
            html_url: data.html_url,
            head: {
              ref: data.head.ref,
              sha: data.head.sha
            },
            base: {
              ref: data.base.ref,
              sha: data.base.sha
            },
            additions: data.additions,
            deletions: data.deletions,
            changed_files: data.changed_files
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to create a pull request
   */
  private createPullRequestTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_create_pr',
      description: 'Create a new pull request in a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), title (required), body (optional), head (required: branch name), base (required: branch name), draft (optional: boolean).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.pulls.create({
            owner,
            repo,
            title: params.title,
            body: params.body,
            head: params.head,
            base: params.base,
            draft: params.draft
          });
          
          return JSON.stringify({
            number: data.number,
            title: data.title,
            state: data.state,
            html_url: data.html_url,
            created_at: data.created_at,
            draft: data.draft
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to list branches
   */
  private listBranchesTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_list_branches',
      description: 'List branches in a GitHub repository. Input should be a repository name like "owner/repo".',
      func: async (input: string) => {
        try {
          const { owner, repo } = this.parseRepo(input);
          
          const { data } = await this.octokit.repos.listBranches({
            owner,
            repo,
            per_page: 100
          });
          
          const branches = data.map(branch => ({
            name: branch.name,
            protected: branch.protected,
            commit_sha: branch.commit.sha
          }));
          
          return JSON.stringify(branches, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to get file content
   */
  private getFileTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_get_file',
      description: 'Get the content of a file from a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), path (required: file path), ref (optional: branch/tag/commit).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: params.path,
            ref: params.ref
          });
          
          if ('content' in data && data.type === 'file') {
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            return JSON.stringify({
              path: data.path,
              size: data.size,
              sha: data.sha,
              content: content
            }, null, 2);
          } else {
            return 'Error: Path is not a file';
          }
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to search code in repositories
   */
  private searchCodeTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_search_code',
      description: 'Search for code in GitHub repositories. Input should be JSON with keys: query (required: search query), repo (optional: limit to specific repo "owner/repo"), limit (optional: number of results).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          let q = params.query;
          
          if (params.repo) {
            q = `${q} repo:${params.repo}`;
          }
          
          const { data } = await this.octokit.search.code({
            q,
            per_page: params.limit || 10
          });
          
          const results = data.items.map(item => ({
            name: item.name,
            path: item.path,
            repository: item.repository.full_name,
            html_url: item.html_url,
            score: item.score
          }));
          
          return JSON.stringify({
            total_count: data.total_count,
            items: results
          }, null, 2);
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }

  /**
   * Tool to list repository contents (files and directories)
   */
  private listRepoContentTool(): DynamicTool {
    return new DynamicTool({
      name: 'github_list_contents',
      description: 'List contents of a directory in a GitHub repository. Input should be JSON with keys: repo (optional, format: "owner/repo"), path (optional: directory path, defaults to root), ref (optional: branch/tag/commit).',
      func: async (input: string) => {
        try {
          const params = JSON.parse(input);
          const { owner, repo } = this.parseRepo(params.repo);
          
          const { data } = await this.octokit.repos.getContent({
            owner,
            repo,
            path: params.path || '',
            ref: params.ref
          });
          
          if (Array.isArray(data)) {
            const contents = data.map(item => ({
              name: item.name,
              path: item.path,
              type: item.type,
              size: item.size,
              sha: item.sha
            }));
            
            return JSON.stringify(contents, null, 2);
          } else {
            return 'Error: Path is not a directory';
          }
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      }
    });
  }
}