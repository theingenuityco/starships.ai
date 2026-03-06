const findByConversationIdMock = jest.fn();
const queryOneMock = jest.fn();

jest.mock('@starships/models', () => {
  return {
    // Only exports required for importing `conversation-membership.ts`
    ChannelRepository: jest.fn(),
    ConversationParticipantRepository: jest.fn(),
    DirectMessageRepository: jest.fn(),
    RoomRepository: jest.fn().mockImplementation(() => ({
      findByConversationId: findByConversationIdMock,
    })),
    getConnection: () => ({
      queryOne: queryOneMock,
    }),
  };
});

// Prevent transitive imports from pulling in mocked @starships/models unexpectedly.
jest.mock('@/services/StarshipService', () => {
  return { StarshipService: jest.fn().mockImplementation(() => ({ getStarship: jest.fn() })) };
});
jest.mock('@/utils/auth-helpers', () => {
  return { isInstanceAdmin: jest.fn().mockReturnValue(false) };
});
jest.mock('@/utils/responseHelpers', () => {
  return { sendError: jest.fn() };
});

import { resolveRoomConversationContext } from '../conversation-membership';

describe('resolveRoomConversationContext', () => {
  beforeEach(() => {
    findByConversationIdMock.mockReset();
    queryOneMock.mockReset();
  });

  it('returns room context when the conversation is the room', async () => {
    findByConversationIdMock.mockResolvedValue({
      conversationId: 'room-1',
      starshipId: 's1',
      isPrivate: false,
    });

    const ctx = await resolveRoomConversationContext({ conversationId: 'room-1' });

    expect(ctx).toEqual({
      isRoom: true,
      isRoomThread: false,
      roomConversationId: 'room-1',
      room: expect.objectContaining({ starshipId: 's1', isPrivate: false }),
    });
    expect(queryOneMock).toHaveBeenCalledTimes(0);
  });

  it('resolves a room for deep nested threads via parent chain', async () => {
    findByConversationIdMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue({
      room_conversation_id: 'room-1',
      starship_id: 's1',
      is_private: true,
    });

    const ctx = await resolveRoomConversationContext({ conversationId: 'thread-3' });

    expect(ctx).toEqual({
      isRoom: false,
      isRoomThread: true,
      roomConversationId: 'room-1',
      room: { starshipId: 's1', isPrivate: true },
    });

    expect(queryOneMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryOneMock.mock.calls[0] as [string, unknown[]];
    expect(String(sql)).toContain('WITH RECURSIVE ancestors');
    expect(params[0]).toBe('thread-3');
    expect(typeof params[1]).toBe('number');
  });

  it('returns null when no ancestor room exists', async () => {
    findByConversationIdMock.mockResolvedValue(null);
    queryOneMock.mockResolvedValue(null);

    const ctx = await resolveRoomConversationContext({ conversationId: 'thread-3' });
    expect(ctx).toBeNull();
  });
});

