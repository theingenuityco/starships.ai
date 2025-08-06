import { VisionRefinementService, VisionAnalysis, VisionRefinementResponse } from '../../src/services/VisionRefinementService';
import { RepositoryFactory } from '@starships/models';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Mock dependencies
jest.mock('@starships/models', () => ({
  RepositoryFactory: {
    getVisionRepository: jest.fn()
  }
}));

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }));
});

// Mock environment variables
jest.mock('../../src/config/environment', () => ({
  env: {
    OPENAI_API_KEY: 'test-openai-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key'
  }
}));

describe('VisionRefinementService', () => {
  let service: VisionRefinementService;
  let mockVisionRepo: any;
  let mockAnthropic: any;
  let mockOpenAI: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock repository
    mockVisionRepo = {
      findByStarshipId: jest.fn(),
      save: jest.fn(),
      update: jest.fn()
    };
    (RepositoryFactory.getVisionRepository as jest.Mock).mockReturnValue(mockVisionRepo);

    // Setup mock Anthropic client
    mockAnthropic = {
      messages: {
        create: jest.fn()
      }
    };
    (Anthropic as jest.Mock).mockImplementation(() => mockAnthropic);

    // Setup mock OpenAI client  
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    (OpenAI as jest.Mock).mockImplementation(() => mockOpenAI);

    service = new VisionRefinementService();
  });

  describe('isVisionRelated', () => {
    it('should detect vision-related messages with keywords', () => {
      expect(service.isVisionRelated('Let me refine our vision')).toBe(true);
      expect(service.isVisionRelated('What are our goals and objectives?')).toBe(true);
      expect(service.isVisionRelated('We need to improve our mission')).toBe(true);
      expect(service.isVisionRelated('Our long-term strategy needs work')).toBe(true);
      expect(service.isVisionRelated('What is our future direction?')).toBe(true);
    });

    it('should detect vision-related messages with contextual patterns', () => {
      expect(service.isVisionRelated('What are we trying to achieve?')).toBe(true);
      expect(service.isVisionRelated('Where are we heading in the long term?')).toBe(true);
      expect(service.isVisionRelated('What does success look like for us?')).toBe(true);
      expect(service.isVisionRelated('What is our main purpose?')).toBe(true);
      expect(service.isVisionRelated('We want to improve our vision statement')).toBe(true);
    });

    it('should not detect non-vision-related messages', () => {
      expect(service.isVisionRelated('How is the weather today?')).toBe(false);
      expect(service.isVisionRelated('Can you help me with coding?')).toBe(false);
      expect(service.isVisionRelated('What time is it?')).toBe(false);
      expect(service.isVisionRelated('Random conversation about movies')).toBe(false);
    });

    it('should handle empty and null inputs gracefully', () => {
      expect(service.isVisionRelated('')).toBe(false);
      expect(service.isVisionRelated(' ')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(service.isVisionRelated('VISION STATEMENT')).toBe(true);
      expect(service.isVisionRelated('Vision Statement')).toBe(true);
      expect(service.isVisionRelated('vision statement')).toBe(true);
    });
  });

  describe('analyze', () => {
    it('should successfully analyze a vision statement', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 85,
            specificityScore: 70,
            actionabilityScore: 75,
            inspirationalScore: 80,
            strengths: ['Clear language', 'Specific goals'],
            weaknesses: ['Could be more actionable'],
            suggestions: ['Add timeline', 'Include metrics']
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const vision = 'We will create innovative AI solutions to transform how people work and collaborate.';
      const analysis = await service.analyze(vision);

      expect(analysis).toMatchObject({
        currentVision: vision,
        clarityScore: 85,
        specificityScore: 70,
        actionabilityScore: 75,
        inspirationalScore: 80,
        strengths: ['Clear language', 'Specific goals'],
        weaknesses: ['Could be more actionable'],
        suggestions: ['Add timeline', 'Include metrics']
      });

      expect(analysis.overallConfidence).toBeGreaterThan(0);
      expect(analysis.overallConfidence).toBeLessThanOrEqual(1);

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1500,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: expect.stringContaining(vision)
        }]
      });
    });

    it('should handle malformed AI response gracefully', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Invalid JSON response'
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const vision = 'Test vision statement';
      const analysis = await service.analyze(vision);

      // Should return fallback analysis
      expect(analysis.currentVision).toBe(vision);
      expect(analysis.clarityScore).toBeGreaterThanOrEqual(0);
      expect(analysis.clarityScore).toBeLessThanOrEqual(100);
      expect(analysis.strengths).toContain('Vision statement is present');
      expect(analysis.overallConfidence).toBe(0.6);
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropic.messages.create.mockRejectedValue(new Error('API Error'));

      const vision = 'Test vision statement';
      const analysis = await service.analyze(vision);

      // Should return fallback analysis
      expect(analysis.currentVision).toBe(vision);
      expect(analysis.overallConfidence).toBe(0.6);
    });

    it('should handle missing response content', async () => {
      const mockResponse = {
        content: []
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const vision = 'Test vision statement';
      const analysis = await service.analyze(vision);

      // Should return fallback analysis
      expect(analysis.currentVision).toBe(vision);
      expect(analysis.overallConfidence).toBe(0.6);
    });
  });

  describe('refine', () => {
    it('should successfully refine a vision statement', async () => {
      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: true,
            proposedVision: 'We will create innovative AI solutions that transform workplace collaboration by 2025, helping 1M+ users achieve 50% better productivity.',
            reasoning: 'Added specific timeline and measurable outcomes to improve actionability',
            confidenceLevel: 0.85,
            keyChanges: ['Added timeline (by 2025)', 'Added user metrics (1M+ users)', 'Added measurable outcome (50% productivity)']
          })
        }]
      };

      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 90,
            specificityScore: 85,
            actionabilityScore: 88,
            inspirationalScore: 82,
            strengths: ['Clear timeline', 'Specific metrics'],
            weaknesses: ['Could expand on methods'],
            suggestions: ['Add implementation strategy']
          })
        }]
      };

      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse);

      const currentVision = 'We will create innovative AI solutions to transform workplace collaboration.';
      const userMessage = 'Make it more specific with timeline and metrics';
      const conversationContext = [
        { role: 'user' as const, content: userMessage, timestamp: Date.now() }
      ];

      const refinement = await service.refine(currentVision, userMessage, conversationContext);

      expect(refinement).toMatchObject({
        proposedVision: 'We will create innovative AI solutions that transform workplace collaboration by 2025, helping 1M+ users achieve 50% better productivity.',
        reasoning: 'Added specific timeline and measurable outcomes to improve actionability',
        requiresConfirmation: true,
        confidenceLevel: 0.85
      });

      expect(refinement.analysis).toBeDefined();
      expect(refinement.analysis.clarityScore).toBe(90);
    });

    it('should handle refinement when no changes are needed', async () => {
      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: false,
            proposedVision: null,
            reasoning: 'The current vision is already well-crafted and clear',
            confidenceLevel: 0.9
          })
        }]
      };

      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 90,
            specificityScore: 85,
            actionabilityScore: 88,
            inspirationalScore: 82,
            strengths: ['Already well-crafted'],
            weaknesses: [],
            suggestions: []
          })
        }]
      };

      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse);

      const currentVision = 'We will revolutionize AI-powered workplace collaboration by 2025, empowering 1M+ users to achieve 50% better productivity through our innovative platform.';
      const userMessage = 'Is this vision good enough?';
      const conversationContext = [
        { role: 'user' as const, content: userMessage, timestamp: Date.now() }
      ];

      const refinement = await service.refine(currentVision, userMessage, conversationContext);

      expect(refinement.proposedVision).toBeUndefined();
      expect(refinement.requiresConfirmation).toBe(false);
      expect(refinement.reasoning).toBe('The current vision is already well-crafted and clear');
    });

    it('should handle API errors during refinement', async () => {
      mockAnthropic.messages.create.mockRejectedValue(new Error('API Error'));

      const currentVision = 'Test vision';
      const userMessage = 'Make it better';
      const conversationContext = [];

      const refinement = await service.refine(currentVision, userMessage, conversationContext);

      // Should return fallback response
      expect(refinement.proposedVision).toBeUndefined();
      expect(refinement.requiresConfirmation).toBe(false);
      expect(refinement.confidenceLevel).toBe(0.3);
      expect(refinement.reasoning).toContain('Unable to generate refinement');
    });

    it('should limit conversation context to last 5 messages', async () => {
      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: false,
            proposedVision: null,
            reasoning: 'No changes needed',
            confidenceLevel: 0.8
          })
        }]
      };

      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 80,
            specificityScore: 75,
            actionabilityScore: 70,
            inspirationalScore: 78,
            strengths: [],
            weaknesses: [],
            suggestions: []
          })
        }]
      };

      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse);

      const currentVision = 'Test vision';
      const userMessage = 'Test message';
      
      // Create 7 messages (should only use last 5)
      const conversationContext = Array.from({ length: 7 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i + 1}`,
        timestamp: Date.now() - (7 - i) * 1000
      }));

      await service.refine(currentVision, userMessage, conversationContext);

      // Check that the prompt only includes the last 5 messages
      const callArgs = mockAnthropic.messages.create.mock.calls[0][0];
      const prompt = callArgs.messages[0].content;
      
      expect(prompt).toContain('Message 3');
      expect(prompt).toContain('Message 7');
      expect(prompt).not.toContain('Message 1');
      expect(prompt).not.toContain('Message 2');
    });
  });

  describe('generateImprovementSummary', () => {
    it('should generate improvement summary for high scores', async () => {
      const originalVision = 'Original vision';
      const refinedVision = 'Refined vision';
      const analysis: VisionAnalysis = {
        currentVision: refinedVision,
        clarityScore: 85,
        specificityScore: 75,
        actionabilityScore: 80,
        inspirationalScore: 72,
        strengths: [],
        weaknesses: [],
        suggestions: [],
        overallConfidence: 0.8
      };

      const summary = await service.generateImprovementSummary(originalVision, refinedVision, analysis);

      expect(summary).toContain('improved clarity');
      expect(summary).toContain('enhanced actionability');
      expect(summary).toContain('focused');
    });

    it('should generate generic summary for low scores', async () => {
      const originalVision = 'Original vision';
      const refinedVision = 'Refined vision';
      const analysis: VisionAnalysis = {
        currentVision: refinedVision,
        clarityScore: 45,
        specificityScore: 50,
        actionabilityScore: 40,
        inspirationalScore: 55,
        strengths: [],
        weaknesses: [],
        suggestions: [],
        overallConfidence: 0.5
      };

      const summary = await service.generateImprovementSummary(originalVision, refinedVision, analysis);

      expect(summary).toContain('several key areas for improvement');
      expect(summary).toContain('focused');
    });
  });

  describe('calculateOverallConfidence', () => {
    it('should calculate confidence correctly', () => {
      const service = new VisionRefinementService();
      const scores = {
        clarityScore: 80,
        specificityScore: 70,
        actionabilityScore: 75,
        inspirationalScore: 85
      };

      // Access private method through any cast
      const confidence = (service as any).calculateOverallConfidence(scores);

      // Average score: (80 + 70 + 75 + 85) / 4 = 77.5
      // Confidence: 77.5 / 100 = 0.775
      expect(confidence).toBeCloseTo(0.775, 3);
    });

    it('should handle missing scores with defaults', () => {
      const service = new VisionRefinementService();
      const scores = {
        clarityScore: 80
      };

      const confidence = (service as any).calculateOverallConfidence(scores);

      // (80 + 50 + 50 + 50) / 4 = 57.5
      // 57.5 / 100 = 0.575
      expect(confidence).toBeCloseTo(0.575, 3);
    });

    it('should constrain confidence to valid range', () => {
      const service = new VisionRefinementService();
      const highScores = {
        clarityScore: 120, // Invalid high score
        specificityScore: 110,
        actionabilityScore: 100,
        inspirationalScore: 100
      };

      const confidence = (service as any).calculateOverallConfidence(highScores);

      expect(confidence).toBeLessThanOrEqual(1);
      expect(confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createFallbackAnalysis', () => {
    it('should create fallback analysis based on basic heuristics', () => {
      const service = new VisionRefinementService();
      
      // Test with a vision containing action verbs and specific terms
      const visionWithActionVerbs = 'We will create 100 innovative solutions and deliver specific results to achieve our goals by 2025.';
      const analysis = (service as any).createFallbackAnalysis(visionWithActionVerbs);

      expect(analysis.currentVision).toBe(visionWithActionVerbs);
      expect(analysis.specificityScore).toBe(75); // Has specific terms
      expect(analysis.actionabilityScore).toBe(70); // Has action verbs
      expect(analysis.inspirationalScore).toBeGreaterThan(40); // Long enough vision
      expect(analysis.overallConfidence).toBe(0.6);
    });

    it('should handle short visions appropriately', () => {
      const service = new VisionRefinementService();
      const shortVision = 'Be great';
      const analysis = (service as any).createFallbackAnalysis(shortVision);

      expect(analysis.inspirationalScore).toBe(40); // Short vision penalty
      expect(analysis.specificityScore).toBe(45); // No specific terms
      expect(analysis.actionabilityScore).toBe(40); // No action verbs
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete refinement workflow', async () => {
      // Mock successful AI responses for both refinement and analysis
      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: true,
            proposedVision: 'Enhanced vision with metrics and timeline',
            reasoning: 'Added specificity and actionability',
            confidenceLevel: 0.9,
            keyChanges: ['Added timeline', 'Added metrics']
          })
        }]
      };

      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 90,
            specificityScore: 85,
            actionabilityScore: 88,
            inspirationalScore: 82,
            strengths: ['Clear and specific'],
            weaknesses: [],
            suggestions: []
          })
        }]
      };

      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse);

      const currentVision = 'We want to be successful';
      const userMessage = 'Make our vision more specific and actionable';
      const context = [{ role: 'user' as const, content: userMessage, timestamp: Date.now() }];

      // First, check if message is vision-related
      expect(service.isVisionRelated(userMessage)).toBe(true);

      // Then analyze current vision
      const currentAnalysis = await service.analyze(currentVision);
      expect(currentAnalysis.currentVision).toBe(currentVision);

      // Then refine the vision
      const refinement = await service.refine(currentVision, userMessage, context);
      expect(refinement.proposedVision).toBe('Enhanced vision with metrics and timeline');
      expect(refinement.requiresConfirmation).toBe(true);

      // Finally generate improvement summary
      const summary = await service.generateImprovementSummary(
        currentVision,
        refinement.proposedVision!,
        refinement.analysis
      );
      expect(summary).toContain('focused');
    });
  });
});