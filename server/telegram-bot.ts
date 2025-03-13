import TelegramBot from 'node-telegram-bot-api';
import { log } from './vite';
import { telegramAPI } from './telegram-api';
import { storage } from './storage';
import { analyzeSentiment } from './openai';

export interface TelegramMessage {
  id: string;
  chatId: string;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  content: string;
  createdAt: Date;
}

/**
 * Process a Telegram message by analyzing sentiment and storing it in the database
 */
export async function processMessage(message: TelegramMessage): Promise<void> {
  try {
    // Skip message if it's empty or only contains media without text
    if (!message.content || message.content.trim() === '') {
      return;
    }

    // Check if user is excluded from analysis
    if (message.userId) {
      const isExcluded = await storage.isTelegramUserExcluded(message.userId);
      if (isExcluded) {
        log(`Skipping message from excluded Telegram user ${message.userId}`, 'debug');
        return;
      }
    }

    // Get sentiment analysis
    const analysis = await analyzeSentiment(message.content);
    
    // Store message with sentiment in database
    await storage.createTelegramMessage({
      messageId: message.id,
      chatId: message.chatId,
      userId: message.userId || '',
      username: message.username || '',
      firstName: message.firstName || '',
      lastName: message.lastName || '',
      content: message.content,
      sentiment: analysis.sentiment,
      sentimentScore: analysis.score,
      createdAt: message.createdAt,
    });

    log(`Processed Telegram message (ID: ${message.id}): ${analysis.sentiment}`, 'debug');
  } catch (error) {
    log(`Error processing Telegram message: ${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

/**
 * Set up message processing on the Telegram bot
 */
export function setupMessageListeners(bot: TelegramBot): void {
  log('Setting up Telegram message listeners', 'debug');
  
  // Handle new messages
  bot.on('message', async (msg) => {
    try {
      // Save the chat info to our database if we haven't seen it before
      const chatExists = await storage.getTelegramChat(String(msg.chat.id));
      
      if (!chatExists) {
        await storage.createTelegramChat({
          chatId: String(msg.chat.id),
          type: msg.chat.type,
          title: msg.chat.title || '',
          username: msg.chat.username || '',
        });
        log(`Added new Telegram chat to database: ${msg.chat.title || msg.chat.username || msg.chat.id}`, 'info');
      }
      
      // Check if this chat is being monitored
      const isMonitored = await storage.isTelegramChatMonitored(String(msg.chat.id));
      
      if (!isMonitored) {
        // Skip processing for unmonitored chats
        return;
      }
      
      // Convert Telegram message to our internal format
      const message: TelegramMessage = {
        id: String(msg.message_id),
        chatId: String(msg.chat.id),
        userId: msg.from ? String(msg.from.id) : undefined,
        username: msg.from ? msg.from.username : undefined,
        firstName: msg.from ? msg.from.first_name : undefined,
        lastName: msg.from ? msg.from.last_name : undefined,
        content: msg.text || '',
        createdAt: new Date(msg.date * 1000), // Convert Unix timestamp to Date
      };
      
      // Process the message
      await processMessage(message);
    } catch (error) {
      log(`Error handling Telegram message: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });
  
  // Update chat member list when the bot joins a new chat
  bot.on('new_chat_members', async (msg) => {
    try {
      // Check if our bot is among the new members
      const ourBot = msg.new_chat_members?.find(member => member.username === bot.botInfo?.username);
      
      if (ourBot) {
        log(`Bot was added to chat: ${msg.chat.title || msg.chat.username || msg.chat.id}`, 'info');
        
        // Save the chat to our database
        const chatExists = await storage.getTelegramChat(String(msg.chat.id));
        
        if (!chatExists) {
          await storage.createTelegramChat({
            chatId: String(msg.chat.id),
            type: msg.chat.type,
            title: msg.chat.title || '',
            username: msg.chat.username || '',
          });
        }
        
        // Send a welcome message
        await bot.sendMessage(msg.chat.id, 
          'Hello! I am a sentiment analysis bot. I will monitor messages in this chat to analyze sentiment.\n\n' +
          'To enable monitoring for this chat, an admin needs to use the web dashboard to add this chat to the monitored list.'
        );
      }
    } catch (error) {
      log(`Error handling new chat members: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });
  
  // Handle when the bot is removed from a chat
  bot.on('left_chat_member', async (msg) => {
    try {
      // Check if our bot is the one being removed
      if (msg.left_chat_member?.username === bot.botInfo?.username) {
        log(`Bot was removed from chat: ${msg.chat.title || msg.chat.username || msg.chat.id}`, 'info');
        
        // Remove chat from monitoring if it was being monitored
        const isMonitored = await storage.isTelegramChatMonitored(String(msg.chat.id));
        
        if (isMonitored) {
          await storage.setTelegramChatMonitored(String(msg.chat.id), false);
          log(`Removed chat ${msg.chat.id} from monitoring since bot was removed`, 'info');
        }
      }
    } catch (error) {
      log(`Error handling left chat member: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });
}

/**
 * Fetch historical messages from a Telegram chat
 * Note: This is limited by Telegram's API which doesn't allow bots to access message history
 * before they were added to the chat.
 */
export async function fetchHistoricalMessages(chatId: string): Promise<{success: boolean, count: number, message?: string}> {
  try {
    log(`Attempting to fetch historical messages for Telegram chat ${chatId}`, 'info');
    log('Note: Telegram bots cannot access messages sent before they were added to a chat', 'info');
    
    // Unfortunately, Telegram bots cannot retrieve chat history before they joined a chat
    return {
      success: true,
      count: 0,
      message: 'Telegram bots cannot access historical messages sent before they were added to the chat.'
    };
  } catch (error) {
    log(`Error fetching historical messages: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      count: 0,
      message: `Error fetching historical messages: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Start the Telegram bot with the provided token
 */
export async function startTelegramBot(token: string): Promise<{success: boolean, message?: string, botInfo?: TelegramBot.User}> {
  try {
    // Validate input
    if (!token || token.trim() === '') {
      return {
        success: false,
        message: "Telegram bot token is missing or empty. Please provide a valid token."
      };
    }
    
    // Clean the token (remove spaces, new lines, etc.)
    const cleanToken = token.trim();
    
    log(`Starting Telegram bot`);
    
    // Use the Telegram API service to initialize the bot
    const initialized = await telegramAPI.initialize(cleanToken, true);
    if (!initialized) {
      return {
        success: false,
        message: "Failed to authenticate with Telegram API. Please check your token and try again."
      };
    }
    
    // Get the bot instance
    const bot = telegramAPI.getBot();
    if (!bot) {
      return {
        success: false,
        message: "Failed to get Telegram bot instance after initialization."
      };
    }
    
    // Set up message listeners
    setupMessageListeners(bot);
    
    // Get bot information
    const botInfo = await bot.getMe();
    
    return {
      success: true,
      message: `Telegram bot initialized successfully (ID: ${botInfo.id}, Username: @${botInfo.username})`,
      botInfo: botInfo
    };
  } catch (error) {
    log(`Error starting Telegram bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return {
      success: false,
      message: `Failed to start Telegram bot: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}