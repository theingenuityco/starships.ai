'use client';

import { KindeProvider } from "@kinde-oss/kinde-auth-nextjs";
import { useRouter } from "next/navigation";

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider that wraps the app with Kinde auth context
 * This should be placed high in the component tree to provide auth state to all components
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  
  return (
    <KindeProvider
      onRedirectCallback={(user) => {
        console.log('[AuthProvider] Redirect callback triggered, user:', user);
        // Force router refresh to sync auth state
        router.refresh();
      }}
    >
      {children}
    </KindeProvider>
  );
}