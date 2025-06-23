# Client Implementation Guide

## Overview

The `@starships/client` package is a modern React-based web application built with Next.js 15, TypeScript, and Tailwind CSS. It provides a beautiful and responsive interface for interacting with AI agents through the Starships.ai platform.

## Architecture

### Technology Stack

- **Framework**: Next.js 15.3.4 (App Router)
- **Language**: TypeScript 5.8.3
- **Styling**: Tailwind CSS 3.4.17 + shadcn/ui patterns
- **State Management**: React hooks (useState, useEffect, useRef)
- **HTTP Client**: Axios 1.10.0
- **Icons**: Lucide React 0.522.0
- **Build Tool**: Next.js built-in bundler

### Project Structure

```
packages/client/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── globals.css      # Global styles with Tailwind
│   │   ├── layout.tsx       # Root layout component
│   │   └── page.tsx         # Home page component
│   ├── components/          # Reusable React components
│   │   ├── agents/          # Agent-related components
│   │   │   ├── AgentCard.tsx
│   │   │   └── AgentSelector.tsx
│   │   ├── chat/            # Chat interface components
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── MessageList.tsx
│   │   └── ui/              # Generic UI components (shadcn/ui)
│   ├── hooks/               # Custom React hooks
│   └── lib/                 # Utility functions and API client
│       ├── api.ts           # API client with typed endpoints
│       └── utils.ts         # Utility functions
├── public/                  # Static assets
├── next.config.js           # Next.js configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Package configuration
```

## Features

### 1. Agent Selection
- **AgentSelector**: Displays available AI agents in a sidebar
- **AgentCard**: Individual agent cards with name, description, and metadata
- Real-time loading states and error handling
- Agent switching with session management

### 2. Chat Interface
- **ChatInterface**: Main chat container with header, messages, and input
- **MessageList**: Scrollable message history with auto-scroll
- **MessageBubble**: Individual message display for user/assistant
- **MessageInput**: Auto-resizing textarea with send functionality

### 3. API Integration
- Typed API client with Axios
- Automatic session creation and management
- Optimistic UI updates for better UX
- Error handling and retry logic
- RESTful endpoints:
  - `GET /api/agents` - Fetch available agents
  - `POST /api/chat` - Create chat session
  - `POST /api/chat/message` - Send message
  - `GET /api/chat/:channelId/messages` - Fetch messages

### 4. UI/UX Features
- Responsive design (mobile-first approach)
- Dark/light mode support (via Tailwind CSS variables)
- Loading states and skeleton screens
- Error boundaries and fallback UI
- Accessible components (ARIA labels, keyboard navigation)
- Smooth animations and transitions

## Development Workflow

### Prerequisites
- Node.js 18+ 
- pnpm package manager
- Running backend server on port 3001

### Setup Instructions

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Start development server**:
   ```bash
   cd packages/client
   pnpm dev
   ```

3. **Build for production**:
   ```bash
   pnpm build
   pnpm start
   ```

### Environment Variables

Create `.env.local` in the client package root:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## API Integration Details

### Type Definitions

```typescript
interface Agent {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: string
  channelId: string
}

interface ChatSession {
  id: string
  agentId: string
  userId: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}
```

### API Client Usage

```typescript
import { agentAPI, chatAPI } from '@/lib/api'

// Fetch agents
const agents = await agentAPI.getAll()

// Create chat session
const session = await chatAPI.createSession({
  agentId: 'agent-id',
  userId: 'user-id'
})

// Send message
const message = await chatAPI.sendMessage({
  content: 'Hello!',
  channelId: session.id
})
```

## Component API

### AgentSelector
```typescript
interface AgentSelectorProps {
  selectedAgent: Agent | null
  onAgentSelect: (agent: Agent) => void
}
```

### ChatInterface
```typescript
interface ChatInterfaceProps {
  agent: Agent
  sessionId: string | null
  onSessionCreated: (sessionId: string) => void
}
```

### MessageInput
```typescript
interface MessageInputProps {
  onSendMessage: (message: string) => Promise<void>
  disabled?: boolean
}
```

## Styling Guide

### Design System
- **Colors**: CSS custom properties for theme support
- **Typography**: Inter font family from Google Fonts
- **Spacing**: Tailwind's default spacing scale
- **Breakpoints**: Mobile-first responsive design
- **Components**: shadcn/ui patterns for consistency

### Key CSS Classes
```css
/* Primary colors */
bg-primary text-primary-foreground
bg-secondary text-secondary-foreground

/* Interactive states */
hover:bg-muted/50 focus:ring-2 focus:ring-primary

/* Layout utilities */
flex items-center justify-center
max-w-[80%] min-h-screen
```

## Performance Optimizations

1. **Code Splitting**: Next.js automatic code splitting
2. **Image Optimization**: Next.js built-in image optimization
3. **Bundle Analysis**: Built-in bundle analyzer
4. **Caching**: Automatic caching for API responses
5. **Optimistic Updates**: Immediate UI feedback
6. **Auto-scroll Management**: Efficient message list scrolling

## Testing Strategy

### Recommended Testing Tools
- **Unit Tests**: Jest + React Testing Library
- **Integration Tests**: Playwright or Cypress
- **Type Checking**: TypeScript compiler
- **Linting**: ESLint + Prettier

### Test Coverage Areas
- Component rendering and props
- API client functionality
- User interactions (clicking, typing)
- Error handling and edge cases
- Responsive design breakpoints

## Deployment

### Production Build
```bash
pnpm build
```

### Environment Setup
- Set `NEXT_PUBLIC_API_URL` to production API endpoint
- Configure CDN for static assets
- Set up monitoring and error tracking

### Recommended Hosting
- **Vercel**: Native Next.js deployment
- **Netlify**: Static site deployment
- **Docker**: Containerized deployment

## Future Enhancements

### Phase 2 Features
- [ ] User authentication and sessions
- [ ] Real-time messaging with WebSockets
- [ ] Message persistence and history
- [ ] File upload and sharing
- [ ] Agent customization and settings

### Phase 3 Features
- [ ] Multi-agent conversations
- [ ] Voice input/output
- [ ] Mobile app (React Native)
- [ ] Offline support and PWA
- [ ] Advanced analytics and insights

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure port 3000 is available
2. **API connection**: Verify backend server is running on port 3001
3. **TypeScript errors**: Run `pnpm type-check` to verify types
4. **Build failures**: Clear `.next` folder and rebuild

### Debug Mode
```bash
NEXT_PUBLIC_DEBUG=true pnpm dev
```

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new interfaces
3. Include proper error handling and loading states
4. Test components in isolation before integration
5. Update documentation for new features

## Support

For questions or issues:
- Check the main project documentation
- Review the existing component implementations
- Test against the running backend API
- Follow Next.js and React best practices 