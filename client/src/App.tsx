import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import TrendsPage from "@/pages/trends-page";
import MessagesPage from "@/pages/messages-page";
import DiscordSettingsPage from "@/pages/discord-settings-page-new";
import TelegramSettingsPage from "@/pages/telegram-settings-page";
import TestTelegramStatus from "@/pages/test-telegram-status";
import AuthPage from "@/pages/auth-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/trends" component={TrendsPage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/discord-settings" component={DiscordSettingsPage} />
      <ProtectedRoute path="/telegram-settings" component={TelegramSettingsPage} />
      <ProtectedRoute path="/test-telegram-status" component={TestTelegramStatus} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
