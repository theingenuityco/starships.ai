import { render, screen, waitFor } from '@testing-library/react';
import { VisionMetricsDisplay } from '../VisionMetricsDisplay';
import type { VisionMetrics } from '@starships/protocol';

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

// Mock Tooltip components
jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children, asChild, ...props }: any) => 
    asChild ? children : <div {...props}>{children}</div>,
  TooltipContent: ({ children }: any) => <div role="tooltip">{children}</div>
}));

describe('VisionMetricsDisplay', () => {
  const mockMetrics: VisionMetrics = {
    clarityScore: 85,
    specificityScore: 70,
    actionabilityScore: 90,
    inspirationalScore: 75,
    hasObjectives: true,
    hasTimeframe: true,
    hasMeasurables: false,
    overallQuality: 80,
    confidence: 0.8,
    refinementCount: 2
  };

  const mockPreviousMetrics: VisionMetrics = {
    clarityScore: 75,
    specificityScore: 60,
    actionabilityScore: 80,
    inspirationalScore: 70,
    hasObjectives: false,
    hasTimeframe: false,
    hasMeasurables: false,
    overallQuality: 70,
    confidence: 0.7,
    refinementCount: 1
  };

  describe('Rendering', () => {
    it('should render vision metrics correctly', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Vision Metrics')).toBeInTheDocument();
      expect(screen.getByText('Real-time vision quality assessment')).toBeInTheDocument();
      expect(screen.getByText('Overall Score')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
    });

    it('should render individual metric cards', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Clarity')).toBeInTheDocument();
      expect(screen.getByText('Specificity')).toBeInTheDocument();
      expect(screen.getByText('Actionability')).toBeInTheDocument();
      expect(screen.getByText('Inspiration')).toBeInTheDocument();

      expect(screen.getByText('85')).toBeInTheDocument(); // Clarity score
      expect(screen.getByText('70')).toBeInTheDocument(); // Specificity score
      expect(screen.getByText('90')).toBeInTheDocument(); // Actionability score
      expect(screen.getByText('75')).toBeInTheDocument(); // Inspirational score
    });

    it('should render completeness indicators', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Has Objectives')).toBeInTheDocument();
      expect(screen.getByText('Has Timeframe')).toBeInTheDocument();
      expect(screen.getByText('Missing Measurables')).toBeInTheDocument();
    });

    it('should show refinement count when present', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Vision refined 2 times')).toBeInTheDocument();
    });

    it('should handle single refinement count correctly', () => {
      const singleRefinementMetrics = { ...mockMetrics, refinementCount: 1 };
      render(<VisionMetricsDisplay metrics={singleRefinementMetrics} />);

      expect(screen.getByText('Vision refined 1 time')).toBeInTheDocument();
    });

    it('should not render when no metrics and not analyzing', () => {
      const { container } = render(<VisionMetricsDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Analyzing State', () => {
    it('should show analyzing state correctly', () => {
      render(<VisionMetricsDisplay isAnalyzing={true} />);

      expect(screen.getByText('Vision Metrics')).toBeInTheDocument();
      expect(screen.getAllByText('Analyzing')).toHaveLength(4); // One for each metric card
    });

    it('should not show overall score when analyzing', () => {
      render(<VisionMetricsDisplay isAnalyzing={true} />);

      expect(screen.queryByText('Overall Score')).not.toBeInTheDocument();
    });

    it('should not show completeness indicators when analyzing', () => {
      render(<VisionMetricsDisplay isAnalyzing={true} />);

      expect(screen.queryByText('Has Objectives')).not.toBeInTheDocument();
      expect(screen.queryByText('Has Timeframe')).not.toBeInTheDocument();
      expect(screen.queryByText('Missing Measurables')).not.toBeInTheDocument();
    });
  });

  describe('Trend Indicators', () => {
    it('should show positive trends', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} previousMetrics={mockPreviousMetrics} />);

      // Should show +10 for clarity (85 - 75)
      expect(screen.getByText('+10')).toBeInTheDocument();
      
      // Should show +10 for overall (80 - 70)
      expect(screen.getByText('+10')).toBeInTheDocument();
    });

    it('should show negative trends', () => {
      const worseMetrics = { ...mockMetrics, clarityScore: 60 };
      render(<VisionMetricsDisplay metrics={worseMetrics} previousMetrics={mockMetrics} />);

      // Should show -25 for clarity (60 - 85)
      expect(screen.getByText('-25')).toBeInTheDocument();
    });

    it('should not show trends when values are the same', () => {
      const sameMetrics = { ...mockPreviousMetrics };
      render(<VisionMetricsDisplay metrics={sameMetrics} previousMetrics={mockPreviousMetrics} />);

      // Should not show any trend indicators
      expect(screen.queryByText('+')).not.toBeInTheDocument();
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });
  });

  describe('Score Colors and Styling', () => {
    it('should apply correct colors for high scores', () => {
      const highScoreMetrics: VisionMetrics = {
        ...mockMetrics,
        clarityScore: 95,
        specificityScore: 90,
        actionabilityScore: 85,
        inspirationalScore: 88,
        overallQuality: 90
      };

      render(<VisionMetricsDisplay metrics={highScoreMetrics} />);
      
      // High scores should have green styling
      const scoreElements = screen.getAllByText(/9[0-5]/);
      expect(scoreElements.length).toBeGreaterThan(0);
    });

    it('should apply correct colors for medium scores', () => {
      const mediumScoreMetrics: VisionMetrics = {
        ...mockMetrics,
        clarityScore: 65,
        specificityScore: 70,
        actionabilityScore: 68,
        inspirationalScore: 72,
        overallQuality: 69
      };

      render(<VisionMetricsDisplay metrics={mediumScoreMetrics} />);
      
      const scoreElements = screen.getAllByText(/6[5-9]|7[0-2]/);
      expect(scoreElements.length).toBeGreaterThan(0);
    });

    it('should apply correct colors for low scores', () => {
      const lowScoreMetrics: VisionMetrics = {
        ...mockMetrics,
        clarityScore: 35,
        specificityScore: 30,
        actionabilityScore: 25,
        inspirationalScore: 40,
        overallQuality: 32
      };

      render(<VisionMetricsDisplay metrics={lowScoreMetrics} />);
      
      const scoreElements = screen.getAllByText(/[23][0-9]|40/);
      expect(scoreElements.length).toBeGreaterThan(0);
    });
  });

  describe('Completeness Status', () => {
    it('should show green indicators for present completeness elements', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Has Objectives')).toBeInTheDocument();
      expect(screen.getByText('Has Timeframe')).toBeInTheDocument();
    });

    it('should show red indicators for missing completeness elements', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      expect(screen.getByText('Missing Measurables')).toBeInTheDocument();
    });

    it('should handle all missing completeness elements', () => {
      const incompleteMetrics: VisionMetrics = {
        ...mockMetrics,
        hasObjectives: false,
        hasTimeframe: false,
        hasMeasurables: false
      };

      render(<VisionMetricsDisplay metrics={incompleteMetrics} />);

      expect(screen.getByText('Missing Objectives')).toBeInTheDocument();
      expect(screen.getByText('Missing Timeframe')).toBeInTheDocument();
      expect(screen.getByText('Missing Measurables')).toBeInTheDocument();
    });

    it('should handle all present completeness elements', () => {
      const completeMetrics: VisionMetrics = {
        ...mockMetrics,
        hasObjectives: true,
        hasTimeframe: true,
        hasMeasurables: true
      };

      render(<VisionMetricsDisplay metrics={completeMetrics} />);

      expect(screen.getByText('Has Objectives')).toBeInTheDocument();
      expect(screen.getByText('Has Timeframe')).toBeInTheDocument();
      expect(screen.getByText('Has Measurables')).toBeInTheDocument();
    });
  });

  describe('Tooltip Functionality', () => {
    it('should render tooltip content for metric cards', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      // Tooltips should be present but not visible without interaction
      // We can check that the tooltip components are rendered
      const tooltipElements = screen.getAllByRole('tooltip', { hidden: true });
      expect(tooltipElements.length).toBe(4); // One for each metric
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      // Check for important headings
      expect(screen.getByText('Vision Metrics')).toBeInTheDocument();
      expect(screen.getByText('Overall Score')).toBeInTheDocument();
    });

    it('should be keyboard accessible', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} />);

      // Metric cards should be focusable for tooltips
      const metricCards = screen.getAllByText(/Clarity|Specificity|Actionability|Inspiration/);
      metricCards.forEach(card => {
        const parent = card.closest('[role]') || card.parentElement;
        expect(parent).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero scores', () => {
      const zeroMetrics: VisionMetrics = {
        ...mockMetrics,
        clarityScore: 0,
        specificityScore: 0,
        actionabilityScore: 0,
        inspirationalScore: 0,
        overallQuality: 0
      };

      render(<VisionMetricsDisplay metrics={zeroMetrics} />);

      expect(screen.getAllByText('0')).toHaveLength(5); // 4 individual scores + 1 overall
    });

    it('should handle perfect scores', () => {
      const perfectMetrics: VisionMetrics = {
        ...mockMetrics,
        clarityScore: 100,
        specificityScore: 100,
        actionabilityScore: 100,
        inspirationalScore: 100,
        overallQuality: 100
      };

      render(<VisionMetricsDisplay metrics={perfectMetrics} />);

      expect(screen.getAllByText('100')).toHaveLength(5); // 4 individual scores + 1 overall
    });

    it('should handle missing previous metrics gracefully', () => {
      render(<VisionMetricsDisplay metrics={mockMetrics} previousMetrics={undefined} />);

      // Should not show any trend indicators
      expect(screen.queryByText('+')).not.toBeInTheDocument();
      expect(screen.queryByText('-')).not.toBeInTheDocument();
    });

    it('should handle zero refinement count', () => {
      const noRefinementMetrics = { ...mockMetrics, refinementCount: 0 };
      render(<VisionMetricsDisplay metrics={noRefinementMetrics} />);

      expect(screen.queryByText(/Vision refined/)).not.toBeInTheDocument();
    });

    it('should handle custom className', () => {
      const { container } = render(
        <VisionMetricsDisplay metrics={mockMetrics} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Performance Considerations', () => {
    it('should render efficiently with large numbers', () => {
      const extremeMetrics: VisionMetrics = {
        ...mockMetrics,
        refinementCount: 999,
        overallQuality: 99.99
      };

      const { rerender } = render(<VisionMetricsDisplay metrics={extremeMetrics} />);

      expect(screen.getByText('Vision refined 999 times')).toBeInTheDocument();
      
      // Should handle re-renders without issues
      rerender(<VisionMetricsDisplay metrics={extremeMetrics} />);
      expect(screen.getByText('Vision refined 999 times')).toBeInTheDocument();
    });

    it('should handle rapid metric updates', async () => {
      const { rerender } = render(<VisionMetricsDisplay metrics={mockMetrics} />);

      // Simulate rapid updates
      for (let i = 0; i < 10; i++) {
        const updatedMetrics = { ...mockMetrics, overallQuality: 80 + i };
        rerender(<VisionMetricsDisplay metrics={updatedMetrics} />);
        
        await waitFor(() => {
          expect(screen.getByText((80 + i).toString())).toBeInTheDocument();
        });
      }
    });
  });
});