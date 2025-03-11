import { FC } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { percentToWidth, formatPercent } from "@/lib/utils";

interface SentimentDistributionProps {
  days?: number;
}

const SentimentDistribution: FC<SentimentDistributionProps> = ({ days = 30 }) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/distribution", { days }],
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

  const { very_positive, positive, neutral, negative, very_negative, total } = data || {
    very_positive: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    very_negative: 0,
    total: 0
  };

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
                className="bg-[#10B981] h-2.5 rounded-full" 
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
                className="bg-[#34D399] h-2.5 rounded-full" 
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
                className="bg-[#9CA3AF] h-2.5 rounded-full" 
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
                className="bg-[#F87171] h-2.5 rounded-full" 
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
                className="bg-[#EF4444] h-2.5 rounded-full" 
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
