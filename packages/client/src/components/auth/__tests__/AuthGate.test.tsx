/**
 * AuthGate Component Tests
 * Tests authentication gate functionality
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { AuthGate } from '../AuthGate'

// Mock Kinde Auth
jest.mock('@kinde-oss/kinde-auth-nextjs', () => ({
  useKindeBrowserClient: jest.fn(),
}))

// Import the mock
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs'

// Mock child component
const MockChildComponent = () => <div data-testid="protected-content">Protected Content</div>

const mockUseKindeBrowserClient = useKindeBrowserClient as jest.MockedFunction<typeof useKindeBrowserClient>

describe('AuthGate', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication States', () => {
    it('should show loading state while authentication is loading', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: true,
        isAuthenticated: false,
        user: null,
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should show login prompt when user is not authenticated', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      expect(screen.getByText('Please sign in to continue')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should render children when user is authenticated', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', email: 'test@example.com' },
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
      expect(screen.queryByText('Please sign in to continue')).not.toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: 'Authentication failed',
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      expect(screen.getByText('Please sign in to continue')).toBeInTheDocument()
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })

    it('should handle missing user data when authenticated', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: null,
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      // Should still render children if authenticated, even without user data
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper loading state accessibility', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: true,
        isAuthenticated: false,
        user: null,
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      const loadingElement = screen.getByText('Loading...')
      expect(loadingElement).toHaveAttribute('role', 'status')
      expect(loadingElement).toHaveAttribute('aria-live', 'polite')
    })

    it('should have proper authentication prompt accessibility', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: false,
        user: null,
      })

      render(
        <AuthGate>
          <MockChildComponent />
        </AuthGate>
      )

      const promptElement = screen.getByText('Please sign in to continue')
      expect(promptElement).toBeInTheDocument()
    })
  })

  describe('Multiple Children', () => {
    it('should render multiple children when authenticated', () => {
      mockUseKindeBrowserClient.mockReturnValue({
        isLoading: false,
        isAuthenticated: true,
        user: { id: '1', email: 'test@example.com' },
      })

      render(
        <AuthGate>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
        </AuthGate>
      )

      expect(screen.getByTestId('child-1')).toBeInTheDocument()
      expect(screen.getByTestId('child-2')).toBeInTheDocument()
    })
  })
})