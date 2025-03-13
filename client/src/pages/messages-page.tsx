import Sidebar from "@/components/dashboard/sidebar";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, MessageSquare, MessageCircle } from "lucide-react";
import { SentimentType } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { 
  getSentimentClass, 
  getSentimentBorderClass, 
  getInitials, 
  formatDateTime 
} from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FaDiscord, FaTelegram } from "react-icons/fa";

export default function MessagesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSentiment, setSelectedSentiment] = useState<SentimentType | "all">("all");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "discord" | "telegram">("all");
  const [isFiltering, setIsFiltering] = useState(false);
  
  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ["/api/channels"],
  });

  const { data: messages, isLoading, error, refetch } = useQuery<any[]>({
    queryKey: ["/api/recent-messages", { 
      limit: 50,
      sentiment: selectedSentiment,
      search: searchQuery,
      channelId: selectedChannelId,
      platform: selectedPlatform
    }],
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: true, // Always enabled, will update when queryKey changes
  });

  const sentimentOptions: { value: SentimentType | "all", label: string }[] = [
    { value: "all", label: "All Sentiments" },
    { value: "very_positive", label: "Very Positive" },
    { value: "positive", label: "Positive" },
    { value: "neutral", label: "Neutral" },
    { value: "negative", label: "Negative" },
    { value: "very_negative", label: "Very Negative" },
  ];
  
  const platformOptions = [
    { value: "all", label: "All Platforms", icon: null },
    { value: "discord", label: "Discord", icon: <FaDiscord className="mr-2 h-4 w-4 text-[#5865F2]" /> },
    { value: "telegram", label: "Telegram", icon: <FaTelegram className="mr-2 h-4 w-4 text-[#0088cc]" /> }
  ];
  
  const applyFilters = () => {
    setIsFiltering(true);
    // This will trigger a refetch with the latest filter values in the queryKey
    refetch().then(() => {
      console.log("Filters applied:", { 
        sentiment: selectedSentiment, 
        channelId: selectedChannelId, 
        search: searchQuery,
        platform: selectedPlatform
      });
      setIsFiltering(false);
    });
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'discord':
        return <FaDiscord className="h-4 w-4 text-[#5865F2]" />;
      case 'telegram': 
        return <FaTelegram className="h-4 w-4 text-[#0088cc]" />;
      default:
        return <MessageCircle className="h-4 w-4" />;
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
            <h1 className="text-2xl font-semibold text-gray-800">Messages</h1>
            <p className="text-sm text-gray-600">Browse and analyze messages from Discord and Telegram</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-10">
          <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Platform selection tabs */}
            <Tabs 
              defaultValue="all" 
              className="w-full"
              onValueChange={(value) => {
                setSelectedPlatform(value as "all" | "discord" | "telegram");
              }}
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <span>All Platforms</span>
                </TabsTrigger>
                <TabsTrigger value="discord" className="flex items-center gap-2">
                  <FaDiscord className="h-4 w-4" />
                  <span>Discord</span>
                </TabsTrigger>
                <TabsTrigger value="telegram" className="flex items-center gap-2">
                  <FaTelegram className="h-4 w-4" />
                  <span>Telegram</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Message Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search for messages..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                  
                  <Select
                    value={selectedSentiment}
                    onValueChange={(value) => setSelectedSentiment(value as SentimentType | "all")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by sentiment" />
                    </SelectTrigger>
                    <SelectContent>
                      {sentimentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.value !== "all" && (
                            <span className="flex items-center">
                              <Badge variant="outline" className={getSentimentClass(option.value as SentimentType)}>
                                {option.label}
                              </Badge>
                            </span>
                          )}
                          {option.value === "all" && option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedChannelId}
                    onValueChange={setSelectedChannelId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      {channels && channels.length > 0 ? (
                        channels.map((channel: any) => (
                          <SelectItem key={channel.channelId} value={channel.channelId}>
                            {channel.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No channels available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex justify-end mt-4">
                  <Button 
                    className="flex items-center gap-2" 
                    onClick={applyFilters}
                    disabled={isFiltering}
                  >
                    <Filter className="h-4 w-4" />
                    {isFiltering ? 'Applying...' : 'Apply Filters'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Messages */}
            <Card>
              <CardHeader>
                <CardTitle>Message List</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "600px" }}>
                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : error ? (
                    <div className="text-center py-8 text-red-500">
                      <p>Error loading messages</p>
                    </div>
                  ) : messages && messages.length > 0 ? (
                    messages.map((message: any) => (
                      <div 
                        key={message.id} 
                        className={`p-3 rounded-lg border ${getSentimentBorderClass(message.sentiment as SentimentType)}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center">
                            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center mr-2 relative">
                              <span className="text-xs font-medium text-gray-600">
                                {getInitials(message.username)}
                              </span>
                              <div className="absolute -bottom-1 -right-1">
                                {getPlatformIcon(message.platform)}
                              </div>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">
                                {message.username}
                                {message.firstName && message.lastName && ` (${message.firstName} ${message.lastName})`}
                              </p>
                              <p className="text-xs text-gray-500">
                                {message.platform === 'telegram' && message.chatTitle ? 
                                  message.chatTitle : 
                                  `#${message.channelId}`
                                }
                              </p>
                            </div>
                          </div>
                          <div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full bg-opacity-90 border border-gray-300 ${getSentimentClass(message.sentiment as SentimentType)}`}>
                              {message.sentiment.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm mt-2 text-gray-700">{message.content}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatDateTime(message.createdAt.toString())}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                      <p>No messages match your filters</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}