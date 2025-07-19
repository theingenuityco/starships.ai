/**
 * StarshipCrewContent Integration Tests
 * Tests the integration between ConnectorSelector and StarshipCrewContent
 */

import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StarshipCrewContent } from '../StarshipCrewContent'
import { mcpServerAPI, agentAPI, MCPServerOption, Agent } from '@/lib/api'

// Mock the APIs
jest.mock('@/lib/api', () => ({
  mcpServerAPI: {
    getAll: jest.fn(),
    getConnectedToStarship: jest.fn(),
    connectToStarship: jest.fn(),
    disconnectFromStarship: jest.fn(),
  },
  agentAPI: {
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}))

// Mock Next.js Link component
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
})

// Mock ChatInterface component
jest.mock('@/components/chat/ChatInterface', () => ({
  ChatInterface: ({ agent, sessionId, onSessionCreated }: any) => (
    <div data-testid="chat-interface">
      <div>Agent: {agent?.name}</div>
      <div>Session: {sessionId || 'No session'}</div>
      <button onClick={() => onSessionCreated?.('test-session-123')}>Create Session</button>
    </div>
  ),
}))

// Mock AgentSelector component
jest.mock('@/components/agents/AgentSelector', () => ({
  AgentSelector: ({ selectedAgent, onAgentSelect, showCreateButton, showFilters }: any) => (
    <div data-testid="agent-selector">
      <div>Selected: {selectedAgent?.name || 'None'}</div>
      <div>Create Button: {showCreateButton ? 'Yes' : 'No'}</div>
      <div>Filters: {showFilters ? 'Yes' : 'No'}</div>
      <button onClick={() => onAgentSelect(mockAgents[0])}>Select Test Agent</button>
    </div>
  ),
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  ArrowLeft: ({ className }: { className?: string }) => (
    <div data-testid="arrow-left" className={className} />
  ),
  Users: ({ className }: { className?: string }) => (
    <div data-testid="users-icon" className={className} />
  ),
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
]

const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Test Agent',
    description: 'A test agent',
    template: 'general',
    systemPrompt: 'You are a helpful assistant',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const defaultProps = {
  slug: 'test-starship-1',
}

describe('StarshipCrewContent Integration Tests', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    jest.clearAllMocks()
    // Setup default API responses
    ;(mcpServerAPI.getAll as jest.Mock).mockResolvedValue(mockConnectors)
    ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockResolvedValue([mockConnectors[0]])
    ;(mcpServerAPI.connectToStarship as jest.Mock).mockResolvedValue(undefined)
    ;(mcpServerAPI.disconnectFromStarship as jest.Mock).mockResolvedValue(undefined)
    ;(agentAPI.getAll as jest.Mock).mockResolvedValue(mockAgents)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('Component Integration', () => {
    it('should render both ConnectorSelector and AgentSelector', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Crew Console')).toBeInTheDocument()
        expect(screen.getByText('Connectors')).toBeInTheDocument()
        expect(screen.getByTestId('agent-selector')).toBeInTheDocument()
      })
    })

    it('should display starship slug in header', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('test-starship-1')).toBeInTheDocument()
      })
    })

    it('should show back navigation link', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Back to Fleet')).toBeInTheDocument()
        expect(screen.getByTestId('arrow-left')).toBeInTheDocument()
      })
    })
  })

  describe('ConnectorSelector Integration', () => {
    it('should fetch connected connectors on mount', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledWith('test-starship-1')
      })
    })

    it('should display connected connectors in ConnectorSelector', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('1 selected')).toBeInTheDocument()
      })
    })

    it('should handle connector selection changes', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      // Open dropdown and select a connector
      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      await waitFor(() => {
        expect(screen.getByText('Puppeteer')).toBeInTheDocument()
      })

      const puppeteerOption = screen.getByText('Puppeteer').closest('[role="option"]')
      await user.click(puppeteerOption!)

      await waitFor(() => {
        expect(mcpServerAPI.connectToStarship).toHaveBeenCalledWith('test-starship-1', 'puppeteer')
      })
    })

    it('should handle connector disconnection', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Clear All')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Clear All'))

      await waitFor(() => {
        expect(mcpServerAPI.disconnectFromStarship).toHaveBeenCalledWith(
          'test-starship-1',
          'github'
        )
      })
    })

    it('should display connector errors', async () => {
      ;(mcpServerAPI.getConnectedToStarship as jest.Mock).mockRejectedValue(new Error('API Error'))

      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load connectors. Please try again.')).toBeInTheDocument()
      })
    })

    it('should disable ConnectorSelector during loading', async () => {
      // Make API call hang to test loading state
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockImplementation(() => new Promise(() => {}))

      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const puppeteerOption = screen.getByText('Puppeteer').closest('[role="option"]')
      await user.click(puppeteerOption!)

      // ConnectorSelector should be disabled during the operation
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search connectors...')).toBeDisabled()
      })
    })
  })

  describe('AgentSelector Integration', () => {
    it('should render AgentSelector with correct props', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        const agentSelector = screen.getByTestId('agent-selector')
        expect(agentSelector).toBeInTheDocument()
        expect(screen.getByText('Create Button: Yes')).toBeInTheDocument()
        expect(screen.getByText('Filters: Yes')).toBeInTheDocument()
      })
    })

    it('should handle agent selection', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select an agent to start chatting')).toBeInTheDocument()
      })

      const selectButton = screen.getByText('Select Test Agent')
      await user.click(selectButton)

      await waitFor(() => {
        expect(screen.getByTestId('chat-interface')).toBeInTheDocument()
        expect(screen.getByText('Agent: Test Agent')).toBeInTheDocument()
      })
    })

    it('should reset session when agent changes', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      // Select an agent
      const selectButton = screen.getByText('Select Test Agent')
      await user.click(selectButton)

      await waitFor(() => {
        expect(screen.getByText('Session: No session')).toBeInTheDocument()
      })

      // Create a session
      const createSessionButton = screen.getByText('Create Session')
      await user.click(createSessionButton)

      await waitFor(() => {
        expect(screen.getByText('Session: test-session-123')).toBeInTheDocument()
      })

      // Select agent again (simulating agent change)
      await user.click(selectButton)

      await waitFor(() => {
        expect(screen.getByText('Session: No session')).toBeInTheDocument()
      })
    })
  })

  describe('Layout and Responsive Design', () => {
    it('should have correct grid layout structure', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        const mainGrid = screen.getByText('Crew Console').closest('.grid')
        expect(mainGrid).toHaveClass('grid-cols-[350px_1fr]')
      })
    })

    it('should show empty state when no agent selected', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select an agent to start chatting')).toBeInTheDocument()
        expect(
          screen.getByText('Choose a crew member from the sidebar to begin your conversation')
        ).toBeInTheDocument()
      })
    })

    it('should show chat interface when agent is selected', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      const selectButton = screen.getByText('Select Test Agent')
      await user.click(selectButton)

      await waitFor(() => {
        expect(screen.getByTestId('chat-interface')).toBeInTheDocument()
        expect(screen.queryByText('Select an agent to start chatting')).not.toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle connector API errors gracefully', async () => {
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockRejectedValue(
        new Error('Connection failed')
      )

      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const puppeteerOption = screen.getByText('Puppeteer').closest('[role="option"]')
      await user.click(puppeteerOption!)

      await waitFor(() => {
        expect(
          screen.getByText('Failed to update connectors. Please try again.')
        ).toBeInTheDocument()
      })
    })

    it('should refresh connectors after error', async () => {
      ;(mcpServerAPI.connectToStarship as jest.Mock).mockRejectedValueOnce(
        new Error('Connection failed')
      )

      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('Select connectors...')).toBeInTheDocument()
      })

      const dropdownTrigger = screen.getByText('Select connectors...')
      await user.click(dropdownTrigger)

      const puppeteerOption = screen.getByText('Puppeteer').closest('[role="option"]')
      await user.click(puppeteerOption!)

      await waitFor(() => {
        // Should call getConnectedToStarship again to refresh state
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('State Management', () => {
    it('should maintain connector state across component updates', async () => {
      const { rerender } = render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('1 selected')).toBeInTheDocument()
      })

      // Rerender with same props
      rerender(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('1 selected')).toBeInTheDocument()
      })
    })

    it('should refetch connectors when starship slug changes', async () => {
      const { rerender } = render(<StarshipCrewContent slug="starship-1" />)

      await waitFor(() => {
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledWith('starship-1')
      })

      // Change slug
      rerender(<StarshipCrewContent slug="starship-2" />)

      await waitFor(() => {
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledWith('starship-2')
        expect(mcpServerAPI.getConnectedToStarship).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /crew console/i })).toBeInTheDocument()
        expect(
          screen.getByRole('heading', { name: /select an agent to start chatting/i })
        ).toBeInTheDocument()
      })
    })

    it('should have proper navigation landmarks', async () => {
      render(<StarshipCrewContent {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /back to fleet/i })).toBeInTheDocument()
      })
    })
  })
})
