import { FC, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  changeValue?: string | number;
  changeLabel?: string;
  isPositiveChange?: boolean;
  isLoading?: boolean;
}

const MetricCard: FC<MetricCardProps> = ({
  title,
  value,
  icon,
  changeValue,
  changeLabel,
  isPositiveChange = true,
  isLoading = false
}) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            {isLoading ? (
              <div className="h-8 w-24 bg-gray-200 animate-pulse rounded mt-1"></div>
            ) : (
              <p className="text-2xl font-semibold text-gray-800">{value}</p>
            )}
          </div>
          <div className="bg-blue-100 p-3 rounded-full">
            {icon}
          </div>
        </div>
        
        {(changeValue !== undefined && changeLabel) && (
          <div className="mt-2 flex items-center text-sm">
            {isLoading ? (
              <div className="h-4 w-32 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <>
                <span className={`flex items-center ${isPositiveChange ? 'text-green-500' : 'text-red-500'}`}>
                  <span className="mr-1">
                    {isPositiveChange ? "↑" : "↓"}
                  </span>
                  <span>{changeValue}</span>
                </span>
                <span className="text-gray-500 ml-2">{changeLabel}</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MetricCard;
