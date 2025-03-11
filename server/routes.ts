import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { processMessage, startBot, setupMessageListeners } from "./discord-bot";
import { format, subDays, parseISO } from "date-fns";
import { discordAPI } from "./discord-api";


export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication
  setupAuth(app);

  // API Routes for Discord messages and sentiment analysis
  app.get("/api/recent-messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const messages = await storage.getRecentMessages(limit);
    res.json(messages);
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
      
      await storage.setChannelMonitored(channelId, guildId, monitor);
      res.json({ success: true });
    } catch (error) {
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
      res.json(settings || { guildId: req.params.guildId, isActive: false, monitorAllChannels: false });
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
      // Return the first (most recent) settings or an empty object
      res.json(allSettings.length > 0 ? allSettings[0] : {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bot settings" });
    }
  });

  app.post("/api/bot/settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const settings = await storage.createOrUpdateBotSettings(req.body);
      res.json(settings);
    } catch (error) {
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
      
      // Clear existing channels for this guild to prevent duplicates
      // This is a simplification - in a production app you might want to update instead of delete/recreate
      const existingChannels = await storage.getChannels();
      const existingGuildChannels = existingChannels.filter(c => c.guildId === guildId);
      
      console.log(`Found ${discordChannels.length} channels from Discord for guild ${guildId}`);
      
      // Save all channels
      for (const channel of discordChannels) {
        await storage.createChannel(channel);
      }
      
      return res.json({
        success: true,
        channelCount: discordChannels.length,
        message: `Successfully refreshed ${discordChannels.length} channels from Discord server`
      });
    } catch (error) {
      console.error("Error refreshing Discord channels:", error);
      res.status(500).json({ 
        success: false,
        message: error instanceof Error ? error.message : "Failed to refresh Discord channels"
      });
    }
  });

  // Check Discord connection
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

  const httpServer = createServer(app);
  return httpServer;
}
