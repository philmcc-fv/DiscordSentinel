import TelegramBot from 'node-telegram-bot-api';
import { log } from './vite';
import { storage } from './storage';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { validateTelegramToken } from './utils/token-validation';

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
      // In our replit environment, forcibly remove any existing lock file
      // since we should be the only instance running
      if (fs.existsSync(LOCK_FILE_PATH)) {
        try {
          fs.unlinkSync(LOCK_FILE_PATH);
          log('Removed existing Telegram bot lock file', 'debug');
        } catch (unlinkError) {
          log(`Failed to remove existing lock file: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`, 'warn');
          // Continue anyway as the next write might succeed
        }
      }
      
      // Create lock directory if it doesn't exist
      const lockDir = path.dirname(LOCK_FILE_PATH);
      if (!fs.existsSync(lockDir)) {
        fs.mkdirSync(lockDir, { recursive: true });
      }
      
      // Create or update lock file with our instance ID
      fs.writeFileSync(LOCK_FILE_PATH, this.instanceId);
      log('Successfully acquired Telegram bot lock', 'debug');
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
      
      // Validate the token
      const validation = validateTelegramToken(token);
      
      if (!validation.isValid) {
        log(`Invalid Telegram token format: ${validation.message}`, 'error');
        throw new Error(`Invalid Telegram token format: ${validation.message}`);
      }
      
      // Use the cleaned token from validation
      const cleanToken = validation.cleanedToken || token;
      
      log('Telegram token validation successful', 'debug');
      
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
        
        // Stop the polling first
        try {
          this.bot.stopPolling();
          log('Stopped bot polling', 'debug');
        } catch (pollingError) {
          log(`Error stopping polling: ${pollingError instanceof Error ? pollingError.message : String(pollingError)}`, 'warn');
          // Continue with cleanup even if stopping polling fails
        }
        
        // Wait for polling to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Remove all event listeners to prevent memory leaks
        try {
          this.bot.removeAllListeners();
          log('Removed all event listeners', 'debug');
        } catch (listenerError) {
          log(`Error removing listeners: ${listenerError instanceof Error ? listenerError.message : String(listenerError)}`, 'warn');
        }
        
        // Attempt to abort any ongoing network connections
        try {
          // @ts-ignore - Accessing private property
          if (this.bot._polling && typeof this.bot._polling.abort === 'function') {
            // @ts-ignore
            this.bot._polling.abort();
            log('Aborted polling manually', 'debug');
          }
        } catch (e) {
          // Ignore errors when accessing private methods
          log('Could not abort polling manually, continuing with cleanup', 'debug');
        }
        
        // Close any active WebHooks if present
        try {
          // @ts-ignore - Check if webhook exists and close it
          if (this.bot._webHook) {
            // @ts-ignore
            this.bot._webHook.close();
            log('Closed webhook', 'debug');
          }
        } catch (webhookError) {
          // Ignore errors with webhook closing
        }
        
        // Explicitly null any internal references to help garbage collection
        try {
          // @ts-ignore
          if (this.bot._polling) this.bot._polling = null;
          // @ts-ignore
          if (this.bot._webHook) this.bot._webHook = null;
          // @ts-ignore
          if (this.bot._request) this.bot._request = null;
        } catch (nullError) {
          // Ignore errors when accessing private properties
        }
        
        // Clear our reference to the bot instance
        this.bot = null;
        
        // Additional waiting to ensure all resources are released
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Release our lock
        this.releaseLock();
        
        log('Telegram bot stopped and resources cleaned up successfully', 'debug');
      } catch (stopError) {
        log(`Error during Telegram bot cleanup: ${stopError instanceof Error ? stopError.message : String(stopError)}`, 'error');
        // Try to release the lock even if there was an error
        this.releaseLock();
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
      if (!token) {
        return {
          success: false,
          message: "No Telegram bot token provided"
        };
      }
      
      // Validate token using the central validation utility
      const validation = validateTelegramToken(token);
      
      if (!validation.isValid) {
        return {
          success: false,
          message: validation.message || "Invalid token format. Token must contain a colon separating the bot ID and secret."
        };
      }
      
      // Use the cleaned token from validation
      const cleanToken = validation.cleanedToken || token;
      log('Telegram token validation successful', 'debug');
      
      // Create a temporary bot instance for testing (no polling)
      const testBot = new TelegramBot(cleanToken, { polling: false });
      
      // Try to get bot info
      const botInfo = await testBot.getMe();
      
      // Clean up resources
      testBot.removeAllListeners();
      
      return {
        success: true,
        message: `Successfully connected to Telegram bot: @${botInfo.username}`,
        botInfo
      };
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : String(error);
      
      // Enhance error message for common issues
      if (errorMessage.includes("ETELEGRAM") && errorMessage.includes("Unauthorized")) {
        errorMessage = "Invalid bot token. Please check your token and try again.";
      } else if (errorMessage.includes("ETELEGRAM") && errorMessage.includes("characters")) {
        errorMessage = "Invalid token format. Please check for any special or non-printable characters in your token.";
      } else if (errorMessage.includes("ETELEGRAM") && errorMessage.includes("409 Conflict")) {
        errorMessage = "Multiple bot instances are running with the same token. Please try again in a few moments.";
      } else if (errorMessage.includes("ENOTFOUND") || errorMessage.includes("ETIMEDOUT")) {
        errorMessage = "Network error. Please check your internet connection and try again.";
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
      log('Cannot get chats through API, attempting to initialize the bot first', 'debug');
      // Try to get the token and initialize
      try {
        const settings = await storage.getTelegramBotSettings();
        if (settings && settings.token) {
          await this.initialize(settings.token);
        } else {
          log('No token available to initialize Telegram bot', 'warn');
          return [];
        }
      } catch (initError) {
        log(`Failed to initialize Telegram bot during getChats: ${initError instanceof Error ? initError.message : String(initError)}`, 'error');
        return [];
      }
    }
    
    if (!this.bot) {
      log('Bot initialization failed, returning only stored chats', 'warn');
      return [];
    }

    try {
      // Get stored chats from database
      const storedChats = await storage.getTelegramChats();
      
      // Build list of chat details
      const chatDetails: TelegramBot.Chat[] = [];
      const inaccessibleChatIds: string[] = [];
      
      // We'll use this to keep track of what chats we've processed
      const processedChatIds: Set<string> = new Set();
      
      // Fetch current information for each stored chat
      for (const chat of storedChats) {
        try {
          if (chat.chatId && this.bot) {
            const chatDetail = await this.bot.getChat(chat.chatId);
            if (chatDetail) {
              chatDetails.push(chatDetail);
              processedChatIds.add(String(chat.chatId));
            }
          }
        } catch (chatError) {
          // Mark chats we can't access for removal
          log(`Could not get chat details for ${chat.chatId}: ${chatError instanceof Error ? chatError.message : String(chatError)}`, 'debug');
          inaccessibleChatIds.push(chat.chatId);
        }
      }
      
      // If there are inaccessible chats, return what we have but don't remove them yet
      // The removal should happen in the route handler to avoid modifying data during a read operation
      if (inaccessibleChatIds.length > 0) {
        log(`Found ${inaccessibleChatIds.length} inaccessible chats that will be marked for removal`, 'info');
      }
      
      // Now try multiple approaches to discover new chats
      
      // 1. First approach: Using getUpdates to discover chats from recent messages
      try {
        log('Approach 1: Discovering chats via getUpdates...', 'debug');
        
        // Get recent updates to find new chats
        const updates = await this.bot.getUpdates({ 
          limit: 100,
          timeout: 1, // Use short timeout for better performance
          allowed_updates: ['message', 'my_chat_member', 'channel_post'] // Limit to relevant updates
        });
        
        if (updates.length > 0) {
          log(`Found ${updates.length} updates to process for chat discovery`, 'debug');
        }
        
        const newChats: Record<string, TelegramBot.Chat> = {};
        
        // Extract all unique chats from updates
        for (const update of updates) {
          // Check message updates
          if (update.message && update.message.chat) {
            const chatId = String(update.message.chat.id);
            
            // Only process chats we haven't already processed
            if (!processedChatIds.has(chatId) && !newChats[chatId]) {
              try {
                // Get complete chat info for this chat
                const chatDetail = await this.bot.getChat(chatId);
                if (chatDetail) {
                  newChats[chatId] = chatDetail;
                  processedChatIds.add(chatId);
                }
              } catch (newChatError) {
                log(`Error getting detail for new chat ${chatId}: ${newChatError instanceof Error ? newChatError.message : String(newChatError)}`, 'debug');
              }
            }
          }
          
          // Check chat member update events
          if (update.my_chat_member && update.my_chat_member.chat) {
            const chatId = String(update.my_chat_member.chat.id);
            
            if (!processedChatIds.has(chatId) && !newChats[chatId]) {
              try {
                const chatDetail = await this.bot.getChat(chatId);
                if (chatDetail) {
                  newChats[chatId] = chatDetail;
                  processedChatIds.add(chatId);
                }
              } catch (chatError) {
                log(`Error getting chat info from member update for ${chatId}: ${chatError instanceof Error ? chatError.message : String(chatError)}`, 'debug');
              }
            }
          }
          
          // Check channel posts
          if (update.channel_post && update.channel_post.chat) {
            const chatId = String(update.channel_post.chat.id);
            
            if (!processedChatIds.has(chatId) && !newChats[chatId]) {
              try {
                const chatDetail = await this.bot.getChat(chatId);
                if (chatDetail) {
                  newChats[chatId] = chatDetail;
                  processedChatIds.add(chatId);
                }
              } catch (chatError) {
                log(`Error getting chat info from channel post for ${chatId}: ${chatError instanceof Error ? chatError.message : String(chatError)}`, 'debug');
              }
            }
          }
        }
        
        // Save newly discovered chats to database and add to return list
        for (const [chatId, chatDetail] of Object.entries(newChats)) {
          // Save this new chat to the database
          const chatExists = await storage.getTelegramChat(chatId);
          if (!chatExists) {
            await storage.createTelegramChat({
              chatId: chatId,
              type: chatDetail.type,
              title: chatDetail.title || '',
              username: chatDetail.username || '',
            });
            log(`Discovered and added new Telegram chat: ${chatDetail.title || chatDetail.username || chatId}`, 'info');
          }
          
          // Add to result set
          chatDetails.push(chatDetail);
        }
        
        log(`Total chats after discovery: ${chatDetails.length} (${Object.keys(newChats).length} newly discovered)`, 'debug');
      } catch (discoveryError) {
        // Don't fail the whole operation if discovery fails
        log(`Error during chat discovery via getUpdates: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`, 'warn');
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
  
  /**
   * Check if the bot is still a member of a specific chat
   * @param chatId The chat ID to check
   * @returns Object with active status and any error message
   */
  async isChatActive(chatId: string): Promise<{ isActive: boolean, message?: string }> {
    if (!this.isReady() || !this.bot) {
      return { 
        isActive: false, 
        message: 'Telegram bot not initialized' 
      };
    }

    try {
      // Try to get chat info
      const chatInfo = await this.bot.getChat(chatId);
      
      // If we get a valid chat info, the bot is still a member
      if (chatInfo) {
        // Update the lastChecked timestamp and set isActive to true
        await storage.updateTelegramChatStatus(chatId, true);
        return { isActive: true };
      }
      
      // Update the lastChecked timestamp and set isActive to false
      await storage.updateTelegramChatStatus(chatId, false);
      return { 
        isActive: false, 
        message: 'Chat information unavailable' 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for specific error messages that indicate the bot is not a member anymore
      if (
        errorMessage.includes('chat not found') || 
        errorMessage.includes('bot was kicked') || 
        errorMessage.includes('ETELEGRAM: 403') ||
        errorMessage.includes('bot was blocked') ||
        errorMessage.includes('chat_id is empty')
      ) {
        // Update the lastChecked timestamp and set isActive to false
        await storage.updateTelegramChatStatus(chatId, false);
        return { 
          isActive: false, 
          message: `Bot does not have access to this chat: ${errorMessage}` 
        };
      }
      
      // For other errors, log but don't assume the bot is not a member
      log(`Error checking chat status for ${chatId}: ${errorMessage}`, 'error');
      // Don't update the chat status for transient errors
      return { 
        isActive: false, 
        message: `Error checking chat status: ${errorMessage}` 
      };
    }
  }
  
  /**
   * Updates the status of all monitored Telegram chats
   * @returns A summary of checked chats
   */
  async updateAllChatStatuses(): Promise<{
    total: number;
    active: number;
    inactive: number;
    errored: number;
    newlyDiscovered: number;
  }> {
    const result = {
      total: 0,
      active: 0,
      inactive: 0,
      errored: 0,
      newlyDiscovered: 0
    };
    
    try {
      // First make sure the bot is initialized
      if (!this.isReady() || !this.bot) {
        try {
          const settings = await storage.getTelegramBotSettings();
          if (settings && settings.token) {
            await this.initialize(settings.token);
          } else {
            log('No token available to initialize Telegram bot for status check', 'warn');
            return result;
          }
        } catch (initError) {
          log(`Failed to initialize Telegram bot during status check: ${initError instanceof Error ? initError.message : String(initError)}`, 'error');
          return result;
        }
      }
      
      if (!this.bot) {
        log('Bot initialization failed for status check', 'error');
        return result;
      }
      
      // First try to discover new chats
      try {
        log('Attempting to discover new chats before status check...', 'debug');
        const chats = await this.getChats();
        log(`Retrieved ${chats.length} chats during discovery phase`, 'debug');
        
        // Count newly discovered chats
        const existingChatIds = new Set<string>();
        const storedChats = await storage.getTelegramChats();
        storedChats.forEach(chat => existingChatIds.add(chat.chatId));
        
        for (const chat of chats) {
          const chatId = String(chat.id);
          if (!existingChatIds.has(chatId)) {
            result.newlyDiscovered++;
          }
        }
      } catch (discoveryError) {
        log(`Error during chat discovery phase: ${discoveryError instanceof Error ? discoveryError.message : String(discoveryError)}`, 'warn');
      }
      
      // Get all monitored chats
      const monitoredChatIds = await storage.getMonitoredTelegramChats();
      result.total = monitoredChatIds.length;
      
      if (monitoredChatIds.length === 0) {
        log('No monitored Telegram chats to check', 'debug');
        return result;
      }
      
      log(`Checking status of ${monitoredChatIds.length} Telegram chats`, 'info');
      
      // Check each chat with slight delay to avoid rate limiting
      for (const chatId of monitoredChatIds) {
        try {
          const { isActive } = await this.isChatActive(chatId);
          if (isActive) {
            result.active++;
          } else {
            result.inactive++;
          }
          
          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          log(`Error checking status of chat ${chatId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
          result.errored++;
        }
      }
      
      log(`Telegram chat status check complete: ${result.active} active, ${result.inactive} inactive, ${result.errored} errored, ${result.newlyDiscovered} newly discovered`, 'info');
      return result;
    } catch (error) {
      log(`Error updating all chat statuses: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return result;
    }
  }
}

// Export a singleton instance
export const telegramAPI = new TelegramAPI();