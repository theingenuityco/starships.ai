const fs = require('fs').promises;
const path = require('path');
const core = require('@actions/core');
const artifact = require('@actions/artifact');

class ThreadStateManager {
  constructor() {
    this.stateFile = 'thread-state.json';
    // Use the new artifact client API
    this.artifactClient = new artifact.DefaultArtifactClient();
    this.artifactName = 'discord-thread-state';
  }

  /**
   * Save thread ID using GitHub Actions artifacts
   */
  async saveThreadId(prNumber, threadId, threadUrl) {
    try {
      const state = await this.loadState();
      
      state[prNumber] = {
        threadId,
        threadUrl,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      // Write to temporary file
      const tempDir = process.env.RUNNER_TEMP || '/tmp';
      const filePath = path.join(tempDir, this.stateFile);
      await fs.writeFile(filePath, JSON.stringify(state, null, 2));

      // Upload as artifact
      const uploadResponse = await this.artifactClient.uploadArtifact(
        this.artifactName,
        [filePath],
        tempDir,
        {
          continueOnError: false,
          retentionDays: 90
        }
      );

      console.log(`State saved for PR #${prNumber}: ${threadId}`);
      return uploadResponse;
    } catch (error) {
      console.error('Error saving state:', error);
      // Fallback: Save to GitHub Actions output
      core.setOutput(`thread_id_${prNumber}`, threadId);
      core.setOutput(`thread_url_${prNumber}`, threadUrl);
      throw error;
    }
  }

  /**
   * Load thread ID from artifacts
   */
  async getThreadId(prNumber) {
    try {
      const state = await this.loadState();
      const threadData = state[prNumber];
      
      if (threadData) {
        console.log(`Found thread for PR #${prNumber}: ${threadData.threadId}`);
        return threadData;
      }
      
      console.log(`No thread found for PR #${prNumber}`);
      return null;
    } catch (error) {
      console.error('Error loading thread ID:', error);
      return null;
    }
  }

  /**
   * Load state from artifacts
   */
  async loadState() {
    try {
      // Download artifact
      const tempDir = process.env.RUNNER_TEMP || '/tmp';
      const downloadResponse = await this.artifactClient.downloadArtifact(
        this.artifactName,
        tempDir
      );

      if (downloadResponse.downloadPath) {
        const filePath = path.join(downloadResponse.downloadPath, this.stateFile);
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.log('No existing state found, creating new state');
    }

    return {};
  }

  /**
   * Delete thread ID when PR is closed
   */
  async deleteThreadId(prNumber) {
    try {
      const state = await this.loadState();
      
      if (state[prNumber]) {
        delete state[prNumber];
        
        // Write updated state
        const tempDir = process.env.RUNNER_TEMP || '/tmp';
        const filePath = path.join(tempDir, this.stateFile);
        await fs.writeFile(filePath, JSON.stringify(state, null, 2));

        // Upload updated artifact
        await this.artifactClient.uploadArtifact(
          this.artifactName,
          [filePath],
          tempDir,
          {
            continueOnError: false,
            retentionDays: 90
          }
        );

        console.log(`Deleted thread state for PR #${prNumber}`);
      }
    } catch (error) {
      console.error('Error deleting thread ID:', error);
    }
  }

  /**
   * Alternative: Use GitHub Action Cache
   */
  async saveThreadIdToCache(prNumber, threadId, threadUrl) {
    const cacheKey = `discord-thread-pr-${prNumber}`;
    const data = {
      threadId,
      threadUrl,
      timestamp: new Date().toISOString()
    };

    // GitHub Actions cache is handled via workflow, just output the data
    core.setOutput('thread_cache_key', cacheKey);
    core.setOutput('thread_cache_data', JSON.stringify(data));
    
    return cacheKey;
  }

  /**
   * Update thread activity timestamp
   */
  async updateThreadActivity(prNumber, eventType) {
    try {
      const state = await this.loadState();
      
      if (state[prNumber]) {
        state[prNumber].lastUpdated = new Date().toISOString();
        state[prNumber].lastEvent = eventType;
        
        // Write updated state
        const tempDir = process.env.RUNNER_TEMP || '/tmp';
        const filePath = path.join(tempDir, this.stateFile);
        await fs.writeFile(filePath, JSON.stringify(state, null, 2));

        // Upload updated artifact
        await this.artifactClient.uploadArtifact(
          this.artifactName,
          [filePath],
          tempDir,
          {
            continueOnError: false,
            retentionDays: 90
          }
        );

        console.log(`Updated activity for PR #${prNumber}: ${eventType}`);
      }
    } catch (error) {
      console.error('Error updating thread activity:', error);
    }
  }

  /**
   * Alternative: Use PR comment for storage (visible but reliable)
   */
  async saveThreadIdToComment(octokit, context, prNumber, threadId, threadUrl) {
    const commentMarker = '<!-- discord-thread-id -->';
    const commentBody = `${commentMarker}
<!-- 
Discord Thread ID: ${threadId}
Discord Thread URL: ${threadUrl}
Created: ${new Date().toISOString()}
-->

<details>
<summary>📌 Discord Thread</summary>

A private Discord thread has been created for this PR.

Thread ID: \`${threadId}\`
[Open in Discord](${threadUrl})

</details>`;

    try {
      // Check if comment already exists
      const { data: comments } = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber
      });

      const existingComment = comments.find(comment => 
        comment.body.includes(commentMarker)
      );

      if (existingComment) {
        // Update existing comment
        await octokit.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existingComment.id,
          body: commentBody
        });
      } else {
        // Create new comment
        await octokit.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: commentBody
        });
      }

      console.log(`Thread ID saved to PR comment for PR #${prNumber}`);
      return true;
    } catch (error) {
      console.error('Error saving to PR comment:', error);
      throw error;
    }
  }

  /**
   * Get thread ID from PR comment
   */
  async getThreadIdFromComment(octokit, context, prNumber) {
    try {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber
      });

      const threadComment = comments.find(comment => 
        comment.body.includes('<!-- discord-thread-id -->')
      );

      if (threadComment) {
        const threadIdMatch = threadComment.body.match(/Discord Thread ID: (\d+)/);
        const threadUrlMatch = threadComment.body.match(/Discord Thread URL: (https:\/\/[^\s]+)/);
        
        if (threadIdMatch && threadUrlMatch) {
          return {
            threadId: threadIdMatch[1],
            threadUrl: threadUrlMatch[1]
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting thread ID from comment:', error);
      return null;
    }
  }

  /**
   * Clean up old thread states (maintenance)
   */
  async cleanupOldStates(daysOld = 30) {
    try {
      const state = await this.loadState();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let cleaned = 0;
      for (const [prNumber, data] of Object.entries(state)) {
        if (new Date(data.lastUpdated) < cutoffDate) {
          delete state[prNumber];
          cleaned++;
        }
      }

      if (cleaned > 0) {
        // Save cleaned state
        const tempDir = process.env.RUNNER_TEMP || '/tmp';
        const filePath = path.join(tempDir, this.stateFile);
        await fs.writeFile(filePath, JSON.stringify(state, null, 2));

        await this.artifactClient.uploadArtifact(
          this.artifactName,
          [filePath],
          tempDir,
          {
            continueOnError: false,
            retentionDays: 90
          }
        );

        console.log(`Cleaned up ${cleaned} old thread states`);
      }

      return cleaned;
    } catch (error) {
      console.error('Error cleaning up old states:', error);
      return 0;
    }
  }
}

module.exports = ThreadStateManager;