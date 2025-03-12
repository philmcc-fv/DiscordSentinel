import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { percentToWidth, formatPercent } from "@/lib/utils";

interface SentimentDistributionProps {
  days?: number;
}

const SentimentDistribution: FC<SentimentDistributionProps> = ({ days = 30 }) => {
  type DistributionData = {
    very_positive: number;
    positive: number;
    neutral: number;
    negative: number;
    very_negative: number;
    total: number;
  };

  const { data, isLoading, error } = useQuery<DistributionData>({
    queryKey: ["/api/distribution", { days }],
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sentiment Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sentiment Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500">Error loading sentiment distribution</div>
        </CardContent>
      </Card>
    );
  }

  // Make sure we have a default empty object with all required properties
  const distribution: DistributionData = data || {
    very_positive: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    very_negative: 0,
    total: 0
  };
  
  const { very_positive, positive, neutral, negative, very_negative, total } = distribution;

  const getPercentage = (value: number) => {
    if (total === 0) return 0;
    return (value / total) * 100;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sentiment Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Very Positive</span>
              <span className="text-sm font-medium text-gray-700">
                {formatPercent(getPercentage(very_positive))}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-sentiment-vpositive h-2.5 rounded-full" 
                style={{ width: percentToWidth(getPercentage(very_positive)) }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Positive</span>
              <span className="text-sm font-medium text-gray-700">
                {formatPercent(getPercentage(positive))}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-sentiment-positive h-2.5 rounded-full" 
                style={{ width: percentToWidth(getPercentage(positive)) }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Neutral</span>
              <span className="text-sm font-medium text-gray-700">
                {formatPercent(getPercentage(neutral))}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-sentiment-neutral h-2.5 rounded-full" 
                style={{ width: percentToWidth(getPercentage(neutral)) }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Negative</span>
              <span className="text-sm font-medium text-gray-700">
                {formatPercent(getPercentage(negative))}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-sentiment-negative h-2.5 rounded-full" 
                style={{ width: percentToWidth(getPercentage(negative)) }}
              ></div>
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">Very Negative</span>
              <span className="text-sm font-medium text-gray-700">
                {formatPercent(getPercentage(very_negative))}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-sentiment-vnegative h-2.5 rounded-full" 
                style={{ width: percentToWidth(getPercentage(very_negative)) }}
              ></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SentimentDistribution;
