import { useState, useEffect, useCallback } from 'react'
import { userAPI, type SyncedUser, setTokenProvider } from '@/lib/api'

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * JWT-based authentication hook to replace Kinde
 */
export function useJwtAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null
  });

  const [syncedUser, setSyncedUser] = useState<SyncedUser | null>(null);

  // Load token from localStorage
  const getStoredToken = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('starships_auth_token');
  }, []);

  // Store token in localStorage
  const setStoredToken = useCallback((token: string | null) => {
    if (typeof window === 'undefined') return;
    if (token) {
      localStorage.setItem('starships_auth_token', token);
    } else {
      localStorage.removeItem('starships_auth_token');
    }
  }, []);

  // Set up token provider for API calls
  useEffect(() => {
    setTokenProvider(async () => {
      const token = getStoredToken();
      return token;
    });
  }, [getStoredToken]);

  // Validate token and get user info
  const validateToken = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const response = await fetch('/api/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.data || data; // Handle different response formats
      }
      
      return null;
    } catch (error) {
      console.error('[JWT-AUTH] Token validation failed:', error);
      return null;
    }
  }, []);

  // Login function
  const login = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.data) {
        const { user, token } = data.data;
        setStoredToken(token);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        console.log('[JWT-AUTH] User logged in:', user.email);
        return { success: true };
      } else {
        const errorMessage = data.error?.message || 'Login failed';
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: errorMessage 
        }));
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('[JWT-AUTH] Login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMessage 
      }));
      return { success: false, error: errorMessage };
    }
  }, [setStoredToken]);

  // Register function
  const register = useCallback(async (email: string, password: string, name?: string): Promise<{ success: boolean; error?: string }> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (response.ok && data.data) {
        const { user, token } = data.data;
        setStoredToken(token);
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        console.log('[JWT-AUTH] User registered:', user.email);
        return { success: true };
      } else {
        const errorMessage = data.error?.message || 'Registration failed';
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: errorMessage 
        }));
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      console.error('[JWT-AUTH] Registration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: errorMessage 
      }));
      return { success: false, error: errorMessage };
    }
  }, [setStoredToken]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Call logout endpoint (optional since JWT is stateless)
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getStoredToken()}`,
        },
      });
    } catch (error) {
      console.error('[JWT-AUTH] Logout API call failed:', error);
    }

    // Clear local state regardless
    setStoredToken(null);
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null
    });
    setSyncedUser(null);
    console.log('[JWT-AUTH] User logged out');
  }, [getStoredToken, setStoredToken]);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const token = getStoredToken();
      
      if (!token) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      // Validate stored token
      const user = await validateToken(token);
      
      if (user) {
        setState({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        
        // Try to sync user data
        try {
          const syncedUserData = await userAPI.syncUser({
            kindeId: user.id, // Use JWT user ID as kindeId for compatibility
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          });
          setSyncedUser(syncedUserData);
        } catch (syncError) {
          console.error('[JWT-AUTH] User sync failed:', syncError);
          // Don't fail auth if sync fails
        }
      } else {
        // Invalid token, clear it
        setStoredToken(null);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, [getStoredToken, setStoredToken, validateToken]);

  return {
    // Auth state
    user: state.user,
    syncedUser,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    
    // Auth actions
    login,
    register,
    logout,
    
    // Compatibility properties for existing components
    userId: syncedUser?.id || state.user?.id,
    userEmail: syncedUser?.email || state.user?.email,
    userName: syncedUser?.displayName || state.user?.name,
    userAvatar: syncedUser?.avatar || state.user?.avatar,
    kindeUser: state.user, // For backward compatibility
  };
}