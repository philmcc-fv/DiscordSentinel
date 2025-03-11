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

  async initialize(token: string, force: boolean = false): Promise<boolean> {
    // Validate token
    if (!token || token.trim() === '') {
      log(`Cannot initialize Discord client: Token is empty or invalid`, 'error');
      return false;
    }
    
    // Log the initialization attempt
    if (force) {
      log(`Forcing Discord client reinitialization with token: ${token.substring(0, 5)}...`, 'debug');
    } else {
      log(`Checking Discord client initialization status`, 'debug');
    }
    
    // Check if we need to initialize
    if (this.isInitialized && token === this.token && !force) {
      log(`Discord client already initialized with same token, skipping initialization`, 'debug');
      return this.client.isReady();
    }

    // Log reason for reinitialization
    if (token !== this.token) {
      log(`Discord token changed, reinitializing client`, 'debug');
    } else if (!this.isInitialized) {
      log(`Discord client not initialized, initializing now`, 'debug');
    }

    // If we have a different token, force reinitialize, or not initialized
    try {
      // Clean up any existing client connections
      if (this.client && this.client.isReady()) {
        log(`Destroying existing Discord client connection...`);
        await this.client.destroy();
        this.hasSetupListeners = false;
        this.isInitialized = false;
      }

      // Re-create the client with proper intents
      // This ensures we don't have any lingering state
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
          GatewayIntentBits.GuildMembers,
        ]
      });

      // Set up core event handlers
      this.client.on(Events.ClientReady, () => {
        log(`Discord bot logged in as ${this.client.user?.tag}`);
        this.isInitialized = true;
      });

      this.client.on(Events.Error, (error) => {
        log(`Discord client error: ${error instanceof Error ? error.message : String(error)}`, 'error');
        this.isInitialized = false;
      });

      // Store the token for future reference
      this.token = token;
      
      // Try to login
      log(`Logging in to Discord with token...`);
      try {
        await this.client.login(token);
        log(`Discord login successful, waiting for ready event...`);
      } catch (loginError) {
        log(`Discord login failed: ${loginError instanceof Error ? loginError.message : String(loginError)}`, 'error');
        return false;
      }
      
      // Wait for the ready event before returning
      // This is crucial for preventing race conditions
      if (!this.client.isReady()) {
        log(`Waiting for Discord client ready event...`, 'debug');
        
        try {
          await Promise.race([
            // Promise that resolves when the client is ready
            new Promise<void>((resolve) => {
              const readyHandler = () => {
                log(`Discord client is now ready!`, 'debug');
                this.isInitialized = true;
                resolve();
              };
              
              // If client becomes ready while we're setting up, resolve immediately
              if (this.client.isReady()) {
                log(`Discord client was already ready`, 'debug');
                this.isInitialized = true;
                resolve();
                return;
              }
              
              // Otherwise wait for the ready event
              this.client.once(Events.ClientReady, readyHandler);
            }),
            
            // Promise that rejects after a timeout
            new Promise<void>((_, reject) => {
              setTimeout(() => {
                reject(new Error("Timeout waiting for Discord client ready event"));
              }, 10000); // Increased timeout to 10 seconds
            })
          ]);
        } catch (timeoutError) {
          log(`${timeoutError instanceof Error ? timeoutError.message : "Timed out waiting for Discord ready event"}`, 'error');
          
          // Check if the client is ready despite the timeout
          if (!this.client.isReady()) {
            log(`Discord client is not ready after timeout, attempting to continue anyway`, 'error');
          }
        }
      }

      // Double-check to make sure we're actually initialized
      const isReady = this.client.isReady();
      if (!isReady) {
        log(`Warning: Discord client is still not ready after waiting`, 'error');
        this.isInitialized = false;
      } else {
        log(`Discord client is ready and fully initialized`, 'debug');
        this.isInitialized = true;
      }
      
      return isReady;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Failed to initialize Discord client: ${errorMessage}`, 'error');
      
      // Provide detailed error diagnostics
      if (errorMessage.includes("Privileged intent")) {
        log(`Error: This bot requires privileged intents. Please enable them in the Discord Developer Portal:
        1. Go to https://discord.com/developers/applications
        2. Select your application
        3. Go to the "Bot" tab
        4. Enable "Server Members Intent" and "Message Content Intent"
        5. Save changes and restart the bot`, 'error');
      } else if (errorMessage.includes("invalid token")) {
        log(`Error: The Discord token is invalid. Please check your token and try again.`, 'error');
      }
      
      return false;
    }
  }

  getClient(): Client {
    return this.client;
  }

  async getGuild(guildId: string): Promise<Guild | null> {
    if (!this.isInitialized) {
      log(`Cannot get guild: Discord API not initialized`, 'error');
      return null;
    }

    try {
      if (!this.client.isReady()) {
        log(`Waiting for client to be ready before fetching guild...`, 'debug');
        // Wait for the client to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      log(`Attempting to fetch guild with ID: ${guildId}`, 'debug');
      
      // First check if the guild is in the client's cache
      const cachedGuild = this.client.guilds.cache.get(guildId);
      if (cachedGuild) {
        log(`Found guild in cache: ${cachedGuild.name}`, 'debug');
        return cachedGuild;
      }
      
      log(`Guild not in cache, fetching from Discord API...`, 'debug');
      const guild = await this.client.guilds.fetch(guildId);
      
      log(`Successfully fetched guild: ${guild.name}`, 'debug');
      return guild;
    } catch (error) {
      log(`Error fetching guild: ${error instanceof Error ? error.message : String(error)}`, 'error');
      
      // Check if it's a permission issue
      if (error instanceof Error && error.message.includes("Missing Access")) {
        log(`Permission error: The bot doesn't have access to this guild. Make sure it's been invited with proper permissions.`, 'error');
      } else if (error instanceof Error && error.message.includes("Unknown Guild")) {
        log(`Guild not found: The guild ID ${guildId} is invalid or the bot has not been invited to this server.`, 'error');
      }
      
      return null;
    }
  }

  async getChannels(guildId: string): Promise<{channelId: string, name: string, guildId: string, guildName: string}[]> {
    if (!this.isInitialized) {
      log(`Cannot get channels: Discord API not initialized`, 'error');
      return [];
    }

    try {
      log(`Fetching channels for guild ID: ${guildId}`, 'debug');
      
      const guild = await this.getGuild(guildId);
      if (!guild) {
        log(`Could not find guild with ID: ${guildId}`, 'error');
        return [];
      }

      log(`Found guild: ${guild.name} (${guild.id}), fetching channels...`);
      const channels = await guild.channels.fetch();
      log(`Retrieved ${channels.size} total channels from Discord API`);
      
      // Filter to only text channels and convert to our format
      const result: {channelId: string, name: string, guildId: string, guildName: string}[] = [];
      
      channels.forEach(channel => {
        if (channel !== null) {
          log(`Checking channel: ${channel.name} (${channel.id}), type: ${channel.type}`, 'debug');
          
          if (channel.type === 0) {
            result.push({
              channelId: channel.id,
              name: channel.name,
              guildId: guild.id,
              guildName: guild.name
            });
            log(`Added text channel: ${channel.name} (${channel.id})`);
          }
        }
      });
      
      log(`Returning ${result.length} text channels for guild ${guild.name}`);
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