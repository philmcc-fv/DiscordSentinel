import { Client, GatewayIntentBits, Collection, Guild, GuildChannel, Channel, TextChannel, Events, PermissionsBitField } from 'discord.js';
import { log } from './vite';

class DiscordAPI {
  private client: Client;
  private isInitialized: boolean = false;
  private token: string | null = null;
  private hasSetupListeners: boolean = false;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    this.client.on(Events.ClientReady, () => {
      log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isInitialized = true;
      
      // Set up message listeners if we haven't already
      if (!this.hasSetupListeners) {
        // We'll set this up from the bot module to avoid circular dependencies
        this.hasSetupListeners = true;
      }
    });

    this.client.on(Events.Error, (error) => {
      log(`Discord client error: ${error instanceof Error ? error.message : String(error)}`, 'error');
      this.isInitialized = false;
    });
  }

  async initialize(token: string): Promise<boolean> {
    if (this.isInitialized && token === this.token) {
      return true;
    }

    // If we have a different token or not initialized
    try {
      if (this.client.isReady()) {
        await this.client.destroy();
        this.hasSetupListeners = false;
      }

      this.token = token;
      await this.client.login(token);
      return true;
    } catch (error) {
      log(`Failed to initialize Discord client: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  }

  getClient(): Client {
    return this.client;
  }

  async getGuild(guildId: string): Promise<Guild | null> {
    if (!this.isInitialized) return null;

    try {
      const guild = await this.client.guilds.fetch(guildId);
      return guild;
    } catch (error) {
      log(`Error fetching guild: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return null;
    }
  }

  async getChannels(guildId: string): Promise<{channelId: string, name: string, guildId: string, guildName: string}[]> {
    if (!this.isInitialized) return [];

    try {
      const guild = await this.getGuild(guildId);
      if (!guild) return [];

      const channels = await guild.channels.fetch();
      
      // Filter to only text channels and convert to our format
      const result: {channelId: string, name: string, guildId: string, guildName: string}[] = [];
      
      channels.forEach(channel => {
        if (channel !== null && channel.type === 0) {
          result.push({
            channelId: channel.id,
            name: channel.name,
            guildId: guild.id,
            guildName: guild.name
          });
        }
      });
      
      return result;
    } catch (error) {
      log(`Error fetching channels: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return [];
    }
  }

  async testConnection(token: string, guildId: string): Promise<{ success: boolean, message: string }> {
    try {
      // Try to initialize with the token
      const initialized = await this.initialize(token);
      if (!initialized) {
        return { 
          success: false, 
          message: "Failed to authenticate with Discord. Please check your bot token."
        };
      }

      log(`Discord bot logged in successfully, checking guild access...`);

      // Try to access the guild
      const guild = await this.getGuild(guildId);
      if (!guild) {
        return { 
          success: false, 
          message: "Bot authenticated but could not access the specified server. Common issues: 1) The server ID is incorrect 2) The bot hasn't been invited to the server with proper permissions 3) The bot token is for a different bot"
        };
      }

      // Get more details about accessible channels
      try {
        const channels = await guild.channels.fetch();
        // Filter text channels
        const textChannels = channels.filter(channel => 
          channel && channel.isTextBased()
        );

        const channelCount = textChannels.size;
        
        return { 
          success: true, 
          message: `Successfully connected to Discord server: ${guild.name} (${channelCount} accessible text channels)` 
        };
      } catch (channelError) {
        // We could connect to the guild but had issues with channel permissions
        log(`Could not fetch channels: ${channelError instanceof Error ? channelError.message : String(channelError)}`, 'error');
        return { 
          success: true, 
          message: `Connected to server: ${guild.name}, but could not access channel list. Please check bot permissions.` 
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Discord connection test failed: ${errorMessage}`, 'error');
      
      // Provide specific guidance based on error type
      if (errorMessage.includes("Unknown Guild")) {
        return {
          success: false,
          message: "The Discord server ID you provided could not be found. To fix this:\n\n1️⃣ Verify the server ID is correct: Right-click on your server in Discord, select 'Copy ID'\n\n2️⃣ Make sure you've invited the bot to this specific server using the OAuth2 URL from Discord Developer Portal with 'bot' scope\n\n3️⃣ Check that the bot has the 'Server Members Intent' enabled in the Discord Developer Portal"
        };
      } else if (errorMessage.includes("Invalid token")) {
        return {
          success: false,
          message: "The Discord bot token is invalid. To fix this:\n\n1️⃣ Go to Discord Developer Portal > Your Application > Bot section\n\n2️⃣ Click 'Reset Token' if needed and copy the new token\n\n3️⃣ Make sure you're copying the Bot Token, not the Client Secret or Application ID"
        };
      } else if (errorMessage.includes("disallowed intents")) {
        return {
          success: false,
          message: "The bot requires additional permissions in the Discord Developer Portal. Please enable the required intents (Server Members, Message Content) for your bot application."
        };
      }
      
      return { 
        success: false, 
        message: `Connection test failed: ${errorMessage}` 
      };
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.client.isReady();
  }
}

// Export a singleton instance
export const discordAPI = new DiscordAPI();