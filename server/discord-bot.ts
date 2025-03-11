import { analyzeSentiment } from './openai';
import { storage } from './storage';
import { SentimentType } from '@shared/schema';
import { discordAPI } from './discord-api';
import { Client, Events, Message, PermissionsBitField } from 'discord.js';
import { log } from './vite';

// Define the Discord message interface for internal use
export interface DiscordMessage {
  id: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
}

/**
 * Process a Discord message by analyzing sentiment and storing it in the database
 */
export async function processMessage(message: DiscordMessage): Promise<void> {
  try {
    // Skip messages that are too short to analyze meaningfully
    if (message.content.length < 3) {
      return;
    }

    // Check if the channel is being monitored
    const isMonitored = await storage.isChannelMonitored(message.channelId);
    if (!isMonitored) {
      return;
    }

    // Analyze sentiment using OpenAI
    const analysis = await analyzeSentiment(message.content);

    // Store the message with its sentiment analysis
    await storage.createDiscordMessage({
      messageId: message.id,
      channelId: message.channelId,
      userId: message.userId,
      username: message.username,
      content: message.content,
      sentiment: analysis.sentiment as SentimentType,
      sentimentScore: analysis.score,
      createdAt: message.createdAt,
    });

    log(`Processed message ${message.id} with sentiment: ${analysis.sentiment}`);
  } catch (error) {
    log(`Error processing Discord message: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

/**
 * Set up message processing on the Discord client
 */
export function setupMessageListeners(client: Client): void {
  client.on(Events.MessageCreate, async (message: Message) => {
    // Skip bot messages
    if (message.author.bot) return;

    try {
      // Check if we should process this message from bot settings
      const channel = message.channel;
      if (!channel || !channel.id) return;
      
      // Get the guild ID
      const guildId = message.guild?.id;
      if (!guildId) return;

      // Get bot settings for this guild
      const settings = await storage.getBotSettings(guildId);
      if (!settings || !settings.isActive) return;

      // If monitor all channels is false, check if the specific channel is monitored
      if (!settings.monitorAllChannels) {
        const isMonitored = await storage.isChannelMonitored(channel.id);
        if (!isMonitored) return;
      }

      // Process the message
      await processMessage({
        id: message.id,
        channelId: channel.id,
        userId: message.author.id,
        username: message.author.username,
        content: message.content,
        createdAt: message.createdAt,
      });
    } catch (error) {
      log(`Error in message event handler: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });

  log('Discord message listeners set up successfully');
}

/**
 * Start the Discord bot with the provided token
 */
export async function startBot(token: string, guildId: string): Promise<{success: boolean, message?: string}> {
  try {
    // Use the discord API service to initialize the client
    const initialized = await discordAPI.initialize(token);
    if (!initialized) {
      const errorMsg = 'Failed to initialize Discord client';
      log(errorMsg, 'error');
      return {
        success: false, 
        message: errorMsg
      };
    }

    log(`Discord bot logged in, attempting to access guild ${guildId}...`);

    // Ensure the bot has access to the specified guild
    const guild = await discordAPI.getGuild(guildId);
    if (!guild) {
      const errorMsg = `Discord bot authenticated but cannot access guild ${guildId}. Make sure the bot has been invited to the server with proper permissions.`;
      log(errorMsg, 'error');
      
      return {
        success: false,
        message: "Bot connected to Discord but could not access the specified server. Common issues: 1) The server ID is incorrect 2) The bot hasn't been invited to the server 3) The bot doesn't have required permissions"
      };
    }

    // Check if the bot has access to text channels
    try {
      const channels = await guild.channels.fetch();
      const textChannels = channels.filter(channel => 
        channel && channel.isTextBased()
      );
      
      if (textChannels.size === 0) {
        return {
          success: true,
          message: `Connected to server "${guild.name}" but found no text channels. This server may not have any text channels.`
        };
      }
      
      // Count channels we have permission to access
      let accessibleChannels = 0;
      for (const [_, channel] of textChannels) {
        // Check if bot can view messages in this channel
        const permissions = channel.permissionsFor(discordAPI.getClient().user!);
        if (permissions && permissions.has(1 << 10)) { // ViewChannel permission
          accessibleChannels++;
        }
      }
      
      if (accessibleChannels === 0) {
        return {
          success: true,
          message: `Connected to server "${guild.name}" but found no accessible text channels. Please check the bot's permissions.`
        };
      }
      
      log(`Discord bot successfully started and connected to guild: ${guild.name} with ${accessibleChannels} accessible channels`);
      return {
        success: true,
        message: `Successfully connected to "${guild.name}" with access to ${accessibleChannels} text channels`
      };
    } catch (channelError) {
      log(`Connected to guild but had issues checking channels: ${channelError instanceof Error ? channelError.message : String(channelError)}`, 'error');
      return {
        success: true,
        message: `Connected to server "${guild.name}" but could not verify channel access. Monitor channels manually.`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error starting Discord bot: ${errorMessage}`, 'error');
    
    // Provide more user-friendly error messages
    if (errorMessage.includes("Unknown Guild")) {
      return {
        success: false,
        message: "The Discord server ID you provided could not be found. Please double-check the ID and make sure the bot has been invited to the server."
      };
    } else if (errorMessage.includes("Invalid token")) {
      return {
        success: false,
        message: "The Discord bot token you provided is invalid. Please check the token and try again."
      };
    }
    
    return {
      success: false,
      message: `Error starting bot: ${errorMessage}`
    };
  }
}
