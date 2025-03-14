import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Sidebar from "@/components/dashboard/sidebar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, RefreshCw, Shield } from "lucide-react";

// Test page to verify the Telegram chat status tracking feature
export default function TestTelegramStatus() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Function to check all chat statuses
  const checkAllChatsStatus = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const res = await apiRequest("GET", "/api/telegram-chats/status/check-all");
      const data = await res.json();
      
      setResult(data);
      
      toast({
        title: "Status Check Complete",
        description: `Checked ${data.data ? data.data.total : 0} chats: ${data.data ? data.data.active : 0} active, ${data.data ? data.data.inactive : 0} inactive`,
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Error checking chat statuses",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 p-6 lg:p-8">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Test Telegram Chat Status</h1>
            <p className="text-muted-foreground">
              This page lets you test the chat status tracking feature
            </p>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Chat Status Management</CardTitle>
              <CardDescription>
                Test the functionality that checks the status of all Telegram chats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Button 
                  onClick={checkAllChatsStatus}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking Status...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Check All Chat Statuses
                    </>
                  )}
                </Button>
              </div>
              
              {result && (
                <div className="p-4 border rounded-md mt-4">
                  <h3 className="font-semibold mb-2">Result:</h3>
                  <pre className="bg-slate-100 p-3 rounded-md overflow-auto text-xs">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}