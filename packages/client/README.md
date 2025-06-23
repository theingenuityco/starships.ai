# Starships AI Client

A modern, responsive web application for interacting with AI agents built with Next.js 15, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build && pnpm start
```

The application will be running at [http://localhost:3000](http://localhost:3000).

## 🛠 Prerequisites

- Node.js 18+
- pnpm package manager
- Backend server running on port 3001

## 📋 Features

- **Agent Selection**: Browse and select from available AI agents
- **Real-time Chat**: Interactive chat interface with auto-scrolling
- **Responsive Design**: Works on desktop, tablet, and mobile
- **TypeScript**: Full type safety throughout the application
- **Modern UI**: Clean, accessible interface with smooth animations

## 🏗 Architecture

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS with shadcn/ui patterns
- **State Management**: React hooks
- **API Client**: Axios with typed endpoints
- **Icons**: Lucide React

## 📁 Project Structure

```
src/
├── app/                    # Next.js pages and layouts
├── components/
│   ├── agents/            # Agent selection components
│   ├── chat/              # Chat interface components
│   └── ui/                # Reusable UI components
├── lib/
│   ├── api.ts             # API client
│   └── utils.ts           # Utility functions
└── hooks/                 # Custom React hooks
```

## 🔧 Configuration

Create `.env.local` in the package root:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 🎨 Design System

- **Colors**: CSS custom properties for theme support
- **Typography**: Inter font family
- **Spacing**: Tailwind's spacing scale
- **Components**: Consistent shadcn/ui patterns

## 📚 Documentation

See [docs/client-implementation.md](../../docs/client-implementation.md) for detailed documentation.

## 🧪 Development

```bash
# Type checking
pnpm type-check

# Linting
pnpm lint

# Build analysis
pnpm build --analyze
```

## 🚢 Deployment

The app is ready for deployment on:
- Vercel (recommended)
- Netlify
- Docker containers

## 📄 License

Part of the Starships AI platform. 