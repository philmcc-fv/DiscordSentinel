import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCw, Play, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function DiscordSettingsPage() {
  const { toast } = useToast();
  
  // Simple form state
  const [token, setToken] = useState("");
  const [guildId, setGuildId] = useState("");
  const [prefix, setPrefix] = useState("!");
  const [analysisFrequency, setAnalysisFrequency] = useState("realtime");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [monitorAllChannels, setMonitorAllChannels] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isStartingBot, setIsStartingBot] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  
  // Load bot settings
  const { data: botSettings, isLoading } = useQuery<any>({
    queryKey: ["/api/bot/settings"],
  });
  
  // Load monitored channels
  const { data: monitoredChannels = [], isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ["/api/monitored-channels"],
  });
  
  // Update form values when bot settings are loaded
  useEffect(() => {
    if (botSettings) {
      setToken(botSettings.token || "");
      setGuildId(botSettings.guildId || "");
      setPrefix(botSettings.prefix || "!");
      setAnalysisFrequency(botSettings.analysisFrequency || "realtime");
      setLoggingEnabled(botSettings.loggingEnabled !== undefined ? botSettings.loggingEnabled : true);
      setNotificationsEnabled(botSettings.notificationsEnabled !== undefined ? botSettings.notificationsEnabled : true);
      setMonitorAllChannels(botSettings.monitorAllChannels !== undefined ? botSettings.monitorAllChannels : false);
    }
  }, [botSettings]);
  
  // Initialize selectedChannels when channels are loaded
  useEffect(() => {
    if (monitoredChannels && monitoredChannels.length > 0) {
      // Extract channels that are monitored (have isMonitored === true)
      const selectedIds = monitoredChannels
        .filter((channel: any) => channel.isMonitored)
        .map((channel: any) => channel.channelId);
      
      setSelectedChannels(selectedIds);
    }
  }, [monitoredChannels]);
  
  // Save settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bot/settings", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/settings"] });
      toast({
        title: "Settings saved",
        description: "Your Discord bot settings have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Connection check
  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      const response = await apiRequest("POST", "/api/bot/check-connection");
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Connection successful",
          description: result.message || "The bot is connected to Discord successfully.",
        });
      } else {
        // Show detailed error message with guidance
        const errorDescription = result.message || "Could not connect to Discord";
        let helpText = "";
        
        // Add specific guidance based on error patterns
        if (errorDescription.includes("Unknown Guild")) {
          helpText = " Please verify your server ID and ensure the bot has been added to this server.";
        } else if (errorDescription.includes("permission") || errorDescription.includes("access")) {
          helpText = " Make sure the bot has the necessary permissions in your Discord server.";
        } else if (errorDescription.includes("token") || errorDescription.includes("authentication")) {
          helpText = " Please check that your bot token is correct and valid.";
        } else {
          helpText = " Please check your settings and try again.";
        }
        
        toast({
          title: "Connection failed",
          description: errorDescription + helpText,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Could not connect to Discord. Please check your settings.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };
  
  // Toggle channel selection
  const toggleChannelSelection = (channelId: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  };
  
  // Save selected channels
  const saveChannelsMutation = useMutation({
    mutationFn: async (channelIds: string[]) => {
      // First save bot settings
      await apiRequest("POST", "/api/bot/settings", {
        token,
        guildId,
        prefix,
        analysisFrequency,
        loggingEnabled,
        notificationsEnabled,
        monitorAllChannels
      });
      
      // Then save each channel's monitored status
      const promises = monitoredChannels.map((channel: any) => {
        const isMonitored = channelIds.includes(channel.channelId);
        return apiRequest("POST", "/api/channels/monitor", {
          channelId: channel.channelId,
          guildId,
          monitor: isMonitored
        });
      });
      
      await Promise.all(promises);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-channels"] });
      toast({
        title: "Channel settings saved",
        description: "Your channel monitoring preferences have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save channel settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleSaveSettings = () => {
    const data = {
      token,
      guildId,
      prefix,
      analysisFrequency,
      loggingEnabled,
      notificationsEnabled,
      monitorAllChannels
    };
    
    updateSettingsMutation.mutate(data);
  };
  
  const handleSaveChannelSettings = () => {
    saveChannelsMutation.mutate(selectedChannels);
  };
  
  // Start bot mutation
  const startBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bot/start");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/settings"] });
      
      if (data.success) {
        toast({
          title: "Bot started",
          description: data.message || "The Discord bot has been started successfully.",
        });
      } else {
        // Handle API response with success: false
        toast({
          title: "Failed to start bot",
          description: data.message || "Could not start the Discord bot. Please check your settings.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start bot",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleStartBot = () => {
    setIsStartingBot(true);
    startBotMutation.mutate(undefined, {
      onSettled: () => {
        setIsStartingBot(false);
      }
    });
  };
  
  // Stop bot mutation
  const [isStoppingBot, setIsStoppingBot] = useState(false);
  
  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bot/stop");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot/settings"] });
      
      if (data.success) {
        toast({
          title: "Bot stopped",
          description: data.message || "The Discord bot has been stopped successfully.",
        });
      } else {
        toast({
          title: "Failed to stop bot",
          description: data.message || "Could not stop the Discord bot. Please check your settings.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to stop bot",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleStopBot = () => {
    setIsStoppingBot(true);
    stopBotMutation.mutate(undefined, {
      onSettled: () => {
        setIsStoppingBot(false);
      }
    });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-0 md:pt-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm z-10 flex-shrink-0 hidden md:flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Discord Settings</h1>
            <p className="text-sm text-gray-600">Configure your Discord bot and analysis settings</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-10">
          <div className="container mx-auto px-4 py-6 space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="general">General Settings</TabsTrigger>
                <TabsTrigger value="channels">Channel Settings</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              
              <TabsContent value="general">
                <Card>
                  <CardHeader>
                    <CardTitle>Bot Configuration</CardTitle>
                    <CardDescription>
                      Configure your Discord bot connection settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="token">Discord Bot Token</Label>
                      <Input 
                        id="token"
                        type="password" 
                        placeholder="Enter your Discord bot token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                      <p className="text-sm text-gray-500">
                        The token used to authenticate your bot with Discord
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="guildId">Server (Guild) ID</Label>
                      <Input 
                        id="guildId"
                        placeholder="Enter your Discord server ID"
                        value={guildId}
                        onChange={(e) => setGuildId(e.target.value)}
                      />
                      <p className="text-sm text-gray-500">
                        The ID of the Discord server to monitor
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="prefix">Command Prefix</Label>
                      <Input 
                        id="prefix"
                        placeholder="!"
                        value={prefix}
                        onChange={(e) => setPrefix(e.target.value)}
                      />
                      <p className="text-sm text-gray-500">
                        The prefix used for bot commands
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="analysisFrequency">Analysis Frequency</Label>
                      <select 
                        id="analysisFrequency"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={analysisFrequency}
                        onChange={(e) => setAnalysisFrequency(e.target.value)}
                      >
                        <option value="realtime">Real-time</option>
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                      </select>
                      <p className="text-sm text-gray-500">
                        How often messages should be analyzed
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label htmlFor="logging" className="text-base">Enable Logging</Label>
                        <p className="text-sm text-gray-500">
                          Log all bot activities for debugging
                        </p>
                      </div>
                      <Switch
                        id="logging"
                        checked={loggingEnabled}
                        onCheckedChange={setLoggingEnabled}
                      />
                    </div>
                  </CardContent>
                  
                  <CardFooter className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline"
                      onClick={checkConnection}
                      disabled={isCheckingConnection}
                    >
                      {isCheckingConnection ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="mr-2 h-4 w-4" />
                      )}
                      Test Connection
                    </Button>
                    
                    {botSettings?.isActive ? (
                      <Button 
                        variant="outline"
                        onClick={handleStopBot}
                        disabled={isStoppingBot || stopBotMutation.isPending}
                        className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-red-200"
                      >
                        {isStoppingBot || stopBotMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Square className="mr-2 h-4 w-4" />
                        )}
                        Stop Bot
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        onClick={handleStartBot}
                        disabled={isStartingBot || !token || !guildId || startBotMutation.isPending}
                        className="bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 border-green-200"
                      >
                        {isStartingBot || startBotMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" />
                        )}
                        Start Bot
                      </Button>
                    )}
                    
                    <Button 
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                      className="ml-auto"
                    >
                      {updateSettingsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Settings
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="channels">
                <Card>
                  <CardHeader>
                    <CardTitle>Channel Monitoring</CardTitle>
                    <CardDescription>
                      Select which channels to monitor for sentiment analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label htmlFor="monitorAllChannels" className="text-base">Monitor All Channels</Label>
                        <p className="text-sm text-gray-500">
                          When enabled, all channels in the server will be monitored
                        </p>
                      </div>
                      <Switch
                        id="monitorAllChannels"
                        checked={monitorAllChannels}
                        onCheckedChange={setMonitorAllChannels}
                      />
                    </div>
                    
                    <div className={monitorAllChannels ? "opacity-50 pointer-events-none" : ""}>
                      <h3 className="font-medium mb-3">Select Individual Channels</h3>
                      <p className="text-sm text-gray-500 mb-4">
                        {monitorAllChannels 
                          ? "Individual channel selection is disabled when monitoring all channels" 
                          : "Choose specific channels to monitor"}
                      </p>
                      
                      {channelsLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {monitoredChannels && monitoredChannels.length > 0 ? (
                            monitoredChannels.map((channel: any) => (
                              <div key={channel.id} className="flex items-center space-x-2 p-2 border rounded">
                                <Checkbox 
                                  id={`channel-${channel.id}`}
                                  disabled={monitorAllChannels}
                                  checked={selectedChannels.includes(channel.channelId)}
                                  onCheckedChange={() => toggleChannelSelection(channel.channelId)}
                                />
                                <label
                                  htmlFor={`channel-${channel.id}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  #{channel.name}
                                </label>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-4 text-gray-500">
                              No channels available. Add channels to your Discord server and they will appear here.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="ml-auto"
                      onClick={handleSaveChannelSettings}
                      disabled={saveChannelsMutation.isPending}
                    >
                      {saveChannelsMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save Channel Settings
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>
              
              <TabsContent value="notifications">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Settings</CardTitle>
                    <CardDescription>
                      Configure when and how you receive notifications
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label htmlFor="notifications" className="text-base">Enable Notifications</Label>
                        <p className="text-sm text-gray-500">
                          Receive notifications for important events
                        </p>
                      </div>
                      <Switch
                        id="notifications"
                        checked={notificationsEnabled}
                        onCheckedChange={setNotificationsEnabled}
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button onClick={handleSaveSettings}>
                        <Save className="mr-2 h-4 w-4" />
                        Save Notification Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}