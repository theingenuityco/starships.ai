import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { LoginLink, LogoutLink, RegisterLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { useEffect, useState } from "react";
import { userAPI, type SyncedUser } from "@/lib/api";

/**
 * Custom hook for accessing Kinde authentication state and synced user data
 * Provides a consistent interface for auth operations across the app
 */
export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading: kindeLoading,
    getToken,
    getClaim
  } = useKindeBrowserClient();

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Auto-sync user when Kinde authentication completes
  useEffect(() => {
    const syncUser = async () => {
      if (!isAuthenticated || !user || syncedUser || syncLoading) {
        return;
      }

      setSyncLoading(true);
      setSyncError(null);

      try {
        console.log('[USER-SYNC] Syncing Kinde user to backend:', user.id);
        
        const syncedUserData = await userAPI.syncUser({
          kindeId: user.id,
          email: user.email!,
          name: user.given_name || user.family_name 
            ? `${user.given_name} ${user.family_name}`.trim()
            : undefined,
          avatar: user.picture || undefined
        });

        setSyncedUser(syncedUserData);
        console.log('[USER-SYNC] User synced successfully:', syncedUserData.id);
      } catch (error) {
        console.error('[USER-SYNC] Failed to sync user:', error);
        setSyncError('Failed to sync user data');
      } finally {
        setSyncLoading(false);
      }
    };

    syncUser();
  }, [isAuthenticated, user?.id]); // Fixed: Only depend on auth state and user ID

  const isLoading = kindeLoading || syncLoading;

  return {
    // Kinde user information
    kindeUser: user,
    isAuthenticated,
    isLoading,
    
    // Synced user data (from our backend)
    syncedUser,
    syncError,
    
    // Token management
    getToken,
    getClaim,
    
    // Auth components (for use in JSX)
    LoginLink,
    LogoutLink,
    RegisterLink,
    
    // Convenience properties (prefer synced user data when available)
    userId: syncedUser?.id || user?.id,
    userEmail: syncedUser?.email || user?.email,
    userName: syncedUser?.displayName || syncedUser?.username || (
      user?.given_name || user?.family_name 
        ? `${user?.given_name} ${user?.family_name}`.trim()
        : user?.email
    ),
    userAvatar: syncedUser?.avatar || user?.picture,
    
    // For backwards compatibility
    user: syncedUser || user
  };
} 