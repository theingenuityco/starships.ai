'use client';

import { KindeProvider } from "@kinde-oss/kinde-auth-nextjs";
import { AuthInitializer } from "@/components/auth/AuthInitializer";

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider that wraps the app with Kinde auth context
 * This should be placed high in the component tree to provide auth state to all components
 */
export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <KindeProvider>
      <AuthInitializer>
        {children}
      </AuthInitializer>
    </KindeProvider>
  );
} 