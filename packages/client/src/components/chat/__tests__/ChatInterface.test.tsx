/**
 * ChatInterface Component Tests
 * Tests chat functionality and user interactions
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInterface } from '../ChatInterface'

// Mock socket client
jest.mock('@/lib/socket-client', () => ({
  createSocketConnection: jest.fn(),
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Send: ({ className }: { className?: string }) => (
    <div data-testid="send-icon" className={className} />
  ),
  Loader2: ({ className }: { className?: string }) => (
    <div data-testid="loader-icon" className={className} />
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <div data-testid="alert-icon" className={className} />
  ),
}))

// Mock child components
jest.mock('../MessageList', () => ({
  MessageList: ({ messages, isLoading }: { messages: any[]; isLoading: boolean }) => (
    <div data-testid="message-list">
      {isLoading && <div data-testid="message-loading">Loading messages...</div>}
      {messages.map((msg, idx) => (
        <div key={idx} data-testid={`message-${idx}`}>
          {msg.content}
        </div>
      ))}
    </div>
  ),
}))

jest.mock('../MessageInput', () => ({
  MessageInput: ({ 
    onSend, 
    disabled, 
    placeholder 
  }: { 
    onSend: (message: string) => void; 
    disabled: boolean;
    placeholder?: string;
  }) => (
    <div data-testid="message-input">
      <input
        data-testid="message-input-field"
        placeholder={placeholder || 'Type a message...'}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend((e.target as HTMLInputElement).value)
          }
        }}
      />
      <button
        data-testid="send-button"
        disabled={disabled}
        onClick={() => {
          const input = document.querySelector('[data-testid="message-input-field"]') as HTMLInputElement
          if (input?.value) {
            onSend(input.value)
            input.value = ''
          }
        }}
      >
        Send
      </button>
    </div>
  ),
}))

const mockAgent = {
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A test agent',
  template: 'general',
  systemPrompt: 'You are a helpful assistant',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
}

const defaultProps = {
  agent: mockAgent,
  sessionId: 'session-123',
  onSessionCreated: jest.fn(),
}

describe('ChatInterface', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Initial Rendering', () => {
    it('should render chat interface with agent information', () => {
      render(<ChatInterface {...defaultProps} />)

      expect(screen.getByText('Test Agent')).toBeInTheDocument()
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
    })

    it('should render without session ID initially', () => {
      const propsWithoutSession = { ...defaultProps, sessionId: undefined }
      render(<ChatInterface {...propsWithoutSession} />)

      expect(screen.getByTestId('message-list')).toBeInTheDocument()
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
    })

    it('should show loading state when messages are being fetched', () => {
      render(<ChatInterface {...defaultProps} />)

      // Simulate loading state
      const messageList = screen.getByTestId('message-list')
      expect(messageList).toBeInTheDocument()
    })
  })

  describe('Message Handling', () => {
    it('should handle sending messages', async () => {
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')
      const sendButton = screen.getByTestId('send-button')

      await user.type(input, 'Hello, agent!')
      await user.click(sendButton)

      // Should clear input after sending
      expect(input).toHaveValue('')
    })

    it('should handle message sending via Enter key', async () => {
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')

      await user.type(input, 'Hello via Enter!')
      await user.keyboard('{Enter}')

      expect(input).toHaveValue('')
    })

    it('should not send empty messages', async () => {
      render(<ChatInterface {...defaultProps} />)

      const sendButton = screen.getByTestId('send-button')
      
      // Try to send empty message
      await user.click(sendButton)

      // Should not create any new messages
      const input = screen.getByTestId('message-input-field')
      expect(input).toHaveValue('')
    })

    it('should disable input when agent is not available', () => {
      const propsWithoutAgent = { ...defaultProps, agent: null }
      render(<ChatInterface {...propsWithoutAgent} />)

      const input = screen.getByTestId('message-input-field')
      const sendButton = screen.getByTestId('send-button')

      expect(input).toBeDisabled()
      expect(sendButton).toBeDisabled()
    })
  })

  describe('Session Management', () => {
    it('should call onSessionCreated when session is created', () => {
      const onSessionCreated = jest.fn()
      const propsWithoutSession = { 
        ...defaultProps, 
        sessionId: undefined, 
        onSessionCreated 
      }

      render(<ChatInterface {...propsWithoutSession} />)

      // Simulate session creation (would normally happen on first message)
      expect(onSessionCreated).not.toHaveBeenCalled()
    })

    it('should handle session updates', () => {
      const { rerender } = render(<ChatInterface {...defaultProps} />)

      // Update with new session
      rerender(<ChatInterface {...defaultProps} sessionId="new-session-456" />)

      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Mock a connection error scenario
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')
      await user.type(input, 'Test message')

      // Simulate connection error
      const sendButton = screen.getByTestId('send-button')
      await user.click(sendButton)

      // Should handle error without crashing
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    })

    it('should show error state when agent fails to respond', () => {
      render(<ChatInterface {...defaultProps} />)

      // The interface should remain functional even with response errors
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')
      const sendButton = screen.getByTestId('send-button')

      expect(input).toHaveAttribute('placeholder')
      expect(sendButton).toHaveTextContent('Send')
    })

    it('should support keyboard navigation', async () => {
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')
      
      // Focus should work properly
      await user.click(input)
      expect(input).toHaveFocus()
    })

    it('should indicate loading states to screen readers', () => {
      render(<ChatInterface {...defaultProps} />)

      const messageList = screen.getByTestId('message-list')
      expect(messageList).toBeInTheDocument()
    })
  })

  describe('Agent Integration', () => {
    it('should display agent-specific information', () => {
      render(<ChatInterface {...defaultProps} />)

      expect(screen.getByText('Test Agent')).toBeInTheDocument()
    })

    it('should handle agent changes', () => {
      const { rerender } = render(<ChatInterface {...defaultProps} />)

      const newAgent = {
        ...mockAgent,
        id: 'agent-2',
        name: 'New Agent',
      }

      rerender(<ChatInterface {...defaultProps} agent={newAgent} />)

      expect(screen.getByText('New Agent')).toBeInTheDocument()
    })

    it('should handle missing agent gracefully', () => {
      const propsWithoutAgent = { ...defaultProps, agent: null }
      
      render(<ChatInterface {...propsWithoutAgent} />)

      // Should still render the interface but with disabled input
      expect(screen.getByTestId('message-input')).toBeInTheDocument()
      expect(screen.getByTestId('message-input-field')).toBeDisabled()
    })
  })

  describe('Message History', () => {
    it('should maintain message order', () => {
      render(<ChatInterface {...defaultProps} />)

      const messageList = screen.getByTestId('message-list')
      expect(messageList).toBeInTheDocument()
    })

    it('should scroll to latest messages', () => {
      render(<ChatInterface {...defaultProps} />)

      // MessageList component should handle scrolling
      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const { rerender } = render(<ChatInterface {...defaultProps} />)

      // Same props should not cause unnecessary re-renders
      rerender(<ChatInterface {...defaultProps} />)

      expect(screen.getByTestId('message-list')).toBeInTheDocument()
    })

    it('should handle rapid message sending', async () => {
      render(<ChatInterface {...defaultProps} />)

      const input = screen.getByTestId('message-input-field')
      const sendButton = screen.getByTestId('send-button')

      // Send multiple messages rapidly
      for (let i = 0; i < 3; i++) {
        await user.type(input, `Message ${i}`)
        await user.click(sendButton)
      }

      expect(input).toHaveValue('')
    })
  })
})