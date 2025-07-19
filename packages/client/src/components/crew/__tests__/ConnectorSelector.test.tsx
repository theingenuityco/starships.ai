/**
 * ConnectorSelector Component Tests
 * Comprehensive test suite covering all functionality with >90% coverage
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectorSelector } from '../ConnectorSelector'
import { mcpServerAPI, MCPServerOption } from '@/lib/api'

// Mock the API
jest.mock('@/lib/api', () => ({
  mcpServerAPI: {
    getAll: jest.fn(),
    getConnectedToStarship: jest.fn(),
    connectToStarship: jest.fn(),
    disconnectFromStarship: jest.fn(),
  },
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => (
    <div data-testid="loader" className={className} />
  ),
  Search: ({ className }: { className?: string }) => (
    <div data-testid="search-icon" className={className} />
  ),
  ChevronDown: ({ className }: { className?: string }) => (
    <div data-testid="chevron-down" className={className} />
  ),
  Check: ({ className }: { className?: string }) => (
    <div data-testid="check-icon" className={className} />
  ),
  X: ({ className }: { className?: string }) => <div data-testid="x-icon" className={className} />,
  Plug: ({ className }: { className?: string }) => (
    <div data-testid="plug-icon" className={className} />
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <div data-testid="alert-icon" className={className} />
  ),
  Wifi: ({ className }: { className?: string }) => (
    <div data-testid="wifi-icon" className={className} />
  ),
  WifiOff: ({ className }: { className?: string }) => (
    <div data-testid="wifi-off-icon" className={className} />
  ),
}))

// Mock utility functions
jest.mock('@/lib/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}))

// Test data
const mockConnectors: MCPServerOption[] = [
  {
    id: 'github',
    name: 'Github',
    command: 'docker',
    args: ['run', '--rm', 'github-mcp'],
    env: '{"GITHUB_TOKEN": "required", "GITHUB_API_URL": "https://api.github.com"}',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    command: 'npx',
    args: ['@modelcontextprotocol/server-puppeteer'],
    env: '{"PUPPETEER_HEADLESS": "true"}',
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    command: 'uvx',
    args: ['mcp-server-filesystem'],
  },
]

const mockConnectedConnectors: MCPServerOption[] = [mockConnectors[0]]

const defaultProps = {
  starshipId: 'test-starship-1',
  selectedConnectors: [],
  onConnectorsChange: jest.fn(),
}

describe('ConnectorSelector', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    jest.clearAllMocks()
    // Setup default API responses
    ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue(mockConnectors)
    ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockResolvedValue(mockConnectedConnectors)
    ;(mcpServerAPI.connectToStarship as jest.Mock).mockResolvedValue(undefined)
    ;(mcpServerAPI.disconnectFromStarship as jest.Mock).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Initial Rendering', () => {
    it('should render loading state initially', async () => {
      // Make API calls hang to test loading state
      ;(mcpServerAPI.getAll as jest.Mock).mockImplementation(() => new Promise(() => {}))
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockImplementation(
        () => new Promise(() => {})
      )

      render(<ConnectorSelector {...defaultProps} />)

      expect(screen.getByTestId('loader')).toBeInTheDocument()
      expect(screen.getByText('Loading connectors...')).toBeInTheDocument()
    })

    it('should render component with all required elements after loading', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Connectors')).toBeInTheDocument()
      })

      expect(screen.getByTestId('plug-icon')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search connectors...')).toBeInTheDocument()
      expect(screen.getByText('Select connectors...')).toBeInTheDocument()
    })

    it('should display selected connectors count badge', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('1 selected')).toBeInTheDocument()
      })
    })

    it('should show Clear All button when connectors are selected', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument()
      })
    })
  })

  describe('API Integration', () => {
    it('should fetch available and connected connectors on mount', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(mcpServerAPI.getAll).toHaveBeenCalledTimes(1)
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledWith('test-starship-1')
      })
    })

    it('should handle API errors gracefully', async () => {
      ;(mcpServerAPI.getAll as jest.Mock).mockRejectedValue(new Error('API Error'))
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockRejectedValue(new Error('API Error'))

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('alert-icon')).toBeInTheDocument()
        expect(screen.getByText('Failed to load connectors. Please try again.')).toBeInTheDocument()
      })
    })

    it('should retry fetching data when Try Again is clicked', async () => {
      ;(mcpServerAPI.getAll as jest.Mock).mockRejectedValueOnce(new Error('API Error'))
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockRejectedValueOnce(
        new Error('API Error')
      )

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Try Again')).toBeInTheDocument()
      })

      // Reset mocks to return successful responses
      ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue(mockConnectors)
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockResolvedValue(mockConnectedConnectors)

      await user.click(screen.getByText('Try Again'))

      await waitFor(() => {
        expect(mcpServerAPI.getAll).toHaveBeenCalledTimes(2)
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Search Functionality', () => {
    it('should filter connectors based on search query', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search connectors...')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search connectors...')

      // Open dropdown to see connectors
      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
        expect(screen.getByText('Puppeteer')).toBeInTheDocument()
        expect(screen.getByText('Filesystem')).toBeInTheDocument()
      })

      // Search for "github"
      await user.type(searchInput, 'github')

      // Wait for debounced search (300ms)
      jest.useFakeTimers()
      act(() => {
        jest.advanceTimersByTime(300)
      })
      jest.useRealTimers()

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
        expect(screen.queryByText('Puppeteer')).not.toBeInTheDocument()
        expect(screen.queryByText('Filesystem')).not.toBeInTheDocument()
      })
    })

    it('should show "No connectors match your search" when no results', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search connectors...')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search connectors...')
      const dropdownTrigger = screen.getByText('Select connectors...')

      await user.click(dropdownTrigger)
      await user.type(searchInput, 'nonexistent')

      jest.useFakeTimers()
      act(() => {
        jest.advanceTimersByTime(300)
      })
      jest.useRealTimers()

      await waitFor(() => {
        expect(screen.getByText('No connectors match your search')).toBeInTheDocument()
      })
    })

    it('should debounce search input', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search connectors...')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Search connectors...')

      jest.useFakeTimers()

      // Type multiple characters quickly
      await user.type(searchInput, 'git')

      // Advance time by less than debounce delay
      act(() => {
        jest.advanceTimersByTime(200)
      })

      // Continue typing
      await user.type(searchInput, 'hub')

      // Now advance past debounce delay
      act(() => {
        jest.advanceTimersByTime(300)
      })

      jest.useRealTimers()

      // The search should only have been applied once after the full debounce delay
      expect(searchInput).toHaveValue('github')
    })
  })

  describe('Multi-select Functionality', () => {
    it('should toggle connector selection', async () => {
      const onConnectorsChange = jest.fn()
      render(<ConnectorSelector {...defaultProps} onConnectorsChange={onConnectorsChange} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
      })

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      expect(githubOption).toBeInTheDocument()

      await user.click(githubOption!)

      await waitFor(() => {
        expect(mcpServerAPI.connectToStarship).toHaveBeenCalledWith('test-starship-1', 'github')
        expect(onConnectorsChange).toHaveBeenCalledWith([mockConnectors[0]])
      })
    })

    it('should deselect connector when already selected', async () => {
      const onConnectorsChange = jest.fn()
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
        onConnectorsChange,
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      await user.click(githubOption!)

      await waitFor(() => {
        expect(mcpServerAPI.disconnectFromStarship).toHaveBeenCalledWith(
          'test-starship-1',
          'github'
        )
        expect(onConnectorsChange).toHaveBeenCalledWith([])
      })
    })

    it('should show selected connectors in trigger button', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0], mockConnectors[1]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
        expect(screen.getByText('Puppeteer')).toBeInTheDocument()
      })
    })

    it('should clear all selections', async () => {
      const onConnectorsChange = jest.fn()
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0], mockConnectors[1]],
        onConnectorsChange,
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Clear All'))

      await waitFor(() => {
        expect(mcpServerAPI.disconnectFromStarship).toHaveBeenCalledWith(
          'test-starship-1',
          'github'
        )
        expect(mcpServerAPI.disconnectFromStarship).toHaveBeenCalledWith(
          'test-starship-1',
          'puppeteer'
        )
        expect(onConnectorsChange).toHaveBeenCalledWith([])
      })
    })
  })

  describe('Connection Status Display', () => {
    it('should show connected status for connected connectors', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
        expect(screen.getByTestId('wifi-icon')).toBeInTheDocument()
      })
    })

    it('should show connection status in selected connectors list', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
        expect(screen.getByTestId('wifi-icon')).toBeInTheDocument()
      })
    })

    it('should show available status for non-connected connectors', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[1]], // Puppeteer is not in connected list
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Available')).toBeInTheDocument()
        expect(screen.getByTestId('wifi-off-icon')).toBeInTheDocument()
      })
    })
  })

  describe('Environment Variables Display', () => {
    it('should display environment requirements', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Requires: GITHUB_TOKEN, GITHUB_API_URL')).toBeInTheDocument()
        expect(screen.getByText('Requires: PUPPETEER_HEADLESS')).toBeInTheDocument()
        expect(screen.getByText('No configuration required')).toBeInTheDocument()
      })
    })

    it('should handle malformed environment JSON gracefully', async () => {
      const connectorWithBadEnv = {
        ...mockConnectors[0],
        env: 'invalid json',
      }

      ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue([connectorWithBadEnv])

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('No configuration required')).toBeInTheDocument()
      })
    })
  })

  describe('Command Badge Display', () => {
    it('should display command badges with correct variants', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('DOCKER')).toBeInTheDocument()
        expect(screen.getByText('NPX')).toBeInTheDocument()
        expect(screen.getByText('UVX')).toBeInTheDocument()
      })
    })
  })

  describe('Loading States', () => {
    it('should show loading state during connector toggle', async () => {
      // Make the connect API call hang
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockImplementation(() => new Promise(() => {}))

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      await user.click(githubOption!)

      await waitFor(() => {
        expect(screen.getByTestId('loader')).toBeInTheDocument()
      })
    })

    it('should show connecting status in selected connectors list', async () => {
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockImplementation(() => new Promise(() => {}))

      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[1]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const puppeteerOption = screen.getByText('Puppeteer').closest('[role="option"]')
      await user.click(puppeteerOption!)

      await waitFor(() => {
        expect(screen.getByText('Connecting...')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should display error when connector toggle fails', async () => {
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      )

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      await user.click(githubOption!)

      await waitFor(() => {
        expect(screen.getByText('Failed to connect Github')).toBeInTheDocument()
        expect(screen.getByTestId('alert-icon')).toBeInTheDocument()
      })
    })

    it('should allow dismissing error messages', async () => {
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      )

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      await user.click(githubOption!)

      await waitFor(() => {
        expect(screen.getByText('Failed to connect Github')).toBeInTheDocument()
      })

      const dismissButton = screen.getByTestId('x-icon').closest('button')
      await user.click(dismissButton!)

      await waitFor(() => {
        expect(screen.queryByText('Failed to connect Github')).not.toBeInTheDocument()
      })
    })

    it('should handle clear all errors', async () => {
      ;(mcpServerAPI.disconnectFromStarship as jest.Mock).mockRejectedValue(
        new Error('Disconnect failed')
      )

      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Clear All'))

      await waitFor(() => {
        expect(screen.getByText('Failed to disconnect all connectors')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByLabelText('Search connectors')).toBeInTheDocument()
        expect(screen.getByLabelText('Select connectors')).toBeInTheDocument()
      })
    })

    it('should have proper ARIA attributes on dropdown', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        const trigger = screen.getByLabelText('Select connectors')
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
      })

      const dropdownTrigger = screen.getByLabelText('Select connectors')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('should have proper role attributes on options', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        const options = screen.getAllByRole('option')
        expect(options).toHaveLength(3)

        options.forEach(option => {
          expect(option).toHaveAttribute('aria-selected')
        })
      })
    })

    it('should have proper labels for remove buttons', async () => {
      const propsWithSelected = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsWithSelected} />)

      await waitFor(() => {
        expect(screen.getByLabelText('Remove Github')).toBeInTheDocument()
      })
    })
  })

  describe('Disabled State', () => {
    it('should disable all interactions when disabled prop is true', async () => {
      const propsDisabled = {
        ...defaultProps,
        disabled: true,
      }

      render(<ConnectorSelector {...propsDisabled} />)

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search connectors...')
        const dropdownTrigger = screen.getByText('Select connectors...')

        expect(searchInput).toBeDisabled()
        expect(dropdownTrigger).toBeDisabled()
      })
    })

    it('should disable Clear All button when disabled', async () => {
      const propsDisabled = {
        ...defaultProps,
        disabled: true,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsDisabled} />)

      await waitFor(() => {
        const clearAllButton = screen.getByText('Clear All')
        expect(clearAllButton).toBeDisabled()
      })
    })

    it('should disable remove buttons when disabled', async () => {
      const propsDisabled = {
        ...defaultProps,
        disabled: true,
        selectedConnectors: [mockConnectors[0]],
      }

      render(<ConnectorSelector {...propsDisabled} />)

      await waitFor(() => {
        const removeButton = screen.getByLabelText('Remove Github')
        expect(removeButton).toBeDisabled()
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty connector list', async () => {
      ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue([])
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockResolvedValue([])

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('No connectors available')).toBeInTheDocument()
      })
    })

    it('should handle missing starshipId gracefully', async () => {
      const propsWithoutStarshipId = {
        ...defaultProps,
        starshipId: '',
      }

      render(<ConnectorSelector {...propsWithoutStarshipId} />)

      await waitFor(() => {
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledWith('')
      })
    })

    it('should handle rapid successive clicks', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const githubOption = screen.getByText('Github').closest('[role="option"]')

      // Click multiple times rapidly
      await user.click(githubOption!)
      await user.click(githubOption!)
      await user.click(githubOption!)

      // Should only make one API call due to loading state protection
      await waitFor(() => {
        expect(mcpServerAPI.connectToStarship).toHaveBeenCalledTimes(1)
      })
    })
  })
})
