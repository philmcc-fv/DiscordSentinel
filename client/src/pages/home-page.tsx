import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import MetricCard from "@/components/dashboard/metric-card";
import SentimentChart from "@/components/dashboard/sentiment-chart";
import SentimentDistribution from "@/components/dashboard/sentiment-distribution";
import RecentMessages from "@/components/dashboard/recent-messages";
import MessageDetailModal from "@/components/dashboard/message-detail-modal";
import { useQuery, QueryClient } from "@tanstack/react-query";
import { MessageCircle, BarChart2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

type StatsResponse = {
  totalMessages: number;
  avgSentiment: string;
  activeUsers: number;
  messageGrowth: number;
  sentimentGrowth: number;
  userGrowth: number;
};

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<StatsResponse>({
    queryKey: ["/api/stats"],
  });

  const handleChartDataPointClick = (date: string) => {
    setSelectedDate(date);
    setShowMessageModal(true);
  };

  const handleRefreshData = () => {
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sentiment"] });
    queryClient.invalidateQueries({ queryKey: ["/api/distribution"] });
    queryClient.invalidateQueries({ queryKey: ["/api/recent-messages"] });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-0 md:pt-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm z-10 flex-shrink-0 hidden md:flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
            <p className="text-sm text-gray-600">Overview of server sentiment analysis</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Input
                type="text"
                placeholder="Search messages..."
                className="pl-10 pr-4 py-2"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            </div>
            <Button
              className="flex items-center"
              onClick={handleRefreshData}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-10">
          <div className="container mx-auto px-4 py-6 space-y-6">
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
              <MetricCard
                title="Analyzed Messages"
                value={statsLoading ? "..." : (stats?.totalMessages || 0).toLocaleString()}
                icon={<MessageCircle className="h-5 w-5 text-blue-500" />}
                changeValue={statsLoading ? "..." : `${(stats?.messageGrowth || 0).toFixed(1)}%`}
                changeLabel="from last month"
                isPositiveChange={!statsLoading && (stats?.messageGrowth || 0) > 0}
                isLoading={statsLoading}
              />

              <MetricCard
                title="Average Sentiment"
                value={statsLoading ? "..." : (stats?.avgSentiment || "Neutral")}
                icon={<BarChart2 className="h-5 w-5 text-green-500" />}
                changeValue={statsLoading ? "..." : `${(stats?.sentimentGrowth || 0).toFixed(1)}%`}
                changeLabel="from last month"
                isPositiveChange={!statsLoading && (stats?.sentimentGrowth || 0) > 0}
                isLoading={statsLoading}
              />

              <MetricCard
                title="Active Users"
                value={statsLoading ? "..." : (stats?.activeUsers || 0)}
                icon={<Users className="h-5 w-5 text-purple-500" />}
                changeValue={statsLoading ? "..." : `${(stats?.userGrowth || 0).toFixed(1)}%`}
                changeLabel="from last month"
                isPositiveChange={!statsLoading && (stats?.userGrowth || 0) > 0}
                isLoading={statsLoading}
              />
            </div>

            {/* Sentiment Chart */}
            <SentimentChart onDataPointClick={handleChartDataPointClick} />

            {/* Sentiment Distribution and Recent Messages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SentimentDistribution />
              <RecentMessages />
            </div>

            {/* Message Detail Modal */}
            <MessageDetailModal
              isOpen={showMessageModal}
              onClose={() => setShowMessageModal(false)}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
