import React, { useRef, useEffect, useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

type ChartWrapperProps = {
  data: ChartData<'line' | 'bar'>;
  options?: ChartOptions<'line' | 'bar'>;
  type: 'line' | 'bar';
  height?: string;
  width?: string;
  className?: string;
  onClick?: (index: number) => void;
};

export function ChartWrapper({
  data,
  options = {},
  type = 'line',
  height = '100%',
  width = '100%',
  className = '',
  onClick
}: ChartWrapperProps) {
  const chartRef = useRef<ChartJS>(null);
  const [chartKey, setChartKey] = useState<number>(Date.now());

  // Set up the onClick handler if provided
  useEffect(() => {
    if (!onClick) return;

    const handleClick = (e: MouseEvent) => {
      if (!chartRef.current) return;
      const elements = chartRef.current.getElementsAtEventForMode(
        e as unknown as Event,
        'nearest',
        { intersect: true },
        false
      );
      
      if (elements.length > 0) {
        const { index } = elements[0];
        onClick(index);
      }
    };

    const chart = chartRef.current?.canvas;
    chart?.addEventListener('click', handleClick);

    return () => {
      chart?.removeEventListener('click', handleClick);
    };
  }, [onClick]);

  // Re-render chart when data changes
  useEffect(() => {
    setChartKey(Date.now());
  }, [data]);

  const baseOptions: ChartOptions<'line' | 'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  const mergedOptions = { ...baseOptions, ...options };

  return (
    <div 
      className={`${className} relative`} 
      style={{ height, width }}
    >
      {type === 'line' ? (
        <Line
          key={chartKey}
          ref={chartRef as React.RefObject<ChartJS<"line">>}
          data={data as ChartData<'line'>}
          options={mergedOptions as ChartOptions<'line'>}
        />
      ) : (
        <Bar
          key={chartKey}
          ref={chartRef as React.RefObject<ChartJS<"bar">>}
          data={data as ChartData<'bar'>}
          options={mergedOptions as ChartOptions<'bar'>}
        />
      )}
    </div>
  );
}
