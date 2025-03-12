import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Check, Loader2, Shield, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

interface ChannelPermissionStatusProps {
  channelId: string;
  guildId: string;
  disabled?: boolean;
}

/**
 * Component that checks and displays if the bot has proper permissions for a Discord channel
 */
export function ChannelPermissionStatus({ 
  channelId, 
  guildId,
  disabled = false
}: ChannelPermissionStatusProps) {
  const [isChecking, setIsChecking] = useState(false);
  
  // Query for channel permissions
  const { data, isLoading, refetch } = useQuery<{ 
    hasPermissions: boolean; 
    missingPermissions: string[];
    error?: string;
  }>({
    queryKey: [`/api/channels/${channelId}/permissions`],
    enabled: false, // Don't run on component mount, run manually
  });
  
  const checkPermissions = async () => {
    setIsChecking(true);
    await refetch();
    setIsChecking(false);
  };
  
  // Determine if we should show an error state
  const hasCheckedAndFailed = data && !data.hasPermissions;
  
  return (
    <div className={`flex ${hasCheckedAndFailed ? 'flex-col space-y-2' : 'items-center gap-1'}`}>
      <div className="inline-flex items-center gap-1">
        {data ? (
          data.hasPermissions ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-green-600 text-xs font-medium">
                    <Check className="h-3.5 w-3.5 mr-0.5" />
                    Permissions OK
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Bot has all required permissions in this channel</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center text-red-600 text-xs font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 mr-0.5" />
                    Missing Permissions
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs">
                    <p className="font-medium mb-1">Missing permissions:</p>
                    <ul className="list-disc pl-4 text-xs">
                      {data.missingPermissions.map((perm) => (
                        <li key={perm}>{perm}</li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        ) : null}
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={checkPermissions}
          disabled={isLoading || isChecking || disabled}
        >
          {isLoading || isChecking ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Shield className="h-3 w-3 mr-1" />
          )}
          Check Permissions
        </Button>
      </div>
      
      {/* Show error message when permissions are missing */}
      {hasCheckedAndFailed && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 flex items-start space-x-2">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-red-700 font-medium">Permission Error</p>
            <p className="text-xs text-red-600">
              This bot doesn't have the necessary permissions to access this channel.
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {data.missingPermissions.map((perm) => (
                <Badge key={perm} variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">
                  Missing: {perm}
                </Badge>
              ))}
            </div>
            <div className="mt-1 flex items-center">
              <HelpCircle className="h-3 w-3 text-red-400 mr-1" />
              <p className="text-[10px] text-red-500">
                See instructions below to fix permission issues
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}