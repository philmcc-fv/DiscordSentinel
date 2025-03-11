import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getSentimentClass, getSentimentBorderClass, getInitials, formatDateTime } from "@/lib/utils";
import { DiscordMessage, SentimentType } from "@shared/schema";

interface RecentMessagesProps {
  limit?: number;
}

const RecentMessages: FC<RecentMessagesProps> = ({ limit = 5 }) => {
  const { data, isLoading, error } = useQuery<DiscordMessage[]>({
    queryKey: ["/api/recent-messages", { limit }],
  });

  const renderMessageItem = (message: DiscordMessage) => {
    return (
      <div 
        key={message.id} 
        className={`p-3 rounded-lg border ${getSentimentBorderClass(message.sentiment as SentimentType)}`}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center">
            <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center mr-2">
              <span className="text-xs font-medium text-gray-600">
                {getInitials(message.username)}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">{message.username}</p>
              <p className="text-xs text-gray-500">#{message.channelId}</p>
            </div>
          </div>
          <div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSentimentClass(message.sentiment as SentimentType)}`}>
              {message.sentiment.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
