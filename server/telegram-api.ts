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

  /**
   * Initialize a new Telegram bot with the given token
   * @param token The Telegram bot token
   * @param force Force re-initialization even if already initialized
   * @returns Whether initialization was successful
   */
  async initialize(token: string, force: boolean = false): Promise<boolean> {
    // If already initialized and not forcing, return
    if (this.isInitialized && this.token === token && !force) {
      log('Telegram bot already initialized', 'debug');
      return true;
    }

    // If there's an existing bot, destroy it first
    if (this.bot) {
      try {
        log('Stopping existing Telegram bot before re-initializing', 'debug');
        this.bot.stopPolling();
        this.bot = null;
      } catch (error) {
        log(`Error stopping existing Telegram bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }

    try {
      // Clean the token from any invisible/control characters
      const cleanToken = token.replace(/[^\x20-\x7E]/g, '');
      
      // Create new bot instance
      this.bot = new TelegramBot(cleanToken, { polling: true });
      
      // Test connection by getting bot info
      const me = await this.bot.getMe();
      
      log(`Telegram bot initialized successfully (ID: ${me.id}, Username: @${me.username})`, 'info');
      
      this.isInitialized = true;
      this.token = cleanToken;
      
      return true;
    } catch (error) {
      log(`Failed to initialize Telegram bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
      this.isInitialized = false;
      this.token = null;
      this.bot = null;
      return false;
    }
  }

  /**
   * Get the initialized bot instance
   * @returns The bot instance or null if not initialized
   */
  getBot(): TelegramBot | null {
    return this.bot;
  }

  /**
   * Check if the bot is currently initialized
   * @returns Whether the bot is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.bot !== null;
  }

  /**
   * Test connection to Telegram API
   * @param token The token to test
   */
  async testConnection(token: string): Promise<{ success: boolean, message: string, botInfo?: TelegramBot.User }> {
    try {
      // Clean the token from any invisible/control characters
      const cleanToken = token.replace(/[^\x20-\x7E]/g, '');
      
      // Create a temporary bot instance for testing
      const testBot = new TelegramBot(cleanToken, { polling: false });
      
      // Get bot information
      const botInfo = await testBot.getMe();
      
      return {
        success: true,
        message: `Successfully connected to Telegram bot: @${botInfo.username}`,
        botInfo
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhanced error message for common issues
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
   * @returns List of chats or null if failed
   */
  async getChats(): Promise<TelegramBot.Chat[]> {
    if (!this.isReady() || !this.bot) {
      log('Cannot get chats, Telegram bot not initialized', 'error');
      return [];
    }

    try {
      // Unfortunately Telegram Bot API doesn't provide a direct way to fetch all chats
      // We'll get any chats we have in our database via the storage method
      const storedChats = await storage.getTelegramChats();
      
      // For each stored chat, try to get the current information
      const chatDetails: TelegramBot.Chat[] = [];
      
      for (const chat of storedChats) {
        try {
          // Only try to get chat details if we have a valid chat ID
          if (chat.chatId) {
            const chatDetail = await this.bot.getChat(chat.chatId);
            if (chatDetail) {
              chatDetails.push(chatDetail);
            }
          }
        } catch (chatError) {
          // If we can't get the chat info (e.g., the bot was removed), just skip it
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

export const telegramAPI = new TelegramAPI();