# Starships AI - Client

A modern React-based chat interface for interacting with AI agents, built with Next.js 15, TypeScript, and shadcn/ui.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## 🏗️ Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5.8+
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: React hooks + localStorage persistence
- **HTTP Client**: Axios with automatic retry
- **Theme**: next-themes for dark/light mode
- **Date**: date-fns for smart timestamps

### Key Features
- ✅ **Stateless Backend Integration**: Direct `/v1/chat` API calls
- ✅ **Client-side Persistence**: Chat history stored locally per agent
- ✅ **Modern UI**: shadcn/ui components with dark/light mode
- ✅ **Smart Timestamps**: Relative time with date-fns ("2 minutes ago")
- ✅ **Loading States**: Individual message sending indicators
- ✅ **Type Safety**: Full TypeScript with strict mode
- ✅ **i18n Ready**: All text in constants for internationalization

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with theme provider
│   └── page.tsx           # Main chat interface
├── components/
│   ├── agents/            # Agent selection components
│   ├── chat/              # Chat interface components
│   ├── ui/                # shadcn/ui components
│   ├── theme-provider.tsx # Theme system provider
│   └── theme-toggle.tsx   # Dark/light mode toggle
├── constants/
│   └── text.ts            # UI text constants (i18n ready)
├── lib/
│   ├── api.ts             # Backend API client
│   ├── storage.ts         # localStorage utilities
│   └── utils.ts           # Utilities + date formatting
└── .env.example           # Environment configuration
```

## 🔧 Development

### Scripts
```bash
pnpm dev          # Start development server
pnpm build        # Build for production  
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix ESLint issues
pnpm format       # Format with Prettier
pnpm type-check   # TypeScript compilation check
```

### Environment Variables
```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 🎨 UI Components

Built with [shadcn/ui](https://ui.shadcn.com/) components:

- **Button**: Message send, theme toggle
- **Card**: Agent selection cards
- **Avatar**: User and agent avatars
- **ScrollArea**: Message list scrolling

### Theme System
- Automatic dark/light mode detection
- Manual theme toggle in header
- CSS custom properties for consistent theming
- Smooth transitions between themes

## 🔌 API Integration

### Backend Communication
```typescript
// Client sends (camelCase)
{
  agentId: "agent-123",
  userId: "user-1", 
  sessionId: "agent-123:user-1",
  message: "Hello"
}

// Backend receives (snake_case)
{
  agent_id: "agent-123",
  user_id: "user-1",
  channel_id: "agent-123:user-1",
  message: "Hello"
}
```

### Endpoints Used
- `GET /api/agents` → `GET /v1/agents` (fetch agents)
- `POST /api/chat` → `POST /v1/chat` (send message)
- `DELETE /api/chat/:sessionId/memory` → `DELETE /v1/chat/:sessionKey/memory` (clear history)

## 💾 Data Persistence

### Chat History
- **Storage**: localStorage per browser
- **Key Format**: `starships-chat-agent-{agentId}:user-{userId}`
- **Persistence**: Survives browser refresh, cleared on logout
- **Cross-tab**: Shared across browser tabs

### Session Management
- **Session ID**: `agent-{agentId}:user-{userId}`
- **Creation**: Automatic when selecting agent
- **Switching**: New session per agent
- **Cleanup**: Manual via clear chat button

## 🧪 Testing

### Current Status
- ✅ TypeScript compilation
- ✅ ESLint configuration
- 🔄 **TODO**: Unit tests with React Testing Library
- 🔄 **TODO**: Integration tests with Playwright
- 🔄 **TODO**: Accessibility testing

### Planned Test Coverage
```bash
# Future test commands
pnpm test          # Run unit tests
pnpm test:e2e      # Run E2E tests  
pnpm test:a11y     # Run accessibility tests
pnpm test:coverage # Generate coverage report
```

## 🚀 Deployment

### Production Build
```bash
pnpm build    # Creates optimized build
pnpm start    # Starts production server on port 3000
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Environment Setup
- **Development**: `http://localhost:4000`
- **Staging**: `https://staging-api.starships.ai`
- **Production**: `[API-DOMAIN-URL]`

## 🔍 Troubleshooting

### Common Issues

1. **Backend Connection Failed**
   ```bash
   # Check environment variable
   echo $NEXT_PUBLIC_API_URL
   
   # Verify backend is running
   curl http://localhost:4000/v1/agents
   ```

2. **Theme Not Working**
   - Ensure `suppressHydrationWarning` in layout.tsx
   - Check browser localStorage for theme preference
   - Verify CSS custom properties in globals.css

3. **Chat History Lost**
   - Check browser localStorage quota
   - Verify session ID consistency
   - Check for incognito/private browsing mode

4. **TypeScript Errors**
   ```bash
   # Check for compilation issues
   pnpm type-check
   
   # Update dependencies
   pnpm update
   ```

## 🛣️ Roadmap

### Phase 3 (Next)
- [ ] **Testing Setup**: Jest + React Testing Library
- [ ] **Error Boundaries**: Component crash protection
- [ ] **Accessibility**: ARIA labels, keyboard navigation
- [ ] **Performance**: React.memo, virtual scrolling
- [ ] **PWA**: Service worker, offline support

### Future Enhancements
- [ ] **Real-time**: WebSocket integration
- [ ] **Voice**: Speech-to-text input
- [ ] **Files**: Drag-and-drop file sharing
- [ ] **Export**: Download chat history
- [ ] **Multi-language**: Complete i18n
- [ ] **Mobile**: React Native app

## 📖 Documentation

- [Client Implementation Guide](../../docs/client-implementation.md) - Detailed technical documentation
- [API Design](../../docs/api-design.md) - Backend API reference
- [Architecture Overview](../../docs/architecture.md) - System design

## 🤝 Contributing

1. **Code Style**: Follow existing patterns
2. **TypeScript**: Strict mode enabled
3. **Components**: Use shadcn/ui components
4. **Text**: Add strings to `constants/text.ts`
5. **Testing**: Add tests for new features (TODO)

### Development Workflow
```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Make changes
# 3. Check types and formatting
pnpm type-check
pnpm lint:fix
pnpm format

# 4. Test changes
pnpm dev

# 5. Commit and push
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

## 📄 License

Part of the Starships.ai project. See main repository for license details.

---

**Need Help?** Check the troubleshooting section above or refer to the detailed documentation links. 