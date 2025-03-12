import { analyzeSentiment } from './openai';
import { storage } from './storage';
import { SentimentType, discordChannels } from '@shared/schema';
import { discordAPI } from './discord-api';
import { Client, Events, Message, PermissionsBitField, GatewayIntentBits, NonThreadGuildBasedChannel, Guild, TextChannel, Collection } from 'discord.js';
import { log } from './vite';
import { db } from './db';
import { eq } from 'drizzle-orm';

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
    log(`🔄 Starting processing of message ID: ${message.id}`, 'debug');
    
    // Skip messages that are too short to analyze meaningfully
    if (message.content.length < 3) {
      log(`⏩ Skipping message ${message.id} - too short for analysis (length: ${message.content.length})`, 'debug');
      return;
    }

    // Double-check if the channel is being monitored
    // This should already be checked in the message listener, but let's be sure
    log(`🔍 Verifying channel ${message.channelId} is monitored...`, 'debug');
    const isMonitored = await storage.isChannelMonitored(message.channelId);
    if (!isMonitored) {
      log(`❌ Skipping message ${message.id} - channel ${message.channelId} is not monitored`, 'debug');
      return;
    }
    log(`✅ Channel ${message.channelId} is confirmed as monitored`, 'debug');
    
    // Get the guild ID from a monitored channel
    const [channel] = await db.select().from(discordChannels).where(eq(discordChannels.channelId, message.channelId));
    if (channel) {
      // Check if the user is excluded
      const isExcluded = await storage.isUserExcluded(message.userId, channel.guildId);
      if (isExcluded) {
        log(`⏩ Skipping message ${message.id} - user ${message.username} (${message.userId}) is excluded from analysis`, 'debug');
        return;
      }
    }

    // Check if message already exists in the database
    const existingMessages = await db.select({ id: discordMessages.id })
      .from(discordMessages)
      .where(eq(discordMessages.messageId, message.id))
      .limit(1);

    if (existingMessages && existingMessages.length > 0) {
      log(`⏩ Skipping message ${message.id} - already exists in database`, 'debug');
      return;
    }

    log(`🧠 Analyzing sentiment for message ID ${message.id}: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`, 'debug');
    
    // Analyze sentiment using OpenAI
    try {
      log(`🔄 Calling OpenAI API for sentiment analysis...`, 'debug');
      const analysis = await analyzeSentiment(message.content);
      
      log(`✅ OpenAI sentiment result: ${analysis.sentiment} (score: ${analysis.score}, confidence: ${analysis.confidence})`, 'debug');

      // Prepare the message data for database storage
      log(`💾 Preparing to store message ${message.id} in database...`, 'debug');
      const messageData = {
        messageId: message.id,
        channelId: message.channelId,
        userId: message.userId,
        username: message.username,
        content: message.content,
        sentiment: analysis.sentiment as SentimentType,
        sentimentScore: analysis.score,
        createdAt: message.createdAt,
      };
      
      log(`📝 Message data prepared: ${JSON.stringify({
        messageId: messageData.messageId,
        channelId: messageData.channelId,
        sentiment: messageData.sentiment,
        createdAt: messageData.createdAt
      })}`, 'debug');

      // Store the message with its sentiment analysis
      log(`💾 Storing message in database...`, 'debug');
      const storedMessage = await storage.createDiscordMessage(messageData);
      
      log(`✅ Successfully stored message ID: ${storedMessage.messageId} with sentiment: ${storedMessage.sentiment}`);
    } catch (apiError) {
      log(`❌ OpenAI API error during sentiment analysis: ${apiError instanceof Error ? apiError.message : String(apiError)}`, 'error');
      // Don't throw here, we've logged the error and want to continue processing other messages
    }
  } catch (error) {
    log(`❌ Error processing Discord message: ${error instanceof Error ? error.message : String(error)}`, 'error');
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
      log(`Ignoring message from bot: ${message.author.username}`, 'debug');
      return;
    }

    try {
      // Log message receipt
      log(`📨 Received message: "${message.content.substring(0, 30)}${message.content.length > 30 ? '...' : ''}" from user ${message.author.username} in channel ${message.channel.id}`, 'debug');
      
      // Check if we should process this message from bot settings
      const channel = message.channel;
      if (!channel || !channel.id) {
        log('❌ Skipping message: No valid channel', 'debug');
        return;
      }
      
      // Get the guild ID
      const guildId = message.guild?.id;
      if (!guildId) {
        log('❌ Skipping message: No guild ID available', 'debug');
        return;
      }
      
      // Check if this user is excluded from analysis
      const isUserExcluded = await storage.isUserExcluded(message.author.id, guildId);
      if (isUserExcluded) {
        log(`⏩ Skipping message - user ${message.author.username} (${message.author.id}) is excluded from analysis`, 'debug');
        return;
      }

      log(`🔍 Checking bot settings for guild ${guildId}...`, 'debug');
      // Get bot settings for this guild
      const settings = await storage.getBotSettings(guildId);
      
      if (!settings) {
        log(`❌ No bot settings found for guild ${guildId}`, 'debug');
        return;
      }
      
      if (!settings.isActive) {
        log(`❌ Bot is not active in guild ${guildId}`, 'debug');
        return;
      }
      
      log(`✅ Bot is active in guild ${guildId}`, 'debug');

      // If monitor all channels is false, check if the specific channel is monitored
      if (!settings.monitorAllChannels) {
        log(`🔎 Checking if channel ${channel.id} is monitored...`, 'debug');
        const isMonitored = await storage.isChannelMonitored(channel.id);
        
        if (!isMonitored) {
          log(`❌ Channel ${channel.id} is not monitored, skipping message`, 'debug');
          return;
        } else {
          log(`✅ Channel ${channel.id} is monitored`, 'debug');
        }
      } else {
        log(`✅ All channels are being monitored for guild ${guildId}`, 'debug');
      }

      // Process the message if it passes all checks
      // Get channel name safely using channel type checking
      let channelName = channel.id;
      if ('name' in channel && typeof channel.name === 'string') {
        channelName = channel.name;
      }
      log(`🔄 Processing message from ${message.author.username} in channel #${channelName}`, 'debug');
      
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
 * Fetch historical messages from a Discord channel and process them
 * @param channelId The channel ID to fetch messages from
 * @param limit The maximum number of messages to fetch (default: 1000)
 */
export async function fetchHistoricalMessages(channelId: string, limit: number = 1000): Promise<{success: boolean, count: number, message?: string}> {
  try {
    log(`📚 Starting historical message fetch for channel ${channelId}, up to ${limit} messages`, 'debug');
    
    // Get the Discord client
    const client = discordAPI.getClient();
    if (!client || !client.isReady()) {
      log('❌ Discord client not ready, cannot fetch historical messages', 'error');
      return { 
        success: false, 
        count: 0,
        message: 'Discord client not ready. Please ensure the bot is properly connected.' 
      };
    }
    
    // Get the channel
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !('messages' in channel)) {
        log(`❌ Channel ${channelId} not found or is not a text channel`, 'error');
        return { 
          success: false, 
          count: 0,
          message: 'Channel not found or is not a text channel' 
        };
      }
      
      // Ensure it's a text channel
      const textChannel = channel as TextChannel;
      
      log(`📥 Fetching up to ${limit} historical messages from channel #${textChannel.name}`, 'debug');
      
      // Fetch messages in batches of 100 (Discord API limit per request)
      let allMessages: Message[] = [];
      let lastMessageId: string | undefined = undefined;
      let fetchedCount = 0;
      let batchSize = 100;
      
      // Continue fetching in batches until we reach the limit or no more messages
      while (fetchedCount < limit) {
        let fetchOptions: { limit: number; before?: string } = {
          limit: Math.min(batchSize, limit - fetchedCount)
        };
        
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }
        
        try {
          log(`📥 Fetching batch of up to ${fetchOptions.limit} messages ${lastMessageId ? `before message ID ${lastMessageId}` : ''}`, 'debug');
          const batch = await textChannel.messages.fetch(fetchOptions);
          
          if (batch.size === 0) {
            log(`📥 No more messages to fetch, reached end of channel history`, 'debug');
            break; // No more messages to fetch
          }
          
          // Add the fetched messages to our collection
          const batchArray = Array.from(batch.values());
          allMessages = allMessages.concat(batchArray);
          fetchedCount += batchArray.length;
          
          // Update the lastMessageId to the oldest message in this batch
          lastMessageId = batchArray[batchArray.length - 1].id;
          
          log(`📥 Fetched ${batchArray.length} messages in this batch, total so far: ${fetchedCount}`, 'debug');
          
          // Add a delay between batches to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (fetchedCount >= limit) {
            log(`📥 Reached specified limit of ${limit} messages`, 'debug');
            break;
          }
        } catch (batchError) {
          log(`⚠️ Error fetching batch: ${batchError instanceof Error ? batchError.message : String(batchError)}`, 'error');
          // If we have some messages already, we'll continue with those rather than failing completely
          if (allMessages.length > 0) {
            log(`📥 Continuing with ${allMessages.length} messages already fetched`, 'debug');
            break;
          } else {
            log(`❌ Failed to fetch any messages`, 'error');
            return { 
              success: false, 
              count: 0,
              message: `Error fetching messages: ${batchError instanceof Error ? batchError.message : String(batchError)}` 
            };
          }
        }
      }
      
      log(`📥 Successfully fetched a total of ${allMessages.length} messages from channel #${textChannel.name}`, 'debug');
      
      if (allMessages.length === 0) {
        log(`ℹ️ No messages found in channel #${textChannel.name}`, 'debug');
        return { 
          success: true, 
          count: 0,
          message: 'No messages found in this channel' 
        };
      }
      
      // Process each message
      log(`🔄 Processing ${allMessages.length} historical messages`, 'debug');
      let processedCount = 0;
      let errorCount = 0;
      
      // Use the array of messages we collected from all batches
      const messageArray = allMessages;
      
      // Use a more controlled loop to handle rate limits
      for (let i = 0; i < messageArray.length; i++) {
        const message = messageArray[i] as Message;
        
        // Skip bot messages
        if (message.author.bot) {
          continue;
        }
        
        // Get the guild ID from the channel
        const [channelInfo] = await db.select().from(discordChannels).where(eq(discordChannels.channelId, channelId));
        if (channelInfo) {
          // Check if the user is excluded from analysis
          const isUserExcluded = await storage.isUserExcluded(message.author.id, channelInfo.guildId);
          if (isUserExcluded) {
            log(`⏩ Skipping historical message - user ${message.author.username} (${message.author.id}) is excluded from analysis`, 'debug');
            continue;
          }
        }
        
        try {
          // Process the message
          await processMessage({
            id: message.id,
            channelId: channelId,
            userId: message.author.id,
            username: message.author.username,
            content: message.content,
            createdAt: message.createdAt
          });
          
          processedCount++;
          
          // Add a small delay every few messages to avoid rate limiting
          if (i % 5 === 0 && i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Add longer delay every 20 messages to respect OpenAI rate limits
          if (i % 20 === 0 && i > 0) {
            log(`⏱️ Adding delay to respect API rate limits after processing ${i} messages`, 'debug');
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (processError) {
          log(`❌ Error processing historical message ${message.id}: ${processError instanceof Error ? processError.message : String(processError)}`, 'error');
          errorCount++;
        }
      }
      
      log(`✅ Finished processing historical messages. Processed: ${processedCount}, Errors: ${errorCount}`);
      
      return {
        success: true,
        count: processedCount,
        message: `Successfully processed ${processedCount} historical messages from channel #${textChannel.name}`
      };
      
    } catch (channelError) {
      log(`❌ Error accessing channel: ${channelError instanceof Error ? channelError.message : String(channelError)}`, 'error');
      return { 
        success: false, 
        count: 0,
        message: `Error accessing channel: ${channelError instanceof Error ? channelError.message : String(channelError)}` 
      };
    }
  } catch (error) {
    log(`❌ Error in fetchHistoricalMessages: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return { 
      success: false, 
      count: 0,
      message: `Error fetching historical messages: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
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
