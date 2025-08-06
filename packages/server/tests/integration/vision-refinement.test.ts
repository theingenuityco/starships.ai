import { Server } from 'http';
import { Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../../src/index';
import { createTestSocketClient, waitForSocketEvent } from '../testUtils';
import { RepositoryFactory } from '@starships/models';

// Mock dependencies
jest.mock('@starships/models', () => ({
  RepositoryFactory: {
    getVisionRepository: jest.fn(),
    getUserRepository: jest.fn(),
    getStarshipRepository: jest.fn()
  }
}));

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }));
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

// Mock environment
jest.mock('../../src/config/environment', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    OPENAI_API_KEY: 'test-key',
    ANTHROPIC_API_KEY: 'test-key',
    KINDE_DOMAIN: 'test.kinde.com',
    KINDE_CLIENT_ID: 'test-client-id',
    KINDE_CLIENT_SECRET: 'test-secret',
    KINDE_REDIRECT_URL: 'http://localhost:3000/callback',
    KINDE_LOGOUT_URL: 'http://localhost:3000',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USERNAME: 'neo4j',
    NEO4J_PASSWORD: 'password'
  }
}));

describe('Vision Refinement Integration Tests', () => {
  let app: any;
  let server: Server;
  let clientSocket: ClientSocket;
  let mockVisionRepo: any;
  let mockUserRepo: any;
  let mockStarshipRepo: any;

  const testUser = {
    id: 'test-user-id',
    kindeId: 'test-kinde-id',
    email: 'test@example.com',
    name: 'Test User'
  };

  const testStarship = {
    id: 'test-starship-id',
    name: 'Test Starship',
    slug: 'test-starship',
    userId: testUser.id
  };

  const testVision = {
    id: 'test-vision-id',
    starshipId: testStarship.id,
    vision: 'We will create innovative solutions.',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeAll(async () => {
    // Setup mock repositories
    mockVisionRepo = {
      findByStarshipId: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn()
    };

    mockUserRepo = {
      findByKindeId: jest.fn(),
      findById: jest.fn()
    };

    mockStarshipRepo = {
      findById: jest.fn(),
      findBySlugAndUserId: jest.fn()
    };

    (RepositoryFactory.getVisionRepository as jest.Mock).mockReturnValue(mockVisionRepo);
    (RepositoryFactory.getUserRepository as jest.Mock).mockReturnValue(mockUserRepo);
    (RepositoryFactory.getStarshipRepository as jest.Mock).mockReturnValue(mockStarshipRepo);

    // Create test app and server
    app = await createApp();
    server = app.listen(0);
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockUserRepo.findByKindeId.mockResolvedValue(testUser);
    mockUserRepo.findById.mockResolvedValue(testUser);
    mockStarshipRepo.findById.mockResolvedValue(testStarship);
    mockVisionRepo.findByStarshipId.mockResolvedValue(testVision);

    // Create socket client
    const port = (server.address() as any).port;
    clientSocket = createTestSocketClient(port);
    
    await waitForSocketEvent(clientSocket, 'connect');
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Socket.IO Vision Events', () => {
    it('should handle vision analysis request', (done) => {
      const visionText = 'We will build amazing products that change the world.';
      
      // Mock successful Anthropic response
      const mockAnthropicResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 75,
            specificityScore: 60,
            actionabilityScore: 70,
            inspirationalScore: 85,
            strengths: ['Clear intent', 'Inspirational language'],
            weaknesses: ['Lacks specificity', 'No timeline'],
            suggestions: ['Add specific goals', 'Include timeline']
          })
        }]
      };

      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create.mockResolvedValue(mockAnthropicResponse);

      // Listen for analysis events
      clientSocket.on('vision:analyzing', (data) => {
        expect(data.starshipId).toBe(testStarship.id);
        expect(data.userId).toBe(testUser.id);
        expect(data.vision).toBe(visionText);
        expect(data.sessionId).toBeDefined();
      });

      clientSocket.on('vision:analysis-complete', (data) => {
        expect(data.starshipId).toBe(testStarship.id);
        expect(data.userId).toBe(testUser.id);
        expect(data.analysis.metrics.clarityScore).toBe(75);
        expect(data.analysis.metrics.specificityScore).toBe(60);
        expect(data.analysis.metrics.inspirationalScore).toBe(85);
        done();
      });

      // Join room and trigger analysis
      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:analyze', {
        starshipId: testStarship.id,
        vision: visionText,
        userId: testUser.id
      });
    });

    it('should handle vision refinement with proposal', (done) => {
      const currentVision = 'We make good products.';
      const userMessage = 'Make it more specific with timeline and metrics.';
      
      // Mock successful refinement response
      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: true,
            proposedVision: 'We will create 5 innovative products that serve 100,000+ users by 2025, achieving 90% customer satisfaction.',
            reasoning: 'Added specific numbers, timeline, and measurable outcomes to improve clarity and actionability.',
            confidenceLevel: 0.88,
            keyChanges: ['Added specific product count (5)', 'Added user target (100,000+)', 'Added timeline (by 2025)', 'Added success metric (90% satisfaction)']
          })
        }]
      };

      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 88,
            specificityScore: 92,
            actionabilityScore: 85,
            inspirationalScore: 78,
            strengths: ['Specific metrics', 'Clear timeline', 'Measurable outcomes'],
            weaknesses: ['Could be more inspirational'],
            suggestions: ['Add emotional appeal']
          })
        }]
      };

      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse);

      let analysisReceived = false;

      clientSocket.on('vision:analyzing', (data) => {
        expect(data.starshipId).toBe(testStarship.id);
        analysisReceived = true;
      });

      clientSocket.on('vision:proposal', (data) => {
        expect(analysisReceived).toBe(true);
        expect(data.starshipId).toBe(testStarship.id);
        expect(data.userId).toBe(testUser.id);
        expect(data.proposal.proposedVision).toContain('5 innovative products');
        expect(data.proposal.keyChanges).toHaveLength(4);
        expect(data.proposal.confidenceLevel).toBe(88);
        done();
      });

      // Join room and trigger refinement
      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:refine', {
        starshipId: testStarship.id,
        currentVision: currentVision,
        userMessage: userMessage,
        conversationContext: [
          { role: 'user', content: userMessage, timestamp: Date.now() }
        ],
        userId: testUser.id
      });
    });

    it('should handle proposal acceptance', (done) => {
      const sessionId = 'test-session-id';
      const proposedVision = 'We will create 5 innovative products that serve 100,000+ users by 2025.';
      
      mockVisionRepo.update.mockResolvedValue({
        ...testVision,
        vision: proposedVision
      });

      // Mock metrics calculation
      const mockMetricsResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 88,
            specificityScore: 92,
            actionabilityScore: 85,
            inspirationalScore: 78,
            strengths: ['Clear and specific'],
            weaknesses: [],
            suggestions: []
          })
        }]
      };

      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create.mockResolvedValue(mockMetricsResponse);

      clientSocket.on('vision:updated', (data) => {
        expect(data.starshipId).toBe(testStarship.id);
        expect(data.userId).toBe(testUser.id);
        expect(data.newVision).toBe(proposedVision);
        expect(data.updateSource).toBe('user_acceptance');
        expect(data.metrics.clarityScore).toBe(88);
        expect(data.metrics.specificityScore).toBe(92);
        
        // Verify vision was updated in database
        expect(mockVisionRepo.update).toHaveBeenCalledWith(
          testVision.id,
          { vision: proposedVision }
        );
        
        done();
      });

      // Join room and accept proposal
      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:accept-proposal', {
        starshipId: testStarship.id,
        sessionId: sessionId,
        userId: testUser.id
      }, (response: any) => {
        expect(response.success).toBe(true);
      });
    });

    it('should handle proposal rejection', (done) => {
      const sessionId = 'test-session-id';
      
      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:reject-proposal', {
        starshipId: testStarship.id,
        sessionId: sessionId,
        userId: testUser.id
      }, (response: any) => {
        expect(response.success).toBe(true);
        expect(response.message).toContain('rejected');
        
        // Should not update vision in database
        expect(mockVisionRepo.update).not.toHaveBeenCalled();
        
        done();
      });
    });

    it('should handle errors gracefully', (done) => {
      const visionText = 'Test vision';
      
      // Mock API error
      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create.mockRejectedValue(new Error('API Error'));

      clientSocket.on('vision:error', (data) => {
        expect(data.starshipId).toBe(testStarship.id);
        expect(data.userId).toBe(testUser.id);
        expect(data.errorCode).toBe('ANALYSIS_FAILED');
        expect(data.error).toContain('Failed to analyze vision');
        done();
      });

      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:analyze', {
        starshipId: testStarship.id,
        vision: visionText,
        userId: testUser.id
      });
    });

    it('should enforce user authorization', (done) => {
      const unauthorizedUserId = 'unauthorized-user-id';
      const visionText = 'Test vision';

      // Mock user not found or unauthorized
      mockUserRepo.findById.mockResolvedValue(null);

      clientSocket.on('vision:error', (data) => {
        expect(data.errorCode).toBe('UNAUTHORIZED');
        done();
      });

      clientSocket.emit('vision:analyze', {
        starshipId: testStarship.id,
        vision: visionText,
        userId: unauthorizedUserId
      });
    });

    it('should handle rate limiting', (done) => {
      const visionText = 'Test vision';
      let requestCount = 0;

      // Setup to trigger rate limiting after multiple requests
      clientSocket.on('vision:error', (data) => {
        if (requestCount > 5) { // Assuming rate limit is 5 requests
          expect(data.errorCode).toBe('RATE_LIMITED');
          done();
        }
      });

      clientSocket.on('vision:analysis-complete', () => {
        requestCount++;
        if (requestCount <= 5) {
          // Send another request
          clientSocket.emit('vision:analyze', {
            starshipId: testStarship.id,
            vision: `${visionText} ${requestCount}`,
            userId: testUser.id
          });
        }
      });

      // Mock successful responses initially
      const mockAnthropicResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 75,
            specificityScore: 60,
            actionabilityScore: 70,
            inspirationalScore: 85,
            strengths: [],
            weaknesses: [],
            suggestions: []
          })
        }]
      };

      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create.mockResolvedValue(mockAnthropicResponse);

      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      clientSocket.emit('vision:analyze', {
        starshipId: testStarship.id,
        vision: visionText,
        userId: testUser.id
      });
    }, 10000); // Increase timeout for rate limiting test
  });

  describe('REST API Endpoints', () => {
    it('should get vision for starship', async () => {
      const response = await request(app)
        .get(`/api/starships/${testStarship.id}/vision`)
        .expect(200);

      expect(response.body.vision).toBe(testVision.vision);
      expect(mockVisionRepo.findByStarshipId).toHaveBeenCalledWith(testStarship.id);
    });

    it('should save vision for starship', async () => {
      const newVision = 'We will revolutionize AI technology by 2025.';
      
      mockVisionRepo.save.mockResolvedValue({
        ...testVision,
        vision: newVision
      });

      const response = await request(app)
        .put(`/api/starships/${testStarship.id}/vision`)
        .send({ vision: newVision })
        .expect(200);

      expect(response.body.vision).toBe(newVision);
      expect(mockVisionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          starshipId: testStarship.id,
          vision: newVision
        })
      );
    });

    it('should validate vision input', async () => {
      const response = await request(app)
        .put(`/api/starships/${testStarship.id}/vision`)
        .send({ vision: '' }) // Empty vision
        .expect(400);

      expect(response.body.error).toContain('Vision cannot be empty');
      expect(mockVisionRepo.save).not.toHaveBeenCalled();
    });

    it('should handle non-existent starship', async () => {
      mockStarshipRepo.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/starships/non-existent-id/vision')
        .expect(404);

      expect(response.body.error).toContain('Starship not found');
    });

    it('should enforce vision length limits', async () => {
      const tooLongVision = 'A'.repeat(10000); // Assuming max length is less than 10000
      
      const response = await request(app)
        .put(`/api/starships/${testStarship.id}/vision`)
        .send({ vision: tooLongVision })
        .expect(400);

      expect(response.body.error).toContain('Vision too long');
      expect(mockVisionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full vision refinement workflow', async () => {
      // 1. Save initial vision via API
      const initialVision = 'We want to be successful.';
      await request(app)
        .put(`/api/starships/${testStarship.id}/vision`)
        .send({ vision: initialVision })
        .expect(200);

      // 2. Connect socket and join room
      clientSocket.emit('vision:join-starship-room', { 
        starshipId: testStarship.id, 
        userId: testUser.id 
      });

      // 3. Request analysis
      const mockAnalysisResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            clarityScore: 45,
            specificityScore: 30,
            actionabilityScore: 40,
            inspirationalScore: 50,
            strengths: ['Shows intent'],
            weaknesses: ['Too vague', 'No specifics'],
            suggestions: ['Add metrics', 'Include timeline']
          })
        }]
      };

      const mockRefinementResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            needsRefinement: true,
            proposedVision: 'We will become the leading provider of innovative solutions, serving 50,000+ customers by 2025 with 95% satisfaction.',
            reasoning: 'Added specific goals, timeline, and success metrics to improve clarity and actionability.',
            confidenceLevel: 0.85,
            keyChanges: ['Added market position goal', 'Added customer target', 'Added timeline', 'Added satisfaction metric']
          })
        }]
      };

      const Anthropic = require('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic();
      mockAnthropic.messages.create
        .mockResolvedValueOnce(mockAnalysisResponse)
        .mockResolvedValueOnce(mockRefinementResponse)
        .mockResolvedValueOnce(mockAnalysisResponse); // For final analysis

      let sessionId: string;

      // Wait for analysis completion
      const analysisComplete = new Promise<void>((resolve) => {
        clientSocket.on('vision:analysis-complete', (data) => {
          expect(data.analysis.metrics.clarityScore).toBe(45);
          resolve();
        });
      });

      // Wait for refinement proposal
      const proposalReceived = new Promise<void>((resolve) => {
        clientSocket.on('vision:proposal', (data) => {
          sessionId = data.sessionId;
          expect(data.proposal.proposedVision).toContain('leading provider');
          resolve();
        });
      });

      // Wait for vision update
      const visionUpdated = new Promise<void>((resolve) => {
        clientSocket.on('vision:updated', (data) => {
          expect(data.newVision).toContain('leading provider');
          expect(data.updateSource).toBe('user_acceptance');
          resolve();
        });
      });

      // Start the workflow
      clientSocket.emit('vision:analyze', {
        starshipId: testStarship.id,
        vision: initialVision,
        userId: testUser.id
      });

      await analysisComplete;

      // Request refinement
      clientSocket.emit('vision:refine', {
        starshipId: testStarship.id,
        currentVision: initialVision,
        userMessage: 'Make it more specific with numbers and timeline',
        conversationContext: [],
        userId: testUser.id
      });

      await proposalReceived;

      // Accept the proposal
      mockVisionRepo.update.mockResolvedValue({
        ...testVision,
        vision: 'We will become the leading provider of innovative solutions, serving 50,000+ customers by 2025 with 95% satisfaction.'
      });

      clientSocket.emit('vision:accept-proposal', {
        starshipId: testStarship.id,
        sessionId: sessionId!,
        userId: testUser.id
      });

      await visionUpdated;

      // Verify final state
      expect(mockVisionRepo.update).toHaveBeenCalledWith(
        testVision.id,
        expect.objectContaining({
          vision: expect.stringContaining('leading provider')
        })
      );
    }, 15000);
  });
});