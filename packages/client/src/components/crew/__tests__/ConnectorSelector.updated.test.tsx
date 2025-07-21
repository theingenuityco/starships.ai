/**
 * ConnectorSelector Component Tests - Updated for Connector Instance Architecture
 * Tests the component's integration with the new connector instance system
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectorSelector } from '../ConnectorSelector'
import { mcpServerAPI, MCPServerOption, MCPServerConnector } from '@/lib/api'

// Mock the API
jest.mock('@/lib/api', () => ({
  mcpServerAPI: {
    getAll: jest.fn(),
  },
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) => (
    <div data-testid="loader" className={className} />
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
  Clock: ({ className }: { className?: string }) => (
    <div data-testid="clock-icon" className={className} />
  ),
  XCircle: ({ className }: { className?: string }) => (
    <div data-testid="x-circle-icon" className={className} />
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
    env: '{"GITHUB_TOKEN": "required"}',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    command: 'npx',
    args: ['@modelcontextprotocol/server-puppeteer'],
  },
]

const mockConnectorInstances: MCPServerConnector[] = [
  {
    id: 'instance-1',
    starshipId: 'test-starship-1',
    templateId: 'github',
    status: 'active',
    isActive: true,
    connectedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    template: mockConnectors[0],
  },
  {
    id: 'instance-2',
    starshipId: 'test-starship-1',
    templateId: 'puppeteer',
    status: 'error',
    isActive: false,
    connectedAt: '2024-01-01T00:00:00Z',
    errorMessage: 'Connection failed',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    template: mockConnectors[1],
  },
]

const defaultProps = {
  starshipId: 'test-starship-1',
  selectedConnectors: [],
  onConnectorsChange: jest.fn(),
  connectorInstances: [],
}

describe('ConnectorSelector - Updated Architecture', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue(mockConnectors)
  })

  describe('Connector Instance Status Display', () => {
    it('should show active status for active connector instances', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
        connectorInstances: [mockConnectorInstances[0]],
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument()
        expect(screen.getByTestId('wifi-icon')).toBeInTheDocument()
      })
    })

    it('should show error status for failed connector instances', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[1]],
        connectorInstances: [mockConnectorInstances[1]],
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument()
        expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument()
        expect(screen.getByText('Connection failed')).toBeInTheDocument()
      })
    })

    it('should show not connected status for templates without instances', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
        connectorInstances: [], // No instances
      }

      render(<ConnectorSelector {...props} />)

      const dropdownTrigger = screen.getByText('Browse Connectors')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Not connected')).toBeInTheDocument()
      })
    })
  })

  describe('Connector Instance Integration', () => {
    it('should display connector instances with template information', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0], mockConnectors[1]],
        connectorInstances: mockConnectorInstances,
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
        expect(screen.getByText('Puppeteer')).toBeInTheDocument()
        expect(screen.getByText('DOCKER')).toBeInTheDocument()
        expect(screen.getByText('NPX')).toBeInTheDocument()
      })
    })

    it('should handle connector instances without templates gracefully', async () => {
      const instanceWithoutTemplate = {
        ...mockConnectorInstances[0],
        template: undefined,
      }

      const props = {
        ...defaultProps,
        selectedConnectors: [],
        connectorInstances: [instanceWithoutTemplate],
      }

      render(<ConnectorSelector {...props} />)

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByText('Connectors')).toBeInTheDocument()
      })
    })
  })

  describe('Status-based UI Styling', () => {
    it('should apply correct border colors based on status', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0], mockConnectors[1]],
        connectorInstances: mockConnectorInstances,
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        const connectorCards = screen
          .getAllByRole('generic')
          .filter(el => el.className.includes('border') && el.className.includes('rounded-lg'))

        // Should have cards with different border colors for different statuses
        expect(connectorCards.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Dropdown Status Display', () => {
    it('should show status information in dropdown options', async () => {
      const props = {
        ...defaultProps,
        connectorInstances: mockConnectorInstances,
      }

      render(<ConnectorSelector {...props} />)

      const dropdownTrigger = screen.getByText('Browse Connectors')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument()
        expect(screen.getByText('Error')).toBeInTheDocument()
      })
    })
  })

  describe('Parent Component Integration', () => {
    it('should call onConnectorsChange when toggling connectors', async () => {
      const onConnectorsChange = jest.fn()
      const props = {
        ...defaultProps,
        onConnectorsChange,
      }

      render(<ConnectorSelector {...props} />)

      const dropdownTrigger = screen.getByText('Browse Connectors')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Github')).toBeInTheDocument()
      })

      const githubOption = screen.getByText('Github').closest('[role="option"]')
      await user.click(githubOption!)

      expect(onConnectorsChange).toHaveBeenCalledWith([mockConnectors[0]])
    })

    it('should handle clear all by calling onConnectorsChange with empty array', async () => {
      const onConnectorsChange = jest.fn()
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
        onConnectorsChange,
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Clear All'))

      expect(onConnectorsChange).toHaveBeenCalledWith([])
    })
  })

  describe('Loading and Error States', () => {
    it('should show loading state when fetching templates', async () => {
      ;(mcpServerAPI.getAll as jest.Mock).mockImplementation(() => new Promise(() => {}))

      render(<ConnectorSelector {...defaultProps} />)

      expect(screen.getByTestId('loader')).toBeInTheDocument()
      expect(screen.getByText('Loading connectors...')).toBeInTheDocument()
    })

    it('should show error state when template fetching fails', async () => {
      ;(mcpServerAPI.getAll as jest.Mock).mockRejectedValue(new Error('API Error'))

      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('alert-icon')).toBeInTheDocument()
        expect(screen.getByText('Failed to load connectors. Please try again.')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should maintain proper ARIA attributes', async () => {
      render(<ConnectorSelector {...defaultProps} />)

      await waitFor(() => {
        const dropdownTrigger = screen.getByRole('button', { name: /select connectors/i })
        expect(dropdownTrigger).toHaveAttribute('aria-expanded', 'false')
        expect(dropdownTrigger).toHaveAttribute('aria-haspopup', 'listbox')
      })
    })

    it('should have proper labels for remove buttons', async () => {
      const props = {
        ...defaultProps,
        selectedConnectors: [mockConnectors[0]],
        connectorInstances: [mockConnectorInstances[0]],
      }

      render(<ConnectorSelector {...props} />)

      await waitFor(() => {
        expect(screen.getByLabelText('Remove Github')).toBeInTheDocument()
      })
    })
  })
})
