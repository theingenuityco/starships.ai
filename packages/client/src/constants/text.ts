export const UI_TEXT = {
  // App Title & Branding
  APP_TITLE: 'Starships AI',
  APP_SUBTITLE: 'Choose an AI agent to start chatting',
  APP_DESCRIPTION: 'Intelligent Agent Platform',

  // Welcome Messages
  WELCOME_TITLE: 'Welcome to Starships AI',
  WELCOME_MESSAGE: 'Select an AI agent from the sidebar to start a conversation',
  
  // Chat Interface
  CHAT: {
    MESSAGE_PLACEHOLDER: 'Type your message...',
    START_CONVERSATION_TITLE: 'Start a conversation',
    START_CONVERSATION_MESSAGE: 'Send a message to begin chatting with this agent',
    LOADING_MESSAGES: 'Loading messages...',
    SENDING_MESSAGE: 'Sending...',
  },

  // Agent Selection
  AGENTS: {
    SECTION_TITLE: 'Available Agents',
    LOADING_AGENTS: 'Loading agents...',
    NO_AGENTS_AVAILABLE: 'No agents available',
    CREATED_PREFIX: 'Created',
  },

  // Error Messages
  ERRORS: {
    FAILED_TO_LOAD_AGENTS: 'Failed to load agents. Please try again.',
    FAILED_TO_LOAD_MESSAGES: 'Failed to load messages. Please try again.',
    FAILED_TO_SEND_MESSAGE: 'Failed to send message. Please try again.',
    FAILED_TO_START_SESSION: 'Failed to start chat session. Please try again.',
    NO_ACTIVE_SESSION: 'No active chat session',
    GENERIC_ERROR: 'An unexpected error occurred. Please try again.',
  },

  // Loading States
  LOADING: {
    MESSAGES: 'Loading messages...',
    AGENTS: 'Loading agents...',
    SENDING: 'Sending...',
  },

  // Actions
  ACTIONS: {
    SEND: 'Send',
    RETRY: 'Retry',
    CLEAR_CHAT: 'Clear Chat',
    SELECT_AGENT: 'Select Agent',
  },

  // Accessibility
  A11Y: {
    SEND_MESSAGE: 'Send message',
    USER_MESSAGE: 'User message',
    ASSISTANT_MESSAGE: 'Assistant message',
    AGENT_AVATAR: 'Agent avatar',
    USER_AVATAR: 'User avatar',
    MESSAGE_TIMESTAMP: 'Message timestamp',
  },
} as const

// Export individual sections for convenience
export const CHAT_TEXT = UI_TEXT.CHAT
export const ERROR_TEXT = UI_TEXT.ERRORS
export const LOADING_TEXT = UI_TEXT.LOADING
export const AGENT_TEXT = UI_TEXT.AGENTS 