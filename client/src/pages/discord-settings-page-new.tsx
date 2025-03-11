import { useState } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DiscordSettingsPage() {
  const { toast } = useToast();
  
  // Simple form state
  const [token, setToken] = useState("");
  const [guildId, setGuildId] = useState("");
  const [prefix, setPrefix] = useState("!");
  const [analysisFrequency, setAnalysisFrequency] = useState("realtime");
  const [loggingEnabled, setLoggingEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const handleSaveSettings = () => {
    setLoading(true);
    
    // Simulating API call
    setTimeout(() => {
      setLoading(false);
      toast({
        title: "Settings saved",
        description: "Your Discord bot settings have been updated successfully.",
      });
    }, 1000);
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
                  
                  <CardFooter className="flex justify-between">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        toast({
                          title: "Testing connection...",
                          description: "Please wait while we test the connection."
                        });
                      }}
                    >
                      <RotateCw className="mr-2 h-4 w-4" />
                      Test Connection
                    </Button>
                    
                    <Button 
                      onClick={handleSaveSettings}
                      disabled={loading}
                    >
                      {loading ? (
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
                    <div className="text-center py-4 text-gray-500">
                      No channels available. Add channels to your Discord server and they will appear here.
                    </div>
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