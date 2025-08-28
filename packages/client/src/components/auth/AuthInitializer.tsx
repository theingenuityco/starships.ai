'use client';

import { useEffect, useState } from 'react';
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs';
import { setTokenProvider } from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, getToken, user } = useKindeBrowserClient();
  const [tokenProviderSet, setTokenProviderSet] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(() => {
    // Check if we've already attempted sync in this session
    return sessionStorage.getItem('auth_sync_attempted') === 'true';
  });
  const router = useRouter();
  const pathname = usePathname();
  
  // Pages that don't need auth sync
  const publicPaths = ['/', '/waitlist', '/api'];
  const isPublicPath = publicPaths.some(path => pathname === path || pathname.startsWith('/api/'));

  // Check if server has auth when client doesn't - ONLY ONCE
  useEffect(() => {
    // Skip sync for public pages
    if (isPublicPath) {
      return;
    }
    
    // Only sync once per session when:
    // 1. Kinde has finished loading
    // 2. Client is not authenticated
    // 3. We haven't already attempted sync in this session
    // 4. Not on a public page
    if (!isLoading && !isAuthenticated && !syncAttempted && !isPublicPath) {
      setSyncAttempted(true);
      sessionStorage.setItem('auth_sync_attempted', 'true');
      
      console.log('[AuthInitializer] Attempting one-time auth sync check');
      
      // Try to sync auth state from server
      fetch('/api/auth/sync', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          console.log('[AuthInitializer] Auth sync response:', data);
          if (data.authenticated) {
            console.log('[AuthInitializer] Server is authenticated, client is not - forcing ONE refresh');
            // Give cookies time to be set, then reload ONCE
            setTimeout(() => {
              window.location.reload();
            }, 100);
          }
        })
        .catch(err => {
          console.error('[AuthInitializer] Failed to sync auth:', err);
        });
    }
  }, [isLoading, isAuthenticated, syncAttempted, isPublicPath]);
  
  // Clear sync flag when user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      sessionStorage.removeItem('auth_sync_attempted');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Set up token provider once Kinde is loaded
    if (!isLoading && !tokenProviderSet) {
      console.log('[AuthInitializer] Setting up token provider, authenticated:', isAuthenticated, 'user:', user?.id);
      
      setTokenProvider(async () => {
        // If authenticated, get the token
        if (isAuthenticated && getToken) {
          try {
            const token = await getToken();
            if (token) {
              console.log('[AuthInitializer] Providing Kinde token');
              return token;
            }
          } catch (error) {
            console.warn('[AuthInitializer] Failed to get Kinde token:', error);
          }
        }
        
        // If we're authenticated but can't get client token, try server endpoint
        if (isAuthenticated) {
          try {
            console.log('[AuthInitializer] Fetching token from server as fallback');
            const response = await fetch('/api/auth/token');
            if (response.ok) {
              const { token } = await response.json();
              if (token && token.includes('.')) {
                console.log('[AuthInitializer] Using server token');
                return token;
              }
            }
            
            // Development fallback
            if (process.env.NODE_ENV === 'development') {
              const devResponse = await fetch('/api/auth/dev-token');
              if (devResponse.ok) {
                const { token } = await devResponse.json();
                console.log('[AuthInitializer] Using development token');
                return token;
              }
            }
          } catch (error) {
            console.error('[AuthInitializer] Failed to get server token:', error);
          }
        }
        
        console.log('[AuthInitializer] No token available');
        return null;
      });
      
      setTokenProviderSet(true);
    }
  }, [isLoading, isAuthenticated, getToken, tokenProviderSet, user]);

  // Show loading while Kinde initializes
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Initializing authentication...</div>
      </div>
    );
  }

  return <>{children}</>;
}