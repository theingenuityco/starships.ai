const core = require('@actions/core');
const github = require('@actions/github');
const DiscordThreadManager = require('../../scripts/discord-client');
const ThreadStateManager = require('../../scripts/state-manager');

async function run() {
  let discord = null;
  
  try {
    // Get inputs
    const discordToken = core.getInput('discord-token', { required: true });
    const guildId = core.getInput('guild-id', { required: true });
    const channelId = core.getInput('channel-id', { required: true });
    const autoInviteRoleId = core.getInput('auto-invite-role-id');
    const githubDiscordMap = JSON.parse(core.getInput('github-discord-map') || '{}');

    // Get GitHub context
    const context = github.context;
    const { eventName, payload } = context;
    
    // Determine PR number and details
    const prDetails = extractPRDetails(context);
    if (!prDetails) {
      console.log('No PR context found for this event');
      core.setOutput('action-taken', 'skipped');
      return;
    }

    const { prNumber, prTitle, prAuthor, prUrl, action } = prDetails;
    console.log(`Processing ${eventName} event for PR #${prNumber} (action: ${action})`);
    
    // Skip updates for closed PRs unless it's the closing event itself
    if (payload.pull_request && payload.pull_request.state === 'closed' && action !== 'closed' && action !== 'reopened') {
      console.log(`Skipping update for closed PR #${prNumber} (action: ${action})`);
      core.setOutput('action-taken', 'skipped - PR is closed');
      return;
    }

    // Initialize Discord client
    discord = new DiscordThreadManager(discordToken, guildId, channelId);
    try {
      await discord.initialize();
    } catch (error) {
      core.setFailed(`Failed to initialize Discord client: ${error.message}`);
      return;
    }

    // Initialize state manager
    const stateManager = new ThreadStateManager();

    // Determine if we need to create or update
    const shouldCreate = eventName === 'pull_request' && 
                        (action === 'opened' || action === 'reopened');

    if (shouldCreate) {
      // Create or reactivate thread
      const result = await createOrReactivateThread(
        discord, stateManager, prNumber, prTitle, prAuthor, prUrl, 
        autoInviteRoleId, githubDiscordMap, context
      );
      
      core.setOutput('thread-id', result.threadId);
      core.setOutput('thread-url', result.threadUrl);
      core.setOutput('action-taken', result.created ? 'created' : 'reactivated');
    } else {
      // Update existing thread
      const result = await updateThread(
        discord, stateManager, prNumber, eventName, action, context
      );
      
      if (result) {
        core.setOutput('thread-id', result.threadId);
        core.setOutput('thread-url', result.threadUrl);
        core.setOutput('action-taken', 'updated');
      } else {
        core.setOutput('action-taken', 'skipped');
      }
    }

    // Always disconnect client
    try {
      await discord.disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting Discord client:', disconnectError);
    }
    
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    console.error(error);
    
    // Try to disconnect if discord client exists
    if (typeof discord !== 'undefined' && discord) {
      try {
        await discord.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Discord client:', disconnectError);
      }
    }
  }
}

function extractPRDetails(context) {
  const { eventName, payload } = context;
  let prNumber, prTitle, prAuthor, prUrl, action;

  action = payload.action || eventName;

  // Direct PR events
  if (payload.pull_request) {
    prNumber = payload.pull_request.number;
    prTitle = payload.pull_request.title;
    prAuthor = payload.pull_request.user.login;
    prUrl = payload.pull_request.html_url;
  }
  // Issue comment on PR
  else if (payload.issue && payload.issue.pull_request) {
    prNumber = payload.issue.number;
    prTitle = payload.issue.title;
    prAuthor = payload.issue.user.login;
    prUrl = payload.issue.html_url;
  }
  // Review events
  else if (payload.review && payload.pull_request) {
    prNumber = payload.pull_request.number;
    prTitle = payload.pull_request.title;
    prAuthor = payload.pull_request.user.login;
    prUrl = payload.pull_request.html_url;
  }
  // Workflow run events
  else if (payload.workflow_run && payload.workflow_run.pull_requests?.length > 0) {
    const pr = payload.workflow_run.pull_requests[0];
    prNumber = pr.number;
    // We'll need to fetch full PR details for workflow runs
    return { prNumber, needsFetch: true, action };
  }
  // Check run/suite events
  else if ((payload.check_run || payload.check_suite) && 
           (payload.check_run?.pull_requests?.length > 0 || 
            payload.check_suite?.pull_requests?.length > 0)) {
    const prs = payload.check_run?.pull_requests || payload.check_suite?.pull_requests;
    prNumber = prs[0].number;
    return { prNumber, needsFetch: true, action };
  }
  else {
    return null;
  }

  return { prNumber, prTitle, prAuthor, prUrl, action };
}

