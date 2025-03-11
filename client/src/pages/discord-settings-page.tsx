import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCw } from "lucide-react";

export default function DiscordSettingsPage() {
  const { toast } = useToast();
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  
  // Form state
  const [token, setToken] = useState("");
  const [guildId, setGuildId] = useState("");
  const [prefix, setPrefix] = useState("!");
  const [analysisFrequency, setAnalysisFrequency] = useState<string>("realtime");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  const { data: botSettings = {}, isLoading } = useQuery<any>({
    queryKey: ["/api/bot-settings"],
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
    }
  }, [botSettings]);
  
  const { data: monitoredChannels = [], isLoading: channelsLoading } = useQuery<any[]>({
    queryKey: ["/api/monitored-channels"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bot-settings", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bot-settings"] });
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

  const handleSaveSettings = () => {
    const data = {
      token,
      guildId,
      prefix,
      analysisFrequency,
      loggingEnabled,
      notificationsEnabled
    };
    
    updateSettingsMutation.mutate(data);
  };

  const checkConnection = async () => {
    setIsCheckingConnection(true);
    try {
      await apiRequest("POST", "/api/bot/check-connection");
      toast({
        title: "Connection successful",
        description: "The bot is connected to Discord successfully.",
      });
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Could not connect to Discord. Please check your settings.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingConnection(false);
    }
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
                      <Select 
                        value={analysisFrequency}
                        onValueChange={setAnalysisFrequency}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realtime">Real-time</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-500">
                        How often messages should be analyzed
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label className="text-base">Enable Logging</Label>
                        <p className="text-sm text-gray-500">
                          Log all bot activities for debugging
                        </p>
                      </div>
                      <Switch
                        checked={loggingEnabled}
                        onCheckedChange={setLoggingEnabled}
                      />
                    </div>
                  </CardContent>
                  
                  <CardFooter className="flex justify-between">
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
                    
                    <Button 
                      onClick={handleSaveSettings}
                      disabled={updateSettingsMutation.isPending}
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
                  <CardContent>
                    {channelsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {monitoredChannels && monitoredChannels.length > 0 ? (
                          monitoredChannels.map((channel: any) => (
                            <div key={channel.id} className="flex items-center space-x-2 p-2 border rounded">
                              <Checkbox id={`channel-${channel.id}`} />
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
                  </CardContent>
                  <CardFooter>
                    <Button className="ml-auto">Save Channel Settings</Button>
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
                        <Label className="text-base">Enable Notifications</Label>
                        <p className="text-sm text-gray-500">
                          Receive notifications for important events
                        </p>
                      </div>
                      <Switch
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