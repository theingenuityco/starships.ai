const { Client, GatewayIntentBits, ChannelType, ThreadAutoArchiveDuration } = require('discord.js');

class DiscordThreadManager {
  constructor(token, guildId, channelId) {
    // Store token but never log it
    this.token = token;
    this.guildId = guildId;
    this.channelId = channelId;
    this.client = null;
    
    // Validate inputs without exposing sensitive data
    if (!token) throw new Error('Discord token is required');
    if (!guildId) throw new Error('Guild ID is required');
    if (!channelId) throw new Error('Channel ID is required');
  }

  async initialize() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ]
    });

    // Set up ready listener BEFORE login
    let isReady = false;
    const readyPromise = new Promise((resolve) => {
      this.client.once('ready', () => {
        console.log('Discord client ready');
        isReady = true;
        resolve();
      });
    });

    // Login to Discord
    try {
      await this.client.login(this.token);
      console.log(`Bot logged in as ${this.client.user.tag}`);
    } catch (error) {
      // Don't log the token in error messages
      console.error('Failed to login to Discord. Please check if the bot token is valid.');
      throw new Error('Discord authentication failed');
    }
    
    // Wait for ready event or timeout after 5 seconds
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        if (!isReady) {
          console.log('Ready event timeout - proceeding anyway');
        }
        resolve();
      }, 5000);
    });
    
    // Wait for either ready or timeout
    await Promise.race([readyPromise, timeoutPromise]);
    
    // Double-check client is ready
    if (!this.client.isReady()) {
      console.log('Client not ready, waiting additional time...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('Discord client initialization complete');
    
    // Validate guild and channel access
    try {
      console.log('Validating Discord configuration...');
      const guild = await this.client.guilds.fetch(this.guildId);
      console.log(`✓ Bot has access to guild: ${guild.name} (${guild.id})`);
      
      const channel = await guild.channels.fetch(this.channelId);
      console.log(`✓ Bot has access to channel: ${channel.name} (${channel.id})`);
      
      if (channel.type !== ChannelType.GuildText) {
        const channelTypes = {
          0: 'Text Channel',
          2: 'Voice Channel', 
          4: 'Category',
          5: 'Announcement Channel',
          13: 'Stage Channel',
          15: 'Forum Channel',
          16: 'Media Channel'
        };
        const channelTypeName = channelTypes[channel.type] || `Unknown (${channel.type})`;
        throw new Error(`Channel "${channel.name}" is a ${channelTypeName}, but threads can only be created in Text Channels (type 0). Please use a regular text channel instead of a forum channel.`);
      }
      
      // Check permissions
      const botMember = guild.members.me;
      const permissions = channel.permissionsFor(botMember);
      const requiredPermissions = [
        'ViewChannel',
        'SendMessages',
        'CreatePrivateThreads',
        'SendMessagesInThreads',
        'ManageThreads'
      ];
      
      const missingPermissions = requiredPermissions.filter(perm => !permissions.has(perm));
      if (missingPermissions.length > 0) {
        console.warn(`⚠️ Bot is missing permissions in channel: ${missingPermissions.join(', ')}`);
      }
      
      console.log('✓ Discord configuration validated successfully');
    } catch (error) {
      console.error('Discord configuration validation failed:', error.message);
      console.error('Available guilds:', this.client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', '));
      throw new Error(`Discord configuration invalid: ${error.message}`);
    }
  }

  async createPrivateThread(prNumber, prTitle, prAuthor, prUrl) {
    try {
      // Validate and fetch guild
      let guild;
      try {
        guild = await this.client.guilds.fetch(this.guildId);
        console.log(`Found guild: ${guild.name} (${guild.id})`);
      } catch (error) {
        console.error(`Failed to fetch guild ${this.guildId}: ${error.message}`);
        console.error('Available guilds:', this.client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', '));
        throw new Error(`Bot is not in guild ${this.guildId} or guild ID is invalid. Please check DISCORD_GUILD_ID secret.`);
      }
      
      // Validate and fetch channel
      let channel;
      try {
        channel = await guild.channels.fetch(this.channelId);
        console.log(`Found channel: ${channel.name} (${channel.id})`);
      } catch (error) {
        console.error(`Failed to fetch channel ${this.channelId}: ${error.message}`);
        throw new Error(`Channel ${this.channelId} not found in guild. Please check DISCORD_CHANNEL_ID secret.`);
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error('Channel not found or not a text channel');
      }

      // Create thread name without lock icon
      const threadName = `PR #${prNumber}: ${prTitle}`.substring(0, 100);

      // Create initial message in channel
      const starterMessage = await channel.send({
        embeds: [{
          title: `🚀 PR: ${prTitle}`,
          description: `Thread for pull request #${prNumber}`,
          color: 0x0366d6,
          fields: [
            { name: 'PR Number', value: `#${prNumber}`, inline: true },
            { name: 'Author', value: prAuthor, inline: true },
            { name: 'Status', value: '🔵 Open', inline: true }
          ],
          url: prUrl,
          timestamp: new Date().toISOString()
        }]
      });

      // Create private thread from the message
      const thread = await starterMessage.startThread({
        name: threadName,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        type: ChannelType.PrivateThread,
        reason: `PR #${prNumber} opened by ${prAuthor}`
      });

      console.log(`Created private thread: ${thread.name} (${thread.id})`);

      // Send initial message in thread
      await thread.send({
        embeds: [{
          title: `Pull Request #${prNumber}`,
          description: prTitle,
          color: 0x0366d6,
          fields: [
            { name: '👤 Author', value: prAuthor, inline: true },
            { name: '🔗 Link', value: `[View PR](${prUrl})`, inline: true },
            { name: '📊 Status', value: 'Open', inline: true }
          ],
          footer: {
            text: 'GitHub PR Bot',
            icon_url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
          },
          timestamp: new Date().toISOString()
        }]
      });

      return {
        threadId: thread.id,
        threadUrl: `https://discord.com/channels/${this.guildId}/${thread.id}`
      };
    } catch (error) {
      console.error('Error creating thread:', error);
      throw error;
    }
  }

  async updateThread(threadId, message, status = null) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      // Send update message
      await thread.send(message);

      // Update thread name if status changed
      if (status) {
        const currentName = thread.name;
        const baseName = currentName.replace(/^[🔒🚧🔵✅🔴⚠️🟣❌]\s*/, '');
        const statusEmoji = this.getStatusEmoji(status);
        const newName = `🔒${statusEmoji} ${baseName}`.substring(0, 100);
        
        if (newName !== currentName) {
          await thread.setName(newName);
        }
      }

      // Ensure thread is not archived
      if (thread.archived) {
        await thread.setArchived(false);
      }

      return true;
    } catch (error) {
      console.error('Error updating thread:', error);
      throw error;
    }
  }

  async inviteMembers(threadId, memberIds) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      for (const memberId of memberIds) {
        try {
          const member = await guild.members.fetch(memberId);
          await thread.members.add(member);
          console.log(`Added member ${member.user.tag} to thread`);
        } catch (err) {
          console.error(`Failed to add member ${memberId}:`, err.message);
        }
      }

      return true;
    } catch (error) {
      console.error('Error inviting members:', error);
      throw error;
    }
  }

  async inviteRole(threadId, roleId) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);
      const role = await guild.roles.fetch(roleId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      if (!role) {
        throw new Error('Role not found');
      }

      // Get all members with this role
      const membersWithRole = role.members;
      
      for (const [, member] of membersWithRole) {
        try {
          await thread.members.add(member);
          console.log(`Added ${member.user.tag} from role ${role.name}`);
        } catch (err) {
          console.error(`Failed to add member ${member.user.tag}:`, err.message);
        }
      }

      return true;
    } catch (error) {
      console.error('Error inviting role members:', error);
      throw error;
    }
  }

  async archiveThread(threadId, reason = 'PR closed') {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      await thread.setArchived(true, reason);
      console.log(`Archived thread: ${thread.name}`);

      return true;
    } catch (error) {
      console.error('Error archiving thread:', error);
      throw error;
    }
  }

  async findThreadByName(prNumber) {
    try {
      let guild;
      try {
        guild = await this.client.guilds.fetch(this.guildId);
      } catch (error) {
        console.error(`Cannot find threads - guild ${this.guildId} not accessible: ${error.message}`);
        return null;
      }
      
      const channel = await guild.channels.fetch(this.channelId);

      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error('Channel not found or not a text channel');
      }

      // Fetch active threads
      const activeThreads = await channel.threads.fetchActive();
      
      // Search for thread with PR number in name
      const searchPattern = `PR #${prNumber}:`;
      const thread = activeThreads.threads.find(t => 
        t.name.includes(searchPattern)
      );

      if (thread) {
        return {
          threadId: thread.id,
          threadUrl: `https://discord.com/channels/${this.guildId}/${thread.id}`
        };
      }

      // Check archived threads
      const archivedThreads = await channel.threads.fetchArchived();
      const archivedThread = archivedThreads.threads.find(t => 
        t.name.includes(searchPattern)
      );

      if (archivedThread) {
        // Unarchive if found
        await archivedThread.setArchived(false);
        return {
          threadId: archivedThread.id,
          threadUrl: `https://discord.com/channels/${this.guildId}/${archivedThread.id}`
        };
      }

      return null;
    } catch (error) {
      console.error('Error finding thread:', error);
      return null;
    }
  }

  getStatusEmoji(status) {
    const statusMap = {
      'draft': '🚧',
      'open': '🔵',
      'approved': '✅',
      'changes_requested': '🔴',
      'ci_failing': '⚠️',
      'merged': '🟣',
      'closed': '❌'
    };
    return statusMap[status] || '';
  }

  async updateThreadStatus(threadId, prNumber, _, emoji) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      // Update thread name with new status emoji
      const currentName = thread.name;
      
      // Remove all status emojis and "PR #XXX:" patterns (including duplicates)
      let baseName = currentName
        .replace(/^[🚧🔵✅🔴⚠️🟣❌]\s*/, '')  // Remove emoji (no lock icon)
        .replace(/PR #\d+:\s*/g, '');  // Remove ALL "PR #XXX:" occurrences (note the 'g' flag)
      
      // Clean up any extra whitespace
      baseName = baseName.trim();
      
      // Build the new name with single PR prefix
      const newName = `${emoji} PR #${prNumber}: ${baseName}`.substring(0, 100);
      
      if (newName !== currentName) {
        await thread.setName(newName);
        console.log(`Updated thread name from "${currentName}" to "${newName}"`);
      }

      return true;
    } catch (error) {
      console.error('Error updating thread status:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      console.log('Discord client disconnected');
    }
  }
}

module.exports = DiscordThreadManager;