import { 
  users, 
  discordChannels, 
  discordMessages, 
  botSettings, 
  monitoredChannels,
  excludedUsers,
  telegramChats,
  telegramMessages,
  telegramBotSettings,
  monitoredTelegramChats,
  excludedTelegramUsers,
  type User, 
  type InsertUser, 
  type DiscordChannel, 
  type InsertDiscordChannel, 
  type DiscordMessage, 
  type InsertDiscordMessage,
  type BotSettings,
  type InsertBotSettings,
  type MonitoredChannel,
  type InsertMonitoredChannel,
  type ExcludedUser,
  type InsertExcludedUser,
  type TelegramChat,
  type InsertTelegramChat,
  type TelegramMessage,
  type InsertTelegramMessage,
  type TelegramBotSettings,
  type InsertTelegramBotSettings,
  type MonitoredTelegramChat,
  type InsertMonitoredTelegramChat,
  type ExcludedTelegramUser,
  type InsertExcludedTelegramUser,
  type SentimentType
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, between, gte, lte, count, or, ilike } from "drizzle-orm";
import postgres from "postgres";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

// Create a postgres client for direct query execution
const pgClient = postgres(process.env.DATABASE_URL!, { 
  ssl: 'require',
  max: 5, // Connection pool size
});

const PostgresSessionStore = connectPgSimple(session);

export interface DailySentimentData {
  date: string;
  averageSentiment: number;
  messageCount: number;
  sentimentCounts: {
    very_positive: number;
    positive: number;
    neutral: number;
    negative: number;
    very_negative: number;
  };
}

export interface SentimentDistribution {
  very_positive: number;
  positive: number;
  neutral: number;
  negative: number;
  very_negative: number;
  total: number;
}

