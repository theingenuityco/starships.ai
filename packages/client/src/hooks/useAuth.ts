import { useJwtAuth } from './useJwtAuth'
import React from 'react'

// Mock component for compatibility
const MockLink = ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children)

/**
 * Main auth hook that now uses JWT instead of Kinde
 * Provides a consistent interface for auth operations across the app
 */
export function useAuth() {
  // Delegate to JWT auth hook
  const jwtAuth = useJwtAuth()
  
  // Return compatible interface for existing components
  return {
    ...jwtAuth,
    // Kinde compatibility properties
    kindeUser: jwtAuth.user,
    getToken: async () => {
      if (typeof window === 'undefined') return null
      return localStorage.getItem('starships_auth_token')
    },
    getClaim: () => null, // Not used with JWT
    
    // Mock components for compatibility (these won't be used with JWT)
    LoginLink: MockLink,
    LogoutLink: MockLink,
    RegisterLink: MockLink,
  }
}

/**
 * Legacy Kinde-based auth hook (deprecated)
 * This is kept for reference but should not be used
 */
export function useKindeAuth() {
  // This function is now deprecated and should not be used
  // Kept for reference only
  console.warn('useKindeAuth is deprecated. Components should use useAuth() which now uses JWT.')
  return {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: 'Kinde authentication is deprecated'
  }
}
