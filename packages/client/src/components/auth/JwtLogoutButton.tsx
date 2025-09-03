'use client';

import { useJwtAuth } from '@/hooks/useJwtAuth';
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface JwtLogoutButtonProps {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

/**
 * JWT-based logout button
 */
export function JwtLogoutButton({
  variant = 'ghost',
  size = 'default',
  className,
  children
}: JwtLogoutButtonProps) {
  const { logout, isLoading } = useJwtAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("flex items-center gap-2", className)}
      onClick={handleLogout}
      disabled={isLoading}
    >
      <LogOut className="h-4 w-4" />
      {children || 'Sign Out'}
    </Button>
  );
}