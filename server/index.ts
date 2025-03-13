import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { startBot } from "./discord-bot";
import { discordAPI } from "./discord-api";
import { setupMessageListeners } from "./discord-bot";
import { startTelegramBot } from "./telegram-bot";
import { telegramAPI } from "./telegram-api";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Initialize both Discord and Telegram bots if settings are available
    try {
      // Initialize Discord bot
      try {
        // Always fetch the most recent settings
        const allSettings = await storage.getAllBotSettings();
        
        if (allSettings.length > 0 && allSettings[0].token && allSettings[0].guildId && allSettings[0].isActive) {
          const { token, guildId } = allSettings[0];
          
          log(`Initializing Discord bot for guild ${guildId}`);
          
          // Try to connect to the guild
          const result = await startBot(token, guildId);
          
          if (result.success) {
            // Set up message listeners
            setupMessageListeners(discordAPI.getClient());
            log('Discord bot successfully initialized and listening for messages');
          } else {
            log(`Discord bot failed to initialize: ${result.message}`, 'error');
            
            // Check if we have other guild settings that might work
            log('Checking for alternative guild settings...', 'debug');
            
            if (allSettings.length > 1) {
              // Try the next guild in the settings
              for (let i = 1; i < allSettings.length; i++) {
                const altSettings = allSettings[i];
                if (altSettings.token && altSettings.guildId && altSettings.isActive) {
                  log(`Trying alternate guild: ${altSettings.guildId}`, 'debug');
                  const altResult = await startBot(altSettings.token, altSettings.guildId);
                  
                  if (altResult.success) {
                    // Set up message listeners
                    setupMessageListeners(discordAPI.getClient());
                    log(`Discord bot initialized with alternate guild ${altSettings.guildId} and listening for messages`);
                    break;
                  }
                }
              }
            }
          }
        } else {
          log('Discord bot not initialized: No active bot settings found');
        }
      } catch (error) {
        log(`Error initializing Discord bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      
      // Initialize Telegram bot
      try {
        // Fetch Telegram bot settings
        const telegramSettings = await storage.getTelegramBotSettings();
        
        if (telegramSettings && telegramSettings.token && telegramSettings.isActive) {
          log('Initializing Telegram bot');
          
          // Try to connect with Telegram
          const result = await startTelegramBot(telegramSettings.token);
          
          if (result.success) {
            log(`Telegram bot successfully initialized as @${result.botInfo?.username}`);
          } else {
            log(`Telegram bot failed to initialize: ${result.message}`, 'error');
          }
        } else {
          log('Telegram bot not initialized: No active bot settings found');
        }
      } catch (error) {
        log(`Error initializing Telegram bot: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } catch (error) {
      log(`Error initializing bots: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  });
})();
