import { analyzeSentiment } from './openai';
import { storage } from './storage';
import { SentimentType } from '@shared/schema';
import { discordAPI } from './discord-api';
import { Client, Events, Message, PermissionsBitField, GatewayIntentBits, NonThreadGuildBasedChannel, Guild } from 'discord.js';
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
  log('Setting up Discord message listeners...', 'debug');
  
  // Remove any existing message listeners to prevent duplicates
  client.removeAllListeners(Events.MessageCreate);
  
  // Set up new message listener
  client.on(Events.MessageCreate, async (message: Message) => {
    // Skip bot messages
    if (message.author.bot) {
      return;
    }

    try {
      // Log message receipt
      log(`Received message: "${message.content.substring(0, 30)}${message.content.length > 30 ? '...' : ''}" from user ${message.author.username}`, 'debug');
      
      // Check if we should process this message from bot settings
      const channel = message.channel;
      if (!channel || !channel.id) {
        log('Skipping message: No valid channel', 'debug');
        return;
      }
      
      // Get the guild ID
      const guildId = message.guild?.id;
      if (!guildId) {
        log('Skipping message: No guild ID available', 'debug');
        return;
      }

      // Get bot settings for this guild
      const settings = await storage.getBotSettings(guildId);
      
      if (!settings || !settings.isActive) {
        return;
      }

      // If monitor all channels is false, check if the specific channel is monitored
      if (!settings.monitorAllChannels) {
        const isMonitored = await storage.isChannelMonitored(channel.id);
        
        if (!isMonitored) {
          return;
        }
      }

      // Process the message if it passes all checks
      // Get channel name safely using channel type checking
      let channelName = channel.id;
      if ('name' in channel && typeof channel.name === 'string') {
        channelName = channel.name;
      }
      log(`Processing message from ${message.author.username} in channel #${channelName}`, 'debug');
      
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

  // Set up debug events for better diagnostics
  client.on(Events.Debug, (message) => {
    log(`Discord debug: ${message}`, 'debug');
  });
  
  client.on(Events.Warn, (message) => {
    log(`Discord warning: ${message}`, 'error');
  });
  
  client.on(Events.Error, (error) => {
    log(`Discord error: ${error instanceof Error ? error.message : String(error)}`, 'error');
  });

  log('Discord message listeners set up successfully');
}

/**
 * Start the Discord bot with the provided token
 */
export async function startBot(token: string, guildId: string): Promise<{success: boolean, message?: string}> {
  try {
    // Validate inputs
    if (!token || token.trim() === '') {
      return {
        success: false,
        message: "Discord bot token is missing or empty. Please provide a valid token."
      };
    }
    
    if (!guildId || guildId.trim() === '') {
      return {
        success: false,
        message: "Discord server ID is missing or empty. Please provide a valid server ID."
      };
    }
    
    // Clean the token (remove spaces, new lines, etc.)
    const cleanToken = token.trim();
    const cleanGuildId = guildId.trim();
    
    log(`Starting Discord bot for guild ${cleanGuildId}`);
    
    // Use the discord API service to initialize the client
    // This will also destroy any existing connections
    const initialized = await discordAPI.initialize(cleanToken, true);
    if (!initialized) {
      return {
        success: false, 
        message: "Failed to authenticate with Discord. Please check your bot token."
      };
    }

    log(`Discord bot logged in, attempting to access guild ${cleanGuildId}...`);

    // Ensure the bot has access to the specified guild
    const guild = await discordAPI.getGuild(cleanGuildId);
    if (!guild) {
      return {
        success: false,
        message: "Bot connected to Discord but could not access the specified server. Please check: 1) The server ID is correct 2) The bot has been invited to this server 3) The bot has required permissions"
      };
    }
    
    // Check if the bot has the MESSAGE_CONTENT intent, which is crucial for monitoring messages
    const client = discordAPI.getClient();
    if (!client.options.intents.has(GatewayIntentBits.MessageContent)) {
      return {
        success: false,
        message: "Bot connected but is missing the MESSAGE_CONTENT intent which is required to read message content. Please enable this in the Discord Developer Portal."
      };
    }
    
    // Verify permissions are correct
    if (!client.user) {
      return {
        success: false,
        message: "Discord client not properly initialized. User object is null."
      };
    }
    
    const botMember = await guild.members.fetch(client.user.id);
    const missingPermissions = [];

    // Check for critical permissions
    if (!botMember.permissions.has(PermissionsBitField.Flags.ViewChannel)) {
      missingPermissions.push("View Channels");
    }
    if (!botMember.permissions.has(PermissionsBitField.Flags.ReadMessageHistory)) {
      missingPermissions.push("Read Message History");
    }
    
    if (missingPermissions.length > 0) {
      return {
        success: false,
        message: `Bot is missing required permissions: ${missingPermissions.join(", ")}. Please update the bot's role permissions in Discord.`
      };
    }
    
    // Check if the bot has access to text channels
    try {
      const channels = await guild.channels.fetch();
      // Filter out null channels and only keep text channels
      const textChannels = channels.filter(channel => 
        channel !== null && channel.isTextBased()
      );
      
      if (textChannels.size === 0) {
        return {
          success: true,
          message: `Connected to server "${guild.name}" but found no text channels. This server may not have any text channels.`
        };
      }
      
      // Count text channels that the bot can actually access
      let accessibleCount = 0;
      
      // Use Array.from to convert Collection to array for iteration
      Array.from(textChannels.entries()).forEach(([id, channel]) => {
        if (client.user && channel && channel.permissionsFor(client.user.id)?.has(PermissionsBitField.Flags.ViewChannel)) {
          accessibleCount++;
        }
      });
      
      if (accessibleCount === 0) {
        return {
          success: true,
          message: `Connected to server "${guild.name}" but cannot access any text channels. Please check channel-specific permissions.`
        };
      }
      
      log(`Discord bot successfully started and connected to guild: ${guild.name} with ${accessibleCount} accessible channels`);
      return {
        success: true,
        message: `Successfully connected to "${guild.name}" with access to ${accessibleCount} text channels`
      };
    } catch (channelError) {
      log(`Connected to guild but had issues checking channels: ${channelError instanceof Error ? channelError.message : String(channelError)}`, 'error');
      
      // Still consider this a success since we connected to the guild
      return {
        success: true,
        message: `Connected to server "${guild.name}" but could not verify channel access. Monitor channels manually.`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`Error starting Discord bot: ${errorMessage}`, 'error');
    
    // Provide more user-friendly error messages based on common errors
    if (errorMessage.includes("Unknown Guild")) {
      return {
        success: false,
        message: "The Discord server ID you provided could not be found. Please double-check the ID and make sure the bot has been invited to the server."
      };
    } else if (errorMessage.includes("Invalid token") || errorMessage.includes("invalid token")) {
      return {
        success: false,
        message: "The Discord bot token you provided is invalid. Please check the token and try again."
      };
    } else if (errorMessage.includes("Privileged intent")) {
      return {
        success: false,
        message: "The bot requires privileged intents that are not enabled. Please enable 'MESSAGE CONTENT INTENT' and 'SERVER MEMBERS INTENT' in the Discord Developer Portal."
      };
    }
    
    return {
      success: false,
      message: `Error starting bot: ${errorMessage}`
    };
  }
}
