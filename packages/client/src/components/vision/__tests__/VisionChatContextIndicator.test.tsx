import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { VisionChatContextIndicator } from '../VisionChatContextIndicator';
import { useAuth } from '@/hooks/useAuth';
import SocketClient from '@/lib/socket-client';

// Mock dependencies
jest.mock('@/hooks/useAuth');
jest.mock('@/lib/socket-client');

// Mock motion/react
jest.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    initial: {},
    animate: {},
    exit: {},
    transition: {}
  },
  AnimatePresence: ({ children }: any) => <div>{children}</div>
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe('VisionChatContextIndicator', () => {
  const mockSocketClient = {
    getInstance: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    isConnected: jest.fn(() => true),
    disconnect: jest.fn()
  };

  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockStarshipId = 'test-starship-id';
  const mockOnVisionProposalAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn()
    });

    (SocketClient.getInstance as jest.Mock).mockReturnValue(mockSocketClient);
  });

  describe('Initial State', () => {
    it('should render nothing when context state is none', () => {
      const { container } = render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should setup socket listeners on mount', () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      expect(mockSocketClient.on).toHaveBeenCalledWith('vision:analyzing', expect.any(Function));
      expect(mockSocketClient.on).toHaveBeenCalledWith('vision:proposal', expect.any(Function));
      expect(mockSocketClient.on).toHaveBeenCalledWith('vision:updated', expect.any(Function));
      expect(mockSocketClient.on).toHaveBeenCalledWith('vision:error', expect.any(Function));
    });

    it('should cleanup socket listeners on unmount', () => {
      const { unmount } = render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      unmount();

      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:analyzing');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:proposal');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:updated');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:error');
    });
  });

  describe('Analyzing State', () => {
    it('should display analyzing state correctly', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      // Simulate analyzing event
      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: 'We will create amazing products.',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Analyzing Vision Statement')).toBeInTheDocument();
        expect(screen.getByText('Sibil is analyzing your vision for clarity, specificity, and actionability.')).toBeInTheDocument();
        expect(screen.getByText('In progress...')).toBeInTheDocument();
        expect(screen.getByText('We will create amazing products.')).toBeInTheDocument();
      });
    });

    it('should truncate long vision text in analyzing state', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const longVision = 'A'.repeat(150);
      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: longVision,
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('A'.repeat(100) + '...')).toBeInTheDocument();
      });
    });

    it('should allow dismissing analyzing state', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Analyzing Vision Statement')).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole('button');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('Analyzing Vision Statement')).not.toBeInTheDocument();
      });
    });
  });

  describe('Proposal Ready State', () => {
    const mockProposal = {
      proposedVision: 'We will create 5 innovative AI products that serve 100,000+ users by 2025, achieving 95% customer satisfaction.',
      reasoning: 'Added specific metrics, timeline, and measurable outcomes to improve clarity and actionability.',
      confidenceLevel: 88,
      keyChanges: [
        'Added specific product count (5)',
        'Added user target (100,000+)',
        'Added timeline (by 2025)',
        'Added satisfaction metric (95%)',
        'Additional change for testing'
      ],
      metrics: {
        overallQuality: 85,
        clarityScore: 90,
        specificityScore: 85,
        actionabilityScore: 88,
        inspirationalScore: 82,
        confidence: 0.88,
        refinementCount: 1,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true
      }
    };

    it('should display proposal ready state correctly', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: mockProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Vision Refinement Ready')).toBeInTheDocument();
        expect(screen.getByText('88% confidence')).toBeInTheDocument();
        expect(screen.getByText(mockProposal.reasoning)).toBeInTheDocument();
        expect(screen.getByText(mockProposal.proposedVision)).toBeInTheDocument();
        expect(screen.getByText('Accept')).toBeInTheDocument();
        expect(screen.getByText('Keep Current')).toBeInTheDocument();
      });
    });

    it('should display key changes correctly', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: mockProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Key Changes:')).toBeInTheDocument();
        expect(screen.getByText('Added specific product count (5)')).toBeInTheDocument();
        expect(screen.getByText('Added user target (100,000+)')).toBeInTheDocument();
        
        // Should show only first 2 changes and indicate there are more
        expect(screen.getByText('+3 more changes')).toBeInTheDocument();
      });
    });

    it('should handle proposals with few key changes', async () => {
      const simpleProposal = {
        ...mockProposal,
        keyChanges: ['Single change']
      };

      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: simpleProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Single change')).toBeInTheDocument();
        expect(screen.queryByText(/\+\d+ more changes/)).not.toBeInTheDocument();
      });
    });

    it('should handle accept proposal action', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: mockProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Accept')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Accept'));

      expect(mockSocketClient.emit).toHaveBeenCalledWith(
        'vision:accept-proposal',
        {
          starshipId: mockStarshipId,
          sessionId: 'test-session-id',
          userId: mockUser.id
        }
      );

      expect(mockOnVisionProposalAction).toHaveBeenCalledWith('accept', mockProposal);
    });

    it('should handle reject proposal action', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: mockProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Keep Current')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Keep Current'));

      expect(mockSocketClient.emit).toHaveBeenCalledWith(
        'vision:reject-proposal',
        {
          starshipId: mockStarshipId,
          sessionId: 'test-session-id',
          userId: mockUser.id
        }
      );

      expect(mockOnVisionProposalAction).toHaveBeenCalledWith('reject', mockProposal);
    });

    it('should allow dismissing proposal', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: mockProposal
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Vision Refinement Ready')).toBeInTheDocument();
      });

      const dismissButtons = screen.getAllByRole('button');
      const dismissButton = dismissButtons.find(btn => btn.getAttribute('class')?.includes('p-1'));
      
      if (dismissButton) {
        fireEvent.click(dismissButton);

        await waitFor(() => {
          expect(screen.queryByText('Vision Refinement Ready')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Updated State', () => {
    const mockMetrics = {
      overallQuality: 85,
      clarityScore: 90,
      specificityScore: 85,
      actionabilityScore: 88,
      inspirationalScore: 82,
      confidence: 0.88,
      refinementCount: 2,
      hasObjectives: true,
      hasTimeframe: true,
      hasMeasurables: true
    };

    it('should display updated state correctly', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const updatedHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:updated'
      )[1];

      act(() => {
        updatedHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          oldVision: 'Old vision',
          newVision: 'New enhanced vision',
          metrics: mockMetrics
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Vision Updated Successfully')).toBeInTheDocument();
        expect(screen.getByText('Quality: 85/100')).toBeInTheDocument();
        expect(screen.getByText('Your starship\'s vision has been successfully updated with the refined version.')).toBeInTheDocument();
      });
    });

    it('should auto-hide updated notification after 5 seconds', async () => {
      jest.useFakeTimers();

      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const updatedHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:updated'
      )[1];

      act(() => {
        updatedHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          oldVision: 'Old vision',
          newVision: 'New enhanced vision',
          metrics: mockMetrics
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Vision Updated Successfully')).toBeInTheDocument();
      });

      // Fast forward 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Vision Updated Successfully')).not.toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('should allow manual dismissal of updated state', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const updatedHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:updated'
      )[1];

      act(() => {
        updatedHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          oldVision: 'Old vision',
          newVision: 'New enhanced vision',
          metrics: mockMetrics
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Vision Updated Successfully')).toBeInTheDocument();
      });

      const dismissButtons = screen.getAllByRole('button');
      const dismissButton = dismissButtons.find(btn => btn.getAttribute('class')?.includes('p-1'));
      
      if (dismissButton) {
        fireEvent.click(dismissButton);

        await waitFor(() => {
          expect(screen.queryByText('Vision Updated Successfully')).not.toBeInTheDocument();
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle error events', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      // First set an analyzing state
      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Analyzing Vision Statement')).toBeInTheDocument();
      });

      // Now trigger an error
      const errorHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:error'
      )[1];

      act(() => {
        errorHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          errorCode: 'ANALYSIS_FAILED',
          error: 'Analysis failed'
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('Analyzing Vision Statement')).not.toBeInTheDocument();
      });
    });
  });

  describe('Event Filtering', () => {
    it('should only respond to events for the correct starship and user', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      // Event for different starship
      act(() => {
        analyzingHandler({
          starshipId: 'different-starship-id',
          userId: mockUser.id,
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('Analyzing Vision Statement')).not.toBeInTheDocument();
      });

      // Event for different user
      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: 'different-user-id',
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.queryByText('Analyzing Vision Statement')).not.toBeInTheDocument();
      });

      // Event for correct starship and user
      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Analyzing Vision Statement')).toBeInTheDocument();
      });
    });
  });

  describe('Props and Configuration', () => {
    it('should handle missing starshipId', () => {
      const { container } = render(
        <VisionChatContextIndicator 
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing user', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        login: jest.fn(),
        logout: jest.fn()
      });

      const { container } = render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId}
          onVisionProposalAction={mockOnVisionProposalAction}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should apply custom className', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId} 
          onVisionProposalAction={mockOnVisionProposalAction}
          className="custom-class"
        />
      );

      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: 'Test vision',
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        const container = screen.getByText('Analyzing Vision Statement').closest('[class*="custom-class"]');
        expect(container).toBeInTheDocument();
      });
    });

    it('should work without onVisionProposalAction callback', async () => {
      render(
        <VisionChatContextIndicator 
          starshipId={mockStarshipId}
        />
      );

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      // Should not throw when callback is not provided
      expect(() => {
        act(() => {
          proposalHandler({
            starshipId: mockStarshipId,
            userId: mockUser.id,
            sessionId: 'test-session-id',
            proposal: {
              proposedVision: 'Test proposal',
              reasoning: 'Test reasoning',
              confidenceLevel: 80,
              keyChanges: ['Test change'],
              metrics: { overallQuality: 80 }
            }
          });
        });
      }).not.toThrow();
    });
  });
});