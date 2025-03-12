import { 
  AlertCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Component that provides instructions for fixing Discord channel permissions
 */
export function PermissionInstructions() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="mt-6">
      <Alert className="bg-blue-50 border-blue-200 text-blue-800">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertTitle>Permission Settings Help</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-2">
            If your bot has permission issues for certain channels, you may need to update channel-specific permissions in Discord.
          </p>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="bg-white border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Hide Instructions
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show Instructions
              </>
            )}
          </Button>
          
          {isExpanded && (
            <div className="mt-4 space-y-4 text-sm">
              <h3 className="font-semibold text-blue-900">How to Fix Channel-Specific Permission Issues:</h3>
              
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  <strong>Open Discord</strong>: Log into the Discord account that has admin permissions on your server
                </li>
                
                <li>
                  <strong>Navigate to your server</strong>: Select the server where your bot is installed
                </li>
                
                <li>
                  <strong>Access Channel Settings</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Right-click on the problem channel</li>
                    <li>Select "Edit Channel" from the dropdown menu</li>
                  </ul>
                </li>
                
                <li>
                  <strong>Open Permissions Tab</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Click on the "Permissions" tab in the channel settings window</li>
                  </ul>
                </li>
                
                <li>
                  <strong>Add Bot-Specific Permissions</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Scroll down to the "Roles/Members" section</li>
                    <li>Click the + button next to "Roles/Members"</li>
                    <li>Search for your bot's name or role and select it</li>
                  </ul>
                </li>
                
                <li>
                  <strong>Grant Required Permissions</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Make sure these permissions are enabled (switch to ✓):
                      <ul className="list-[circle] ml-5">
                        <li>"View Channel"</li>
                        <li>"Read Message History"</li>
                      </ul>
                    </li>
                    <li>Make sure these permissions are not explicitly denied (not ❌)</li>
                  </ul>
                </li>
                
                <li>
                  <strong>Save Changes</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Click the "Save Changes" button at the bottom of the screen</li>
                  </ul>
                </li>
                
                <li>
                  <strong>Test Again</strong>:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Return to this page</li>
                    <li>Try to fetch historical messages again for the channel</li>
                  </ul>
                </li>
              </ol>
              
              <div className="bg-blue-100 p-3 rounded-md">
                <h4 className="font-semibold text-blue-900 mb-1">Common Causes of Permission Issues:</h4>
                <ul className="list-disc ml-5">
                  <li>The channel has different permissions than the rest of the server</li>
                  <li>The channel is in a category with restricted permissions</li>
                  <li>The channel has explicit permission denials that override server-level permissions</li>
                </ul>
              </div>
              
              <p className="text-sm text-blue-600">
                Note: If you've added the bot recently, you might need to restart your bot after making permission changes.
              </p>
            </div>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}