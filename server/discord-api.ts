import { Client, GatewayIntentBits, Collection, Guild, GuildChannel, Channel, TextChannel } from 'discord.js';
import { log } from './vite';

class DiscordAPI {
  private client: Client;
  private isInitialized: boolean = false;
  private token: string | null = null;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    this.client.on('ready', () => {
      log(`Discord bot logged in as ${this.client.user?.tag}`);
      this.isInitialized = true;
    });

    this.client.on('error', (error) => {
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
      }

      this.token = token;
      await this.client.login(token);
      return true;
    } catch (error) {
      log(`Failed to initialize Discord client: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
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

      // Try to access the guild
      const guild = await this.getGuild(guildId);
      if (!guild) {
        return { 
          success: false, 
          message: "Bot authenticated but could not access the specified server. Please check the Guild ID and ensure the bot has been invited to the server."
        };
      }

      return { 
        success: true, 
        message: `Successfully connected to Discord server: ${guild.name}` 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.client.isReady();
  }
}

// Export a singleton instance
export const discordAPI = new DiscordAPI();