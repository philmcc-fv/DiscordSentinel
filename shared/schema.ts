import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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

// Insertion schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

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

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertDiscordChannel = z.infer<typeof insertDiscordChannelSchema>;
export type InsertDiscordMessage = z.infer<typeof insertDiscordMessageSchema>;
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type InsertMonitoredChannel = z.infer<typeof insertMonitoredChannelSchema>;

export type User = typeof users.$inferSelect;
export type DiscordChannel = typeof discordChannels.$inferSelect;
export type DiscordMessage = typeof discordMessages.$inferSelect;
export type BotSettings = typeof botSettings.$inferSelect;
export type MonitoredChannel = typeof monitoredChannels.$inferSelect;

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
