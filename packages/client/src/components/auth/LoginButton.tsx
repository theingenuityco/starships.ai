'use client';

import { LoginLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoginButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

/**
 * Login button that redirects to Kinde's hosted authentication page
 * Integrates with existing UI components and theme
 */
export function LoginButton({ 
  variant = 'default', 
  size = 'default', 
  className,
  children 
}: LoginButtonProps) {
  return (
    <LoginLink postLoginRedirectURL="/">
      <Button 
        variant={variant} 
        size={size}
        className={cn("flex items-center gap-2", className)}
      >
        <LogIn className="h-4 w-4" />
        {children || 'Sign In'}
      </Button>
    </LoginLink>
  );
} 