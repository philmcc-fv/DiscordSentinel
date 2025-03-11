import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Loader2, Save, RotateCw } from "lucide-react";

const botSettingsSchema = z.object({
  token: z.string().min(1, "Bot token is required"),
  guildId: z.string().min(1, "Guild ID is required"),
  prefix: z.string().default("!"),
  analysisFrequency: z.enum(["realtime", "hourly", "daily"]),
  loggingEnabled: z.boolean().default(true),
  notificationsEnabled: z.boolean().default(true),
});

export default function DiscordSettingsPage() {
  const { toast } = useToast();
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  
  const { data: botSettings = {}, isLoading } = useQuery({
    queryKey: ["/api/bot-settings"],
  });
  
  const { data: monitoredChannels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ["/api/monitored-channels"],
  });

  const form = useForm<z.infer<typeof botSettingsSchema>>({
    resolver: zodResolver(botSettingsSchema),
    defaultValues: {
      token: "",
      guildId: "",
      prefix: "!",
      analysisFrequency: "realtime" as const,
      loggingEnabled: true,
      notificationsEnabled: true,
    },
  });

  // Define an interface for bot settings structure
  interface BotSettingsType {
    token?: string;
    guildId?: string;
    prefix?: string;
    analysisFrequency?: "realtime" | "hourly" | "daily";
    loggingEnabled?: boolean;
    notificationsEnabled?: boolean;
  }

  // Update form when data is loaded
  useEffect(() => {
    if (botSettings) {
      const settings = botSettings as BotSettingsType;
      form.reset({
        token: settings.token || "",
        guildId: settings.guildId || "",
        prefix: settings.prefix || "!",
        analysisFrequency: settings.analysisFrequency || "realtime",
        loggingEnabled: settings.loggingEnabled ?? true,
        notificationsEnabled: settings.notificationsEnabled ?? true,
      });
    }
  }, [botSettings, form]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: z.infer<typeof botSettingsSchema>) => {
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

  function onSubmit(data: z.infer<typeof botSettingsSchema>) {
    updateSettingsMutation.mutate(data);
  }

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
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                      <CardContent className="space-y-4">
                        <FormField
                          control={form.control}
                          name="token"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discord Bot Token</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="password" 
                                  placeholder="Enter your Discord bot token" 
                                />
                              </FormControl>
                              <FormDescription>
                                The token used to authenticate your bot with Discord
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="guildId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Server (Guild) ID</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="Enter your Discord server ID" 
                                />
                              </FormControl>
                              <FormDescription>
                                The ID of the Discord server to monitor
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="prefix"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Command Prefix</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="!" 
                                />
                              </FormControl>
                              <FormDescription>
                                The prefix used for bot commands
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="analysisFrequency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Analysis Frequency</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select frequency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="realtime">Real-time</SelectItem>
                                  <SelectItem value="hourly">Hourly</SelectItem>
                                  <SelectItem value="daily">Daily</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                How often messages should be analyzed
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="loggingEnabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Enable Logging</FormLabel>
                                <FormDescription>
                                  Log all bot activities for debugging
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </CardContent>
                      
                      <CardFooter className="flex justify-between">
                        <Button 
                          type="button" 
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
                          type="submit"
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
                    </form>
                  </Form>
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
                        {monitoredChannels?.map((channel: any) => (
                          <div key={channel.id} className="flex items-center space-x-2 p-2 border rounded">
                            <Checkbox id={`channel-${channel.id}`} />
                            <label
                              htmlFor={`channel-${channel.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              #{channel.name}
                            </label>
                          </div>
                        ))}
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
                    <FormField
                      control={form.control}
                      name="notificationsEnabled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Enable Notifications</FormLabel>
                            <FormDescription>
                              Receive notifications for important events
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" onClick={form.handleSubmit(onSubmit)}>Save Notification Settings</Button>
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}