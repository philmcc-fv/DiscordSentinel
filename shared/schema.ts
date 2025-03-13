import { pgTable, text, serial, integer, boolean, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Platform enum for distinguishing between Discord and Telegram
export const platformEnum = pgEnum('platform', [
  'discord',
  'telegram'
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const sentimentEnum = pgEnum('sentiment', [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative'
]);

// Discord-specific tables
export const discordChannels = pgTable("discord_channels", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull().unique(),
  name: text("name").notNull(),
  guildId: text("guild_id").notNull(),
  guildName: text("guild_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const discordMessages = pgTable("discord_messages", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  content: text("content").notNull(),
  sentiment: sentimentEnum("sentiment").notNull(),
  sentimentScore: integer("sentiment_score").notNull(),
  createdAt: timestamp("created_at").notNull(),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
});

export const botSettings = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull().unique(),
  token: text("token"),
  prefix: text("prefix").default("!"),
  analysisFrequency: text("analysis_frequency").default("realtime"),
  loggingEnabled: boolean("logging_enabled").default(true),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  isActive: boolean("is_active").default(true).notNull(),
  monitorAllChannels: boolean("monitor_all_channels").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const monitoredChannels = pgTable("monitored_channels", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const excludedUsers = pgTable("excluded_users", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Ensure a user can only be excluded once per guild
    userGuildUnique: unique().on(table.guildId, table.userId)
  };
});

// Telegram-specific tables
export const telegramChats = pgTable("telegram_chats", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  type: text("type").notNull(), // group, supergroup, private, channel
  title: text("title"),
  username: text("username"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const telegramMessages = pgTable("telegram_messages", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull(),
  chatId: text("chat_id").notNull(),
  userId: text("user_id"),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  content: text("content").notNull(),
  sentiment: sentimentEnum("sentiment").notNull(),
  sentimentScore: integer("sentiment_score").notNull(),
  createdAt: timestamp("created_at").notNull(),
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
}, (table) => {
  return {
    // Telegram message IDs are unique only within a chat
    messageChatUnique: unique().on(table.messageId, table.chatId)
  };
});

export const telegramBotSettings = pgTable("telegram_bot_settings", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  username: text("username"),
  analysisFrequency: text("analysis_frequency").default("realtime"),
  loggingEnabled: boolean("logging_enabled").default(true),
  notificationsEnabled: boolean("notifications_enabled").default(true),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const monitoredTelegramChats = pgTable("monitored_telegram_chats", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const excludedTelegramUsers = pgTable("excluded_telegram_users", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insertion schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Discord insertion schemas
export const insertDiscordChannelSchema = createInsertSchema(discordChannels).pick({
  channelId: true,
  name: true,
  guildId: true,
  guildName: true,
});

export const insertDiscordMessageSchema = createInsertSchema(discordMessages).pick({
  messageId: true,
  channelId: true,
  userId: true,
  username: true,
  content: true,
  sentiment: true,
  sentimentScore: true,
  createdAt: true,
});

export const insertBotSettingsSchema = createInsertSchema(botSettings).pick({
  guildId: true,
  token: true,
  prefix: true,
  analysisFrequency: true,
  loggingEnabled: true,
  notificationsEnabled: true,
  isActive: true,
  monitorAllChannels: true,
});

export const insertMonitoredChannelSchema = createInsertSchema(monitoredChannels).pick({
  guildId: true,
  channelId: true,
});

export const insertExcludedUserSchema = createInsertSchema(excludedUsers).pick({
  guildId: true,
  userId: true,
  username: true,
  reason: true,
});

// Telegram insertion schemas
export const insertTelegramChatSchema = createInsertSchema(telegramChats).pick({
  chatId: true,
  type: true,
  title: true,
  username: true,
});

export const insertTelegramMessageSchema = createInsertSchema(telegramMessages).pick({
  messageId: true,
  chatId: true,
  userId: true,
  username: true,
  firstName: true,
  lastName: true,
  content: true,
  sentiment: true,
  sentimentScore: true,
  createdAt: true,
});

export const insertTelegramBotSettingsSchema = createInsertSchema(telegramBotSettings).pick({
  token: true,
  username: true,
  analysisFrequency: true,
  loggingEnabled: true,
  notificationsEnabled: true,
  isActive: true,
});

export const insertMonitoredTelegramChatSchema = createInsertSchema(monitoredTelegramChats).pick({
  chatId: true,
});

export const insertExcludedTelegramUserSchema = createInsertSchema(excludedTelegramUsers).pick({
  userId: true,
  username: true,
  firstName: true,
  lastName: true,
  reason: true,
});

// Types
// Discord types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertDiscordChannel = z.infer<typeof insertDiscordChannelSchema>;
export type InsertDiscordMessage = z.infer<typeof insertDiscordMessageSchema>;
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type InsertMonitoredChannel = z.infer<typeof insertMonitoredChannelSchema>;
export type InsertExcludedUser = z.infer<typeof insertExcludedUserSchema>;

// Telegram types
export type InsertTelegramChat = z.infer<typeof insertTelegramChatSchema>;
export type InsertTelegramMessage = z.infer<typeof insertTelegramMessageSchema>;
export type InsertTelegramBotSettings = z.infer<typeof insertTelegramBotSettingsSchema>;
export type InsertMonitoredTelegramChat = z.infer<typeof insertMonitoredTelegramChatSchema>;
export type InsertExcludedTelegramUser = z.infer<typeof insertExcludedTelegramUserSchema>;

// Selected types
export type User = typeof users.$inferSelect;
export type DiscordChannel = typeof discordChannels.$inferSelect;
export type DiscordMessage = typeof discordMessages.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;
export type MonitoredChannel = typeof monitoredChannels.$inferSelect;
export type ExcludedUser = typeof excludedUsers.$inferSelect;
export type TelegramChat = typeof telegramChats.$inferSelect;
export type TelegramMessage = typeof telegramMessages.$inferSelect;
export type TelegramBotSettings = typeof telegramBotSettings.$inferSelect;
export type MonitoredTelegramChat = typeof monitoredTelegramChats.$inferSelect;
export type ExcludedTelegramUser = typeof excludedTelegramUsers.$inferSelect;

export type SentimentType = 'very_positive' | 'positive' | 'neutral' | 'negative' | 'very_negative';

export const sentimentMappings = {
  'very_positive': {
    display: 'Very Positive',
    color: 'bg-sentiment-vpositive',
    border: 'border-sentiment-vpositive',
    textColor: 'text-white',
    score: 4
  },
  'positive': {
    display: 'Positive',
    color: 'bg-sentiment-positive',
    border: 'border-sentiment-positive',
    textColor: 'text-white',
    score: 3
  },
  'neutral': {
    display: 'Neutral',
    color: 'bg-sentiment-neutral',
    border: 'border-sentiment-neutral',
    textColor: 'text-white',
    score: 2
  },
  'negative': {
    display: 'Negative',
    color: 'bg-sentiment-negative',
    border: 'border-sentiment-negative',
    textColor: 'text-white',
    score: 1
  },
  'very_negative': {
    display: 'Very Negative',
    color: 'bg-sentiment-vnegative',
    border: 'border-sentiment-vnegative',
    textColor: 'text-white',
    score: 0
  }
};
