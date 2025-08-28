import { useEffect, useState } from 'react';

interface ServerAuthState {
  isAuthenticated: boolean;
  user: any;
  isLoading: boolean;
}

/**
 * Hook to get the server-side authentication state
 * This ensures client and server auth states are in sync
 */
export function useServerAuth(): ServerAuthState {
  const [authState, setAuthState] = useState<ServerAuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true
  });

  useEffect(() => {
    // Fetch the server session
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          setAuthState({
            isAuthenticated: data.isAuthenticated,
            user: data.user,
            isLoading: false
          });
        } else {
          setAuthState({
            isAuthenticated: false,
            user: null,
            isLoading: false
          });
        }
      } catch (error) {
        console.error('[useServerAuth] Error checking auth:', error);
        setAuthState({
          isAuthenticated: false,
          user: null,
          isLoading: false
        });
      }
    };

    checkAuth();
  }, []);

  return authState;
}