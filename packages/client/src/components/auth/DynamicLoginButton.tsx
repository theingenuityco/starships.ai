'use client';

import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";

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
  postLoginRedirectURL = '/',
  showIcon = true,
  ...props
}: DynamicLoginButtonProps) {
  const router = useRouter();
  
  const handleLogin = () => {
    // Store redirect URL in localStorage for post-login redirect
    if (postLoginRedirectURL && postLoginRedirectURL !== '/') {
      localStorage.setItem('starships_redirect_after_login', postLoginRedirectURL);
    }
    router.push('/login');
  };
  
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("flex items-center gap-2", className)}
      onClick={handleLogin}
      {...props}
    >
      {showIcon && <LogIn className="h-4 w-4" />}
      {children || 'Sign In'}
    </Button>
  );
}