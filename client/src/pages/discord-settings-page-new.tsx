import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCw, Play, Square, HelpCircle, AlertCircle, Shield, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { ChannelPermissionStatus } from "@/components/discord/channel-permission-status";
import { PermissionInstructions } from "@/components/discord/permission-instructions";
import { SetupGuide } from "@/components/discord/setup-guide";
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
  const { data: monitoredChannels = [], isLoading: channelsLoading, refetch: refetchChannels } = useQuery<any[]>({
    queryKey: ["/api/monitored-channels"],
  });
  
  // Refresh channels mutation
  const [isRefreshingChannels, setIsRefreshingChannels] = useState(false);
  
  const refreshChannelsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bot/refresh-channels");
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Channels refreshed",
          description: data.message || `Successfully refreshed channels from Discord server.`,
        });
        refetchChannels(); // Reload the channels
        queryClient.invalidateQueries({ queryKey: ["/api/monitored-channels"] }); 
      } else {
        toast({
          title: "Failed to refresh channels",
          description: data.message || "Could not refresh Discord channels. Please check your settings.",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to refresh channels",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update form values when bot settings are loaded
  useEffect(() => {
    if (botSettings) {
      // Don't populate token from API response for security reasons
      // we'll only use the tokenSet flag to know if a token exists
      setToken(botSettings.tokenSet ? "••••••••••••••••••••••••••" : "");
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
  
  // Fetch historical messages mutation
  const [fetchingHistoryForChannel, setFetchingHistoryForChannel] = useState<string | null>(null);
  
  const fetchHistoricalMessagesMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await apiRequest("POST", "/api/channels/fetch-history", { channelId });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.success === false) {
        // Handle unsuccessful response but still a successful API call
        const description = data.message || "Could not fetch historical messages.";
        
        // Check for permission-related errors
        if (description.includes("permissions") || description.includes("permission")) {
          toast({
            title: "Permission Error",
            description: (
              <div className="space-y-2">
                <p>{description}</p>
                <p className="font-semibold">Suggestions:</p>
                <ul className="list-disc pl-4 text-sm">
                  <li>Ensure the bot has the "View Channel" permission</li>
                  <li>Ensure the bot has the "Read Message History" permission</li>
                  <li>Check if the channel has category-level permission restrictions</li>
                  <li>Try adding the bot to your server again with proper permissions</li>
                </ul>
              </div>
            ),
            variant: "destructive",
            duration: 10000, // Show for longer time
          });
        } else {
          toast({
            title: "Failed to fetch historical messages",
            description: description,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Historical messages fetch initiated",
          description: data.message || "The process may take several minutes depending on message volume.",
        });
      }
      // No need to invalidate queries since the data will be updated in the background
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to fetch historical messages",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleFetchHistory = (channelId: string) => {
    setFetchingHistoryForChannel(channelId);
    fetchHistoricalMessagesMutation.mutate(channelId, {
      onSettled: () => {
        setFetchingHistoryForChannel(null);
      }
    });
  };

  // Stop bot mutation
  const [isStoppingBot, setIsStoppingBot] = useState(false);
  
  // User exclusion states and API calls
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [isExcludingUser, setIsExcludingUser] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState<string | null>(null);
  
  // Fetch excluded users
  const { data: excludedUsers = [], isLoading: excludedUsersLoading, refetch: refetchExcludedUsers } = useQuery<any[]>({
    queryKey: ["/api/excluded-users", botSettings?.guildId],
    queryFn: async () => {
      if (!botSettings?.guildId) return [];
      const res = await apiRequest("GET", `/api/excluded-users/${botSettings.guildId}`);
      return await res.json();
    },
    enabled: !!botSettings?.guildId,
  });
  
  // Add user to excluded list
  const excludeUserMutation = useMutation({
    mutationFn: async (data: { userId: string; guildId: string; username: string }) => {
      const res = await apiRequest("POST", "/api/excluded-users", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User excluded",
        description: "The user will no longer be included in sentiment analysis.",
      });
      refetchExcludedUsers();
      setNewUserId("");
      setNewUserName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to exclude user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Remove user from excluded list
  const removeExcludedUserMutation = useMutation({
    mutationFn: async ({ userId, guildId }: { userId: string; guildId: string }) => {
      const res = await apiRequest("DELETE", `/api/excluded-users/${userId}/${guildId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User removed from exclusion list",
        description: "The user's messages will now be included in sentiment analysis.",
      });
      refetchExcludedUsers();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleExcludeUser = () => {
    if (!newUserId || !botSettings?.guildId) return;
    
    setIsExcludingUser(true);
    excludeUserMutation.mutate({
      userId: newUserId,
      guildId: botSettings.guildId,
      username: newUserName || newUserId,
    }, {
      onSettled: () => {
        setIsExcludingUser(false);
      }
    });
  };
  
  const handleRemoveExcludedUser = (userId: string) => {
    if (!botSettings?.guildId) return;
    
    setIsRemovingUser(userId);
    removeExcludedUserMutation.mutate({
      userId,
      guildId: botSettings.guildId
    }, {
      onSettled: () => {
        setIsRemovingUser(null);
      }
    });
  };
  
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
                <TabsTrigger value="exclusions">User Exclusions</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              
              {/* User Exclusions Tab */}
              <TabsContent value="exclusions">
                <Card>
                  <CardHeader>
                    <CardTitle>User Exclusions</CardTitle>
                    <CardDescription>
                      Manage users whose messages should be excluded from sentiment analysis
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
                      <p className="font-medium mb-1">Why exclude users?</p>
                      <p>You may want to exclude certain users from sentiment analysis if:</p>
                      <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>They are bots or automated services posting messages</li>
                        <li>They post content that isn't relevant to server sentiment</li>
                        <li>Their messages would skew the sentiment analysis results</li>
                      </ul>
                    </div>
                    
                    {/* Add new excluded user */}
                    <div className="border rounded-lg p-4 space-y-4">
                      <h3 className="font-medium text-lg">Add User to Exclusion List</h3>
                      
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="userId">User ID</Label>
                          <Input 
                            id="userId"
                            placeholder="Enter Discord user ID"
                            value={newUserId}
                            onChange={(e) => setNewUserId(e.target.value)}
                          />
                          <p className="text-xs text-gray-500">
                            To get a User ID in Discord: Enable Developer Mode in Settings → Advanced, then right-click on a user and select "Copy ID"
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="username">Username (Optional)</Label>
                          <Input 
                            id="username"
                            placeholder="For display purposes only"
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                          />
                          <p className="text-xs text-gray-500">
                            This is only for your reference and can be left blank
                          </p>
                        </div>
                        
                        <Button 
                          onClick={handleExcludeUser}
                          disabled={isExcludingUser || !newUserId || !botSettings?.guildId}
                          className="mt-2"
                        >
                          {isExcludingUser ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Exclude User
                        </Button>
                      </div>
                    </div>
                    
                    {/* List of excluded users */}
                    <div>
                      <h3 className="font-medium text-lg mb-3">Currently Excluded Users</h3>
                      
                      {excludedUsersLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : excludedUsers.length === 0 ? (
                        <div className="text-center py-8 border rounded-lg bg-gray-50">
                          <p className="text-gray-500">No users are currently excluded</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {excludedUsers.map((user: any) => (
                            <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">{user.username}</p>
                                <p className="text-xs text-gray-500">ID: {user.userId}</p>
                                {user.reason && (
                                  <p className="text-xs text-gray-500 mt-1">Reason: {user.reason}</p>
                                )}
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleRemoveExcludedUser(user.userId)}
                                disabled={isRemovingUser === user.userId}
                              >
                                {isRemovingUser === user.userId ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Remove"
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
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
                
                {/* Discord Bot Setup Guide (expandable) - within general settings tab */}
                <div className="mt-6">
                  <SetupGuide />
                </div>
                
              </TabsContent>
              
              <TabsContent value="channels">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Channel Monitoring</CardTitle>
                      <CardDescription>
                        Select which channels to monitor for sentiment analysis
                      </CardDescription>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => {
                        setIsRefreshingChannels(true);
                        refreshChannelsMutation.mutate(undefined, {
                          onSettled: () => {
                            setIsRefreshingChannels(false);
                          }
                        });
                      }}
                      disabled={isRefreshingChannels}
                      className="flex gap-1"
                    >
                      {isRefreshingChannels ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCw className="h-4 w-4" />
                      )}
                      {isRefreshingChannels ? "Refreshing..." : "Refresh Channels"}
                    </Button>
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
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-medium">Select Individual Channels</h3>
                        {channelsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      </div>
                      <p className="text-sm text-gray-500 mb-4">
                        {monitorAllChannels 
                          ? "Individual channel selection is disabled when monitoring all channels" 
                          : monitoredChannels.length === 0 
                            ? "No channels found. Try refreshing channels or check your Discord server settings." 
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
                              <div key={channel.id} className="flex flex-col p-2 border rounded">
                                <div className="flex items-center justify-between space-x-2">
                                  <div className="flex items-center gap-2">
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
                                  <div className="flex items-center gap-2">
                                    {selectedChannels.includes(channel.channelId) && (
                                      <>
                                        <ChannelPermissionStatus 
                                          channelId={channel.channelId} 
                                          guildId={guildId} 
                                          disabled={!botSettings?.isActive}
                                        />
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="px-2 h-7 text-xs"
                                          onClick={() => handleFetchHistory(channel.channelId)}
                                          disabled={fetchingHistoryForChannel === channel.channelId || !botSettings?.isActive}
                                          title={!botSettings?.isActive ? "Start the bot first to fetch historical messages" : "Fetch and analyze historical messages"}
                                        >
                                          {fetchingHistoryForChannel === channel.channelId ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          ) : (
                                            <RotateCw className="h-3 w-3 mr-1" />
                                          )}
                                          {fetchingHistoryForChannel === channel.channelId ? "Fetching..." : "Fetch History"}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
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
                    
                    {/* Permission instructions for troubleshooting */}
                    <PermissionInstructions />
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