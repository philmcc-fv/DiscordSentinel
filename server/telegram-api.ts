import TelegramBot from 'node-telegram-bot-api';
import { log } from './vite';
import { storage } from './storage';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// File lock path for managing bot instances
const LOCK_FILE_PATH = path.join(process.cwd(), 'tmp', 'telegram-bot.lock');
const INSTANCE_ID = randomUUID();

/**
 * Service class for interacting with the Telegram Bot API
 */
class TelegramAPI {
  private bot: TelegramBot | null = null;
  private isInitialized: boolean = false;
  private token: string | null = null;
  private isInitializing: boolean = false;
  private instanceId: string = INSTANCE_ID;
  
  /**
   * Creates a file lock to prevent multiple instances from running simultaneously
   * @returns Whether the lock was successfully acquired
   */
  private acquireLock(): boolean {
    try {
      // Check if lock file exists
      if (fs.existsSync(LOCK_FILE_PATH)) {
        // Check if lock is stale (older than 2 minutes)
        const lockStats = fs.statSync(LOCK_FILE_PATH);
        const lockAge = Date.now() - lockStats.mtimeMs;
        
        if (lockAge < 120000) { // 2 minutes in milliseconds
          // Read the lock file to see if it's our instance
          const lockContent = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
          if (lockContent === this.instanceId) {
            // We already have the lock
            return true;
          }
          
          // Someone else has the lock
          log(`Telegram bot lock already acquired by another instance: ${lockContent}`, 'warn');
          return false;
        }
        
        // Lock is stale, we can override it
        log('Found stale Telegram bot lock, overriding', 'warn');
      }
      
      // Create lock directory if it doesn't exist
      const lockDir = path.dirname(LOCK_FILE_PATH);
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }
      
      // Create or update lock file with our instance ID
      fs.writeFileSync(LOCK_FILE_PATH, this.instanceId);
      return true;
    } catch (error) {
      log(`Error acquiring Telegram bot lock: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  }
  
  /**
   * Releases the file lock if we own it
   */
  private releaseLock(): void {
    try {
      if (fs.existsSync(LOCK_FILE_PATH)) {
        const lockContent = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
        if (lockContent === this.instanceId) {
          fs.unlinkSync(LOCK_FILE_PATH);
          log('Released Telegram bot lock', 'debug');
        }
      }
    } catch (error) {
      log(`Error releasing Telegram bot lock: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }
  
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
    
    // Attempt to acquire the lock
    if (!this.acquireLock()) {
      log('Failed to acquire Telegram bot lock, another instance is running', 'error');
      return false;
    }
    
    // Set flag to prevent concurrent initializations
    this.isInitializing = true;
    
    try {
      // Stop and clean up the existing bot if there is one
      await this.stopBot();
      
      // Validate the token format and clean any problematic characters
      if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
        log('Warning: Telegram token does not match expected format. Attempting to clean...', 'warn');
      }
      
      // Clean the token to remove any non-printable or problematic characters
      // Only allow digits, letters, colons, underscores, and hyphens which are valid in a Telegram bot token
      const cleanToken = token.replace(/[^\d:A-Za-z0-9_-]/g, '');
      
      try {
        // Generate unique options for this instance to avoid polling conflicts
        const uniqueOptions = {
          polling: {
            interval: 1000, // Polling interval
            params: {
              timeout: 10,   // Long polling timeout
              allowed_updates: ["message", "edited_message"], // Only listen for these update types
              // Add unique identifier to options to ensure no conflict with other instances
              offset: Date.now() % 1000000  // Use a dynamic offset based on current time
            }
          },
          // Add instance ID for tracing
          agent: {
            keepAlive: true,
            keepAliveMsecs: 30000
          },
          filepath: false // Disable file downloads
        };
        
        log(`Starting Telegram bot with unique polling options`, 'debug');
        
        // Create new bot instance
        this.bot = new TelegramBot(cleanToken, uniqueOptions);
        
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
        this.releaseLock();
        
        return false;
      }
    } catch (error) {
      log(`Error during Telegram bot initialization: ${error instanceof Error ? error.message : String(error)}`, 'error');
      this.isInitializing = false;
      this.releaseLock();
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
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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
        
        // Clear reference
        this.bot = null;
        
        // Additional waiting to ensure all resources are released
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Release our lock
        this.releaseLock();
        
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