import express from 'express';

// Mocks must be declared before importing the router under test.
const publishMock = jest.fn().mockResolvedValue({ streamId: '1-0' });
const updateMessageMock = jest.fn();

jest.mock('@/middleware/jwt-auth', () => {
  return {
    jwtAuthMiddleware: (req: any, _res: any, next: any) => {
      req.user = { id: 'user-a' };
      next();
    },
  };
});

jest.mock('@/services/ConversationStreamBus', () => {
  return {
    ConversationStreamBus: {
      getInstance: () => ({
        publish: publishMock,
      }),
    },
  };
});

jest.mock('@/services/MessageService', () => {
  return {
    MessageService: jest.fn().mockImplementation(() => ({
      updateMessage: updateMessageMock,
    })),
  };
});

// The route module imports several repositories from @starships/models.
// Only ConversationParticipantRepository is touched in this test; stub the rest
// so module import doesn't fail.
jest.mock('@starships/models', () => {
  return {
    ChannelRepository: jest.fn(),
    DirectMessageRepository: jest.fn(),
    MessageReactionRepository: jest.fn(),
    NotificationRepository: jest.fn(),
    ConversationParticipantRepository: jest.fn().mockImplementation(() => ({
      addUserParticipant: jest.fn().mockResolvedValue(null),
      addAgentParticipant: jest.fn().mockResolvedValue(null),
    })),
  };
});

// Not used in this test, but imported by the route module.
jest.mock('@/services/ConversationService', () => {
  return { ConversationService: jest.fn() };
});
jest.mock('@/services/NotificationStreamBus', () => {
  return { NotificationStreamBus: { getInstance: () => ({ publish: jest.fn() }) } };
});

import messageRoutes from '@/routes/messages';

describe('PUT /messages/:messageId streaming', () => {
  beforeEach(() => {
    publishMock.mockClear();
    updateMessageMock.mockReset();
  });

  it('broadcasts a message.append update when a message is linked to a thread', async () => {
    // Must satisfy IdSchema: 10-30 chars, alnum + _/-
    const messageId = 'msg_1234567';
    const parentConversationId = 'parentconv12';
    const childConversationId = 'childconv123';

    updateMessageMock.mockResolvedValue({
      id: messageId,
      role: 'user',
      content: 'hello',
      messageType: 'user_input',
      conversationId: parentConversationId,
      userId: 'user-a',
      linkedConversationId: childConversationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/v1', messageRoutes);

    const server = app.listen(0);
    const port = (server.address() as any).port as number;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedConversationId: childConversationId }),
      });

      expect(res.status).toBe(200);
      expect(publishMock).toHaveBeenCalledTimes(1);
      expect(publishMock).toHaveBeenCalledWith(parentConversationId, {
        type: 'message.append',
        data: {
          conversationId: parentConversationId,
          message: expect.objectContaining({
            id: messageId,
            linkedConversationId: childConversationId,
          }),
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

