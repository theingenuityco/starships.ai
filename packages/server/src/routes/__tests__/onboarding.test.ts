import type { Request, Response } from 'express';
import type { StarshipModel } from '@starships/protocol';

jest.mock('@/services/StarshipService', () => ({
  StarshipService: {
    createDefaultStarship: jest.fn(),
  },
}));

jest.mock('@/services/AgentTemplateService', () => ({
  AgentTemplateService: jest.fn().mockImplementation(() => ({
    searchTemplates: jest.fn(),
    createAgentFromTemplate: jest.fn(),
  })),
}));

jest.mock('@/services/ConversationService', () => ({
  ConversationService: jest.fn(),
}));

jest.mock('@starships/models', () => ({
  UserRepository: jest.fn(),
  StarshipRepository: jest.fn(),
  AgentRepository: jest.fn(),
  OnboardingSessionRepository: jest.fn(),
}));

import onboardingRouter from '@/routes/onboarding';
import { StarshipService } from '@/services/StarshipService';
import { AgentTemplateService } from '@/services/AgentTemplateService';
import { ConversationService } from '@/services/ConversationService';
import { UserRepository, StarshipRepository, OnboardingSessionRepository } from '@starships/models';

type MockRes = {
  status: jest.Mock<Response, [number]>;
  json: jest.Mock<Response, [unknown]>;
};

function createMockRes(): MockRes {
  const res: MockRes = {
    status: jest.fn<Response, [number]>(),
    json: jest.fn<Response, [unknown]>(),
  };
  res.status.mockImplementation(() => res as unknown as Response);
  res.json.mockImplementation(() => res as unknown as Response);
  return res;
}

