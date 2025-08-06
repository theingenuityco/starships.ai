import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SimpleVisionChamber } from '../SimpleVisionChamber';
import { useStarshipStore } from '@/store/starship-store';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import * as visionAPI from '@/lib/api';
import SocketClient from '@/lib/socket-client';

// Mock dependencies
jest.mock('@/store/starship-store');
jest.mock('@/hooks/useAuth');
jest.mock('@/hooks/useToast');
jest.mock('@/lib/api');
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

// Mock VisionMetricsDisplay component
jest.mock('@/components/vision/VisionMetricsDisplay', () => ({
  VisionMetricsDisplay: ({ metrics, isAnalyzing }: any) => (
    <div data-testid="vision-metrics-display">
      {isAnalyzing ? 'Analyzing...' : `Metrics: ${metrics?.overallQuality || 0}`}
    </div>
  )
}));

const mockUseStarshipStore = useStarshipStore as jest.MockedFunction<typeof useStarshipStore>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockVisionAPI = visionAPI.visionAPI as jest.Mocked<typeof visionAPI.visionAPI>;

describe('SimpleVisionChamber', () => {
  const mockToast = jest.fn();
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
  const mockVision = 'We will create innovative AI solutions that transform workplace collaboration.';

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseStarshipStore.mockReturnValue({
      activeStarshipId: mockStarshipId,
      setActiveStarshipId: jest.fn(),
      starships: [],
      setStarships: jest.fn(),
      isLoading: false,
      setIsLoading: jest.fn()
    });

    mockUseAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      logout: jest.fn()
    });

    mockUseToast.mockReturnValue({ toast: mockToast });

    mockVisionAPI.get.mockResolvedValue({ vision: mockVision });
    mockVisionAPI.save.mockResolvedValue({ vision: mockVision });

    (SocketClient.getInstance as jest.Mock).mockReturnValue(mockSocketClient);
  });

  describe('Initial Rendering', () => {
    it('should render when no active starship is selected', () => {
      mockUseStarshipStore.mockReturnValue({
        activeStarshipId: null,
        setActiveStarshipId: jest.fn(),
        starships: [],
        setStarships: jest.fn(),
        isLoading: false,
        setIsLoading: jest.fn()
      });

      render(<SimpleVisionChamber />);

      expect(screen.getByText('No active starship selected')).toBeInTheDocument();
    });

    it('should load and display existing vision', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(mockVisionAPI.get).toHaveBeenCalledWith(mockStarshipId);
      });

      await waitFor(() => {
        expect(screen.getByText(mockVision)).toBeInTheDocument();
      });
    });

    it('should show edit mode when vision is empty', async () => {
      mockVisionAPI.get.mockResolvedValue({ vision: '' });

      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your starship\'s vision statement...')).toBeInTheDocument();
      });
    });

    it('should setup socket listeners on mount', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:analyzing', expect.any(Function));
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:analysis-complete', expect.any(Function));
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:proposal', expect.any(Function));
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:updated', expect.any(Function));
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:error', expect.any(Function));
        expect(mockSocketClient.emit).toHaveBeenCalledWith('vision:join-starship-room', {
          starshipId: mockStarshipId,
          userId: mockUser.id
        });
      });
    });
  });

  describe('Vision Editing', () => {
    it('should enter edit mode when edit button is clicked', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByText(mockVision)).toBeInTheDocument();
      });

      const editButton = screen.getByText('Edit Vision');
      fireEvent.click(editButton);

      expect(screen.getByDisplayValue(mockVision)).toBeInTheDocument();
      expect(screen.getByText('Save Vision')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should save vision when save button is clicked', async () => {
      const user = userEvent.setup();
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByText('Edit Vision')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Edit Vision'));

      const textarea = screen.getByDisplayValue(mockVision);
      const newVision = 'Updated vision statement with new goals.';
      
      await user.clear(textarea);
      await user.type(textarea, newVision);

      const saveButton = screen.getByText('Save Vision');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockVisionAPI.save).toHaveBeenCalledWith(mockStarshipId, newVision);
        expect(mockSocketClient.emit).toHaveBeenCalledWith('vision:analyze', {
          starshipId: mockStarshipId,
          vision: newVision,
          userId: mockUser.id
        });
      });
    });

    it('should cancel editing when cancel button is clicked', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Edit Vision'));
      });

      const textarea = screen.getByDisplayValue(mockVision);
      fireEvent.change(textarea, { target: { value: 'Changed text' } });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.getByText(mockVision)).toBeInTheDocument();
        expect(screen.queryByDisplayValue('Changed text')).not.toBeInTheDocument();
      });
    });

    it('should disable save button when vision is empty', async () => {
      mockVisionAPI.get.mockResolvedValue({ vision: '' });
      const user = userEvent.setup();
      
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        const saveButton = screen.getByText('Save Vision');
        expect(saveButton).toBeDisabled();
      });
    });

    it('should show character count while editing', async () => {
      const user = userEvent.setup();
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Edit Vision'));
      });

      const textarea = screen.getByDisplayValue(mockVision);
      
      expect(screen.getByText(`${mockVision.length} characters`)).toBeInTheDocument();
      
      await user.type(textarea, ' Additional text');
      
      await waitFor(() => {
        expect(screen.getByText(`${mockVision.length + 16} characters`)).toBeInTheDocument();
      });
    });
  });

  describe('Socket.IO Events', () => {
    it('should handle vision analyzing event', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:analyzing', expect.any(Function));
      });

      // Simulate analyzing event
      const analyzingHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analyzing'
      )[1];

      act(() => {
        analyzingHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          vision: mockVision,
          sessionId: 'test-session-id'
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Sibil is refining your vision...')).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Vision Analysis Started',
          description: 'Sibil is analyzing your vision statement...',
          variant: 'default',
          duration: 3000
        });
      });
    });

    it('should handle vision analysis complete event', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(mockSocketClient.on).toHaveBeenCalledWith('vision:analysis-complete', expect.any(Function));
      });

      const analysisCompleteHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:analysis-complete'
      )[1];

      const mockAnalysisData = {
        starshipId: mockStarshipId,
        userId: mockUser.id,
        analysis: {
          metrics: {
            clarityScore: 85,
            specificityScore: 70,
            actionabilityScore: 90,
            inspirationalScore: 75,
            overallQuality: 80,
            confidence: 0.8,
            refinementCount: 1,
            hasObjectives: true,
            hasTimeframe: true,
            hasMeasurables: false
          }
        }
      };

      act(() => {
        analysisCompleteHandler(mockAnalysisData);
      });

      await waitFor(() => {
        expect(screen.getByTestId('vision-metrics-display')).toBeInTheDocument();
        expect(screen.getByText('Metrics: 80')).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Vision Analysis Complete',
          description: 'Overall quality score: 80',
          variant: 'success',
          duration: 4000
        });
      });
    });

    it('should handle vision refinement proposal', async () => {
      render(<SimpleVisionChamber />);

      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      const mockProposalData = {
        starshipId: mockStarshipId,
        userId: mockUser.id,
        sessionId: 'test-session-id',
        proposal: {
          proposedVision: 'Enhanced vision with specific metrics and timeline',
          reasoning: 'Added specificity and actionability',
          confidenceLevel: 88,
          keyChanges: ['Added timeline', 'Added metrics'],
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
        }
      };

      act(() => {
        proposalHandler(mockProposalData);
      });

      await waitFor(() => {
        expect(screen.getByText('Sibil\'s Vision Refinement')).toBeInTheDocument();
        expect(screen.getByText('Enhanced vision with specific metrics and timeline')).toBeInTheDocument();
        expect(screen.getByText('Accept Proposal')).toBeInTheDocument();
        expect(screen.getByText('Keep Current')).toBeInTheDocument();
      });
    });

    it('should handle proposal acceptance', async () => {
      render(<SimpleVisionChamber />);

      // First simulate a proposal
      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: {
            proposedVision: 'Enhanced vision',
            reasoning: 'Better vision',
            confidenceLevel: 90,
            keyChanges: ['Improvement'],
            metrics: { overallQuality: 90 }
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Accept Proposal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Accept Proposal'));

      expect(mockSocketClient.emit).toHaveBeenCalledWith(
        'vision:accept-proposal',
        {
          starshipId: mockStarshipId,
          sessionId: 'test-session-id',
          userId: mockUser.id
        },
        expect.any(Function)
      );
    });

    it('should handle proposal rejection', async () => {
      render(<SimpleVisionChamber />);

      // Simulate proposal first
      const proposalHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:proposal'
      )[1];

      act(() => {
        proposalHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          sessionId: 'test-session-id',
          proposal: {
            proposedVision: 'Enhanced vision',
            reasoning: 'Better vision',
            confidenceLevel: 90,
            keyChanges: ['Improvement'],
            metrics: { overallQuality: 90 }
          }
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
        },
        expect.any(Function)
      );
    });

    it('should handle vision updated event', async () => {
      render(<SimpleVisionChamber />);

      const updatedHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:updated'
      )[1];

      const updatedVision = 'Updated vision statement';

      act(() => {
        updatedHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          newVision: updatedVision,
          oldVision: mockVision,
          updateSource: 'user_acceptance',
          metrics: { overallQuality: 85 }
        });
      });

      await waitFor(() => {
        expect(screen.getByText(updatedVision)).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Vision Updated',
          description: 'Vision successfully updated via Your acceptance of the proposal.',
          variant: 'success',
          duration: 4000
        });
      });
    });

    it('should handle vision error events', async () => {
      render(<SimpleVisionChamber />);

      const errorHandler = mockSocketClient.on.mock.calls.find(
        call => call[0] === 'vision:error'
      )[1];

      act(() => {
        errorHandler({
          starshipId: mockStarshipId,
          userId: mockUser.id,
          errorCode: 'ANALYSIS_FAILED',
          error: 'Failed to analyze vision statement'
        });
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Vision Refinement Error',
          description: 'Failed to analyze vision statement',
          variant: 'destructive',
          duration: 6000
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle vision loading errors', async () => {
      const error = new Error('Failed to load vision');
      mockVisionAPI.get.mockRejectedValue(error);

      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load vision')).toBeInTheDocument();
      });
    });

    it('should handle vision saving errors', async () => {
      const error = new Error('Failed to save vision');
      mockVisionAPI.save.mockRejectedValue(error);

      render(<SimpleVisionChamber />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Edit Vision'));
      });

      fireEvent.click(screen.getByText('Save Vision'));

      await waitFor(() => {
        expect(screen.getByText('Failed to save vision')).toBeInTheDocument();
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Save Failed',
          description: 'Failed to save your vision statement.',
          variant: 'destructive'
        });
      });
    });

    it('should handle socket connection issues', async () => {
      mockSocketClient.isConnected.mockReturnValue(false);

      render(<SimpleVisionChamber />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Edit Vision'));
      });

      fireEvent.click(screen.getByText('Save Vision'));

      // Should still save but not emit socket events
      await waitFor(() => {
        expect(mockVisionAPI.save).toHaveBeenCalled();
        expect(mockSocketClient.emit).not.toHaveBeenCalledWith('vision:analyze', expect.anything());
      });
    });
  });

  describe('Vision Quality Indicators', () => {
    it('should show quality indicators based on vision length', async () => {
      const shortVision = 'Short vision.';
      mockVisionAPI.get.mockResolvedValue({ vision: shortVision });

      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByText('Weak')).toBeInTheDocument(); // Short vision = weak clarity
      });
    });

    it('should update quality indicators when editing', async () => {
      const user = userEvent.setup();
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Edit Vision'));
      });

      const textarea = screen.getByDisplayValue(mockVision);
      
      // Clear and add short text
      await user.clear(textarea);
      await user.type(textarea, 'Short');

      await waitFor(() => {
        expect(screen.getByText('Vision Clarity: Weak')).toBeInTheDocument();
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup socket listeners on unmount', () => {
      const { unmount } = render(<SimpleVisionChamber />);

      unmount();

      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:analyzing');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:analysis-complete');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:proposal');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:updated');
      expect(mockSocketClient.off).toHaveBeenCalledWith('vision:error');
    });

    it('should leave starship room on cleanup', () => {
      const { unmount } = render(<SimpleVisionChamber />);

      unmount();

      expect(mockSocketClient.emit).toHaveBeenCalledWith('vision:leave-starship-room', {
        starshipId: mockStarshipId,
        userId: mockUser.id
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        expect(screen.getByText('Vision Statement')).toBeInTheDocument();
        expect(screen.getByText('Define your starship\'s guiding purpose')).toBeInTheDocument();
      });
    });

    it('should be keyboard accessible', async () => {
      render(<SimpleVisionChamber />);

      await waitFor(() => {
        const editButton = screen.getByText('Edit Vision');
        expect(editButton).toBeInTheDocument();
        
        // Should be focusable
        editButton.focus();
        expect(document.activeElement).toBe(editButton);
      });
    });
  });
});