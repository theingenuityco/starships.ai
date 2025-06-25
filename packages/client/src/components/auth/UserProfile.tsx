'use client';

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { LogOut, User } from "lucide-react";

interface UserProfileProps {
  mode?: 'collapsed' | 'expanded';
}

/**
 * User profile component for navigation bottom
 * Shows user information and provides logout functionality via tooltip
 */
export const UserProfile = React.memo(function UserProfile({ mode = 'expanded' }: UserProfileProps) {
  const { user, userName, userEmail, userAvatar, isAuthenticated } = useAuth();
  const [showTooltip, setShowTooltip] = useState(false);

  if (!isAuthenticated || !user) {
    return null;
  }

  // Get user initials for avatar fallback
  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (mode === 'collapsed') {
    return (
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="flex justify-center group">
            <div className="p-1 rounded-lg hover:bg-accent/50 transition-colors">
              <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                <AvatarImage 
                  src={userAvatar ? userAvatar : undefined} 
                  alt={userName || 'User'} 
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
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
          <div className="p-4 space-y-4">
            {/* Header with user info */}
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-primary/10">
                <AvatarImage 
                  src={userAvatar ? userAvatar : undefined} 
                  alt={userName || 'User'} 
                />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span className="text-xs text-muted-foreground">Online</span>
                </div>
              </div>
            </div>
            
            <div className="h-px bg-border"></div>
            
            {/* Action buttons */}
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-accent">
                <User className="w-4 h-4 mr-3" />
                View Profile
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
          <Avatar className="h-9 w-9 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
            <AvatarImage 
              src={userAvatar ? userAvatar : undefined} 
              alt={userName || 'User'} 
            />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{userName}</p>
              <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0"></div>
            </div>
            <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
          </div>
        </div>
      </TooltipTrigger>
             <TooltipContent 
         side="right" 
         className="p-0 bg-popover border border-border shadow-lg rounded-lg max-w-xs text-popover-foreground"
         sideOffset={10}
       >
        <div className="p-4 space-y-4">
          {/* Header with user info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 ring-2 ring-primary/10">
              <AvatarImage 
                src={userAvatar ? userAvatar : undefined} 
                alt={userName || 'User'} 
              />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            </div>
          </div>
          
          <div className="h-px bg-border"></div>
          
          {/* Action buttons */}
          <div className="space-y-2">
            <Button variant="ghost" size="sm" className="w-full justify-start h-9 hover:bg-accent">
              <User className="w-4 h-4 mr-3" />
              View Profile
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