# Client Implementation Guide

## Overview

The `@starships/client` package is a modern React-based web application built with Next.js 15, TypeScript, and Tailwind CSS. It provides a beautiful and responsive interface for interacting with AI agents through the Starships.ai platform.

## Architecture

### Technology Stack

- **Framework**: Next.js 15.3.4 (App Router)
- **Language**: TypeScript 5.8.3
- **Styling**: Tailwind CSS 3.4.17 + shadcn/ui components
- **State Management**: React hooks (useState, useEffect, useRef)
- **HTTP Client**: Axios 1.7.9
- **Icons**: Lucide React 0.522.0
- **Theme**: next-themes 0.4.6 for dark/light mode
- **Date Formatting**: date-fns 4.1.0
- **Build Tool**: Next.js built-in bundler
- **UI Components**: shadcn/ui (New York style)

### Project Structure

```
packages/client/
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── globals.css      # Global styles with Tailwind + shadcn variables
│   │   ├── layout.tsx       # Root layout with ThemeProvider
│   │   └── page.tsx         # Home page component
│   ├── components/          # Reusable React components
│   │   ├── agents/          # Agent-related components
│   │   │   ├── AgentCard.tsx    # shadcn Card + Avatar
│   │   │   └── AgentSelector.tsx
│   │   ├── chat/            # Chat interface components
│   │   │   ├── ChatInterface.tsx # Main chat container
│   │   │   ├── MessageBubble.tsx # shadcn Avatar + smart timestamps
│   │   │   ├── MessageInput.tsx  # shadcn Button + auto-resize
│   │   │   └── MessageList.tsx   # shadcn ScrollArea
│   │   ├── ui/              # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   └── avatar.tsx
│   │   ├── theme-provider.tsx   # next-themes provider
│   │   └── theme-toggle.tsx     # Dark/light mode toggle
│   ├── constants/           # Text constants for i18n
│   │   └── text.ts
│   ├── lib/                 # Utility functions and API client
│   │   ├── api.ts           # Backend integration (stateless design)
│   │   ├── storage.ts       # localStorage chat persistence
│   │   └── utils.ts         # shadcn cn() + date-fns formatting
│   └── hooks/               # Custom React hooks (future)
├── public/                  # Static assets
├── .env.example             # Environment variables documentation
├── .prettierrc              # Code formatting configuration
├── components.json          # shadcn/ui configuration
├── next.config.js           # Next.js + API proxy configuration
├── tailwind.config.js       # Tailwind + shadcn theme configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Package configuration
```

## Key Features

### 1. **Backend Integration (Stateless Design)**
- **Direct API Integration**: Uses `/v1/chat` endpoint (no session management on backend)
- **Client-side Sessions**: Generated as `agent-{agentId}:user-{userId}`
- **Type Conversion**: Automatic camelCase ↔ snake_case for backend communication
- **API Endpoints**:
  - `GET /api/agents` → `GET /v1/agents` (proxied)
  - `POST /api/chat` → `POST /v1/chat` (proxied)
  - `DELETE /api/chat/:sessionId/memory` → `DELETE /v1/chat/:sessionKey/memory` (proxied)

### 2. **Client-side Chat Persistence**
- **localStorage Storage**: Chat history per agent persisted locally
- **Session Management**: Automatic session creation and management
- **Cross-browser Compatibility**: Works with localStorage-enabled browsers
- **Utilities**:
  - `getChatHistory(sessionId)` - Load stored messages
  - `saveChatHistory(sessionId, messages)` - Save conversation
  - `clearChatHistory(sessionId)` - Clear specific agent history

### 3. **Modern UI with shadcn/ui**
- **Design System**: shadcn/ui (New York style) with Neutral color palette
- **Components Used**:
  - Button (message send, theme toggle)
  - Card (agent selection)
  - Avatar (user/agent avatars)
  - ScrollArea (message scrolling)
- **Theme Support**: Full dark/light mode with smooth transitions
- **Responsive Design**: Mobile-first approach with Tailwind CSS

### 4. **Smart Timestamps with date-fns**
- **Relative Time**: "just now", "5 minutes ago", "2 hours ago"
- **Smart Display**:
  - Today: Relative time
  - Yesterday: "yesterday 3:45 PM"
  - Older: "Dec 23, 3:45 PM"
- **Real-time Updates**: Timestamps update as time passes

### 5. **Individual Message Loading States**
- **Optimistic Updates**: Messages appear immediately when sent
- **Loading Indicators**: Spinner shown while message is being processed
- **Error Handling**: Failed messages removed with error display
- **Visual Feedback**: Sending messages shown with reduced opacity

### 6. **Internationalization Ready**
- **Text Constants**: All UI strings in `src/constants/text.ts`
- **Organized Structure**: Grouped by feature (CHAT, AGENTS, ERRORS, etc.)
- **Type Safety**: TypeScript constants with proper typing

## Environment Setup

### Prerequisites
- Node.js 20+
- pnpm package manager
- Running backend server (default: port 4000)

### Installation

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your settings
   ```

3. **Start development server**:
   ```bash
   pnpm dev
   ```

4. **Build for production**:
   ```bash
   pnpm build
   pnpm start
   ```

### Environment Variables

Create `.env.local` in the client package root:

```env
# Backend API URL (default: http://localhost:4000)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Development Scripts

```bash
# Development
pnpm dev              # Start dev server on port 3000

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
pnpm format           # Format code with Prettier
pnpm type-check       # TypeScript compilation check

# Production
pnpm build            # Build for production
pnpm start            # Start production server
```

