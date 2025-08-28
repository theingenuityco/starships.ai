'use client';

import { KindeProvider } from "@kinde-oss/kinde-auth-nextjs";
import { useEffect } from "react";

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider that wraps the app with Kinde auth context
 * This should be placed high in the component tree to provide auth state to all components
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // Force check authentication state on mount
  useEffect(() => {
    // Trigger Kinde SDK to check for existing auth session
    const checkAuth = async () => {
      try {
        // This call helps initialize the Kinde client
        await fetch('/api/auth/setup');
      } catch (error) {
        console.error('[AuthProvider] Failed to check auth setup:', error);
      }
    };
    
    checkAuth();
  }, []);

  return (
    <KindeProvider>
      {children}
    </KindeProvider>
  );
} 