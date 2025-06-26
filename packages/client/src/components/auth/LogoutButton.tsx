'use client';

import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

/**
 * Logout button that signs out the user via Kinde
 * Integrates with existing UI components and theme
 */
export function LogoutButton({ 
  variant = 'ghost', 
  size = 'default', 
  className,
  children 
}: LogoutButtonProps) {
  return (
    <LogoutLink>
      <Button 
        variant={variant} 
        size={size}
        className={cn("flex items-center gap-2", className)}
      >
        <LogOut className="h-4 w-4" />
        {children || 'Sign Out'}
      </Button>
    </LogoutLink>
  );
} 