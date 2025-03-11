import { FC, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatTime, getSentimentClass, getInitials } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscordMessage, SentimentType } from "@shared/schema";

interface MessageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string | null;
}

const MessageDetailModal: FC<MessageDetailModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
}) => {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    // Reset filters and pagination when the date changes
    setChannelFilter("all");
    setSentimentFilter("all");
    setPage(1);
  }, [selectedDate]);

  // Fetch messages for the selected date
  const {
    data: messages,
    isLoading,
    error,
  } = useQuery<DiscordMessage[]>({
    queryKey: ["/api/messages", selectedDate],
    enabled: !!selectedDate && isOpen,
  });

  // Calculate sentiment distribution for the day
  const sentimentCounts = (messages || []).reduce(
    (acc, message) => {
      acc[message.sentiment as SentimentType]++;
      acc.total++;
      return acc;
    },
    {
      very_positive: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      very_negative: 0,
      total: 0,
    }
  );

  // Get average sentiment for the day
  const avgSentiment = (() => {
    if (!messages || messages.length === 0) return "Neutral";
    
    const sum = messages.reduce((acc, msg) => acc + msg.sentimentScore, 0);
    const avg = sum / messages.length;
    
    if (avg >= 3.5) return "Very Positive";
    if (avg >= 2.5) return "Positive";
    if (avg >= 1.5) return "Neutral";
    if (avg >= 0.5) return "Negative";
    return "Very Negative";
  })();

  // Get sentiment color class for the average
  const avgSentimentClass = (() => {
    if (avgSentiment === "Very Positive") return "bg-[#10B981] text-white";
    if (avgSentiment === "Positive") return "bg-[#34D399] text-white";
    if (avgSentiment === "Neutral") return "bg-[#9CA3AF] text-white";
    if (avgSentiment === "Negative") return "bg-[#F87171] text-white";
    return "bg-[#EF4444] text-white";
  })();

  // Get unique channels for filtering
  const channels = [...new Set((messages || []).map(m => m.channelId))];

  // Apply filters
  const filteredMessages = (messages || []).filter(message => {
    if (channelFilter !== "all" && message.channelId !== channelFilter) return false;
    if (sentimentFilter !== "all" && message.sentiment !== sentimentFilter) return false;
    return true;
  });

  // Apply pagination
  const paginatedMessages = filteredMessages.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));

  // Get sentiment percentage for the day
  const getPercentage = (sentiment: SentimentType) => {
    if (sentimentCounts.total === 0) return "0%";
    return `${Math.round((sentimentCounts[sentiment] / sentimentCounts.total) * 100)}%`;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Messages for {selectedDate ? formatDate(selectedDate) : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-sm font-medium text-gray-700">Daily Sentiment:</span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${avgSentimentClass}`}>
              {avgSentiment}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-sm">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#10B981] mr-1"></div>
              <span className="text-xs">{getPercentage('very_positive')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#34D399] mr-1"></div>
              <span className="text-xs">{getPercentage('positive')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#9CA3AF] mr-1"></div>
              <span className="text-xs">{getPercentage('neutral')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#F87171] mr-1"></div>
              <span className="text-xs">{getPercentage('negative')}</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-[#EF4444] mr-1"></div>
              <span className="text-xs">{getPercentage('very_negative')}</span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex justify-between mb-4">
            <Select
              value={channelFilter}
              onValueChange={setChannelFilter}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {channels.map(channel => (
                  <SelectItem key={channel} value={channel}>
                    #{channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sentimentFilter}
              onValueChange={setSentimentFilter}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Sentiments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sentiments</SelectItem>
                <SelectItem value="very_positive">Very Positive</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="very_negative">Very Negative</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center">
                          <Skeleton className="h-8 w-8 rounded-full mr-2" />
                          <Skeleton className="h-4 w-16" />
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-red-500">
                      Error loading messages
                    </TableCell>
                  </TableRow>
                ) : paginatedMessages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-gray-500">
                      No messages found for the selected criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMessages.map(message => (
                    <TableRow key={message.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <div className="bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center mr-2">
                            <span className="text-xs font-medium text-gray-600">
                              {getInitials(message.username)}
                            </span>
                          </div>
                          <span className="text-sm text-gray-900">{message.username}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-500">
                        #{message.channelId}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                        {message.content}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSentimentClass(message.sentiment as SentimentType)}`}>
                          {message.sentiment.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-500">
                        {formatTime(message.createdAt.toString())}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center">
          <div className="flex items-center text-sm text-gray-700">
            {filteredMessages.length > 0 && (
              <span>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredMessages.length)} of {filteredMessages.length} messages
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page => Math.max(1, page - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page => Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MessageDetailModal;
