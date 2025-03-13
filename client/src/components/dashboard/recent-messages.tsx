import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageSquare, MessageCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSentimentClass, getSentimentBorderClass, getInitials, formatDateTime } from "@/lib/utils";
import { SentimentType } from "@shared/schema";
import { FaDiscord, FaTelegram } from "react-icons/fa";

// Update to use the new combined message type
interface CombinedMessage {
  id: string;
  platform: 'discord' | 'telegram';
  channelId: string;
  channelName?: string;
  userId: string;
  username: string;
  content: string;
  sentiment: SentimentType;
  sentimentScore: number;
  createdAt: Date | string;
  firstName?: string;
  lastName?: string;
  chatTitle?: string;
}

interface RecentMessagesProps {
  limit?: number;
}

const RecentMessages: FC<RecentMessagesProps> = ({ limit = 5 }) => {
  const { data, isLoading, error } = useQuery<CombinedMessage[]>({
    queryKey: ["/api/recent-messages", { limit }],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

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

  const renderMessageItem = (message: CombinedMessage) => {
    return (
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
              {typeof message.sentiment === 'string' && 
                message.sentiment.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </span>
          </div>
        </div>
        <p className="text-sm mt-2 text-gray-700">{message.content}</p>
        <p className="text-xs text-gray-500 mt-1">{formatDateTime(message.createdAt.toString())}</p>
      </div>
    );
  };

  const renderSkeleton = () => {
    return Array(3).fill(0).map((_, i) => (
      <div key={i} className="p-3 rounded-lg border border-gray-200">
        <div className="flex justify-between items-start">
          <div className="flex items-center">
            <Skeleton className="rounded-full w-8 h-8 mr-2" />
            <div>
              <Skeleton className="h-4 w-20 mb-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full mt-2" />
        <Skeleton className="h-4 w-3/4 mt-1" />
        <Skeleton className="h-3 w-20 mt-1" />
      </div>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent Messages</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "400px" }}>
          {isLoading ? (
            renderSkeleton()
          ) : error ? (
            <div className="text-red-500">Error loading recent messages</div>
          ) : data && data.length > 0 ? (
            data.map(renderMessageItem)
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-2" />
              <p>No recent messages found</p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-0 flex justify-center">
        <Link href="/messages">
          <Button variant="link">View All Messages</Button>
        </Link>
      </CardFooter>
    </Card>
  );
};

export default RecentMessages;
