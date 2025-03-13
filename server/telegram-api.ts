import TelegramBot from 'node-telegram-bot-api';
import { log } from './vite';
import { storage } from './storage';

/**
 * Service class for interacting with the Telegram Bot API
 */
class TelegramAPI {
  private bot: TelegramBot | null = null;
  private isInitialized: boolean = false;
  private token: string | null = null;
  private isInitializing: boolean = false;
  
  /**
   * Initialize a new Telegram bot with the given token
   * @param token The Telegram bot token
   * @param force Force re-initialization even if already initialized
   * @returns Whether initialization was successful
   */
  async initialize(token: string, force: boolean = false): Promise<boolean> {
    // If already initialized with the same token and not forcing, return true
    if (this.isInitialized && this.token === token && !force) {
      log('Telegram bot already initialized and token matches', 'debug');
      return true;
    }
    
    // Check if initialization is already in progress
    if (this.isInitializing) {
      log('Telegram bot initialization already in progress', 'debug');
      // Wait for up to 10 seconds for initialization to complete
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!this.isInitializing) {
          if (this.isInitialized) {
            return true;
          }
          break;
        }
      }
      log('Telegram initialization timeout, proceeding with new initialization', 'warn');
    }
    
    // Set flag to prevent concurrent initializations
    this.isInitializing = true;
    
    try {
      // Stop and clean up the existing bot if there is one
      await this.stopBot();
      
      // Clean the token to remove any non-printable characters
      const cleanToken = token.replace(/[^\x20-\x7E]/g, '');
      
      try {
        // Create a new bot instance with specific polling options
        this.bot = new TelegramBot(cleanToken, {
          polling: {
            interval: 1000, // Polling interval
            params: {
              timeout: 10    // Long polling timeout
            }
          }
        });
        
        // Test connection
        const me = await this.bot.getMe();
        
        log(`Telegram bot initialized successfully (ID: ${me.id}, Username: @${me.username})`, 'info');
        
        this.isInitialized = true;
        this.token = cleanToken;
        this.isInitializing = false;
        
        return true;
      } catch (error) {
        log(`Failed to initialize Telegram bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
        
        // Mark as uninitialized and cleanup
        this.isInitialized = false;
        this.token = null;
        this.bot = null;
        this.isInitializing = false;
        
        return false;
      }
    } catch (error) {
      log(`Error during Telegram bot initialization: ${error instanceof Error ? error.message : String(error)}`, 'error');
      this.isInitializing = false;
      return false;
    }
  }
  
  /**
   * Stop the bot and clean up resources
   */
  private async stopBot(): Promise<void> {
    if (this.bot) {
      try {
        log('Stopping existing Telegram bot...', 'debug');
        
        // Stop the polling
        this.bot.stopPolling();
        
        // Wait for polling to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Remove all event listeners
        this.bot.removeAllListeners();
        
        // Attempt to abort any ongoing network connections
        try {
          // @ts-ignore - Accessing private property
          if (this.bot._polling && typeof this.bot._polling.abort === 'function') {
            // @ts-ignore
            this.bot._polling.abort();
          }
        } catch (e) {
          // Ignore errors when accessing private methods
        }
        
        // Clear reference and wait for cleanup
        this.bot = null;
        
        // Additional waiting to ensure all resources are released
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        log('Telegram bot stopped successfully', 'debug');
      } catch (stopError) {
        log(`Error stopping Telegram bot: ${stopError instanceof Error ? stopError.message : String(stopError)}`, 'error');
      }
    }
    
    // Reset state even if there was an error
    this.isInitialized = false;
    this.token = null;
  }

  /**
   * Get the initialized bot instance
   * @returns The bot instance or null if not initialized
   */
  getBot(): TelegramBot | null {
    return this.bot;
  }

  /**
   * Check if the bot is currently initialized and ready
   * @returns Whether the bot is initialized and ready
   */
  isReady(): boolean {
    return this.isInitialized && this.bot !== null;
  }

  /**
   * Test connection to Telegram API without starting a polling bot
   * @param token The token to test
   * @returns Result object with success status, message and bot info
   */
  async testConnection(token: string): Promise<{ success: boolean, message: string, botInfo?: TelegramBot.User }> {
    try {
      // Clean the token from any invisible/control characters
      const cleanToken = token.replace(/[^\x20-\x7E]/g, '');
      
      // Create a temporary bot instance for testing (no polling)
      const testBot = new TelegramBot(cleanToken, { polling: false });
      
      // Try to get bot info
      const botInfo = await testBot.getMe();
      
      return {
        success: true,
        message: `Successfully connected to Telegram bot: @${botInfo.username}`,
        botInfo
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhance error message for common issues
      if (errorMessage.includes("ETELEGRAM") && errorMessage.includes("characters")) {
        errorMessage = "Invalid token format. Please check for any special or non-printable characters in your token.";
      }
      
      return {
        success: false,
        message: `Failed to connect to Telegram: ${errorMessage}`
      };
    }
  }

  /**
   * Get a list of chats the bot is a member of
   * @returns List of chats or empty array if failed
   */
  async getChats(): Promise<TelegramBot.Chat[]> {
    if (!this.isReady() || !this.bot) {
      log('Cannot get chats, Telegram bot not initialized', 'error');
      return [];
    }

    try {
      // Get stored chats from database
      const storedChats = await storage.getTelegramChats();
      
      // Build list of chat details
      const chatDetails: TelegramBot.Chat[] = [];
      
      // Fetch current information for each stored chat
      for (const chat of storedChats) {
        try {
          if (chat.chatId && this.bot) {
            const chatDetail = await this.bot.getChat(chat.chatId);
            if (chatDetail) {
              chatDetails.push(chatDetail);
            }
          }
        } catch (chatError) {
          // Skip chats we can't access
          log(`Could not get chat details for ${chat.chatId}: ${chatError instanceof Error ? chatError.message : String(chatError)}`, 'debug');
        }
      }
      
      return chatDetails;
    } catch (error) {
      log(`Error getting chats: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return [];
    }
  }

  /**
   * Get information about a specific chat
   * @param chatId The chat ID to get information for
   * @returns Chat information or null if failed
   */
  async getChat(chatId: string): Promise<TelegramBot.Chat | null> {
    if (!this.isReady() || !this.bot) {
      log('Cannot get chat info, Telegram bot not initialized', 'error');
      return null;
    }

    try {
      return await this.bot.getChat(chatId);
    } catch (error) {
      log(`Error getting chat info for ${chatId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return null;
    }
  }
}

// Export a singleton instance
export const telegramAPI = new TelegramAPI();