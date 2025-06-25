'use client';

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { LogOut, User } from "lucide-react";

interface UserProfileProps {
  mode?: 'collapsed' | 'expanded';
}

/**
 * User profile component for navigation bottom
 * Shows user name and email with logout functionality via tooltip
 */
export const UserProfile = React.memo(function UserProfile({ mode = 'expanded' }: UserProfileProps) {
  const { user, userName, userEmail, isAuthenticated } = useAuth();
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isAuthenticated || !user) {
    return null;
  }

  if (mode === 'collapsed') {
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="flex justify-center group">
            <div className="p-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="right" 
          className="p-0 bg-popover border border-border shadow-lg rounded-lg max-w-xs text-popover-foreground z-[70]"
          sideOffset={15}
          avoidCollisions={true}
          collisionPadding={10}
        >
          <div className="p-3">
            {/* Action buttons only */}
            <div className="space-y-1">
              <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-accent">
                <User className="w-4 h-4 mr-3" />
                My Profile
              </Button>
              <LogoutLink className="block">
                <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-destructive hover:text-destructive-foreground">
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign Out
                </Button>
              </LogoutLink>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

    // Expanded mode
  return (
    <Tooltip delayDuration={200} open={showTooltip} onOpenChange={setShowTooltip}>
      <TooltipTrigger asChild>
        <div 
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-all duration-200 group"
          onClick={() => setShowTooltip(!showTooltip)}
        >
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent 
        side="right" 
        className="p-0 bg-popover border border-border shadow-lg rounded-lg max-w-xs text-popover-foreground"
        sideOffset={10}
      >
        <div className="p-3">
          {/* Action buttons only */}
          <div className="space-y-1">
            <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-accent">
              <User className="w-4 h-4 mr-3" />
              My Profile
            </Button>
            <LogoutLink className="block">
              <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-destructive hover:text-destructive-foreground">
                <LogOut className="w-4 h-4 mr-3" />
                Sign Out
              </Button>
            </LogoutLink>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}); 