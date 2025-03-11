import { 
  users, 
  discordChannels, 
  discordMessages, 
  botSettings, 
  monitoredChannels,
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
  type SentimentType
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, between, gte, lte, count } from "drizzle-orm";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

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

  // Discord message management
  getRecentMessages(limit?: number): Promise<DiscordMessage[]>;
  getMessagesByDate(date: Date): Promise<DiscordMessage[]>;
  getMessagesByDateRange(startDate: Date, endDate: Date): Promise<DiscordMessage[]>;
  createDiscordMessage(message: InsertDiscordMessage): Promise<DiscordMessage>;

  // Channel monitoring
  isChannelMonitored(channelId: string): Promise<boolean>;
  setChannelMonitored(channelId: string, guildId: string, monitor: boolean): Promise<void>;
  getMonitoredChannels(guildId: string): Promise<string[]>;

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
    const [newChannel] = await db
      .insert(discordChannels)
      .values(channel)
      .returning();
    return newChannel;
  }

  // Discord message management
  async getRecentMessages(limit: number = 20): Promise<DiscordMessage[]> {
    return db
      .select()
      .from(discordMessages)
      .orderBy(desc(discordMessages.createdAt))
      .limit(limit);
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
    
    if (existing) {
      const [updated] = await db
        .update(botSettings)
        .set({
          ...settings,
          updatedAt: new Date()
        })
        .where(eq(botSettings.guildId, settings.guildId))
        .returning();
      
      return updated;
    } else {
      const [newSettings] = await db
        .insert(botSettings)
        .values(settings)
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
  }> {
    // Get total messages
    const [{ value: totalMessages }] = await db
      .select({ value: count() })
      .from(discordMessages);
    
    // Get messages from last 30 days for average sentiment
    const endDate = new Date();
    const startDate = subDays(endDate, 30);
    const recentMessages = await this.getMessagesByDateRange(startDate, endDate);
    
    // Calculate avg sentiment
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
    
    // Count active users
    const activeUsers = userSet.size;
    
    // Calculate message growth (comparing last 30 days to previous 30 days)
    const prevPeriodStart = subDays(startDate, 30);
    const prevMessages = await this.getMessagesByDateRange(prevPeriodStart, startDate);
    
    let messageGrowth = 0;
    if (prevMessages.length > 0) {
      messageGrowth = ((recentMessages.length - prevMessages.length) / prevMessages.length) * 100;
    }
    
    return {
      totalMessages,
      avgSentiment,
      activeUsers,
      messageGrowth
    };
  }
}

export const storage = new DatabaseStorage();
