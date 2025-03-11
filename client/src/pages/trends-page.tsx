import { useState } from "react";
import Sidebar from "@/components/dashboard/sidebar";
import SentimentChart from "@/components/dashboard/sentiment-chart";
import MessageDetailModal from "@/components/dashboard/message-detail-modal";
import { DateRangePicker, DateRange } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TrendsPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });

  const handleChartDataPointClick = (date: string) => {
    setSelectedDate(date);
    setShowMessageModal(true);
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-gray-50">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-0 md:pt-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm z-10 flex-shrink-0 hidden md:flex items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Sentiment Trends</h1>
            <p className="text-sm text-gray-600">Analyze sentiment trends over time</p>
          </div>
          <div>
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto pb-10">
          <div className="container mx-auto px-4 py-6 space-y-6">
            <Tabs defaultValue="byDay" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="byDay">By Day</TabsTrigger>
                <TabsTrigger value="byWeek">By Week</TabsTrigger>
                <TabsTrigger value="byMonth">By Month</TabsTrigger>
              </TabsList>
              
              <TabsContent value="byDay">
                <Card>
                  <CardHeader>
                    <CardTitle>Daily Sentiment Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentChart onDataPointClick={handleChartDataPointClick} />
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="byWeek">
                <Card>
                  <CardHeader>
                    <CardTitle>Weekly Sentiment Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentChart onDataPointClick={handleChartDataPointClick} />
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="byMonth">
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Sentiment Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SentimentChart onDataPointClick={handleChartDataPointClick} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

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