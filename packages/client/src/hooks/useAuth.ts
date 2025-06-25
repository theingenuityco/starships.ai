import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { LoginLink, LogoutLink, RegisterLink } from "@kinde-oss/kinde-auth-nextjs/components";

/**
 * Custom hook for accessing Kinde authentication state
 * Provides a consistent interface for auth operations across the app
 */
export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    getToken,
    getClaim
  } = useKindeBrowserClient();

  return {
    // User information
    user,
    isAuthenticated,
    isLoading,
    
    // Token management
    getToken,
    getClaim,
    
    // Auth components (for use in JSX)
    LoginLink,
    LogoutLink,
    RegisterLink,
    
    // Convenience properties
    userId: user?.id,
    userEmail: user?.email,
    userName: user?.given_name || user?.family_name 
      ? `${user?.given_name} ${user?.family_name}`.trim()
      : user?.email,
    userAvatar: user?.picture
  };
} 