## API Integration Details

### Request Flow
```typescript
// Client Request
{
  agentId: "agent-123",
  userId: "user-1", 
  sessionId: "agent-123:user-1",
  message: "Hello"
}

// Converted to Backend Format
{
  agent_id: "agent-123",
  user_id: "user-1",
  channel_id: "agent-123:user-1", 
  message: "Hello",
  stream: false
}

// Backend Response
{
  reply: "Hi there! How can I help you?",
  usage: { prompt_tokens: 10, completion_tokens: 8 }
}

// Converted to Client Message
{
  id: "generated-client-id",
  content: "Hi there! How can I help you?",
  role: "assistant",
  timestamp: "2024-01-15T10:30:00.000Z",
  sessionId: "agent-123:user-1"
}
```

### Error Handling
- **Network Errors**: Automatic retry logic (TODO)
- **Validation Errors**: User-friendly error messages
- **Loading States**: Visual feedback during API calls
- **Fallback UI**: Graceful degradation when APIs fail

## Theme System

### Dark Mode Implementation
```typescript
// Theme Provider Setup
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  {children}
</ThemeProvider>

// Theme Toggle Component
const { theme, setTheme } = useTheme()
const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light")
```

### CSS Variables
- Automatic theme switching via CSS custom properties
- Smooth transitions between themes
- System preference detection
- Persistent theme selection

## Component Architecture

### Chat Flow
```
HomePage
├── AgentSelector (sidebar)
│   └── AgentCard[] (shadcn Card + Avatar)
└── ChatInterface (main area)
    ├── Header (agent info + theme toggle)
    ├── MessageList (shadcn ScrollArea)
    │   └── MessageBubble[] (shadcn Avatar + timestamps)
    └── MessageInput (shadcn Button + auto-resize)
```

### State Management
- **Local State**: React hooks for component state
- **Session State**: localStorage for chat persistence
- **Theme State**: next-themes for dark/light mode
- **Loading State**: Individual message loading tracking

## Performance Optimizations

### Bundle Size
- **Tree Shaking**: Only import used shadcn components
- **Code Splitting**: Automatic with Next.js App Router
- **Image Optimization**: Next.js built-in image optimization

### Runtime Performance
- **Memoization**: React.memo for expensive components (TODO)
- **Virtual Scrolling**: For large chat histories (TODO)
- **Debounced Inputs**: For search and filters (TODO)

## Accessibility

### Current Implementation
- **ARIA Labels**: Screen reader support for buttons
- **Keyboard Navigation**: Tab navigation support
- **Focus Management**: Proper focus handling
- **Color Contrast**: WCAG compliant color palette

### TODO Improvements
- **Keyboard Shortcuts**: Chat navigation shortcuts
- **Voice Commands**: Speech-to-text input
- **High Contrast Mode**: Enhanced accessibility theme
- **Screen Reader Announcements**: Live message updates

## Testing Strategy (TODO)

### Planned Testing
- **Unit Tests**: Component testing with React Testing Library
- **Integration Tests**: API integration testing
- **E2E Tests**: Complete user flows with Playwright
- **Visual Regression**: Screenshot testing for UI consistency

### Test Coverage Goals
- **Components**: 90%+ coverage
- **Utils**: 100% coverage
- **API Integration**: Mock-based testing
- **Accessibility**: Automated a11y testing

## Deployment

### Production Build
```bash
pnpm build    # Creates optimized production build
pnpm start    # Starts production server
```

### Docker Deployment
```dockerfile
# Multi-stage build for optimized image size
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS runtime  
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Configuration
- **Development**: `NEXT_PUBLIC_API_URL=http://localhost:4000`
- **Production**: `NEXT_PUBLIC_API_URL=[API-DOMAIN-URL]`
- **Staging**: `NEXT_PUBLIC_API_URL=https://staging-api.starships.ai`

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Check `NEXT_PUBLIC_API_URL` environment variable
   - Verify backend server is running on correct port
   - Check network connectivity and CORS settings

2. **Theme Not Switching**
   - Ensure `suppressHydrationWarning` is set on `<html>` tag
   - Check ThemeProvider configuration
   - Verify CSS custom properties are defined

3. **Chat History Not Persisting**
   - Check localStorage availability in browser
   - Verify session ID generation is consistent
   - Check for localStorage quota exceeded errors

4. **TypeScript Errors**
   - Run `pnpm type-check` to identify issues
   - Ensure all dependencies have proper type definitions
   - Check for version compatibility issues

### Performance Issues
- **Slow Loading**: Check bundle size with `pnpm build`
- **Memory Leaks**: Monitor component cleanup in DevTools
- **API Timeouts**: Adjust timeout values in API client

## Future Enhancements

### Planned Features
- **Real-time Chat**: WebSocket integration for live updates
- **File Uploads**: Drag-and-drop file sharing
- **Voice Messages**: Audio recording and playback
- **Chat Export**: Download conversation history
- **Multi-language**: Complete i18n implementation
- **Mobile App**: React Native version

### Technical Improvements
- **Offline Support**: Service worker for offline functionality
- **PWA Features**: Progressive web app capabilities
- **Performance Monitoring**: Real user monitoring integration
- **Error Tracking**: Automated error reporting
- **Analytics**: User interaction tracking
- **Security**: Enhanced XSS protection and CSP headers

This implementation provides a solid foundation for a modern, scalable chat interface that can grow with the platform's needs. 