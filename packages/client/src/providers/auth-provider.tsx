'use client';

import React, { createContext, useContext } from 'react';
import { useJwtAuth } from '@/hooks/useJwtAuth';
import type { AuthUser } from '@/hooks/useJwtAuth';

interface AuthContextValue {
  user: AuthUser | null;
  syncedUser: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  getToken: () => string | null;
  userId?: string;
  userEmail?: string;
  userName?: string;
  userAvatar?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Authentication provider that wraps the app with JWT auth context
 * This should be placed high in the component tree to provide auth state to all components
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const auth = useJwtAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}