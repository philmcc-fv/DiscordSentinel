import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { SentimentType, sentimentMappings } from "@shared/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string, formatString: string = "PPP"): string {
  if (!dateString) return "";
  try {
    return format(parseISO(dateString), formatString);
  } catch (error) {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  if (!dateString) return "";
  try {
    return format(parseISO(dateString), "MMM d, yyyy h:mm a");
  } catch (error) {
    return dateString;
  }
}

export function formatTime(dateString: string): string {
  if (!dateString) return "";
  try {
    return format(parseISO(dateString), "h:mm a");
  } catch (error) {
    return dateString;
  }
}

export function getSentimentLabel(sentiment: SentimentType): string {
  return sentimentMappings[sentiment].display;
}

export function getSentimentClass(sentiment: SentimentType): string {
  return `bg-sentiment-${sentiment.replace('very_', 'v')} text-white`;
}

export function getSentimentBorderClass(sentiment: SentimentType): string {
  return `border-sentiment-${sentiment.replace('very_', 'v')}`;
}

export function getInitials(name: string): string {
  if (!name) return "";
  const parts = name.split(/[\s-_]+/);
  if (parts.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function percentToWidth(percent: number): string {
  return `${Math.max(0, Math.min(100, percent))}%`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function sentimentScoreToLabel(score: number): SentimentType {
  if (score >= 3.5) return 'very_positive';
  if (score >= 2.5) return 'positive';
  if (score >= 1.5) return 'neutral';
  if (score >= 0.5) return 'negative';
  return 'very_negative';
}
