'use client';

import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface LoginButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
  redirectTo?: string;
}

/**
 * Login button that redirects to JWT-based login page
 * Integrates with existing UI components and theme
 */
export function LoginButton({
  variant = 'default',
  size = 'default',
  className,
  children,
  redirectTo = '/'
}: LoginButtonProps) {
  const router = useRouter();
  
  const handleLogin = () => {
    // Store redirect URL in localStorage for post-login redirect
    if (redirectTo !== '/') {
      localStorage.setItem('starships_redirect_after_login', redirectTo);
    }
    router.push('/login');
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("flex items-center gap-2", className)}
      onClick={handleLogin}
    >
      <LogIn className="h-4 w-4" />
      {children || 'Sign In'}
    </Button>
  );
}