async function createOrReactivateThread(discord, stateManager, prNumber, prTitle, prAuthor, prUrl, autoInviteRoleId, githubDiscordMap, context) {
  console.log(`Creating/reactivating Discord thread for PR #${prNumber}: ${prTitle}`);

  // Check if thread already exists
  let threadData = await stateManager.getThreadId(prNumber);
  
  if (!threadData) {
    // Try to find existing thread by name
    threadData = await discord.findThreadByName(prNumber);
  }

  if (threadData) {
    console.log(`Thread already exists for PR #${prNumber}: ${threadData.threadId}`);
    
    // Update thread with reactivation message
    await discord.updateThread(threadData.threadId, {
      embeds: [{
        title: '🔄 PR Reopened',
        description: 'This thread has been reactivated',
        color: 0x0366d6,
        fields: [
          { name: 'PR', value: `#${prNumber}`, inline: true },
          { name: 'Status', value: '💬 Open', inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    });

    return { ...threadData, created: false };
  }

  // Create new thread
  const result = await discord.createPrivateThread(
    prNumber,
    prTitle,
    prAuthor,
    prUrl
  );

  console.log(`Created new thread: ${result.threadId}`);

  // Save thread ID to state
  await stateManager.saveThreadId(prNumber, result.threadId, result.threadUrl);

  // Auto-invite role if specified
  if (autoInviteRoleId) {
    console.log(`Auto-inviting role ${autoInviteRoleId}`);
    await discord.inviteRole(result.threadId, autoInviteRoleId);
  }

  // Invite PR author if mapped
  if (githubDiscordMap[prAuthor]) {
    console.log(`Inviting PR author ${prAuthor}`);
    await discord.inviteMembers(result.threadId, [githubDiscordMap[prAuthor]]);
  }

  // Get PR reviewers from context and invite them
  if (context.payload.pull_request) {
    const reviewers = context.payload.pull_request.requested_reviewers || [];
    const discordIds = reviewers
      .map(reviewer => githubDiscordMap[reviewer.login])
      .filter(id => id);

    if (discordIds.length > 0) {
      console.log(`Inviting ${discordIds.length} reviewers`);
      await discord.inviteMembers(result.threadId, discordIds);
    }
  }

  return { ...result, created: true };
}

async function updateThread(discord, stateManager, prNumber, eventName, action, context) {
  console.log(`Updating Discord thread for PR #${prNumber} - Event: ${eventName}/${action}`);

  // Get existing thread ID
  let threadData = await stateManager.getThreadId(prNumber);
  
  if (!threadData) {
    // Try to find existing thread by name
    threadData = await discord.findThreadByName(prNumber);
    
    if (!threadData) {
      console.log(`No Discord thread found for PR #${prNumber}`);
      
      // Don't create new threads for closed PRs
      if (context.payload.pull_request && context.payload.pull_request.state === 'closed') {
        console.log(`PR #${prNumber} is closed, not creating new thread`);
        return null;
      }
      
      console.log(`Creating new thread for PR #${prNumber}`);
      
      // Fetch PR details to create thread
      const octokit = github.getOctokit(process.env.GITHUB_TOKEN || '');
      try {
        const { data: pr } = await octokit.rest.pulls.get({
          owner: context.repo.owner,
          repo: context.repo.repo,
          pull_number: prNumber
        });
        
        // Don't create thread if PR is closed (double-check from API)
        if (pr.state === 'closed') {
          console.log(`PR #${prNumber} is closed (verified via API), not creating new thread`);
          return null;
        }
        
        // Create the thread
        const result = await discord.createPrivateThread(
          prNumber,
          pr.title,
          pr.user.login,
          pr.html_url
        );
        
        // Save thread ID to state
        await stateManager.saveThreadId(prNumber, result.threadId, result.threadUrl);
        
        threadData = result;
        console.log(`Created new thread: ${result.threadId} for PR #${prNumber}`);
        
        // Send initial creation message
        await discord.updateThread(threadData.threadId, {
          embeds: [{
            title: '🔄 Thread Created',
            description: 'This thread was created for an existing PR due to activity',
            color: 0x0366d6,
            fields: [
              { name: 'PR', value: `#${prNumber}`, inline: true },
              { name: 'Triggered By', value: `${eventName}/${action}`, inline: true }
            ],
            timestamp: new Date().toISOString()
          }]
        });
      } catch (error) {
        console.error(`Failed to fetch PR details or create thread: ${error.message}`);
        return null;
      }
    }
  }

  // Prepare embed based on event
  const embed = createEventEmbed(eventName, action, context);
  
  if (embed) {
    // Add PR context footer
    embed.footer = {
      text: `PR #${prNumber} | GitHub Actions`,
      icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
    };

    // Send update to thread
    await discord.updateThread(threadData.threadId, { embeds: [embed] });

    // Update thread status for certain events
    const status = determineStatus(eventName, action, context);
    if (status) {
      const statusEmojis = {
        'open': '💬',
        'closed': '🔒',
        'merged': '✨',
        'draft': '📝'
      };
      
      const emoji = statusEmojis[status] || '🔵';
      await discord.updateThreadStatus(threadData.threadId, prNumber, status, emoji);
    }

    // Update state timestamp
    await stateManager.updateThreadActivity(prNumber, `${eventName}/${action}`);
    
    // Archive thread if PR is closed
    if (eventName === 'pull_request' && action === 'closed') {
      try {
        await discord.archiveThread(threadData.threadId, context.payload.pull_request.merged ? 'PR merged' : 'PR closed');
        console.log(`Archived thread for closed PR #${prNumber}`);
      } catch (error) {
        console.error(`Failed to archive thread: ${error.message}`);
      }
    }
  }

  return threadData;
}

function createEventEmbed(eventName, action, context) {
  const { payload } = context;
  let embed = {};

  switch (eventName) {
    case 'pull_request':
      embed = createPullRequestEmbed(action, payload);
      break;
    
    case 'pull_request_review':
      embed = createReviewEmbed(payload);
      break;
    
    case 'pull_request_review_comment':
    case 'issue_comment':
      embed = createCommentEmbed(action, payload);
      break;
    
    case 'workflow_run':
      embed = createWorkflowEmbed(payload);
      break;
    
    case 'check_run':
    case 'check_suite':
      embed = createCheckEmbed(eventName, payload);
      break;
    
    default:
      embed = {
        title: `📌 ${eventName}`,
        description: `Event: ${action || eventName}`,
        color: 0x0366d6,
        timestamp: new Date().toISOString()
      };
  }

  return embed;
}

function createPullRequestEmbed(action, payload) {
  const pr = payload.pull_request;
  const actionMap = {
    'synchronize': { title: '📦 New Commits', color: 0x0366d6 },
    'edited': { title: '✏️ PR Edited', color: 0x586069 },
    'labeled': { title: '🏷️ Label Added', color: 0xa2eeef },
    'unlabeled': { title: '🏷️ Label Removed', color: 0x959da5 },
    'assigned': { title: '👤 Assigned', color: 0x0366d6 },
    'unassigned': { title: '👤 Unassigned', color: 0x959da5 },
    'review_requested': { title: '👀 Review Requested', color: 0xffd33d },
    'review_request_removed': { title: '👀 Review Request Removed', color: 0x959da5 },
    'ready_for_review': { title: '✅ Ready for Review', color: 0x28a745 },
    'converted_to_draft': { title: '📝 Converted to Draft', color: 0x6a737d },
    'closed': { title: pr.merged ? '🎉 PR Merged' : '🔒 PR Closed', color: pr.merged ? 0x6f42c1 : 0xd73a49 },
    'locked': { title: '🔐 PR Locked', color: 0xd73a49 },
    'unlocked': { title: '🔓 PR Unlocked', color: 0x28a745 },
    'auto_merge_enabled': { title: '🤖 Auto-merge Enabled', color: 0x0366d6 },
    'auto_merge_disabled': { title: '🤖 Auto-merge Disabled', color: 0x959da5 }
  };

  const info = actionMap[action] || { title: `📌 PR ${action}`, color: 0x0366d6 };
  
  const embed = {
    title: info.title,
    description: pr.title || `Pull request ${action}`,
    color: info.color,
    fields: [],
    timestamp: new Date().toISOString()
  };

  // Add relevant fields based on action
  if (action === 'synchronize' && payload.before && payload.after) {
    embed.fields.push(
      { name: 'Commits', value: `${payload.before.substring(0, 7)}...${payload.after.substring(0, 7)}`, inline: true }
    );
  }
  
  if (action === 'labeled' || action === 'unlabeled') {
    embed.fields.push(
      { name: 'Label', value: payload.label?.name || 'Unknown', inline: true }
    );
  }

  if (action === 'assigned' || action === 'unassigned') {
    embed.fields.push(
      { name: 'Assignee', value: payload.assignee?.login || 'Unknown', inline: true }
    );
  }

  if (action === 'review_requested' || action === 'review_request_removed') {
    const reviewer = payload.requested_reviewer?.login || payload.requested_team?.name || 'Unknown';
    embed.fields.push(
      { name: 'Reviewer', value: reviewer, inline: true }
    );
  }

  if (action === 'closed') {
    if (pr.merged) {
      embed.fields.push(
        { name: 'Merged By', value: pr.merged_by?.login || 'Unknown', inline: true },
        { name: 'Merge Commit', value: `\`${pr.merge_commit_sha?.substring(0, 7) || 'unknown'}\``, inline: true }
      );
    } else {
      embed.fields.push(
        { name: 'Closed By', value: payload.sender?.login || 'Unknown', inline: true }
      );
    }
    
    // Add note about thread archival
    embed.footer = {
      text: 'This thread will be archived',
      icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
    };
  }

  return embed;
}

function createReviewEmbed(payload) {
  const review = payload.review;
  const reviewStates = {
    'approved': { emoji: '✅', color: 0x28a745 },
    'changes_requested': { emoji: '🔄', color: 0xffd33d },
    'commented': { emoji: '💭', color: 0x586069 },
    'dismissed': { emoji: '❌', color: 0xd73a49 }
  };
  
  const reviewState = review.state?.toLowerCase() || 'commented';
  const reviewInfo = reviewStates[reviewState] || reviewStates.commented;
  
  return {
    title: `${reviewInfo.emoji} PR Review: ${reviewState.replace('_', ' ').toUpperCase()}`,
    description: review.body || 'Review submitted',
    color: reviewInfo.color,
    author: {
      name: review.user?.login || 'Unknown',
      icon_url: review.user?.avatar_url || `https://github.com/${review.user?.login}.png`
    },
    fields: [
      { name: 'Reviewer', value: review.user?.login || 'Unknown', inline: true },
      { name: 'State', value: reviewState.replace('_', ' '), inline: true }
    ],
    url: review.html_url,
    timestamp: new Date().toISOString()
  };
}

function createCommentEmbed(action, payload) {
  const comment = payload.comment;
  const actionEmojis = {
    'created': '💬',
    'edited': '✏️',
    'deleted': '🗑️'
  };
  
  return {
    title: `${actionEmojis[action] || '💬'} Comment ${action}`,
    description: comment?.body || 'Comment activity',
    color: 0x586069,
    author: {
      name: comment?.user?.login || payload.sender?.login || 'Unknown',
      icon_url: comment?.user?.avatar_url || `https://github.com/${comment?.user?.login}.png`
    },
    fields: [
      { name: 'Author', value: comment?.user?.login || payload.sender?.login || 'Unknown', inline: true },
      { name: 'Action', value: action, inline: true }
    ],
    url: comment?.html_url,
    timestamp: new Date().toISOString()
  };
}

function createWorkflowEmbed(payload) {
  const workflow = payload.workflow_run;
  const statusMap = {
    'queued': { emoji: '⏳', color: 0xdbab09 },
    'in_progress': { emoji: '🔄', color: 0x0366d6 },
    'completed': {
      'success': { emoji: '✅', color: 0x28a745 },
      'failure': { emoji: '❌', color: 0xd73a49 },
      'cancelled': { emoji: '⚠️', color: 0x959da5 },
      'skipped': { emoji: '⏭️', color: 0x586069 },
      'neutral': { emoji: '⚪', color: 0x959da5 }
    }
  };

  let statusInfo;
  if (workflow.status === 'completed' && workflow.conclusion) {
    statusInfo = statusMap.completed[workflow.conclusion] || statusMap.completed.neutral;
  } else {
    statusInfo = statusMap[workflow.status] || { emoji: '📊', color: 0x0366d6 };
  }

  const embed = {
    title: `${statusInfo.emoji} Workflow: ${workflow.name}`,
    description: `Status: ${workflow.status}${workflow.conclusion ? ` (${workflow.conclusion})` : ''}`,
    color: statusInfo.color,
    fields: [
      { name: 'Workflow', value: workflow.name, inline: true },
      { name: 'Status', value: workflow.status, inline: true }
    ],
    url: workflow.html_url,
    timestamp: new Date().toISOString()
  };

  if (workflow.conclusion) {
    embed.fields.push({ name: 'Conclusion', value: workflow.conclusion, inline: true });
  }

  // Calculate duration if completed
  if (workflow.run_started_at && workflow.updated_at && workflow.status === 'completed') {
    const start = new Date(workflow.run_started_at);
    const end = new Date(workflow.updated_at);
    const duration = Math.floor((end - start) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    embed.fields.push({ name: 'Duration', value: `${minutes}m ${seconds}s`, inline: true });
  }

  return embed;
}

function createCheckEmbed(eventName, payload) {
  const check = payload.check_run || payload.check_suite;
  const checkName = check.name || check.app?.name || 'Check';
  
  const statusMap = {
    'queued': { emoji: '⏳', color: 0xdbab09 },
    'in_progress': { emoji: '🔄', color: 0x0366d6 },
    'completed': {
      'success': { emoji: '✅', color: 0x28a745 },
      'failure': { emoji: '❌', color: 0xd73a49 },
      'cancelled': { emoji: '⚠️', color: 0x959da5 },
      'skipped': { emoji: '⏭️', color: 0x586069 },
      'neutral': { emoji: '⚪', color: 0x959da5 }
    }
  };

  let statusInfo;
  if (check.status === 'completed' && check.conclusion) {
    statusInfo = statusMap.completed[check.conclusion] || statusMap.completed.neutral;
  } else {
    statusInfo = statusMap[check.status] || { emoji: '📊', color: 0x0366d6 };
  }

  return {
    title: `${statusInfo.emoji} ${eventName === 'check_suite' ? 'Check Suite' : 'Check'}: ${checkName}`,
    description: `Status: ${check.status}${check.conclusion ? ` (${check.conclusion})` : ''}`,
    color: statusInfo.color,
    fields: [
      { name: 'Check', value: checkName, inline: true },
      { name: 'Status', value: check.status, inline: true },
      ...(check.conclusion ? [{ name: 'Conclusion', value: check.conclusion, inline: true }] : [])
    ],
    url: check.html_url || check.url,
    timestamp: new Date().toISOString()
  };
}

function determineStatus(eventName, action, context) {
  if (eventName === 'pull_request') {
    const pr = context.payload.pull_request;
    if (pr.merged) return 'merged';
    if (pr.state === 'closed') return 'closed';
    if (pr.draft) return 'draft';
    return 'open';
  }
  return null;
}

run();