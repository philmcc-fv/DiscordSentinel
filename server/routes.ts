import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { processMessage, startBot, setupMessageListeners, fetchHistoricalMessages } from "./discord-bot";
import { format, subDays, parseISO } from "date-fns";
import { discordAPI } from "./discord-api";
import { log } from "./vite";
import { analyzeSentiment } from "./openai";
import { GuildChannel } from "discord.js";
import { telegramAPI } from "./telegram-api";
import { startTelegramBot, setupMessageListeners as setupTelegramMessageListeners, fetchHistoricalMessages as fetchTelegramHistoricalMessages } from "./telegram-bot";
import * as TelegramBot from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as path from 'path';


export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // API Routes for combined messages and sentiment analysis
  app.get("/api/recent-messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const sentiment = req.query.sentiment as string || 'all';
      const search = req.query.search as string || '';
      const channelId = req.query.channelId as string || 'all';
      const platform = req.query.platform as 'discord' | 'telegram' | 'all' || 'all';
      
      // Pass filters to the combined messages method
      const messages = await storage.getCombinedMessages(limit, {
        sentiment,
        channelId,
        search,
        platform
      });
      
      res.json(messages);
    } catch (error) {
      console.error('Error fetching filtered messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.get("/api/messages/:date", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const date = parseISO(req.params.date);
      const messages = await storage.getMessagesByDate(date);
      res.json(messages);
    } catch (error) {
      res.status(400).json({ error: "Invalid date format" });
    }
  });

  app.get("/api/sentiment", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const endDate = new Date();
      const startDate = subDays(endDate, days);
      
      const sentimentData = await storage.getSentimentByDateRange(startDate, endDate);
      res.json(sentimentData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sentiment data" });
    }
  });

  app.get("/api/distribution", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const distribution = await storage.getSentimentDistribution(days);
      res.json(distribution);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sentiment distribution" });
    }
  });

  app.get("/api/stats", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // API endpoint for Discord webhook integration
  app.post("/api/webhook/discord", async (req, res) => {
    try {
      const { message_id, channel_id, author, content, timestamp } = req.body;
      
      if (!message_id || !channel_id || !author || !content) {
        return res.status(400).json({ error: "Missing required message data" });
      }
      
      await processMessage({
        id: message_id,
        channelId: channel_id,
        userId: author.id,
        username: author.username,
        content,
        createdAt: timestamp ? new Date(timestamp) : new Date(),
      });
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Monitored channels management
  app.get("/api/channels", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const channels = await storage.getChannels();
      res.json(channels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.post("/api/channels/monitor", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { channelId, guildId, monitor } = req.body;
      
      if (!channelId || !guildId || monitor === undefined) {
        return res.status(400).json({ error: "Missing required data" });
      }
      
      // Check if the channel was previously monitored
      const wasMonitored = await storage.isChannelMonitored(channelId);
      
      // Update the monitoring status
      await storage.setChannelMonitored(channelId, guildId, monitor);
      
      // If the channel is being set to monitored for the first time, fetch historical messages
      if (monitor && !wasMonitored) {
        log(`🔍 Channel ${channelId} is being monitored for the first time. Fetching historical messages...`);
        
        // Fetch historical messages in the background (up to 1000 messages)
        fetchHistoricalMessages(channelId, 1000)
          .then(result => {
            if (result.success) {
              log(`✅ Successfully fetched and processed ${result.count} historical messages from channel ${channelId}`);
            } else {
              log(`❌ Failed to fetch historical messages: ${result.message}`, 'error');
            }
          })
          .catch(error => {
            log(`❌ Error fetching historical messages: ${error instanceof Error ? error.message : String(error)}`, 'error');
          });
        
        // Return a response indicating that historical messages are being fetched
        res.json({ 
          success: true,
          message: "Channel monitoring updated. Historical messages are being fetched and analyzed in the background."
        });
      } else {
        // Just return success if we're not fetching historical messages
        res.json({ success: true });
      }
    } catch (error) {
      log(`❌ Error updating channel monitoring: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to update channel monitoring" });
    }
  });
  
  // GET monitored channels
  app.get("/api/monitored-channels", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the bot settings to check for guild ID
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0) {
        return res.json([]);
      }
      
      // Use the first guild ID from settings
      const guildId = allSettings[0].guildId;
      const token = allSettings[0].token;
      
      if (!guildId) {
        return res.json([]);
      }
      
      let channels = await storage.getChannels();
      const monitoredChannelIds = await storage.getMonitoredChannels(guildId);
      
      // Try to get real Discord channels if we have a token
      if (token) {
        // Initialize Discord API with the token (don't force reconnect on regular refresh)
        const initialized = await discordAPI.initialize(token, false);
        
        if (initialized) {
          // Get real channels from Discord - prioritize the new guild ID
          const discordChannels = await discordAPI.getChannels(guildId);
          
          if (discordChannels.length > 0) {
            // Save any new channels to our database
            for (const channel of discordChannels) {
              // Check if this channel exists in our database
              const existingChannel = channels.find(c => c.channelId === channel.channelId);
              
              if (!existingChannel) {
                // Save the new channel
                await storage.createChannel(channel);
              }
            }
            
            // Refresh our channel list
            channels = await storage.getChannels();
            
            // Filter channels to only show ones for the current guild
            channels = channels.filter(channel => channel.guildId === guildId);
          }
        }
      }
      
      // We should never use test channels in a production app, always try to refresh channels from Discord
      if (channels.length === 0 && token) {
        // Attempt to reload channels by re-initializing the Discord API
        console.log("No channels found, attempting to refresh from Discord...");
        
        // Force re-initialization
        await discordAPI.initialize(token, true);
        
        // Try to get channels again
        const freshDiscordChannels = await discordAPI.getChannels(guildId);
        
        if (freshDiscordChannels.length > 0) {
          console.log(`Found ${freshDiscordChannels.length} channels from Discord`);
          
          // Save the channels to our database
          for (const channel of freshDiscordChannels) {
            await storage.createChannel(channel);
          }
          
          // Refresh our local list
          channels = await storage.getChannels();
        } else {
          console.log("Still no channels found from Discord");
        }
      }
      
      // Add isMonitored property to each channel
      const enhancedChannels = channels.map(channel => ({
        ...channel,
        isMonitored: monitoredChannelIds.includes(channel.channelId)
      }));
      
      res.json(enhancedChannels);
    } catch (error) {
      console.error("Error fetching monitored channels:", error);
      res.status(500).json({ error: "Failed to fetch monitored channels" });
    }
  });
  
  // GET which channels are being monitored
  app.get("/api/monitored-channels/:guildId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const guildId = req.params.guildId;
      if (!guildId) {
        return res.status(400).json({ error: "Guild ID is required" });
      }
      
      const monitoredChannelIds = await storage.getMonitoredChannels(guildId);
      res.json(monitoredChannelIds);
    } catch (error) {
      console.error("Error fetching monitored channel IDs:", error);
      res.status(500).json({ error: "Failed to fetch monitored channel IDs" });
    }
  });

  // Bot settings
  app.get("/api/bot/settings/:guildId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const settings = await storage.getBotSettings(req.params.guildId);
      if (settings) {
        const { token, ...safeSettings } = settings;
        res.json({
          ...safeSettings,
          tokenSet: !!token
        });
      } else {
        res.json({ guildId: req.params.guildId, isActive: false, monitorAllChannels: false });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot settings" });
    }
  });
  
  // General bot settings (no guild specified)
  app.get("/api/bot/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get all settings
      const allSettings = await storage.getAllBotSettings();
      
      // Return the first (most recent) settings or an empty object, but exclude the token
      if (allSettings.length > 0) {
        const { token, ...safeSettings } = allSettings[0];
        // Add a tokenSet flag to indicate that a token exists
        // Using type assertion to add the dynamic property
        (safeSettings as any).tokenSet = !!token;
        res.json(safeSettings);
      } else {
        res.json({});
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot settings" });
    }
  });

  app.post("/api/bot/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get previous settings to check if guild ID or token changed
      const previousSettings = await storage.getAllBotSettings();
      const previousGuildId = previousSettings.length > 0 ? previousSettings[0].guildId : '';
      const previousToken = previousSettings.length > 0 ? previousSettings[0].token : '';
      
      // Update settings
      const settings = await storage.createOrUpdateBotSettings(req.body);
      
      // Default status
      let botStatus = {
        success: false,
        message: "No changes to bot settings"
      };
      
      // Check if guild ID or token changed and bot is active
      if (settings.isActive && (settings.guildId !== previousGuildId || settings.token !== previousToken)) {
        log(`Bot settings changed: Guild ID or token updated. Restarting bot with new guild ID: ${settings.guildId}`);
        
        // Restart the bot with new settings
        // Make sure token and guildId are not null
        if (!settings.token || !settings.guildId) {
          log('Missing token or guildId in settings', 'error');
          res.status(400).json({ error: "Missing token or guildId in bot settings" });
          return;
        }
        
        try {
          // First force a full re-initialization of the Discord API
          const initialized = await discordAPI.initialize(settings.token, true);
          
          if (!initialized) {
            botStatus = {
              success: false,
              message: "Failed to initialize Discord client. Please check your bot token."
            };
          } else {
            // Then start the bot with the new settings
            const result = await startBot(settings.token, settings.guildId);
            
            // Update status with the result from startBot
            botStatus = {
              success: result.success,
              message: result.message || "Unknown status"
            };
            
            if (result.success) {
              // Set up message listeners with the new client
              setupMessageListeners(discordAPI.getClient());
              log('Discord bot restarted with new settings and listening for messages');
              
              log(`Bot successfully connected to Discord server: ${result.message}`);
            } else {
              log(`Failed to restart Discord bot with new settings: ${result.message}`, 'error');
            }
          }
        } catch (botError) {
          log(`Error connecting to Discord: ${botError instanceof Error ? botError.message : String(botError)}`, 'error');
          botStatus = {
            success: false,
            message: `Failed to connect to Discord: ${botError instanceof Error ? botError.message : String(botError)}`
          };
        }
      }
      
      // Return the settings with additional status information but exclude the token
      const { token, ...safeSettings } = settings;
      // Add a tokenSet flag to indicate that a token exists
      res.json({
        ...safeSettings,
        tokenSet: !!token,
        status: botStatus
      });
    } catch (error) {
      console.error(`Error updating bot settings: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "Failed to update bot settings" });
    }
  });
  
  // Refresh Discord channels
  app.post("/api/bot/refresh-channels", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the latest bot settings
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0 || !allSettings[0].token || !allSettings[0].guildId) {
        return res.status(400).json({ error: "Discord bot settings not configured properly" });
      }
      
      const token = allSettings[0].token;
      const guildId = allSettings[0].guildId;
      
      console.log(`Forcing refresh of Discord channels for guild ${guildId}...`);
      
      // Force re-initialization of the Discord client
      const initialized = await discordAPI.initialize(token, true);
      
      if (!initialized) {
        return res.status(500).json({ 
          success: false, 
          message: "Failed to authenticate with Discord. Please check your bot token." 
        });
      }
      
      // Get fresh channels from Discord
      const discordChannels = await discordAPI.getChannels(guildId);
      
      if (discordChannels.length === 0) {
        return res.json({ 
          success: true, 
          channelCount: 0,
          message: "Connected to Discord but found no channels. Please check your server ID and bot permissions." 
        });
      }
      
      // Handle existing channels - update rather than just inserting to avoid duplicates
      const existingChannels = await storage.getChannels();
      const existingChannelMap = new Map();
      
      // Create a map of existing channels by channelId for quick lookup
      for (const channel of existingChannels) {
        if (channel.guildId === guildId) {
          existingChannelMap.set(channel.channelId, channel);
        }
      }
      
      console.log(`Found ${discordChannels.length} channels from Discord for guild ${guildId}`);
      
      // Process channels - update existing ones and create new ones
      for (const channel of discordChannels) {
        try {
          const existing = existingChannelMap.get(channel.channelId);
          
          if (existing) {
            // Update existing channel if needed
            await storage.updateChannel(channel);
            log(`Updated existing channel: ${channel.name} (${channel.channelId})`);
          } else {
            // Create new channel if it doesn't exist
            await storage.createChannel(channel);
            log(`Added new channel: ${channel.name} (${channel.channelId})`);
          }
        } catch (channelError) {
          log(`Error processing channel ${channel.name}: ${channelError instanceof Error ? channelError.message : String(channelError)}`, 'error');
          // Continue with other channels even if one fails
        }
      }
      
      // Restart the bot to ensure it's connected to the correct guild
      const result = await startBot(token, guildId);
      
      if (result.success) {
        // Set up message listeners with the new client
        setupMessageListeners(discordAPI.getClient());
        console.log('Discord bot restarted with refreshed channels and listening for messages');
      } else {
        console.error(`Warning: Failed to restart Discord bot after channel refresh: ${result.message}`);
      }
      
      return res.json({
        success: true,
        channelCount: discordChannels.length,
        message: `Successfully refreshed ${discordChannels.length} channels from Discord server. Bot has been restarted with new settings.`
      });
    } catch (error) {
      console.error("Error refreshing Discord channels:", error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Failed to refresh Discord channels"
      });
    }
  });

  // Check channel permissions
  app.get("/api/channels/:channelId/permissions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { channelId } = req.params;
      
      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }
      
      // Get Discord client
      const client = discordAPI.getClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ 
          hasPermissions: false, 
          missingPermissions: ["Bot is not connected"],
          error: "Discord client not ready. Please ensure the bot is properly connected." 
        });
      }
      
      try {
        // Get the channel
        const channel = await client.channels.fetch(channelId);
        if (!channel || !('messages' in channel)) {
          return res.status(404).json({ 
            hasPermissions: false, 
            missingPermissions: ["Channel not found or not a text channel"]
          });
        }
        
        // Check permissions
        const textChannel = channel as any; // TextChannel
        const missingPermissions = [];
        let hasPermissions = true;
        
        if (textChannel.guild) {
          const botMember = await textChannel.guild.members.fetch(client.user!.id);
          // Use type assertion to clarify that this is a GuildChannel with permissionsFor
          const botPermissions = (textChannel as GuildChannel).permissionsFor(botMember);
          
          // Check for required permissions
          const requiredPermissions = [
            { flag: BigInt(1024), name: "View Channel" },             // VIEW_CHANNEL = 1024
            { flag: BigInt(65536), name: "Read Message History" }     // READ_MESSAGE_HISTORY = 65536
          ];
          
          for (const perm of requiredPermissions) {
            if (!botPermissions.has(perm.flag)) {
              missingPermissions.push(perm.name);
              hasPermissions = false;
            }
          }
          
          res.json({
            hasPermissions,
            missingPermissions
          });
        } else {
          res.json({
            hasPermissions: false,
            missingPermissions: ["Cannot verify permissions for this channel type"]
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`❌ Error checking channel permissions: ${errorMessage}`, 'error');
        
        if (errorMessage.includes('Missing Access')) {
          return res.status(403).json({
            hasPermissions: false,
            missingPermissions: ["Missing Access"],
            error: "The bot doesn't have access to this channel."
          });
        }
        
        res.status(500).json({ 
          hasPermissions: false, 
          missingPermissions: ["Unknown error"],
          error: `Error checking permissions: ${errorMessage}`
        });
      }
    } catch (error) {
      log(`❌ Error checking permissions: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ 
        hasPermissions: false, 
        missingPermissions: ["Server error"],
        error: "Failed to check channel permissions"
      });
    }
  });

  // Check Discord connection
  // Check channel permissions for the bot
  app.get("/api/channels/:channelId/permissions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const channelId = req.params.channelId;
      
      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }

      // Get Discord client
      if (!discordAPI.isReady()) {
        return res.status(400).json({ 
          hasPermissions: false, 
          missingPermissions: ["Bot not connected"],
          error: "Bot is not currently connected to Discord"
        });
      }
      
      const client = discordAPI.getClient();
      
      try {
        // Try to fetch the channel to check permissions
        const channel = await client.channels.fetch(channelId);
        
        if (!channel) {
          return res.json({ 
            hasPermissions: false, 
            missingPermissions: ["Cannot access channel"],
            error: "Channel not found or bot cannot access it" 
          });
        }
        
        // For text channels, check specific permissions
        if (channel.isTextBased()) {
          const missingPermissions = [];
          let hasViewAccess = true;
          let hasHistoryAccess = true;
          
          // We need to check if this is a guild channel (with permissions) vs DM channel
          // as permissionsFor is only available on GuildChannels 
          if ('permissionsFor' in channel && client.user) {
            // Check for VIEW_CHANNEL permission
            if (client.user && !(channel as GuildChannel).permissionsFor(client.user)?.has("ViewChannel")) {
              missingPermissions.push("View Channel");
              hasViewAccess = false;
            }
            
            // Check for READ_MESSAGE_HISTORY permission
            if (client.user && !(channel as GuildChannel).permissionsFor(client.user)?.has("ReadMessageHistory")) {
              missingPermissions.push("Read Message History");
              hasHistoryAccess = false;
            }
          } else {
            // For DM channels, we assume we have permissions since the user is messaging the bot directly
            log(`Channel ${channelId} doesn't support permissionsFor check, likely a DM channel`);
          }
          
          if (missingPermissions.length === 0) {
            return res.json({ hasPermissions: true, missingPermissions: [] });
          } else {
            return res.json({ 
              hasPermissions: false, 
              missingPermissions,
              error: "Bot lacks necessary permissions" 
            });
          }
        } else {
          return res.json({ 
            hasPermissions: false, 
            missingPermissions: ["Not a text channel"],
            error: "The selected channel is not a text channel"
          });
        }
      } catch (error) {
        log(`Error checking channel permissions: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return res.json({ 
          hasPermissions: false, 
          missingPermissions: ["Cannot access channel"],
          error: "Failed to access channel, likely due to permission issues" 
        });
      }
      
    } catch (error) {
      log(`Error in permissions check API: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ 
        hasPermissions: false,
        missingPermissions: ["Server error"],
        error: "Failed to check permissions" 
      });
    }
  });

  // Manually fetch historical messages for a specific channel
  app.post("/api/channels/fetch-history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { channelId, limit } = req.body;
      
      if (!channelId) {
        return res.status(400).json({ error: "Channel ID is required" });
      }
      
      // Verify that the channel is monitored
      const isMonitored = await storage.isChannelMonitored(channelId);
      if (!isMonitored) {
        return res.status(400).json({ 
          success: false,
          error: "Channel is not being monitored. Please enable monitoring for this channel first." 
        });
      }
      
      // Start fetching historical messages in the background
      log(`📚 Manual request to fetch historical messages for channel ${channelId}`);
      
      try {
        // Start fetching process (which checks permissions)
        const result = await fetchHistoricalMessages(channelId, limit || 1000);
        
        if (result.success) {
          log(`✅ Successfully fetched and processed ${result.count} historical messages from channel ${channelId}`);
          res.json({ 
            success: true, 
            message: result.message || `Successfully processed ${result.count} messages. The data will be available shortly.`
          });
        } else {
          log(`❌ Failed to fetch historical messages: ${result.message}`, 'error');
          res.json({
            success: false,
            message: result.message
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`❌ Error fetching historical messages: ${errorMessage}`, 'error');
        res.json({
          success: false,
          message: `Error fetching messages: ${errorMessage}`
        });
      }
    } catch (error) {
      log(`❌ Error initiating historical message fetch: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ 
        success: false, 
        error: "Failed to initiate historical message fetching" 
      });
    }
  });
  
  app.post("/api/bot/check-connection", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the latest bot settings
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0 || !allSettings[0].token) {
        return res.status(400).json({ error: "No Discord token configured" });
      }
      
      // Use the Discord API to test the connection
      const token = allSettings[0].token;
      const guildId = allSettings[0].guildId;
      
      const result = await discordAPI.testConnection(token, guildId);
      res.json(result);
    } catch (error) {
      console.error("Error checking Discord connection:", error);
      res.status(500).json({ error: "Failed to check Discord connection" });
    }
  });
  
  // Start the Discord bot manually
  app.post("/api/bot/start", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the latest bot settings
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0 || !allSettings[0].token || !allSettings[0].guildId) {
        return res.status(400).json({ error: "Discord bot settings not configured properly" });
      }
      
      const { token, guildId } = allSettings[0];
      
      // Start the bot
      const result = await startBot(token, guildId);
      
      if (result.success) {
        // Only set up message listeners if we truly have access to the guild
        // Check if the message doesn't indicate partial success
        const hasFullAccess = !result.message?.includes("could not verify") && 
                             !result.message?.includes("no text channels") &&
                             !result.message?.includes("no accessible text channels");
        
        if (hasFullAccess) {
          // Set up message listeners
          setupMessageListeners(discordAPI.getClient());
          
          // Update the settings to mark the bot as active
          await storage.createOrUpdateBotSettings({
            ...allSettings[0],
            isActive: true
          });
          
          res.json({ 
            success: true, 
            message: result.message || "Discord bot started successfully" 
          });
        } else {
          // Connected but with limited access
          await storage.createOrUpdateBotSettings({
            ...allSettings[0],
            isActive: true
          });
          
          res.json({ 
            success: true, 
            message: result.message || "Discord bot started with limited access" 
          });
        }
      } else {
        res.status(500).json({ 
          success: false, 
          message: result.message || "Failed to start Discord bot"
        });
      }
    } catch (error) {
      console.error("Error starting Discord bot:", error);
      res.status(500).json({ error: "Failed to start Discord bot" });
    }
  });
  
  // Stop the Discord bot manually
  app.post("/api/bot/stop", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the latest bot settings
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0) {
        return res.status(400).json({ error: "Discord bot settings not found" });
      }
      
      // Disconnect the bot
      if (discordAPI.isReady()) {
        await discordAPI.getClient().destroy();
        
        // Update the settings to mark the bot as inactive
        await storage.createOrUpdateBotSettings({
          ...allSettings[0],
          isActive: false
        });
        
        res.json({ success: true, message: "Discord bot stopped successfully" });
      } else {
        // Bot wasn't running, just update the settings
        await storage.createOrUpdateBotSettings({
          ...allSettings[0],
          isActive: false
        });
        
        res.json({ success: true, message: "Discord bot was not running" });
      }
    } catch (error) {
      console.error("Error stopping Discord bot:", error);
      res.status(500).json({ error: "Failed to stop Discord bot" });
    }
  });
  
  // Restart the Discord bot with the latest settings
  app.post("/api/bot/restart", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the latest bot settings
      const allSettings = await storage.getAllBotSettings();
      if (allSettings.length === 0 || !allSettings[0].token || !allSettings[0].guildId) {
        return res.status(400).json({ error: "Discord bot settings not configured properly" });
      }
      
      const { token, guildId } = allSettings[0];
      
      log(`Manual bot restart requested for guild ${guildId}`);
      
      // First, destroy the existing client connection if it exists
      if (discordAPI.isReady()) {
        log('Destroying existing Discord client connection...');
        await discordAPI.getClient().destroy();
      }
      
      // Force re-initialization with the token
      log('Re-initializing Discord client...');
      await discordAPI.initialize(token, true);
      
      // Start the bot with the settings
      const result = await startBot(token, guildId);
      
      if (result.success) {
        // Set up message listeners
        setupMessageListeners(discordAPI.getClient());
        log('Discord bot successfully restarted and listening for messages');
        
        // Update the settings to mark the bot as active
        await storage.createOrUpdateBotSettings({
          ...allSettings[0],
          isActive: true
        });
        
        // Get channels after restart to verify connection
        const channels = await discordAPI.getChannels(guildId);
        
        res.json({ 
          success: true, 
          message: `Discord bot successfully restarted. ${result.message}`,
          channelCount: channels.length
        });
      } else {
        log(`Failed to restart Discord bot: ${result.message}`, 'error');
        res.status(500).json({ 
          success: false, 
          message: result.message || "Failed to restart Discord bot"
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Error restarting Discord bot: ${errorMessage}`, 'error');
      res.status(500).json({ error: `Failed to restart Discord bot: ${errorMessage}` });
    }
  });
  
  // User exclusion management
  app.get("/api/excluded-users/:guildId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const guildId = req.params.guildId;
      if (!guildId) {
        return res.status(400).json({ error: "Guild ID is required" });
      }
      
      const excludedUsers = await storage.getExcludedUsers(guildId);
      res.json(excludedUsers);
    } catch (error) {
      log(`Error fetching excluded users: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to fetch excluded users" });
    }
  });
  
  app.post("/api/excluded-users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { userId, guildId, username } = req.body;
      
      if (!userId || !guildId) {
        return res.status(400).json({ error: "User ID and Guild ID are required" });
      }
      
      // Check if already excluded
      const isExcluded = await storage.isUserExcluded(userId, guildId);
      if (isExcluded) {
        return res.status(400).json({ error: "User is already excluded" });
      }
      
      // Add to excluded users
      const excludedUser = await storage.excludeUser({
        userId,
        guildId,
        username: username || userId,
        reason: `Manually excluded on ${new Date().toLocaleString()}`
      });
      
      log(`User ${excludedUser.username} (${excludedUser.userId}) has been excluded from analysis in guild ${guildId}`);
      res.status(201).json(excludedUser);
    } catch (error) {
      log(`Error excluding user: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to exclude user" });
    }
  });
  
  app.delete("/api/excluded-users/:userId/:guildId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { userId, guildId } = req.params;
      
      if (!userId || !guildId) {
        return res.status(400).json({ error: "User ID and Guild ID are required" });
      }
      
      // Check if actually excluded
      const isExcluded = await storage.isUserExcluded(userId, guildId);
      if (!isExcluded) {
        return res.status(404).json({ error: "User is not in the excluded list" });
      }
      
      // Remove from excluded users
      await storage.removeExcludedUser(userId, guildId);
      
      log(`User ${userId} has been removed from exclusion list in guild ${guildId}`);
      res.json({ success: true });
    } catch (error) {
      log(`Error removing excluded user: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to remove user from exclusion list" });
    }
  });

  // Test sentiment analysis (for development/debugging only)
  app.post("/api/test/analyze-sentiment", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { message } = req.body;
      
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Missing or invalid message text" });
      }
      
      const analysis = await analyzeSentiment(message);
      
      // Log the test for monitoring purposes
      log(`TEST: Analyzed sentiment for message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`, 'debug');
      log(`TEST: OpenAI sentiment result: ${analysis.sentiment} (score: ${analysis.score}, confidence: ${analysis.confidence})`, 'debug');
      
      return res.json({
        message,
        analysis
      });
    } catch (error) {
      console.error("Error in test sentiment analysis:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to analyze sentiment",
        message: req.body.message
      });
    }
  });

  // ===== TELEGRAM API ROUTES =====
  
  // API Routes for Telegram messages
  app.get("/api/telegram-messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const sentiment = req.query.sentiment as string || 'all';
      const search = req.query.search as string || '';
      const chatId = req.query.chatId as string || 'all';
      
      // Pass filters directly to the storage method
      const messages = await storage.getRecentTelegramMessages(limit, {
        sentiment,
        chatId,
        search
      });
      
      res.json(messages);
    } catch (error) {
      console.error('Error fetching Telegram messages:', error);
      res.status(500).json({ error: "Failed to fetch Telegram messages" });
    }
  });

  // API endpoint for getting Telegram chats (from database)
  app.get("/api/telegram-chats", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const chats = await storage.getTelegramChats();
      res.json(chats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram chats" });
    }
  });
  
  // API endpoint for getting Telegram chats (combined from database and live API)
  app.get("/api/telegram-chats/live", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // First, get stored chats from the database
      const storedChats = await storage.getTelegramChats();
      
      // Get current settings to check if bot is active and we can fetch live data
      const settings = await storage.getTelegramBotSettings();
      let liveChats: TelegramBot.Chat[] = [];
      
      if (settings?.isActive && settings?.token) {
        // Get live chat information if the bot is active
        try {
          // First make sure the bot is initialized
          if (!telegramAPI.isReady()) {
            await telegramAPI.initialize(settings.token);
          }
          
          // Then get the current chats
          liveChats = await telegramAPI.getChats();
          log(`Retrieved ${liveChats.length} live Telegram chats`, 'debug');
        } catch (botError) {
          log(`Error getting live Telegram chats: ${botError instanceof Error ? botError.message : String(botError)}`, 'error');
        }
      }
      
      // Process each stored chat to ensure it's in the database
      for (const liveChat of liveChats) {
        const chatId = String(liveChat.id);
        const existingChat = storedChats.find(c => c.chatId === chatId);
        
        if (!existingChat) {
          // Add new chat to database
          try {
            await storage.createTelegramChat({
              chatId,
              type: liveChat.type,
              title: liveChat.title || '',
              username: liveChat.username || '',
            });
            
            // Add the newly created chat to our stored chats list
            storedChats.push({
              id: 0, // This will be auto-assigned by the database
              chatId,
              type: liveChat.type,
              title: liveChat.title || '',
              username: liveChat.username || '',
              createdAt: new Date()
            });
            
            log(`Added new Telegram chat to database: ${liveChat.title || liveChat.username || chatId}`, 'info');
          } catch (createError) {
            log(`Error creating Telegram chat in database: ${createError instanceof Error ? createError.message : String(createError)}`, 'error');
          }
        }
      }
      
      // Return the updated list of stored chats
      const refreshedChats = await storage.getTelegramChats();
      res.json(refreshedChats);
    } catch (error) {
      log(`Error getting combined Telegram chats: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to fetch Telegram chats" });
    }
  });

  // API endpoint for getting monitored Telegram chats
  app.get("/api/monitored-telegram-chats", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const monitoredChatIds = await storage.getMonitoredTelegramChats();
      
      // Get all chats and add isMonitored property
      const chats = await storage.getTelegramChats();
      const enhancedChats = chats.map(chat => ({
        ...chat,
        isMonitored: monitoredChatIds.includes(chat.chatId)
      }));
      
      res.json(enhancedChats);
    } catch (error) {
      console.error("Error fetching monitored Telegram chats:", error);
      res.status(500).json({ error: "Failed to fetch monitored Telegram chats" });
    }
  });

  // API endpoint for setting a Telegram chat to be monitored
  app.post("/api/telegram-chats/monitor", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { chatId, monitor } = req.body;
      
      if (!chatId || monitor === undefined) {
        return res.status(400).json({ error: "Missing required data" });
      }
      
      // Check if the chat was previously monitored
      const wasMonitored = await storage.isTelegramChatMonitored(chatId);
      
      // Update the monitoring status
      await storage.setTelegramChatMonitored(chatId, monitor);
      
      res.json({ success: true });
    } catch (error) {
      log(`❌ Error updating Telegram chat monitoring: ${error instanceof Error ? error.message : String(error)}`, 'error');
      res.status(500).json({ error: "Failed to update Telegram chat monitoring" });
    }
  });

  // Telegram bot settings
  app.get("/api/telegram-bot/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const settings = await storage.getTelegramBotSettings();
      if (settings) {
        const { token, ...safeSettings } = settings;
        res.json({
          ...safeSettings,
          tokenSet: !!token
        });
      } else {
        res.json({});
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch Telegram bot settings" });
    }
  });

  // Update Telegram bot settings
  app.post("/api/telegram-bot/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get previous settings
      const previousSettings = await storage.getTelegramBotSettings();
      const previousToken = previousSettings?.token || '';
      
      // Validate token if provided
      if (req.body.token) {
        // Check for unescaped characters in the token
        if (!req.body.token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
          log('Warning: Telegram token in request does not match expected format. Cleaning...', 'warn');
          
          // Clean the token to only allow valid characters for a Telegram bot token
          const cleanToken = req.body.token.replace(/[^\d:A-Za-z0-9_-]/g, '');
          
          if (cleanToken !== req.body.token) {
            log('Token was cleaned to remove invalid characters', 'debug');
            // Replace the token with the cleaned version
            req.body.token = cleanToken;
          }
          
          // If the token is now invalid after cleaning, return an error
          if (!cleanToken || cleanToken.length < 10) {
            return res.status(400).json({ 
              error: "Invalid token format. Token should start with digits followed by a colon and alphanumeric characters. Please check for any special or control characters in your token."
            });
          }
        }
      }
      
      // Update settings with cleaned token
      const settings = await storage.createOrUpdateTelegramBotSettings(req.body);
      
      // Default status
      let botStatus = {
        success: false,
        message: "No changes to Telegram bot settings"
      };
      
      // Check if token changed and bot is active
      if (settings.isActive && settings.token !== previousToken) {
        log(`Telegram bot settings changed: Token updated. Restarting bot with new token.`);
        
        // Restart the bot with new settings
        if (!settings.token) {
          log('Missing token in Telegram bot settings', 'error');
          res.status(400).json({ error: "Missing token in Telegram bot settings" });
          return;
        }
        
        try {
          // First, make sure any existing bot instances are stopped
          if (telegramAPI.isReady()) {
            log('Forcing cleanup of existing Telegram bot before starting new one', 'debug');
            // Force a cleanup by initializing with the new token
            await telegramAPI.initialize(settings.token, true);
            
            // Wait a moment to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Start the Telegram bot with the new token
          const result = await startTelegramBot(settings.token);
          
          // Update status with the result
          botStatus = {
            success: result.success,
            message: result.message || "Unknown status"
          };
          
          if (result.success) {
            log('Telegram bot restarted with new settings and listening for messages');
          } else {
            log(`Failed to restart Telegram bot with new settings: ${result.message}`, 'error');
          }
        } catch (botError) {
          log(`Error connecting to Telegram: ${botError instanceof Error ? botError.message : String(botError)}`, 'error');
          botStatus = {
            success: false,
            message: `Failed to connect to Telegram: ${botError instanceof Error ? botError.message : String(botError)}`
          };
        }
      }
      
      // Return the settings with additional status information but exclude the token
      const { token, ...safeSettings } = settings;
      // Add a tokenSet flag to indicate that a token exists
      res.json({
        ...safeSettings,
        tokenSet: !!token,
        status: botStatus
      });
    } catch (error) {
      console.error(`Error updating Telegram bot settings: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "Failed to update Telegram bot settings" });
    }
  });

  // Test Telegram connection
  app.post("/api/telegram-bot/check-connection", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }
      
      // Clean up any existing bot instances first
      try {
        const lockPath = path.join(process.cwd(), 'tmp', 'telegram-bot.lock');
        if (fs.existsSync(lockPath)) {
          log('Removing stale lock file before testing connection', 'debug');
          fs.unlinkSync(lockPath);
          // Brief pause to ensure filesystem sync
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (cleanupError) {
        // Continue anyway as this is just preparation
        log(`Warning during test preparation: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'debug');
      }
      
      // Test the connection with the provided token
      const result = await telegramAPI.testConnection(token);
      
      res.json(result);
    } catch (error) {
      console.error("Error testing Telegram connection:", error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to test Telegram connection: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Start Telegram bot
  app.post("/api/telegram-bot/start", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the bot settings
      const settings = await storage.getTelegramBotSettings();
      
      if (!settings || !settings.token) {
        return res.status(400).json({ error: "Telegram bot token is not configured" });
      }
      
      if (settings.isActive) {
        return res.json({ success: true, message: "Telegram bot is already active", alreadyRunning: true });
      }
      
      // First, force cleanup any existing bot instances to prevent polling conflicts
      const lockPath = path.join(process.cwd(), 'tmp', 'telegram-bot.lock');
      try {
        log('Cleaning up any stale Telegram bot instances before starting...', 'debug');
        
        // Remove stale lock file if it exists
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
          log('Removed stale lock file', 'debug');
          // Wait a moment for filesystem to sync
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (cleanupError) {
        log(`Warning: Unable to clean up previous lock file: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`, 'warn');
        // Continue anyway as we'll try a fresh start
      }
      
      log(`Starting Telegram bot with clean environment...`);
      
      // Start the bot with the cleaned environment
      const result = await startTelegramBot(settings.token);
      
      if (result.success) {
        // Update the settings to mark the bot as active
        await storage.createOrUpdateTelegramBotSettings({
          ...settings,
          isActive: true,
          username: result.botInfo?.username || settings.username || ''
        });
        
        log(`Telegram bot started successfully: ${result.message}`);
        
        return res.json({
          success: true,
          message: result.message,
          botInfo: result.botInfo
        });
      } else {
        return res.json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("Error starting Telegram bot:", error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to start Telegram bot: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Stop Telegram bot
  app.post("/api/telegram-bot/stop", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Get the bot settings
      const settings = await storage.getTelegramBotSettings();
      
      if (!settings) {
        return res.status(400).json({ error: "Telegram bot settings not found" });
      }
      
      if (!settings.isActive) {
        return res.json({ success: true, message: "Telegram bot is already inactive", alreadyStopped: true });
      }

      // Explicitly clean up Telegram bot resources if it's initialized
      if (telegramAPI.isReady()) {
        log('Stopping active Telegram bot instance');
        // Create a new temporary instance to force cleanup
        const tmpToken = settings.token;
        await telegramAPI.initialize(tmpToken, true);
      }
      
      // Mark the bot as inactive in database
      await storage.createOrUpdateTelegramBotSettings({
        ...settings,
        isActive: false
      });
      
      log(`Telegram bot marked as inactive and resources cleaned up`);
      
      return res.json({
        success: true,
        message: "Telegram bot has been stopped and resources cleaned up"
      });
    } catch (error) {
      console.error("Error stopping Telegram bot:", error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to stop Telegram bot: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Excluded users for Telegram
  app.get("/api/excluded-telegram-users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const users = await storage.getExcludedTelegramUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching excluded Telegram users:", error);
      res.status(500).json({ error: "Failed to fetch excluded Telegram users" });
    }
  });

  // Add excluded Telegram user
  app.post("/api/excluded-telegram-users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { userId, username } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      // Check if user is already excluded
      const isExcluded = await storage.isTelegramUserExcluded(userId);
      
      if (isExcluded) {
        return res.status(400).json({ error: "User is already excluded" });
      }
      
      // Add user to excluded list
      const excludedUser = await storage.excludeTelegramUser({
        userId,
        username: username || ''
      });
      
      res.json(excludedUser);
    } catch (error) {
      console.error("Error excluding Telegram user:", error);
      res.status(500).json({ error: "Failed to exclude Telegram user" });
    }
  });

  // Remove excluded Telegram user
  app.delete("/api/excluded-telegram-users/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      // Remove user from excluded list
      await storage.removeExcludedTelegramUser(userId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing excluded Telegram user:", error);
      res.status(500).json({ error: "Failed to remove excluded Telegram user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
