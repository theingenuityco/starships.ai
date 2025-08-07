'use client';

import { LoginLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingSession } from "@/hooks/useOnboardingSession";
import { ReactNode } from "react";

interface DynamicLoginButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: ReactNode;
  postLoginRedirectURL?: string;
  preserveOnboarding?: boolean;
  showIcon?: boolean;
  [key: string]: any; // Allow additional props
}

/**
 * Enhanced login button that preserves onboarding state through authentication
 * Automatically detects if user has a pending vision and adjusts redirect URL
 */
export function DynamicLoginButton({ 
  variant = 'default', 
  size = 'default', 
  className,
  children,
  postLoginRedirectURL = '/fleet',
  preserveOnboarding = true,
  showIcon = true,
  ...props
}: DynamicLoginButtonProps) {
  const { session } = useOnboardingSession();
  
  // Build redirect URL with onboarding params if needed
  const buildRedirectUrl = () => {
    let url = postLoginRedirectURL;
    
    // If we have an onboarding session and should preserve it
    if (preserveOnboarding && session?.pendingVision) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}onboarding=true`;
      
      // Add session ID for recovery
      if (session.sibilSessionId) {
        url += `&session=${encodeURIComponent(session.sibilSessionId)}`;
      }
      
      console.log('[DynamicLoginButton] Built redirect URL with onboarding params:', url);
    }
    
    return url;
  };
  
  const redirectUrl = buildRedirectUrl();
  
  // Log for debugging
  if (session?.pendingVision) {
    console.log('[DynamicLoginButton] Session found with vision:', session.pendingVision.slice(0, 50));
  }
  
  return (
    <LoginLink postLoginRedirectURL={redirectUrl}>
      <Button 
        variant={variant} 
        size={size}
        className={cn("flex items-center gap-2", className)}
        {...props}
      >
        {showIcon && <LogIn className="h-4 w-4" />}
        {children || 'Sign In'}
      </Button>
    </LoginLink>
  );
}