export interface CombinedMessage {
  id: string;
  platform: 'discord' | 'telegram';
  channelId: string;
  channelName?: string;
  userId: string;
  username: string;
  content: string;
  sentiment: SentimentType;
  sentimentScore: number;
  createdAt: Date;
  firstName?: string;
  lastName?: string;
  chatTitle?: string;
}

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Discord channel management
  getChannels(): Promise<DiscordChannel[]>;
  getChannel(channelId: string): Promise<DiscordChannel | undefined>;
  createChannel(channel: InsertDiscordChannel): Promise<DiscordChannel>;
  updateChannel(channel: InsertDiscordChannel): Promise<DiscordChannel>;

  // Discord message management
  getRecentMessages(limit?: number, filters?: { sentiment?: string; channelId?: string; search?: string; }): Promise<DiscordMessage[]>;
  getMessagesByDate(date: Date): Promise<DiscordMessage[]>;
  getMessagesByDateRange(startDate: Date, endDate: Date): Promise<DiscordMessage[]>;
  createDiscordMessage(message: InsertDiscordMessage): Promise<DiscordMessage>;

  // Discord channel monitoring
  isChannelMonitored(channelId: string): Promise<boolean>;
  setChannelMonitored(channelId: string, guildId: string, monitor: boolean): Promise<void>;
  getMonitoredChannels(guildId: string): Promise<string[]>;

  // Discord user exclusion management
  getExcludedUsers(guildId: string): Promise<ExcludedUser[]>;
  isUserExcluded(userId: string, guildId: string): Promise<boolean>;
  excludeUser(userData: InsertExcludedUser): Promise<ExcludedUser>;
  removeExcludedUser(userId: string, guildId: string): Promise<void>;

  // Discord bot settings
  getBotSettings(guildId: string): Promise<BotSettings | undefined>;
  getAllBotSettings(): Promise<BotSettings[]>;
  createOrUpdateBotSettings(settings: InsertBotSettings): Promise<BotSettings>;

  // Telegram chat management
  getTelegramChats(): Promise<TelegramChat[]>;
  getTelegramChat(chatId: string): Promise<TelegramChat | undefined>;
  createTelegramChat(chat: InsertTelegramChat): Promise<TelegramChat>;
  updateTelegramChat(chat: InsertTelegramChat): Promise<TelegramChat>;

  // Telegram message management
  getRecentTelegramMessages(limit?: number, filters?: { sentiment?: string; chatId?: string; search?: string; }): Promise<TelegramMessage[]>;
  getTelegramMessagesByDate(date: Date): Promise<TelegramMessage[]>;
  getTelegramMessagesByDateRange(startDate: Date, endDate: Date): Promise<TelegramMessage[]>;
  createTelegramMessage(message: InsertTelegramMessage): Promise<TelegramMessage>;

  // Telegram chat monitoring
  isTelegramChatMonitored(chatId: string): Promise<boolean>;
  setTelegramChatMonitored(chatId: string, monitor: boolean): Promise<void>;
  getMonitoredTelegramChats(): Promise<string[]>;

  // Telegram user exclusion management
  getExcludedTelegramUsers(): Promise<ExcludedTelegramUser[]>;
  isTelegramUserExcluded(userId: string): Promise<boolean>;
  excludeTelegramUser(userData: InsertExcludedTelegramUser): Promise<ExcludedTelegramUser>;
  removeExcludedTelegramUser(userId: string): Promise<void>;

  // Telegram bot settings
  getTelegramBotSettings(): Promise<TelegramBotSettings | undefined>;
  createOrUpdateTelegramBotSettings(settings: InsertTelegramBotSettings): Promise<TelegramBotSettings>;

  // Combined message management (across platforms)
  getCombinedMessages(limit?: number, filters?: { 
    sentiment?: string; 
    channelId?: string; 
    search?: string;
    platform?: 'discord' | 'telegram' | 'all';
  }): Promise<CombinedMessage[]>;

  // Analytics (combined for both platforms)
  getSentimentByDateRange(startDate: Date, endDate: Date): Promise<DailySentimentData[]>;
  getSentimentDistribution(days?: number): Promise<SentimentDistribution>;
  getStats(): Promise<{
    totalMessages: number;
    avgSentiment: string;
    activeUsers: number;
    messageGrowth: number;
  }>;

  // Session store for authentication
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
        ssl: true,
      },
      createTableIfMissing: true,
    });
  }

  // User management
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Discord channel management
  async getChannels(): Promise<DiscordChannel[]> {
    return db.select().from(discordChannels).orderBy(discordChannels.name);
  }

  async getChannel(channelId: string): Promise<DiscordChannel | undefined> {
    const [channel] = await db
      .select()
      .from(discordChannels)
      .where(eq(discordChannels.channelId, channelId));
    return channel;
  }

  async createChannel(channel: InsertDiscordChannel): Promise<DiscordChannel> {
    try {
      const [newChannel] = await db
        .insert(discordChannels)
        .values(channel)
        .returning();
      return newChannel;
    } catch (error) {
      // If there's a duplicate, try to update instead
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return this.updateChannel(channel);
      }
      throw error;
    }
  }
  
  async updateChannel(channel: InsertDiscordChannel): Promise<DiscordChannel> {
    const [updatedChannel] = await db
      .update(discordChannels)
      .set({
        name: channel.name,
        guildName: channel.guildName
      })
      .where(eq(discordChannels.channelId, channel.channelId))
      .returning();
    return updatedChannel;
  }

  // Discord message management
  async getRecentMessages(
    limit: number = 20, 
    filters?: { 
      sentiment?: string;
      channelId?: string;
      search?: string;
    }
  ): Promise<DiscordMessage[]> {
    // Start building the SQL query
    let sqlQuery = `
      SELECT * FROM discord_messages
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    // Apply sentiment filter if provided and not 'all'
    if (filters?.sentiment && filters.sentiment !== 'all') {
      sqlQuery += ` AND sentiment = $${paramIndex}`;
      params.push(filters.sentiment);
      paramIndex++;
    }
    
    // Apply channel filter if provided and not 'all'
    if (filters?.channelId && filters.channelId !== 'all') {
      sqlQuery += ` AND channel_id = $${paramIndex}`;
      params.push(filters.channelId);
      paramIndex++;
    }
    
    // Apply text search if provided
    if (filters?.search && filters.search.trim() !== '') {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      sqlQuery += ` AND (LOWER(content) LIKE $${paramIndex} OR LOWER(username) LIKE $${paramIndex})`;
      params.push(searchTerm);
      paramIndex++;
    }
    
    // Add ordering and limit
    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    // Execute the query using the postgres client directly
    const results = await pgClient.unsafe(sqlQuery, params);
    
    // Remove sentimentConfidence which is not in our schema
    return results.map(row => {
      const message: DiscordMessage = {
        id: Number(row.id),
        messageId: String(row.message_id), 
        channelId: String(row.channel_id),
        userId: String(row.user_id),
        username: String(row.username),
        content: String(row.content),
        sentiment: String(row.sentiment) as SentimentType,
        sentimentScore: Number(row.sentiment_score),
        createdAt: new Date(String(row.created_at)),
        analyzedAt: new Date(String(row.analyzed_at))
      };
      return message;
    });
  }

  async getMessagesByDate(date: Date): Promise<DiscordMessage[]> {
    const start = startOfDay(date);
    const end = endOfDay(date);
    
    return db
      .select()
      .from(discordMessages)
      .where(
        and(
          gte(discordMessages.createdAt, start),
          lte(discordMessages.createdAt, end)
        )
      )
      .orderBy(desc(discordMessages.createdAt));
  }

  async getMessagesByDateRange(startDate: Date, endDate: Date): Promise<DiscordMessage[]> {
    return db
      .select()
      .from(discordMessages)
      .where(
        and(
          gte(discordMessages.createdAt, startDate),
          lte(discordMessages.createdAt, endDate)
        )
      )
      .orderBy(desc(discordMessages.createdAt));
  }

  async createDiscordMessage(message: InsertDiscordMessage): Promise<DiscordMessage> {
    const [newMessage] = await db
      .insert(discordMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  // Channel monitoring
  async isChannelMonitored(channelId: string): Promise<boolean> {
    const [channel] = await db
      .select()
      .from(monitoredChannels)
      .where(eq(monitoredChannels.channelId, channelId));
    
    if (channel) {
      return true;
    }
    
    // Check if the guild has a "monitor all channels" setting
    const [guildChannel] = await db
      .select()
      .from(discordChannels)
      .where(eq(discordChannels.channelId, channelId));
    
    if (guildChannel) {
      const [settings] = await db
        .select()
        .from(botSettings)
        .where(
          and(
            eq(botSettings.guildId, guildChannel.guildId),
            eq(botSettings.isActive, true),
            eq(botSettings.monitorAllChannels, true)
          )
        );
      
      return !!settings;
    }
    
    return false;
  }

  async setChannelMonitored(channelId: string, guildId: string, monitor: boolean): Promise<void> {
    if (monitor) {
      // First check if it's already monitored
      const [existing] = await db
        .select()
        .from(monitoredChannels)
        .where(eq(monitoredChannels.channelId, channelId));
      
      if (!existing) {
        await db
          .insert(monitoredChannels)
          .values({
            channelId,
            guildId
          });
      }
    } else {
      await db
        .delete(monitoredChannels)
        .where(eq(monitoredChannels.channelId, channelId));
    }
  }

  async getMonitoredChannels(guildId: string): Promise<string[]> {
    const channels = await db
      .select()
      .from(monitoredChannels)
      .where(eq(monitoredChannels.guildId, guildId));
    
    return channels.map(c => c.channelId);
  }

  // User exclusion management
  async getExcludedUsers(guildId: string): Promise<ExcludedUser[]> {
    // Use raw SQL to ensure consistent field naming
    const query = sql`
      SELECT 
        id, 
        user_id, 
        guild_id, 
        username, 
        reason, 
        created_at
      FROM excluded_users
      WHERE guild_id = ${guildId}
      ORDER BY username
    `;
    
    const results = await db.execute(query);
    
    // Transform from db snake_case to camelCase with explicit type casting
    return results.map(row => ({
      id: Number(row.id),
      userId: String(row.user_id),
      guildId: String(row.guild_id),
      username: String(row.username),
      reason: row.reason ? String(row.reason) : null,
      createdAt: row.created_at ? new Date(String(row.created_at)) : new Date()
    }));
  }

  async isUserExcluded(userId: string, guildId: string): Promise<boolean> {
    // Use raw SQL query to ensure consistent field naming
    const query = sql`
      SELECT 1 FROM excluded_users
      WHERE user_id = ${userId} AND guild_id = ${guildId}
      LIMIT 1
    `;
    
    const result = await db.execute(query);
    return result.length > 0;
  }

  async excludeUser(userData: InsertExcludedUser): Promise<ExcludedUser> {
    try {
      // Format current date as ISO string which PostgreSQL can parse
      const currentTime = new Date().toISOString();
      
      // Use raw SQL approach for inserting
      const query = sql`
        INSERT INTO excluded_users (user_id, guild_id, username, reason, created_at)
        VALUES (${userData.userId}, ${userData.guildId}, ${userData.username}, ${userData.reason || null}, ${currentTime})
        RETURNING *
      `;
      
      const result = await db.execute(query);
      
      // Convert from db snake_case to camelCase with explicit type casting
      return {
        id: Number(result[0].id),
        userId: String(result[0].user_id),
        guildId: String(result[0].guild_id),
        username: String(result[0].username),
        reason: result[0].reason ? String(result[0].reason) : null,
        createdAt: result[0].created_at ? new Date(String(result[0].created_at)) : new Date()
      };
    } catch (error) {
      // If there's a duplicate, just return the existing user
      if (error instanceof Error && error.message.includes('duplicate key')) {
        const query = sql`
          SELECT * FROM excluded_users
          WHERE user_id = ${userData.userId} AND guild_id = ${userData.guildId}
        `;
        
        const result = await db.execute(query);
        
        // Convert from db snake_case to camelCase with explicit type casting
        return {
          id: Number(result[0].id),
          userId: String(result[0].user_id),
          guildId: String(result[0].guild_id),
          username: String(result[0].username),
          reason: result[0].reason ? String(result[0].reason) : null,
          createdAt: result[0].created_at ? new Date(String(result[0].created_at)) : new Date()
        };
      }
      
      console.error('Error excluding user:', error);
      throw error;
    }
  }

  async removeExcludedUser(userId: string, guildId: string): Promise<void> {
    // Use raw SQL to delete
    const query = sql`
      DELETE FROM excluded_users
      WHERE user_id = ${userId} AND guild_id = ${guildId}
    `;
    
    await db.execute(query);
  }

  // Bot settings
  async getBotSettings(guildId: string): Promise<BotSettings | undefined> {
    const [settings] = await db
      .select()
      .from(botSettings)
      .where(eq(botSettings.guildId, guildId));
    
    return settings;
  }

  async getAllBotSettings(): Promise<BotSettings[]> {
    return db
      .select()
      .from(botSettings)
      .orderBy(desc(botSettings.updatedAt));
  }

  async createOrUpdateBotSettings(settings: InsertBotSettings): Promise<BotSettings> {
    // Check if settings already exist
    const existing = await this.getBotSettings(settings.guildId);
    
    // Ensure monitorAllChannels is set based on UI state if provided
    const updatedSettings = {
      ...settings,
      // Set monitor_all_channels based on UI state if it's provided
      monitorAllChannels: settings.monitorAllChannels !== undefined ? 
        settings.monitorAllChannels : 
        existing?.monitorAllChannels || false
    };
    
    if (existing) {
      const [updated] = await db
        .update(botSettings)
        .set({
          ...updatedSettings,
          updatedAt: new Date()
        })
        .where(eq(botSettings.guildId, settings.guildId))
        .returning();
      
      return updated;
    } else {
      const [newSettings] = await db
        .insert(botSettings)
        .values(updatedSettings)
        .returning();
      
      return newSettings;
    }
  }

  // Telegram chat management
  async getTelegramChats(): Promise<TelegramChat[]> {
    return db.select().from(telegramChats).orderBy(telegramChats.title);
  }

  async getTelegramChat(chatId: string): Promise<TelegramChat | undefined> {
    const [chat] = await db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.chatId, chatId));
    return chat;
  }

  async createTelegramChat(chat: InsertTelegramChat): Promise<TelegramChat> {
    try {
      const [newChat] = await db
        .insert(telegramChats)
        .values(chat)
        .returning();
      return newChat;
    } catch (error) {
      // If there's a duplicate, try to update instead
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return this.updateTelegramChat(chat);
      }
      throw error;
    }
  }
  
  async updateTelegramChat(chat: InsertTelegramChat): Promise<TelegramChat> {
    const [updatedChat] = await db
      .update(telegramChats)
      .set({
        title: chat.title,
        username: chat.username,
        type: chat.type
      })
      .where(eq(telegramChats.chatId, chat.chatId))
      .returning();
    return updatedChat;
  }

  // Telegram message management
  async getRecentTelegramMessages(
    limit: number = 20, 
    filters?: { 
      sentiment?: string;
      chatId?: string;
      search?: string;
    }
  ): Promise<TelegramMessage[]> {
    // Start building the SQL query
    let sqlQuery = `
      SELECT * FROM telegram_messages
      WHERE 1=1
    `;
    
    const params: any[] = [];
    let paramIndex = 1;
    
    // Apply sentiment filter if provided and not 'all'
    if (filters?.sentiment && filters.sentiment !== 'all') {
      sqlQuery += ` AND sentiment = $${paramIndex}`;
      params.push(filters.sentiment);
      paramIndex++;
    }
    
    // Apply chat filter if provided and not 'all'
    if (filters?.chatId && filters.chatId !== 'all') {
      sqlQuery += ` AND chat_id = $${paramIndex}`;
      params.push(filters.chatId);
      paramIndex++;
    }
    
    // Apply text search if provided
    if (filters?.search && filters.search.trim() !== '') {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      sqlQuery += ` AND (LOWER(content) LIKE $${paramIndex} OR LOWER(username) LIKE $${paramIndex} OR LOWER(first_name) LIKE $${paramIndex} OR LOWER(last_name) LIKE $${paramIndex})`;
      params.push(searchTerm);
      paramIndex++;
    }
    
    // Add ordering and limit
    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);
    
    // Execute the query using the postgres client directly
    const results = await pgClient.unsafe(sqlQuery, params);
    
    // Map results to TelegramMessage type
    return results.map(row => {
      const message: TelegramMessage = {
        id: Number(row.id),
        messageId: String(row.message_id),
        chatId: String(row.chat_id),
        userId: row.user_id ? String(row.user_id) : null,
        username: row.username ? String(row.username) : null,
        firstName: row.first_name ? String(row.first_name) : null,
        lastName: row.last_name ? String(row.last_name) : null,
        content: String(row.content),
        sentiment: String(row.sentiment) as SentimentType,
        sentimentScore: Number(row.sentiment_score),
        createdAt: new Date(String(row.created_at)),
        analyzedAt: new Date(String(row.analyzed_at))
      };
      return message;
    });
  }

  async getTelegramMessagesByDate(date: Date): Promise<TelegramMessage[]> {
    const start = startOfDay(date);
    const end = endOfDay(date);
    
    return db
      .select()
      .from(telegramMessages)
      .where(
        and(
          gte(telegramMessages.createdAt, start),
          lte(telegramMessages.createdAt, end)
        )
      )
      .orderBy(desc(telegramMessages.createdAt));
  }

  async getTelegramMessagesByDateRange(startDate: Date, endDate: Date): Promise<TelegramMessage[]> {
    return db
      .select()
      .from(telegramMessages)
      .where(
        and(
          gte(telegramMessages.createdAt, startDate),
          lte(telegramMessages.createdAt, endDate)
        )
      )
      .orderBy(desc(telegramMessages.createdAt));
  }

  async createTelegramMessage(message: InsertTelegramMessage): Promise<TelegramMessage> {
    const [newMessage] = await db
      .insert(telegramMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  // Telegram chat monitoring
  async isTelegramChatMonitored(chatId: string): Promise<boolean> {
    const [chat] = await db
      .select()
      .from(monitoredTelegramChats)
      .where(eq(monitoredTelegramChats.chatId, chatId));
    
    return !!chat;
  }

  async setTelegramChatMonitored(chatId: string, monitor: boolean): Promise<void> {
    if (monitor) {
      // First check if it's already monitored
      const [existing] = await db
        .select()
        .from(monitoredTelegramChats)
        .where(eq(monitoredTelegramChats.chatId, chatId));
      
      if (!existing) {
        await db
          .insert(monitoredTelegramChats)
          .values({
            chatId
          });
      }
    } else {
      await db
        .delete(monitoredTelegramChats)
        .where(eq(monitoredTelegramChats.chatId, chatId));
    }
  }

  async getMonitoredTelegramChats(): Promise<string[]> {
    const chats = await db
      .select()
      .from(monitoredTelegramChats);
    
    return chats.map(c => c.chatId);
  }

  // Telegram user exclusion management
  async getExcludedTelegramUsers(): Promise<ExcludedTelegramUser[]> {
    // Use raw SQL to ensure consistent field naming
    const query = sql`
      SELECT 
        id, 
        user_id, 
        username, 
        first_name,
        last_name,
        reason, 
        created_at
      FROM excluded_telegram_users
      ORDER BY username, first_name
    `;
    
    const results = await db.execute(query);
    
    // Transform from db snake_case to camelCase with explicit type casting
    return results.map(row => ({
      id: Number(row.id),
      userId: String(row.user_id),
      username: row.username ? String(row.username) : null,
      firstName: row.first_name ? String(row.first_name) : null,
      lastName: row.last_name ? String(row.last_name) : null,
      reason: row.reason ? String(row.reason) : null,
      createdAt: row.created_at ? new Date(String(row.created_at)) : new Date()
    }));
  }

  async isTelegramUserExcluded(userId: string): Promise<boolean> {
    // Use raw SQL query to ensure consistent field naming
    const query = sql`
      SELECT 1 FROM excluded_telegram_users
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    
    const result = await db.execute(query);
    return result.length > 0;
  }

  async excludeTelegramUser(userData: InsertExcludedTelegramUser): Promise<ExcludedTelegramUser> {
    try {
      // Format current date as ISO string which PostgreSQL can parse
      const currentTime = new Date().toISOString();
      
      // Use raw SQL approach for inserting
      const query = sql`
        INSERT INTO excluded_telegram_users (user_id, username, first_name, last_name, reason, created_at)
        VALUES (${userData.userId}, ${userData.username || null}, ${userData.firstName || null}, ${userData.lastName || null}, ${userData.reason || null}, ${currentTime})
        RETURNING *
      `;
      
      const result = await db.execute(query);
      
      // Convert from db snake_case to camelCase with explicit type casting
      return {
        id: Number(result[0].id),
        userId: String(result[0].user_id),
        username: result[0].username ? String(result[0].username) : null,
        firstName: result[0].first_name ? String(result[0].first_name) : null,
        lastName: result[0].last_name ? String(result[0].last_name) : null,
        reason: result[0].reason ? String(result[0].reason) : null,
        createdAt: result[0].created_at ? new Date(String(result[0].created_at)) : new Date()
      };
    } catch (error) {
      // If there's a duplicate, just return the existing user
      if (error instanceof Error && error.message.includes('duplicate key')) {
        const query = sql`
          SELECT * FROM excluded_telegram_users
          WHERE user_id = ${userData.userId}
        `;
        
        const result = await db.execute(query);
        
        // Convert from db snake_case to camelCase with explicit type casting
        return {
          id: Number(result[0].id),
          userId: String(result[0].user_id),
          username: result[0].username ? String(result[0].username) : null,
          firstName: result[0].first_name ? String(result[0].first_name) : null,
          lastName: result[0].last_name ? String(result[0].last_name) : null,
          reason: result[0].reason ? String(result[0].reason) : null,
          createdAt: result[0].created_at ? new Date(String(result[0].created_at)) : new Date()
        };
      }
      
      console.error('Error excluding Telegram user:', error);
      throw error;
    }
  }

  async removeExcludedTelegramUser(userId: string): Promise<void> {
    // Use raw SQL to delete
    const query = sql`
      DELETE FROM excluded_telegram_users
      WHERE user_id = ${userId}
    `;
    
    await db.execute(query);
  }

  // Telegram bot settings
  async getTelegramBotSettings(): Promise<TelegramBotSettings | undefined> {
    const [settings] = await db
      .select()
      .from(telegramBotSettings)
      .orderBy(desc(telegramBotSettings.updatedAt))
      .limit(1);
    
    return settings;
  }

  // Combined message management (across platforms)
  async getCombinedMessages(
    limit: number = 20, 
    filters?: { 
      sentiment?: string; 
      channelId?: string; 
      search?: string;
      platform?: 'discord' | 'telegram' | 'all';
    }
  ): Promise<CombinedMessage[]> {
    // Default platform to 'all' if not specified
    const platform = filters?.platform || 'all';
    
    let combinedMessages: CombinedMessage[] = [];
    
    // Get Discord messages if platform is 'all' or 'discord'
    if (platform === 'all' || platform === 'discord') {
      const discordMessages = await this.getRecentMessages(
        platform === 'all' ? Math.floor(limit / 2) : limit, 
        {
          sentiment: filters?.sentiment,
          channelId: filters?.channelId,
          search: filters?.search
        }
      );
      
      // Map Discord messages to the combined format
      const discordCombined = discordMessages.map(msg => {
        return {
          id: `discord-${msg.messageId}`,
          platform: 'discord' as const,
          channelId: msg.channelId,
          userId: msg.userId,
          username: msg.username,
          content: msg.content,
          sentiment: msg.sentiment,
          sentimentScore: msg.sentimentScore,
          createdAt: msg.createdAt
        } as CombinedMessage;
      });
      
      combinedMessages = [...combinedMessages, ...discordCombined];
    }
    
    // Get Telegram messages if platform is 'all' or 'telegram'
    if (platform === 'all' || platform === 'telegram') {
      const telegramMessages = await this.getRecentTelegramMessages(
        platform === 'all' ? Math.floor(limit / 2) : limit, 
        {
          sentiment: filters?.sentiment,
          chatId: filters?.channelId,
          search: filters?.search
        }
      );
      
      // Map Telegram messages to the combined format
      const telegramCombined = telegramMessages.map(msg => {
        return {
          id: `telegram-${msg.messageId}`,
          platform: 'telegram' as const,
          channelId: msg.chatId,
          userId: msg.userId || '',
          username: msg.username || (msg.firstName ? msg.firstName : 'Unknown User'),
          content: msg.content,
          sentiment: msg.sentiment,
          sentimentScore: msg.sentimentScore,
          createdAt: msg.createdAt,
          firstName: msg.firstName || undefined,
          lastName: msg.lastName || undefined,
          // Add chat title if available from joined data
          chatTitle: msg.chatTitle || undefined
        } as CombinedMessage;
      });
      
      combinedMessages = [...combinedMessages, ...telegramCombined];
    }
    
    // Sort combined messages by creation date (newest first)
    combinedMessages.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Apply limit to final combined result
    return combinedMessages.slice(0, limit);
  }

  async createOrUpdateTelegramBotSettings(settings: InsertTelegramBotSettings): Promise<TelegramBotSettings> {
    // Check if any settings already exist
    const existing = await this.getTelegramBotSettings();
    
    if (existing) {
      const [updated] = await db
        .update(telegramBotSettings)
        .set({
          ...settings,
          updatedAt: new Date()
        })
        .where(eq(telegramBotSettings.id, existing.id))
        .returning();
      
      return updated;
    } else {
      const [newSettings] = await db
        .insert(telegramBotSettings)
        .values(settings)
        .returning();
      
      return newSettings;
    }
  }

  // Analytics
  async getSentimentByDateRange(startDate: Date, endDate: Date): Promise<DailySentimentData[]> {
    // Get messages from both Discord and Telegram
    const discordMessages = await this.getMessagesByDateRange(startDate, endDate);
    const telegramMessages = await this.getTelegramMessagesByDateRange(startDate, endDate);
    
    // Combine all messages
    const combinedMessagesByDate: Record<string, Array<DiscordMessage | TelegramMessage>> = {};
    
    // Group Discord messages by date
    discordMessages.forEach(message => {
      const dateStr = format(message.createdAt, 'yyyy-MM-dd');
      if (!combinedMessagesByDate[dateStr]) {
        combinedMessagesByDate[dateStr] = [];
      }
      combinedMessagesByDate[dateStr].push(message);
    });
    
    // Group Telegram messages by date
    telegramMessages.forEach(message => {
      const dateStr = format(message.createdAt, 'yyyy-MM-dd');
      if (!combinedMessagesByDate[dateStr]) {
        combinedMessagesByDate[dateStr] = [];
      }
      combinedMessagesByDate[dateStr].push(message);
    });
    
    // Process each date's data
    const result: DailySentimentData[] = [];
    
    for (const [dateStr, messages] of Object.entries(combinedMessagesByDate)) {
      const sentimentCounts = {
        very_positive: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        very_negative: 0
      };
      
      let sentimentSum = 0;
      
      // Count messages by sentiment
      for (const message of messages) {
        sentimentCounts[message.sentiment as SentimentType]++;
        sentimentSum += message.sentimentScore;
      }
      
      const averageSentiment = sentimentSum / messages.length;
      
      result.push({
        date: dateStr,
        averageSentiment,
        messageCount: messages.length,
        sentimentCounts
      });
    }
    
    // Sort by date
    result.sort((a, b) => a.date.localeCompare(b.date));
    
    return result;
  }

  async getSentimentDistribution(days: number = 30): Promise<SentimentDistribution> {
    const endDate = new Date();
    const startDate = subDays(endDate, days);
    
    // Get both Discord and Telegram messages
    const discordMessages = await this.getMessagesByDateRange(startDate, endDate);
    const telegramMessages = await this.getTelegramMessagesByDateRange(startDate, endDate);
    
    const totalCount = discordMessages.length + telegramMessages.length;
    
    const distribution = {
      very_positive: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      very_negative: 0,
      total: totalCount
    };
    
    // Process Discord messages
    for (const message of discordMessages) {
      distribution[message.sentiment as SentimentType]++;
    }
    
    // Process Telegram messages
    for (const message of telegramMessages) {
      distribution[message.sentiment as SentimentType]++;
    }
    
    return distribution;
  }

  async getStats(): Promise<{
    totalMessages: number;
    avgSentiment: string;
    activeUsers: number;
    messageGrowth: number;
    sentimentGrowth: number;
    userGrowth: number;
  }> {
    // Get total messages (Discord + Telegram)
    const [{ value: discordTotal }] = await db
      .select({ value: count() })
      .from(discordMessages);
      
    const [{ value: telegramTotal }] = await db
      .select({ value: count() })
      .from(telegramMessages);
      
    const totalMessages = discordTotal + telegramTotal;
    
    // Get messages from last 30 days for average sentiment
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    
    // Get both Discord and Telegram messages
    const recentDiscordMessages = await this.getMessagesByDateRange(startDate, endDate);
    const recentTelegramMessages = await this.getTelegramMessagesByDateRange(startDate, endDate);
    
    // Calculate avg sentiment for current period
    let sentimentSum = 0;
    const userSet = new Set<string>();
    
    // Process Discord messages
    for (const message of recentDiscordMessages) {
      sentimentSum += message.sentimentScore;
      userSet.add(`discord:${message.userId}`);
    }
    
    // Process Telegram messages
    for (const message of recentTelegramMessages) {
      sentimentSum += message.sentimentScore;
      if (message.userId) {
        userSet.add(`telegram:${message.userId}`);
      }
    }
    
    const totalRecentMessages = recentDiscordMessages.length + recentTelegramMessages.length;
    
    const avgSentimentScore = totalRecentMessages > 0 
      ? sentimentSum / totalRecentMessages 
      : 2; // Default to neutral
    
    // Map score to sentiment label
    let avgSentiment = 'Neutral';
    if (avgSentimentScore >= 3.5) avgSentiment = 'Very Positive';
    else if (avgSentimentScore >= 2.5) avgSentiment = 'Positive';
    else if (avgSentimentScore >= 1.5) avgSentiment = 'Neutral';
    else if (avgSentimentScore >= 0.5) avgSentiment = 'Negative';
    else avgSentiment = 'Very Negative';
    
    // Count active users in current period
    const activeUsers = userSet.size;
    
    // Calculate data for previous period
    const prevPeriodStart = subDays(startDate, 30);
    
    // Get previous period messages
    const prevDiscordMessages = await this.getMessagesByDateRange(prevPeriodStart, startDate);
    const prevTelegramMessages = await this.getTelegramMessagesByDateRange(prevPeriodStart, startDate);
    
    const totalPrevMessages = prevDiscordMessages.length + prevTelegramMessages.length;
    
    // Calculate message growth
    let messageGrowth = 0;
    if (totalPrevMessages > 0) {
      messageGrowth = ((totalRecentMessages - totalPrevMessages) / totalPrevMessages) * 100;
    }
    
    // Calculate sentiment growth
    let prevSentimentSum = 0;
    const prevUserSet = new Set<string>();
    
    // Process Discord messages from previous period
    for (const message of prevDiscordMessages) {
      prevSentimentSum += message.sentimentScore;
      prevUserSet.add(`discord:${message.userId}`);
    }
    
    // Process Telegram messages from previous period
    for (const message of prevTelegramMessages) {
      prevSentimentSum += message.sentimentScore;
      if (message.userId) {
        prevUserSet.add(`telegram:${message.userId}`);
      }
    }
    
    const prevAvgSentimentScore = totalPrevMessages > 0 
      ? prevSentimentSum / totalPrevMessages 
      : 2; // Default to neutral
    
    let sentimentGrowth = 0;
    if (prevAvgSentimentScore > 0) {
      sentimentGrowth = ((avgSentimentScore - prevAvgSentimentScore) / prevAvgSentimentScore) * 100;
    }
    
    // Calculate user growth
    const prevActiveUsers = prevUserSet.size;
    let userGrowth = 0;
    if (prevActiveUsers > 0) {
      userGrowth = ((activeUsers - prevActiveUsers) / prevActiveUsers) * 100;
    }
    
    return {
      totalMessages,
      avgSentiment,
      activeUsers,
      messageGrowth,
      sentimentGrowth,
      userGrowth
    };
  }
}

export const storage = new DatabaseStorage();
