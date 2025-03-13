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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function TelegramSettingsPage() {
  const { toast } = useToast();
  
  // Simple form state
  const [token, setToken] = useState("");
  const [analysisFrequency, setAnalysisFrequency] = useState("realtime");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [monitorAllChats, setMonitorAllChats] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [isStartingBot, setIsStartingBot] = useState(false);
  const [selectedChats, setSelectedChats] = useState<string[]>([]);
  
  // Load bot settings
  const { data: botSettings, isLoading } = useQuery<any>({
    queryKey: ["/api/telegram-bot/settings"],
  });
  
  // Load monitored chats
  const { data: monitoredChats = [], isLoading: chatsLoading, refetch: refetchChats } = useQuery<any[]>({
    queryKey: ["/api/monitored-telegram-chats"],
  });
  
  // Update form values when bot settings are loaded
  useEffect(() => {
    if (botSettings) {
      setToken(botSettings.token || "");
      setAnalysisFrequency(botSettings.analysisFrequency || "realtime");
      setLoggingEnabled(botSettings.loggingEnabled !== undefined ? botSettings.loggingEnabled : true);
      setNotificationsEnabled(botSettings.notificationsEnabled !== undefined ? botSettings.notificationsEnabled : true);
      setMonitorAllChats(botSettings.monitorAllChats !== undefined ? botSettings.monitorAllChats : false);
    }
  }, [botSettings]);
  
  // Initialize selectedChats when chats are loaded
  useEffect(() => {
    if (monitoredChats && monitoredChats.length > 0) {
      // Extract chats that are monitored (have isMonitored === true)
      const selectedIds = monitoredChats
        .filter((chat: any) => chat.isMonitored)
        .map((chat: any) => chat.chatId);
      
      setSelectedChats(selectedIds);
    }
  }, [monitoredChats]);
  
  // Save settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/telegram-bot/settings", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-bot/settings"] });
      
      if (data.status && data.status.success === false && data.status.message !== "No changes to Telegram bot settings") {
        // If there was an issue with the bot after updating settings
        toast({
          title: "Settings saved but bot update failed",
          description: data.status.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Settings saved",
          description: "Your Telegram bot settings have been updated.",
        });
      }
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
      const response = await apiRequest("POST", "/api/telegram-bot/check-connection", { token });
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Connection successful",
          description: `Bot connected as @${result.botInfo?.username || "unknown"}`,
        });
      } else {
        // Show detailed error message with guidance
        const errorDescription = result.message || "Could not connect to Telegram";
        let helpText = "";
        
        // Add specific guidance based on error patterns
        if (errorDescription.includes("401") || errorDescription.includes("unauthorized")) {
          helpText = " Please verify your bot token is correct.";
        } else if (errorDescription.includes("forbidden") || errorDescription.includes("access")) {
          helpText = " Make sure the bot has the necessary permissions.";
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
        description: error instanceof Error ? error.message : "Could not connect to Telegram. Please check your settings.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };
  
  // Toggle chat selection
  const toggleChatSelection = (chatId: string) => {
    setSelectedChats(prev => {
      if (prev.includes(chatId)) {
        return prev.filter(id => id !== chatId);
      } else {
        return [...prev, chatId];
      }
    });
  };
  
  // Save selected chats
  const saveChatsMutation = useMutation({
    mutationFn: async (chatIds: string[]) => {
      // First save bot settings
      await apiRequest("POST", "/api/telegram-bot/settings", {
        token,
        analysisFrequency,
        loggingEnabled,
        notificationsEnabled,
        monitorAllChats
      });
      
      // Then save each chat's monitored status
      const promises = monitoredChats.map((chat: any) => {
        const isMonitored = chatIds.includes(chat.chatId);
        return apiRequest("POST", "/api/telegram-chats/monitor", {
          chatId: chat.chatId,
          monitor: isMonitored
        });
      });
      
      await Promise.all(promises);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-bot/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/monitored-telegram-chats"] });
      toast({
        title: "Chat settings saved",
        description: "Your chat monitoring preferences have been updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save chat settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleSaveSettings = () => {
    const data = {
      token,
      analysisFrequency,
      loggingEnabled,
      notificationsEnabled,
      monitorAllChats,
      isActive: botSettings?.isActive || false
    };
    
    updateSettingsMutation.mutate(data);
  };
  
  const handleSaveChatSettings = () => {
    saveChatsMutation.mutate(selectedChats);
  };
  
  // Start bot mutation
  const startBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/telegram-bot/start");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-bot/settings"] });
      
      if (data.success) {
        toast({
          title: "Bot started",
          description: data.message || "The Telegram bot has been started successfully.",
        });
      } else {
        // Handle API response with success: false
        toast({
          title: "Failed to start bot",
          description: data.message || "Could not start the Telegram bot. Please check your settings.",
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
  
  // User exclusion states and API calls
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [isExcludingUser, setIsExcludingUser] = useState(false);
  const [isRemovingUser, setIsRemovingUser] = useState<string | null>(null);
  
  // Fetch excluded users
  const { data: excludedUsers = [], isLoading: excludedUsersLoading, refetch: refetchExcludedUsers } = useQuery<any[]>({
    queryKey: ["/api/excluded-telegram-users"],
  });
  
  // Add user to excluded list
  const excludeUserMutation = useMutation({
    mutationFn: async (data: { userId: string; username: string }) => {
      const res = await apiRequest("POST", "/api/excluded-telegram-users", data);
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
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/excluded-telegram-users/${userId}`);
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
    if (!newUserId) return;
    
    setIsExcludingUser(true);
    excludeUserMutation.mutate({
      userId: newUserId,
      username: newUserName || newUserId,
    }, {
      onSettled: () => {
        setIsExcludingUser(false);
      }
    });
  };
  
  const handleRemoveExcludedUser = (userId: string) => {
    setIsRemovingUser(userId);
    removeExcludedUserMutation.mutate(userId, {
      onSettled: () => {
        setIsRemovingUser(null);
      }
    });
  };
  
  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/telegram-bot/stop");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram-bot/settings"] });
      
      if (data.success) {
        toast({
          title: "Bot stopped",
          description: data.message || "The Telegram bot has been stopped successfully.",
        });
      } else {
        toast({
          title: "Failed to stop bot",
          description: data.message || "Could not stop the Telegram bot. Please check your settings.",
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
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 p-6 lg:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Telegram Settings</h1>
            <p className="text-muted-foreground">
              Configure your Telegram bot settings and monitored chats
            </p>
          </div>
          
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="grid w-full md:w-auto grid-cols-3">
              <TabsTrigger value="settings">Bot Settings</TabsTrigger>
              <TabsTrigger value="chats">Monitored Chats</TabsTrigger>
              <TabsTrigger value="users">Excluded Users</TabsTrigger>
            </TabsList>
            
            <TabsContent value="settings" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Telegram Bot Configuration</CardTitle>
                  <CardDescription>
                    Configure your Telegram bot to monitor messages for sentiment analysis
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="token">Bot Token</Label>
                    <div className="flex">
                      <Input
                        id="token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        type="password"
                        placeholder="Enter your Telegram bot token"
                        className="flex-1"
                      />
                      <Button 
                        variant="outline" 
                        onClick={checkConnection} 
                        disabled={!token || isCheckingConnection}
                        className="ml-2"
                      >
                        {isCheckingConnection ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing</>
                        ) : (
                          <>Test Connection</>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create a bot with @BotFather on Telegram and paste the token here
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Analysis Settings</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="freq-realtime">Analysis Frequency</Label>
                        <select
                          id="freq-realtime"
                          value={analysisFrequency}
                          onChange={(e) => setAnalysisFrequency(e.target.value)}
                          className="ml-auto p-2 border rounded"
                        >
                          <option value="realtime">Real-time</option>
                          <option value="batched">Batched (every 5 min)</option>
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                        </select>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="logging">Logging Enabled</Label>
                        <Switch
                          id="logging"
                          checked={loggingEnabled}
                          onCheckedChange={setLoggingEnabled}
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="notifications">Notifications</Label>
                        <Switch
                          id="notifications"
                          checked={notificationsEnabled}
                          onCheckedChange={setNotificationsEnabled}
                        />
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="all-chats">Monitor All Accessible Chats</Label>
                        <Switch
                          id="all-chats"
                          checked={monitorAllChats}
                          onCheckedChange={setMonitorAllChats}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-muted-foreground mr-2 mt-0.5" />
                      <div>
                        <h4 className="font-medium">About Telegram Bot Integration</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Telegram bots can only access messages in groups where they are members, and only messages sent after they join. To analyze conversations in your chats:
                        </p>
                        <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                          <li>Create a bot with @BotFather on Telegram</li>
                          <li>Add your bot to the groups you want to monitor</li>
                          <li>Ensure your bot has permission to read messages (disable Privacy Mode in BotFather)</li>
                          <li>Configure the bot settings and save them here</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  <div className="flex items-center">
                    {botSettings?.isActive ? (
                      <div className="flex items-center text-green-500 mr-2">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
                        Bot is active
                      </div>
                    ) : (
                      <div className="flex items-center text-red-500 mr-2">
                        <span className="h-2 w-2 rounded-full bg-red-500 mr-2"></span>
                        Bot is inactive
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
                    >
                      {updateSettingsMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</>
                      ) : (
                        <><Save className="mr-2 h-4 w-4" /> Save Settings</>
                      )}
                    </Button>
                    
                    {botSettings?.isActive ? (
                      <Button
                        variant="destructive"
                        onClick={handleStopBot}
                        disabled={isStoppingBot}
                      >
                        {isStoppingBot ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Stopping</>
                        ) : (
                          <><Square className="mr-2 h-4 w-4" /> Stop Bot</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        onClick={handleStartBot}
                        disabled={isStartingBot || !token}
                      >
                        {isStartingBot ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting</>
                        ) : (
                          <><Play className="mr-2 h-4 w-4" /> Start Bot</>
                        )}
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
            
            <TabsContent value="chats" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Monitored Telegram Chats</CardTitle>
                  <CardDescription>
                    Choose which Telegram chats you want to monitor for sentiment analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chatsLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : monitoredChats.length === 0 ? (
                    <div className="text-center py-8 bg-muted rounded-md">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <h3 className="text-lg font-medium">No chats available</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start your bot and add it to Telegram groups to see chats here.
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Make sure to disable Privacy Mode in BotFather settings.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {monitoredChats.map((chat: any) => (
                        <div 
                          key={chat.chatId} 
                          className="flex items-center justify-between p-3 border rounded-md"
                        >
                          <div className="flex items-center space-x-3">
                            <Checkbox 
                              id={`chat-${chat.chatId}`}
                              checked={selectedChats.includes(chat.chatId)}
                              onCheckedChange={() => toggleChatSelection(chat.chatId)}
                            />
                            <div>
                              <Label htmlFor={`chat-${chat.chatId}`} className="font-medium">
                                {chat.title || chat.username || `Chat ${chat.chatId}`}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {chat.type.charAt(0).toUpperCase() + chat.type.slice(1)} · ID: {chat.chatId}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            {chat.isMonitored && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mr-2">
                                Monitored
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
                <CardFooter className="justify-end">
                  <Button
                    onClick={handleSaveChatSettings}
                    disabled={monitoredChats.length === 0 || saveChatsMutation.isPending}
                  >
                    {saveChatsMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" /> Save Chat Settings</>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            
            <TabsContent value="users" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Excluded Users</CardTitle>
                  <CardDescription>
                    Specify users whose messages you want to exclude from sentiment analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="user-id">User ID</Label>
                        <Input
                          id="user-id"
                          value={newUserId}
                          onChange={(e) => setNewUserId(e.target.value)}
                          placeholder="Enter Telegram user ID"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="username">Username (optional)</Label>
                        <Input
                          id="username"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="Enter username for reference"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleExcludeUser}
                      disabled={!newUserId || isExcludingUser}
                      className="w-full"
                    >
                      {isExcludingUser ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding User</>
                      ) : (
                        <>Add User to Excluded List</>
                      )}
                    </Button>
                    
                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-3">Currently Excluded Users</h3>
                      {excludedUsersLoading ? (
                        <div className="flex items-center justify-center h-20">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                      ) : excludedUsers.length === 0 ? (
                        <div className="text-center py-4 border rounded">
                          <p className="text-sm text-muted-foreground">No users are currently excluded</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {excludedUsers.map((user: any) => (
                            <div
                              key={user.userId}
                              className="flex items-center justify-between p-3 border rounded"
                            >
                              <div>
                                <p className="font-medium">{user.username || "Unknown User"}</p>
                                <p className="text-xs text-muted-foreground">ID: {user.userId}</p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
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
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}