function getHandler(path: string): (req: Request, res: Response) => Promise<void> {
  const stack = (onboardingRouter as unknown as { stack: Array<{ route?: { path?: string; stack: Array<{ handle: unknown }> } }> }).stack;
  const layer = stack.find((l) => l?.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  const routeStack = layer.route?.stack || [];
  const last = routeStack[routeStack.length - 1] as { handle: (req: Request, res: Response) => Promise<void> };
  return last.handle;
}

describe('onboarding routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /onboarding/start creates starship, ensures Aria, upserts session', async () => {
    const mockUserRepo = { findById: jest.fn() };
    (UserRepository as unknown as jest.Mock).mockImplementation(() => mockUserRepo);
    mockUserRepo.findById.mockResolvedValue({ id: 'u1', onboardingCompleted: false });

    const mockSessionRepo = { findByUserId: jest.fn(), upsertForUser: jest.fn() };
    (OnboardingSessionRepository as unknown as jest.Mock).mockImplementation(() => mockSessionRepo);
    mockSessionRepo.findByUserId.mockResolvedValue(null);
    mockSessionRepo.upsertForUser.mockResolvedValue({
      userId: 'u1',
      starshipId: 's1',
      step: 'welcome',
      goals: [],
      selectedConnectorProviders: [],
      selectedAgentTemplateIds: [],
      primaryAgentTemplateId: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockStarshipRepo = { findById: jest.fn(), findByOwner: jest.fn(), getDeployedAgents: jest.fn() };
    (StarshipRepository as unknown as jest.Mock).mockImplementation(() => mockStarshipRepo);
    mockStarshipRepo.findByOwner.mockResolvedValue([]);
    mockStarshipRepo.getDeployedAgents.mockResolvedValue([
      { id: 'a1', slug: 'aria', name: 'Aria' },
    ]);

    jest.mocked(StarshipService.createDefaultStarship).mockResolvedValue({
      id: 's1',
      slug: 'ship-1',
      ownerId: 'u1',
      name: 'Ship 1',
      status: 'active',
      maxAgents: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as StarshipModel);

    // Omit starshipName so the route uses StarshipService.createDefaultStarship (mocked below)
    const req = { user: { id: 'u1' }, body: {} } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/onboarding/start');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as { success: boolean; data: { session: { userId: string }; starship: { slug: string }; ariaAgent: { slug: string } } };
    expect(payload.success).toBe(true);
    expect(payload.data.session.userId).toBe('u1');
    expect(payload.data.starship.slug).toBe('ship-1');
    expect(payload.data.ariaAgent.slug).toBe('aria');
  });

  it('POST /onboarding/start reuses an existing starship (prevents repeat welcome credits)', async () => {
    const mockUserRepo = { findById: jest.fn() };
    (UserRepository as unknown as jest.Mock).mockImplementation(() => mockUserRepo);
    mockUserRepo.findById.mockResolvedValue({ id: 'u1', onboardingCompleted: false });

    const mockSessionRepo = { findByUserId: jest.fn(), upsertForUser: jest.fn() };
    (OnboardingSessionRepository as unknown as jest.Mock).mockImplementation(() => mockSessionRepo);
    mockSessionRepo.findByUserId.mockResolvedValue(null);
    mockSessionRepo.upsertForUser.mockResolvedValue({
      userId: 'u1',
      starshipId: 'sExisting',
      step: 'welcome',
      goals: [],
      selectedConnectorProviders: [],
      selectedAgentTemplateIds: [],
      primaryAgentTemplateId: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockStarshipRepo = { findById: jest.fn(), findByOwner: jest.fn(), getDeployedAgents: jest.fn() };
    (StarshipRepository as unknown as jest.Mock).mockImplementation(() => mockStarshipRepo);
    mockStarshipRepo.findByOwner.mockResolvedValue([
      {
        id: 'sExisting',
        slug: 'existing-ship',
        ownerId: 'u1',
        name: 'Existing Ship',
        status: 'active',
        maxAgents: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    mockStarshipRepo.getDeployedAgents.mockResolvedValue([{ id: 'a1', slug: 'aria', name: 'Aria' }]);

    // If we found an existing starship, we should NOT create a new one (and thus not re-grant welcome credits).
    jest.mocked(StarshipService.createDefaultStarship).mockResolvedValue({
      id: 'sNew',
      slug: 'should-not-be-used',
      ownerId: 'u1',
      name: 'Should Not Be Used',
      status: 'active',
      maxAgents: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as StarshipModel);

    const req = { user: { id: 'u1' }, body: {} } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/onboarding/start');
    await handler(req, res as unknown as Response);

    expect(jest.mocked(StarshipService.createDefaultStarship)).not.toHaveBeenCalled();
    expect(mockSessionRepo.upsertForUser).toHaveBeenCalledWith('u1', expect.objectContaining({ starshipId: 'sExisting' }));

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as { success: boolean; data: { starship: { slug: string }; ariaAgent: { slug: string } } };
    expect(payload.success).toBe(true);
    expect(payload.data.starship.slug).toBe('existing-ship');
    expect(payload.data.ariaAgent.slug).toBe('aria');
  });

  it('POST /onboarding/apply deploys selected templates and returns deployed agents', async () => {
    const mockSessionRepo = { findByUserId: jest.fn(), upsertForUser: jest.fn() };
    (OnboardingSessionRepository as unknown as jest.Mock).mockImplementation(() => mockSessionRepo);
    mockSessionRepo.findByUserId.mockResolvedValue({
      userId: 'u1',
      starshipId: 's1',
      step: 'agents',
      goals: ['research'],
      selectedConnectorProviders: [],
      selectedAgentTemplateIds: [],
      primaryAgentTemplateId: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockSessionRepo.upsertForUser.mockResolvedValue({
      userId: 'u1',
      starshipId: 's1',
      step: 'first_task',
      goals: ['research'],
      selectedConnectorProviders: [],
      selectedAgentTemplateIds: ['t1'],
      primaryAgentTemplateId: 't1',
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const mockStarshipRepo = { getDeployedAgents: jest.fn(), findByOwner: jest.fn(), findById: jest.fn() };
    (StarshipRepository as unknown as jest.Mock).mockImplementation(() => mockStarshipRepo);
    mockStarshipRepo.getDeployedAgents.mockResolvedValue([]);

    const templateSvc = {
      searchTemplates: jest.fn(),
      createAgentFromTemplate: jest.fn().mockResolvedValue({ id: 'a2', slug: 'agent-1', name: 'Agent 1', sourceTemplateId: 't1' }),
    };
    (AgentTemplateService as unknown as jest.Mock).mockImplementation(() => templateSvc);

    const req = { user: { id: 'u1' }, body: { selectedAgentTemplateIds: ['t1'], primaryAgentTemplateId: 't1' } } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/onboarding/apply');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0] as { success: boolean; data: { session: { step: string }; deployedAgents: Array<{ slug: string }> } };
    expect(payload.success).toBe(true);
    expect(payload.data.session.step).toBe('first_task');
    expect(payload.data.deployedAgents[0].slug).toBe('agent-1');
  });

  it('POST /onboarding/chat/skip clears onboarding state for the conversation', async () => {
    const mockConversationSvc = {
      getConversationById: jest.fn(),
      getConversationStarship: jest.fn(),
      updateConversation: jest.fn(),
    };
    (ConversationService as unknown as jest.Mock).mockImplementation(() => mockConversationSvc);
    mockConversationSvc.getConversationById.mockResolvedValue({ id: 'c1', starshipId: 's1', state: { isOnboardingConversation: true } });
    mockConversationSvc.getConversationStarship.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    mockConversationSvc.updateConversation.mockResolvedValue({ id: 'c1' });

    const req = { user: { id: 'u1' }, body: { conversationId: 'c1' } } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/onboarding/chat/skip');
    await handler(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockConversationSvc.updateConversation).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        state: expect.objectContaining({ isOnboardingConversation: false, onboardingSystemPrompt: null }),
      })
    );
    const payload = res.json.mock.calls[0][0] as { success: boolean; data: { conversationId: string } };
    expect(payload.success).toBe(true);
    expect(payload.data.conversationId).toBe('c1');
  });
});

