jest.mock('@starships/models', () => ({
  AgentRepository: jest.fn(),
  AgentTemplateRepository: jest.fn(),
  StarshipRepository: jest.fn(),
  UserRepository: jest.fn(),
  ToolRepository: jest.fn(),
  ToolTemplateRepository: jest.fn(),
  DEFAULT_AGENT_TIMEOUT_MS: 30000,
  DEFAULT_AGENT_TEMPERATURE: 0.7,
  MAX_AGENT_MAX_TOKENS: 200000,
  MAX_AGENT_TIMEOUT_MS: 120000,
  MIN_AGENT_MAX_TOKENS: 1,
  MIN_AGENT_TIMEOUT_MS: 1000,
}));

// AgentService constructor instantiates these services; mock them to keep this test focused and
// avoid pulling in additional @starships/models repositories.
jest.mock('@/services/MessageService', () => ({
  MessageService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/services/ConnectorSecretService', () => ({
  ConnectorSecretService: jest.fn().mockImplementation(() => ({})),
}));

import { AgentService } from '@/services/AgentService';
import {
  AgentRepository,
  AgentTemplateRepository,
  StarshipRepository,
  ToolRepository,
  ToolTemplateRepository,
  UserRepository,
} from '@starships/models';

describe('AgentService.approvePublication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates ToolTemplate name when synchronizing tools during agent publication approval', async () => {
    const mockAgentRepo = {
      findById: jest.fn(),
      update: jest.fn(),
      getAgentTools: jest.fn(),
    };
    (AgentRepository as unknown as jest.Mock).mockImplementation(() => mockAgentRepo);

    // Constructor dependency (unused in this test, but AgentService instantiates it)
    (StarshipRepository as unknown as jest.Mock).mockImplementation(() => ({
      findById: jest.fn(),
      getDeployedAgents: jest.fn(),
    }));

    const mockUserRepo = { findById: jest.fn() };
    (UserRepository as unknown as jest.Mock).mockImplementation(() => mockUserRepo);
    mockUserRepo.findById.mockResolvedValue({ id: 'admin_1234567', isInstanceAdmin: true });

    const mockTemplateRepo = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setToolTemplateRelationshipsByIds: jest.fn(),
      getAvatarStorageById: jest.fn(),
      updateAvatarStorage: jest.fn(),
    };
    (AgentTemplateRepository as unknown as jest.Mock).mockImplementation(() => mockTemplateRepo);

    const mockToolRepo = { update: jest.fn() };
    (ToolRepository as unknown as jest.Mock).mockImplementation(() => mockToolRepo);

    const mockToolTemplateRepo = {
      findById: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };
    (ToolTemplateRepository as unknown as jest.Mock).mockImplementation(() => mockToolTemplateRepo);

    mockAgentRepo.findById.mockResolvedValue({
      id: 'agent_1234567',
      starshipId: 'ship_1234567',
      name: 'My Agent',
      description: 'Agent description',
      role: 'Assistant',
      category: 'general',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1000,
      timeout: 30000,
      reasoning: null,
      systemPrompt: 'You are helpful.',
      state: { type: 'state', nodes: [] },
      blueprint: { nodes: [] },
      previewPrompts: [],
      version: '1.0.0',
      publicationStatus: 'pending_approval',
      publicationRequestedVersion: '1.1.0',
      publishedTemplateId: 'agent_tpl_1234567',
      avatarAttachmentId: null,
    });

    mockTemplateRepo.findById.mockResolvedValue({ id: 'agent_tpl_1234567', slug: 'my-agent' });
    mockTemplateRepo.getAvatarStorageById.mockResolvedValue(null);

    mockAgentRepo.getAgentTools.mockResolvedValue([
      {
        id: 'tool_1234567',
        starshipId: 'ship_1234567',
        name: 'New Tool Name',
        description: 'Tool description',
        status: 'active',
        parameters: { type: 'object', properties: {} },
        blueprint: { nodes: [] },
        transforms: [],
        mutations: [],
        condition: null,
        version: '1.0.0',
        publicationRequestedVersion: '1.2.3',
        publishedTemplateId: 'tool_tpl_1234567',
      },
    ]);

    mockToolTemplateRepo.findById.mockResolvedValue({ id: 'tool_tpl_1234567', slug: 'tool-template-slug' });
    // Repository update returns the updated template, including the new slug (slug is auto-regenerated on name updates).
    mockToolTemplateRepo.update.mockResolvedValue({ id: 'tool_tpl_1234567', slug: 'updated-tool-template-slug' });

    mockAgentRepo.update.mockResolvedValue({ id: 'agent_1234567', publicationStatus: 'published' });

    const svc = new AgentService();
    await svc.approvePublication('agent_1234567', 'admin_1234567');

    expect(mockToolTemplateRepo.update).toHaveBeenCalledWith(
      'tool_tpl_1234567',
      expect.objectContaining({
        name: 'New Tool Name',
      })
    );

    // Ensure the AgentTemplate junction-table update is written by ids (canonical) and is not slug-derived.
    expect(mockTemplateRepo.setToolTemplateRelationshipsByIds).toHaveBeenCalledWith('agent_tpl_1234567', ['tool_tpl_1234567']);
  });
});
