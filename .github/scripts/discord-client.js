const { Client, GatewayIntentBits, ChannelType, ThreadAutoArchiveDuration } = require('discord.js');

class DiscordThreadManager {
  constructor(token, guildId, channelId) {
    this.token = token;
    this.guildId = guildId;
    this.channelId = channelId;
    this.client = null;
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

    await this.client.login(this.token);
    console.log(`Bot logged in as ${this.client.user.tag}`);
    
    // Wait for client to be ready
    return new Promise((resolve) => {
      this.client.once('ready', () => {
        console.log('Discord client ready');
        resolve();
      });
    });
  }

  async createPrivateThread(prNumber, prTitle, prAuthor, prUrl) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const channel = await guild.channels.fetch(this.channelId);

      if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error('Channel not found or not a text channel');
      }

      // Create thread name with emoji indicators
      const threadName = `🔒 PR #${prNumber}: ${prTitle}`.substring(0, 100);

      // Create initial message in channel
      const starterMessage = await channel.send({
        content: `Creating private thread for PR #${prNumber}`,
        embeds: [{
          title: `🚀 New PR: ${prTitle}`,
          description: `A private thread is being created for this pull request.`,
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
      
      for (const [memberId, member] of membersWithRole) {
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
      const guild = await this.client.guilds.fetch(this.guildId);
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

  async updateThreadStatus(threadId, prNumber, status, emoji) {
    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const thread = await guild.channels.fetch(threadId);

      if (!thread || !thread.isThread()) {
        throw new Error('Thread not found');
      }

      // Update thread name with new status emoji
      const currentName = thread.name;
      const baseName = currentName.replace(/^[🔒🚧🔵✅🔴⚠️🟣❌]\s*/, '').replace(/^PR #\d+:\s*/, '');
      const newName = `${emoji} PR #${prNumber}: ${baseName}`.substring(0, 100);
      
      if (newName !== currentName) {
        await thread.setName(newName);
        console.log(`Updated thread name to: ${newName}`);
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