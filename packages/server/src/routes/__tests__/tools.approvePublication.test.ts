jest.mock('@starships/models', () => ({
  ToolRepository: jest.fn(),
  ToolTemplateRepository: jest.fn(),
}));

import type { Request, Response } from 'express';
import toolsRouter from '@/routes/tools';
import { ToolRepository, ToolTemplateRepository } from '@starships/models';

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
  const layer = (toolsRouter as any).stack.find((l: any) => l?.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('tools routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /admin/tools/:id/approve updates ToolTemplate name when approving publication', async () => {
    const mockToolRepo = { findById: jest.fn(), update: jest.fn() };
    (ToolRepository as unknown as jest.Mock).mockImplementation(() => mockToolRepo);

    const mockTemplateRepo = { findById: jest.fn(), create: jest.fn(), update: jest.fn() };
    (ToolTemplateRepository as unknown as jest.Mock).mockImplementation(() => mockTemplateRepo);

    mockToolRepo.findById.mockResolvedValue({
      id: 'tool_1234567',
      name: 'Updated Tool Name',
      description: 'desc',
      parameters: { type: 'object', properties: {} },
      blueprint: { nodes: [] },
      transforms: [],
      mutations: [],
      condition: null,
      version: '1.0.0',
      publicationRequestedVersion: '1.1.0',
      publicationStatus: 'pending_approval',
      publishedTemplateId: 'tool_tpl_1234567',
    });

    mockTemplateRepo.findById.mockResolvedValue({ id: 'tool_tpl_1234567', slug: 'tool-template-slug' });
    mockToolRepo.update.mockResolvedValue({ id: 'tool_1234567' });

    const req = {
      user: { id: 'admin_1234567', isInstanceAdmin: true },
      params: { id: 'tool_1234567' },
      body: {},
    } as unknown as Request;
    const res = createMockRes();

    const handler = getHandler('/admin/tools/:id/approve');
    await handler(req, res as unknown as Response);

    expect(mockTemplateRepo.update).toHaveBeenCalledWith(
      'tool_tpl_1234567',
      expect.objectContaining({
        name: 'Updated Tool Name',
      })
    );
  });
});

