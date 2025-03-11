import Sidebar from "@/components/dashboard/sidebar";
import RecentMessages from "@/components/dashboard/recent-messages";
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
import { Search, Filter } from "lucide-react";
import { SentimentType } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { getSentimentClass } from "@/lib/utils";

export default function MessagesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSentiment, setSelectedSentiment] = useState<SentimentType | "all">("all");
  
  const { data: channels = [] } = useQuery<any[]>({
    queryKey: ["/api/channels"],
  });

  const sentimentOptions: { value: SentimentType | "all", label: string }[] = [
    { value: "all", label: "All Sentiments" },
    { value: "very_positive", label: "Very Positive" },
    { value: "positive", label: "Positive" },
    { value: "neutral", label: "Neutral" },
    { value: "negative", label: "Negative" },
    { value: "very_negative", label: "Very Negative" },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-0 md:pt-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm z-10 flex-shrink-0 hidden md:flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Messages</h1>
            <p className="text-sm text-gray-600">Browse and analyze all Discord messages</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-10">
          <div className="container mx-auto px-4 py-6 space-y-6">
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

                  <Select>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filter by channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      {channels && channels.length > 0 ? (
                        channels.map((channel: any) => (
                          <SelectItem key={channel.id} value={channel.id}>
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
                  <Button className="flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    Apply Filters
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
                <RecentMessages limit={50} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}