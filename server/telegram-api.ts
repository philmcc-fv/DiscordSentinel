import TelegramBot from 'node-telegram-bot-api';
import { log } from './vite';

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
      // Create new bot instance
      this.bot = new TelegramBot(token, { polling: true });
      
      // Test connection by getting bot info
      const me = await this.bot.getMe();
      
      log(`Telegram bot initialized successfully (ID: ${me.id}, Username: @${me.username})`, 'info');
      
      this.isInitialized = true;
      this.token = token;
      
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
      // Create a temporary bot instance for testing
      const testBot = new TelegramBot(token, { polling: false });
      
      // Get bot information
      const botInfo = await testBot.getMe();
      
      return {
        success: true,
        message: `Successfully connected to Telegram bot: @${botInfo.username}`,
        botInfo
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to connect to Telegram: ${error instanceof Error ? error.message : String(error)}`
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
      // The bot must store this information itself as users add it to chats
      // This will be handled in the message listener
      return [];
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