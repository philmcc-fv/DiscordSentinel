import { analyzeSentiment } from './openai';
import { storage } from './storage';
import { SentimentType } from '@shared/schema';
import { discordAPI } from './discord-api';
import { Client, Events, Message } from 'discord.js';
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
export async function startBot(token: string, guildId: string): Promise<boolean> {
  try {
    // Use the discord API service to initialize the client
    const initialized = await discordAPI.initialize(token);
    if (!initialized) {
      log('Failed to initialize Discord client', 'error');
      return false;
    }

    // Ensure the bot has access to the specified guild
    const guild = await discordAPI.getGuild(guildId);
    if (!guild) {
      log(`Discord bot initialized but cannot access guild ${guildId}`, 'error');
      return false;
    }

    log(`Discord bot successfully started and connected to guild: ${guild.name}`);
    return true;
  } catch (error) {
    log(`Error starting Discord bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}
