/**
 * MessageService thread-link race-condition tests
 *
 * These tests verify that linking a message to a thread is "first write wins":
 * concurrent attempts to link the same message to different thread conversations
 * must not result in the later call overwriting the earlier link.
 */

const updateMock = jest.fn();
const findByIdMock = jest.fn();
const linkToThreadIfUnlinkedMock = jest.fn();

jest.mock('@starships/models', () => {
  return {
    MessageRepository: jest.fn().mockImplementation(() => ({
      update: updateMock,
      findById: findByIdMock,
      linkToThreadIfUnlinked: linkToThreadIfUnlinkedMock,
    })),
    AttachmentRepository: jest.fn().mockImplementation(() => ({})),
    ConversationParticipantRepository: jest.fn().mockImplementation(() => ({})),
  };
});

import { MessageService } from '@/services/MessageService';

describe('MessageService.updateMessage thread linking', () => {
  beforeEach(() => {
    updateMock.mockReset();
    findByIdMock.mockReset();
    linkToThreadIfUnlinkedMock.mockReset();
  });

  it('returns the linked message when the link succeeds', async () => {
    // No non-link updates → service reads message first
    findByIdMock.mockResolvedValueOnce({ id: 'msg_123', linkedConversationId: null });
    linkToThreadIfUnlinkedMock.mockResolvedValueOnce({ id: 'msg_123', linkedConversationId: 'child_conv_a' });

    const service = new MessageService();
    const result = await service.updateMessage('msg_123', { linkedConversationId: 'child_conv_a' });

    expect(linkToThreadIfUnlinkedMock).toHaveBeenCalledWith('msg_123', 'child_conv_a');
    expect(result).toMatchObject({ id: 'msg_123', linkedConversationId: 'child_conv_a' });
  });

  it('fails with 409 and does not overwrite when a concurrent link loses the race', async () => {
    // Simulate: another request already linked message to child_conv_a.
    // Our attempt to link to child_conv_b should not overwrite and should surface a conflict.
    findByIdMock.mockResolvedValueOnce({ id: 'msg_123', linkedConversationId: 'child_conv_a' });
    linkToThreadIfUnlinkedMock.mockResolvedValueOnce(null);
    findByIdMock.mockResolvedValueOnce({ id: 'msg_123', linkedConversationId: 'child_conv_a' });

    const service = new MessageService();
    await expect(service.updateMessage('msg_123', { linkedConversationId: 'child_conv_b' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESOURCE_CONFLICT',
    });
  });
});

