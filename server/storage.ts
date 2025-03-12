import { 
  users, 
  discordChannels, 
  discordMessages, 
  botSettings, 
  monitoredChannels,
  excludedUsers,
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

  // Channel monitoring
  isChannelMonitored(channelId: string): Promise<boolean>;
  setChannelMonitored(channelId: string, guildId: string, monitor: boolean): Promise<void>;
  getMonitoredChannels(guildId: string): Promise<string[]>;

  // User exclusion management
  getExcludedUsers(guildId: string): Promise<ExcludedUser[]>;
  isUserExcluded(userId: string, guildId: string): Promise<boolean>;
  excludeUser(userData: InsertExcludedUser): Promise<ExcludedUser>;
  removeExcludedUser(userId: string, guildId: string): Promise<void>;

  // Bot settings
  getBotSettings(guildId: string): Promise<BotSettings | undefined>;
  getAllBotSettings(): Promise<BotSettings[]>;
  createOrUpdateBotSettings(settings: InsertBotSettings): Promise<BotSettings>;

  // Analytics
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

  // Analytics
  async getSentimentByDateRange(startDate: Date, endDate: Date): Promise<DailySentimentData[]> {
    const messages = await this.getMessagesByDateRange(startDate, endDate);
    
    // Group messages by date
    const messagesByDate = messages.reduce((acc, message) => {
      const dateStr = format(message.createdAt, 'yyyy-MM-dd');
      if (!acc[dateStr]) {
        acc[dateStr] = [];
      }
      acc[dateStr].push(message);
      return acc;
    }, {} as Record<string, DiscordMessage[]>);
    
    // Process each date's data
    const result: DailySentimentData[] = [];
    
    for (const [dateStr, dateMessages] of Object.entries(messagesByDate)) {
      const sentimentCounts = {
        very_positive: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
        very_negative: 0
      };
      
      let sentimentSum = 0;
      
      // Count messages by sentiment
      for (const message of dateMessages) {
        sentimentCounts[message.sentiment as SentimentType]++;
        sentimentSum += message.sentimentScore;
      }
      
      const averageSentiment = sentimentSum / dateMessages.length;
      
      result.push({
        date: dateStr,
        averageSentiment,
        messageCount: dateMessages.length,
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
    
    const messages = await this.getMessagesByDateRange(startDate, endDate);
    
    const distribution = {
      very_positive: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      very_negative: 0,
      total: messages.length
    };
    
    for (const message of messages) {
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
    // Get total messages
    const [{ value: totalMessages }] = await db
      .select({ value: count() })
      .from(discordMessages);
    
    // Get messages from last 30 days for average sentiment
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const recentMessages = await this.getMessagesByDateRange(startDate, endDate);
    
    // Calculate avg sentiment for current period
    let sentimentSum = 0;
    const userSet = new Set<string>();
    
    for (const message of recentMessages) {
      sentimentSum += message.sentimentScore;
      userSet.add(message.userId);
    }
    
    const avgSentimentScore = recentMessages.length > 0 
      ? sentimentSum / recentMessages.length 
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
    const prevMessages = await this.getMessagesByDateRange(prevPeriodStart, startDate);
    
    // Calculate message growth
    let messageGrowth = 0;
    if (prevMessages.length > 0) {
      messageGrowth = ((recentMessages.length - prevMessages.length) / prevMessages.length) * 100;
    }
    
    // Calculate sentiment growth
    let prevSentimentSum = 0;
    const prevUserSet = new Set<string>();
    
    for (const message of prevMessages) {
      prevSentimentSum += message.sentimentScore;
      prevUserSet.add(message.userId);
    }
    
    const prevAvgSentimentScore = prevMessages.length > 0 
      ? prevSentimentSum / prevMessages.length 
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
