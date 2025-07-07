# Starships AI - Client

A modern React-based starship mission control interface with clean navigation architecture and sophisticated consciousness planning tools, built with Next.js 15, TypeScript, and shadcn/ui.

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
- **State Management**: Zustand with sophisticated starship store
- **Animations**: Framer Motion for smooth transitions
- **Theme**: next-themes for dark/light mode
- **Authentication**: Kinde integration

### Key Features
- ✅ **Clean Navigation Architecture**: Extracted from command-deck spaghetti into dedicated components
- ✅ **Vision Chamber Integration**: Full-screen consciousness planning with auto-influence engine
- ✅ **Command Deck**: Mission control dashboard (placeholder for future expansion)
- ✅ **Responsive Design**: Mobile-first with adaptive layouts
- ✅ **Modern UI**: shadcn/ui components with glassmorphism effects
- ✅ **Type Safety**: Full TypeScript with strict mode
- ✅ **State Persistence**: Store integration maintains state across navigation

## 📁 Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── client-layout.tsx        # Main layout with navigation sidebar
│   ├── command-deck/page.tsx    # Command Deck dashboard page
│   ├── vision-chamber/page.tsx  # Vision Chamber full-screen page
│   ├── crew/page.tsx            # Crew management page
│   ├── drive/page.tsx           # Starship drive systems page
│   ├── expeditions/page.tsx     # Expeditions management page
│   ├── logbook/page.tsx         # Mission logbook page
│   └── sibil/page.tsx           # AI assistant page
├── components/
│   ├── navigation/              # Clean navigation system
│   │   ├── Navigation.tsx       # Main navigation component
│   │   ├── NavigationSection.tsx # Section groupings component
│   │   ├── NavigationItem.tsx   # Individual nav items component
│   │   └── StarshipSelector.tsx # Starship selection dropdown
│   ├── consciousness/           # Vision Chamber implementation
│   │   └── VisionChamber/       # 1,500+ lines sophisticated implementation
│   │       ├── index.tsx        # Main Vision Chamber component
│   │       ├── VisionCore/      # Core vision management
│   │       ├── GoalsMatrix/     # Goals CRUD interface
│   │       ├── ConstraintsGrid/ # Constraints management
│   │       └── shared/          # Auto-influence engine & types
│   ├── command-deck/            # Command Deck functionality
│   │   ├── dashboard/           # Dashboard modules
│   │   └── modules/             # Quick action modules
│   ├── auth/                    # Authentication components
│   ├── ui/                      # shadcn/ui components
│   └── theme-provider.tsx       # Theme system provider
├── store/
│   └── starship-store.ts        # Zustand store (556 lines)
├── hooks/                       # Custom React hooks
└── lib/                         # Utilities and configurations
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

## 🧭 Navigation Architecture (Recently Cleaned)

### Before: Spaghetti Architecture
```
❌ src/components/command-deck/
├── NavigationBridge.tsx           # Unnecessary wrapper
├── CommandDeckNavigation.tsx      # Unnecessary wrapper
├── modules/NavigationModule.tsx   # Navigation mixed in wrong folder
└── StarshipSelector.tsx           # Navigation concern in command-deck
```

### After: Clean Separation
```
✅ src/components/navigation/       # Dedicated navigation folder
├── Navigation.tsx                 # Main navigation component
├── NavigationSection.tsx         # Section groupings
├── NavigationItem.tsx            # Individual nav items
└── StarshipSelector.tsx          # Moved to correct location

✅ src/components/command-deck/    # Pure command deck functionality
├── dashboard/                    # Dashboard modules
└── modules/                      # Quick action modules
```

### Route Structure
- **Command Deck**: `/command-deck` - Mission control dashboard
- **Vision Chamber**: `/vision-chamber` - Consciousness planning (replaces `/core`)
- **Core Systems**: `/crew`, `/drive` - Starship management
- **Operations**: `/expeditions`, `/logbook`, `/sibil` - Mission operations

## 🧠 Vision Chamber Integration

### Features
- **Auto-Influence Engine**: 342-line pattern matching system for intelligent suggestions
- **Goals Matrix**: Full CRUD interface for mission objectives
- **Constraints Grid**: Category-based constraint management
- **Maker-Checker Flow**: Change management and approval workflows
- **Real-time Suggestions**: Context-aware recommendations based on vision changes

### State Management
- **Zustand Store**: 556-line sophisticated state management
- **Persistence**: State maintained across navigation changes
- **Auto-Sync**: Real-time updates between components

## 💾 Data Persistence

### Vision & Goals
- **Storage**: Zustand store with persistence
- **Components**: Vision statements, goals, constraints
- **Auto-influence**: Suggestion engine with pattern matching
- **State Sync**: Maintained across route navigation

### Starship Management
- **Starship Selection**: Multi-starship support with status tracking
- **Power Management**: Real-time power level monitoring
- **Expedition Tracking**: Active expedition counting
- **Insights**: AI-generated insights and recommendations

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
- **Production**: `https://api.starships.ai`

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