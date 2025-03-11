import { cn } from "@/lib/utils";
import { FC, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Smile,
  ChartBar,
  MessageCircle,
  LayoutDashboard,
  Settings,
  Menu,
  X,
  LogOut
} from "lucide-react";

interface SidebarProps {
  className?: string;
}

const Sidebar: FC<SidebarProps> = ({ className }) => {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: <LayoutDashboard className="mr-3 h-5 w-5" />,
      active: location === "/"
    },
    {
      name: "Sentiment Trends",
      href: "/trends",
      icon: <ChartBar className="mr-3 h-5 w-5" />,
      active: location === "/trends"
    },
    {
      name: "Messages",
      href: "/messages",
      icon: <MessageCircle className="mr-3 h-5 w-5" />,
      active: location === "/messages"
    },
    {
      name: "Discord Settings",
      href: "/discord-settings",
      icon: <Settings className="mr-3 h-5 w-5" />,
      active: location === "/discord-settings"
    }
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden bg-gray-800 text-white w-full p-4 flex items-center justify-between">
        <div className="flex items-center">
          <Smile className="text-blue-400 h-5 w-5 mr-2" />
          <h1 className="font-semibold text-lg">Sentiment Analyzer</h1>
        </div>
        <button
          onClick={toggleMobileMenu}
          className="text-gray-300 focus:outline-none"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-gray-800 z-10">
          <nav className="py-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={closeMobileMenu}
                className={cn(
                  "flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700",
                  item.active && "bg-gray-900 text-blue-400"
                )}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="w-full flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700"
            >
              <LogOut className="mr-3 h-5 w-5" />
              <span>Logout</span>
            </button>
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div
        className={cn(
          "bg-gray-800 text-white w-64 flex-shrink-0 hidden md:flex md:flex-col h-screen",
          className
        )}
      >
        <div className="p-4 flex items-center border-b border-gray-700">
          <Smile className="text-blue-400 h-5 w-5 mr-2" />
          <h1 className="font-semibold text-lg">Sentiment Analyzer</h1>
        </div>

        <nav className="flex-1 pt-5">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-4 py-3 text-gray-300 hover:bg-gray-700",
                item.active && "bg-gray-900 text-blue-400"
              )}
            >
              {item.icon}
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center mb-3">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-600 flex items-center justify-center">
              <span className="text-gray-300 text-sm font-medium">
                {user?.username?.substring(0, 2).toUpperCase() || "U"}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{user?.username}</p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <span className="flex items-center">
                <LogOut className="mr-2 h-4 w-4 animate-spin" />
                Logging out...
              </span>
            ) : (
              <span className="flex items-center">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </span>
            )}
          </Button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
