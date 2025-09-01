'use client';

import { LoginLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface DynamicLoginButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: ReactNode;
  postLoginRedirectURL?: string;
  showIcon?: boolean;
  [key: string]: unknown; // Allow additional props
}

export function DynamicLoginButton({
  variant = 'default',
  size = 'default',
  className,
  children,
  postLoginRedirectURL = '/fleet',
  showIcon = true,
  ...props
}: DynamicLoginButtonProps) {
  
  return (
    <LoginLink postLoginRedirectURL={postLoginRedirectURL}>
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