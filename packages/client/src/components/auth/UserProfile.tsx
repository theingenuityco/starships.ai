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

    // Expanded mode - Professional design
  return (
    <Tooltip delayDuration={200} open={showTooltip} onOpenChange={setShowTooltip}>
      <TooltipTrigger asChild>
        <div 
          className="flex items-center gap-2.5 p-3 m-3 rounded-lg bg-gradient-to-r from-muted/30 to-muted/20 hover:from-muted/40 hover:to-muted/30 cursor-pointer transition-all duration-300 group border border-border/40 hover:border-border/60 shadow-sm hover:shadow-md"
          onClick={() => setShowTooltip(!showTooltip)}
        >
          <div className="relative">
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg group-hover:from-primary/25 group-hover:to-primary/15 transition-all duration-300">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{userName}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              {userEmail}
            </p>
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