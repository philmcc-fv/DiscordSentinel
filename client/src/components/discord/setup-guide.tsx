import { 
  HelpCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Component that provides setup instructions for the Discord bot
 */
export function SetupGuide() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="mt-6">
      <Alert className="bg-blue-50 border-blue-200 text-blue-800">
        <HelpCircle className="h-4 w-4 text-blue-600" />
        <AlertTitle>Discord Bot Setup Guide</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-2">
            Follow these steps to properly set up your Discord bot for sentiment analysis.
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
                Hide Setup Guide
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Show Setup Guide
              </>
            )}
          </Button>
          
          {isExpanded && (
            <div className="mt-4 space-y-4 text-sm">
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900 mb-2">Step 1: Create a Discord Bot</h3>
                <ol className="space-y-1 list-decimal ml-5">
                  <li>Visit the <a href="https://discord.com/developers/applications" target="_blank" rel="noopener" className="text-blue-600 hover:underline">Discord Developer Portal</a></li>
                  <li>Click "New Application" and name your bot</li>
                  <li>Go to the "Bot" tab and click "Add Bot"</li>
                  <li>Copy your bot token (Reset Token if needed) and paste it in the form below</li>
                </ol>
              </div>
              
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900 mb-2">Step 2: Enable Required Intents</h3>
                <ol className="space-y-1 list-decimal ml-5">
                  <li>In the Bot tab, scroll down to "Privileged Gateway Intents"</li>
                  <li>Enable <strong>MESSAGE CONTENT INTENT</strong> (required for analyzing messages)</li>
                  <li>Enable <strong>SERVER MEMBERS INTENT</strong></li>
                </ol>
              </div>
              
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900 mb-2">Step 3: Generate Invite URL</h3>
                <ol className="space-y-1 list-decimal ml-5">
                  <li>Go to OAuth2 → URL Generator</li>
                  <li>Select scopes: <strong>bot</strong>, <strong>identify</strong>, <strong>guilds</strong></li>
                  <li>Select bot permissions: <strong>View Channels</strong>, <strong>Send Messages</strong>, <strong>Read Message History</strong></li>
                  <li>Add any redirect URL (e.g. <code>https://localhost/callback</code>)</li>
                  <li>Copy the generated URL at the bottom of the page</li>
                </ol>
              </div>
              
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900 mb-2">Step 4: Invite Bot to Your Server</h3>
                <ol className="space-y-1 list-decimal ml-5">
                  <li>Paste the URL in your browser</li>
                  <li>Select your server from the dropdown</li>
                  <li>Authorize the bot</li>
                  <li>Verify the bot appears in your server's member list</li>
                </ol>
              </div>
              
              <div className="border-l-4 border-blue-500 pl-4 py-2">
                <h3 className="font-semibold text-blue-900 mb-2">Step 5: Get Server ID</h3>
                <ol className="space-y-1 list-decimal ml-5">
                  <li>In Discord, enable Developer Mode in Settings → Advanced</li>
                  <li>Right-click on your server name and select "Copy ID"</li>
                  <li>Paste the ID in the Server ID field below</li>
                </ol>
              </div>
              
              <div className="bg-blue-100 p-3 rounded-md">
                <h4 className="font-semibold text-blue-900 mb-1">Important Notes:</h4>
                <ul className="list-disc ml-5">
                  <li>Keep your bot token secure - it provides full access to your bot</li>
                  <li>The bot must be online to collect and analyze messages</li>
                  <li>You may need to adjust channel-specific permissions if access issues occur</li>
                </ul>
              </div>
            </div>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}