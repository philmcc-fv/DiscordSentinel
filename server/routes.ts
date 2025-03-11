import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { processMessage } from "./discord-bot";
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
        // Initialize Discord API with the token
        const initialized = await discordAPI.initialize(token);
        
        if (initialized) {
          // Get real channels from Discord
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
            
            // Refresh our channel list with the newly saved channels
            channels = await storage.getChannels();
          }
        }
      }
      
      // If no channels found and we're not in production, create test channels
      if (channels.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          const testChannels = [
            { id: 1, channelId: 'test-channel-1', name: 'general', guildId, guildName: 'Your Server', isMonitored: monitoredChannelIds.includes('test-channel-1') },
            { id: 2, channelId: 'test-channel-2', name: 'announcements', guildId, guildName: 'Your Server', isMonitored: monitoredChannelIds.includes('test-channel-2') },
            { id: 3, channelId: 'test-channel-3', name: 'random', guildId, guildName: 'Your Server', isMonitored: monitoredChannelIds.includes('test-channel-3') }
          ];
          return res.json(testChannels);
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

  const httpServer = createServer(app);
  return httpServer;
}
