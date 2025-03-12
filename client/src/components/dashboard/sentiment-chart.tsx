import { FC, useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartWrapper } from "@/components/ui/chart-wrapper";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartData, ChartOptions } from "chart.js";

interface SentimentChartProps {
  onDataPointClick: (date: string) => void;
}

// Type definitions for the sentiment data
interface SentimentDataPoint {
  date: string;
  averageSentiment: number;
  messageCount: number;
  sentimentCounts: {
    very_positive: number;
    positive: number;
    neutral: number;
    negative: number;
    very_negative: number;
  };
}

type TimeRange = "week" | "month" | "quarter" | "year";

const timeRangeToDays = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365
};

const SentimentChart: FC<SentimentChartProps> = ({ onDataPointClick }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("month");

  // Use the days parameter in the query key and request
  const { data, isLoading, error, refetch } = useQuery<SentimentDataPoint[]>({
    queryKey: ["/api/sentiment", timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/sentiment?days=${timeRangeToDays[timeRange]}`);
      if (!response.ok) {
        throw new Error('Failed to fetch sentiment data');
      }
      return response.json();
    },
    refetchInterval: 15000 // Refresh every 15 seconds
  });

  // Convert API data to chart data
  const chartData = useMemo(() => {
    if (!data || isLoading) {
      return {
        labels: [],
        datasets: [
          {
            label: 'Average Sentiment',
            data: [],
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
          }
        ]
      };
    }

    return {
      labels: data.map((d) => formatDate(d.date, 'MMM d')),
      datasets: [
        {
          label: 'Average Sentiment',
          data: data.map((d) => d.averageSentiment),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.1,
          pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#3B82F6'
        }
      ]
    } as ChartData<'line'>;
  }, [data, isLoading]);

  const chartOptions: ChartOptions<'line'> = {
    scales: {
      y: {
        beginAtZero: false,
        min: 0,
        max: 4,
        ticks: {
          stepSize: 1,
          callback: function(value) {
            if (value === 0) return 'Very Negative';
            if (value === 1) return 'Negative';
            if (value === 2) return 'Neutral';
            if (value === 3) return 'Positive';
            if (value === 4) return 'Very Positive';
            return '';
          }
        }
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.parsed.y;
            let sentiment = 'Neutral';
            if (value < 1) sentiment = 'Very Negative';
            else if (value < 2) sentiment = 'Negative';
            else if (value < 3) sentiment = 'Neutral';
            else if (value < 4) sentiment = 'Positive';
            else sentiment = 'Very Positive';
            
            return `Sentiment: ${sentiment} (${value.toFixed(1)})`;
          }
        }
      }
    }
  };

  const handleChartClick = (index: number) => {
    if (data && data[index]) {
      onDataPointClick(data[index].date);
    }
  };

  // Function to change time range and refetch data
  const changeTimeRange = (range: TimeRange) => {
    setTimeRange(range);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between">
          <CardTitle className="text-lg">Sentiment Trend</CardTitle>
          
          <div className="flex space-x-2 mt-2 sm:mt-0">
            <Button 
              size="sm"
              variant={timeRange === 'week' ? 'default' : 'outline'} 
              onClick={() => changeTimeRange('week')}
            >
              Week
            </Button>
            <Button 
              size="sm"
              variant={timeRange === 'month' ? 'default' : 'outline'} 
              onClick={() => changeTimeRange('month')}
            >
              Month
            </Button>
            <Button 
              size="sm"
              variant={timeRange === 'quarter' ? 'default' : 'outline'} 
              onClick={() => changeTimeRange('quarter')}
            >
              Quarter
            </Button>
            <Button 
              size="sm"
              variant={timeRange === 'year' ? 'default' : 'outline'} 
              onClick={() => changeTimeRange('year')}
            >
              Year
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div>
          <div className="flex items-center mb-3 overflow-x-auto whitespace-nowrap">
            <span className="text-sm font-medium text-gray-600 mr-6">Sentiment Legend:</span>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#10B981] mr-1"></div>
                <span className="text-xs">Very Positive</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#34D399] mr-1"></div>
                <span className="text-xs">Positive</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#9CA3AF] mr-1"></div>
                <span className="text-xs">Neutral</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#F87171] mr-1"></div>
                <span className="text-xs">Negative</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#EF4444] mr-1"></div>
                <span className="text-xs">Very Negative</span>
              </div>
            </div>
          </div>
          
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : error ? (
            <div className="h-80 flex items-center justify-center text-red-500">
              Error loading sentiment data
            </div>
          ) : (
            <div className="h-80">
              <ChartWrapper 
                type="line"
                data={chartData}
                options={chartOptions}
                onClick={handleChartClick}
              />
            </div>
          )}
          
          <div className="mt-2 text-center text-sm text-gray-500">
            <p>Click on any data point to view messages from that day</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SentimentChart;
