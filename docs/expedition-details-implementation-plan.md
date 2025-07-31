# Expedition Details Page Implementation Plan

## Overview
Implement a professional, robust, and elegant expedition details page featuring a chat interface and activity log. This will be a UI-only implementation initially, with API integration planned for later.

## Design Specifications

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────┐
│                         HEADER                                   │
│  Expedition Name (Large, Bold)                                   │
│  Description (Muted text)                                        │
├─────────────────────────────────────────────────┬───────────────┤
│                CHAT INTERFACE (60%)             │  ACTIVITY LOG  │
│                                                 │     (40%)      │
│  ┌─────────────────────────────────────────┐   │                │
│  │                                         │   │  Timeline of   │
│  │         Message Display Area           │   │   events and   │
│  │                                         │   │    actions     │
│  │                                         │   │                │
│  │                                         │   │                │
│  └─────────────────────────────────────────┘   │                │
│  ┌─────────────────────────────────────────┐   │                │
│  │ Input field              | Send Button  │   │                │
│  └─────────────────────────────────────────┘   │                │
└─────────────────────────────────────────────────┴───────────────┘
```

### Visual Design Principles
1. **Glassmorphism Effects**: Consistent with existing starships.ai design
2. **Dark Theme**: Professional dark background with subtle gradients
3. **Smooth Animations**: Hover effects, transitions, and loading states
4. **Typography**: Clear hierarchy with appropriate font sizes and weights
5. **Spacing**: Generous padding and consistent gaps between elements

## Component Architecture

### 1. Page Structure
```
/app/ship/[slug]/expeditions/[expeditionId]/
└── page.tsx                    # Main expedition details page
```

### 2. Component Breakdown
```
/components/expedition/details/
├── ExpeditionDetailsHeader.tsx    # Header with name & description
├── ExpeditionChat.tsx            # Chat interface component
├── ExpeditionActivityLog.tsx     # Activity timeline component
├── ChatMessage.tsx               # Individual chat message
├── ChatInput.tsx                 # Chat input with send button
└── ActivityLogItem.tsx           # Individual activity item
```

## Detailed Component Specifications

### ExpeditionDetailsHeader
```typescript
interface ExpeditionDetailsHeaderProps {
  name: string;
  description?: string;
}
```
- Display expedition name as h1 with large font
- Show description in muted text below
- Subtle background with glassmorphism effect
- Responsive padding

### ExpeditionChat
```typescript
interface Message {
  id: string;
  content: string;
  timestamp: Date;
  sender: 'user' | 'agent';
  senderName?: string;
}

interface ExpeditionChatProps {
  // No props needed - will use local state with mock data
}
```
- Scrollable message area with auto-scroll to bottom
- Message bubbles with different styles for user/agent
- Timestamps on hover
- Loading states for pending messages
- Smooth animations for new messages

### ChatInput
```typescript
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}
```
- Textarea that expands with content (max 4 lines)
- Send button with hover effects
- Keyboard shortcuts (Enter to send, Shift+Enter for new line)
- Character limit indicator
- Disabled state during message sending

### ExpeditionActivityLog
```typescript
interface ActivityItem {
  id: string;
  type: 'created' | 'agent_assigned' | 'message_sent' | 'status_changed';
  timestamp: Date;
  description: string;
  metadata?: Record<string, any>;
}

interface ExpeditionActivityLogProps {
  // No props needed - will use local state with mock data
}
```
- Vertical timeline design
- Icons for different activity types
- Relative timestamps (e.g., "2 hours ago")
- Smooth scroll with fade effects
- Grouped by date sections

### ActivityLogItem
```typescript
interface ActivityLogItemProps {
  activity: ActivityItem;
  isFirst?: boolean;
  isLast?: boolean;
}
```
- Icon based on activity type
- Connecting line to next item
- Hover effects showing full details
- Subtle animations on mount

## UI/UX Features

### Chat Interface
1. **Message States**
   - Sending (with loading indicator)
   - Sent (with checkmark)
   - Failed (with retry option)

2. **Interactive Elements**
   - Copy message on click
   - Hover to show full timestamp
   - Smooth scroll to bottom button

3. **Empty State**
   - Friendly message encouraging to start conversation
   - Subtle animation

### Activity Log
1. **Static Display**
   - Fixed list of mock activities
   - Clean timeline presentation
   - Hover effects for details

2. **Visual Design**
   - Smooth scroll within container
   - Fade effects at top/bottom
   - Clear visual hierarchy

## Styling Approach

### Color Palette
```scss
// Chat Interface
$chat-bg: rgba(15, 23, 42, 0.8);
$user-message: rgba(59, 130, 246, 0.1);
$agent-message: rgba(34, 197, 94, 0.1);
$input-bg: rgba(30, 41, 59, 0.5);

// Activity Log
$activity-bg: rgba(15, 23, 42, 0.6);
$timeline-line: rgba(71, 85, 105, 0.3);
$activity-dot: #3b82f6;
```

### Responsive Design
- Mobile: Stack layout (chat on top, activity below)
- Tablet: 70/30 split
- Desktop: 60/40 split
- Fluid typography and spacing

## Technical Implementation Details

### State Management
```typescript
// Local state only - no stores
const [messages, setMessages] = useState<Message[]>([]);
const [activities, setActivities] = useState<ActivityItem[]>([]);
const [isLoading, setIsLoading] = useState(false);
```

### Mock Data Generation
```typescript
// Generate mock data for development
const generateMockMessages = (count: number): Message[] => {
  // Implementation for realistic mock messages
};

const generateMockActivities = (count: number): ActivityItem[] => {
  // Implementation for realistic activity timeline
};
```

### Animation Libraries
- Framer Motion for smooth transitions
- CSS transitions for hover effects
- Auto-animate for list updates

## File Structure

```
packages/client/src/
├── app/
│   └── ship/
│       └── [slug]/
│           └── expeditions/
│               └── [expeditionId]/
│                   └── page.tsx
├── components/
│   └── expedition/
│       └── details/
│           ├── ExpeditionDetailsHeader.tsx
│           ├── ExpeditionChat.tsx
│           ├── ExpeditionActivityLog.tsx
│           ├── ChatMessage.tsx
│           ├── ChatInput.tsx
│           └── ActivityLogItem.tsx
└── lib/
    └── mocks/
        └── expedition-details.ts    # Mock data generators
```

## Implementation Phases

### Phase 1: Core Layout (Day 1)
- [ ] Create route structure
- [ ] Implement ExpeditionDetailsHeader
- [ ] Set up basic layout with split view
- [ ] Add responsive design

### Phase 2: Chat Interface (Day 2)
- [ ] Implement ExpeditionChat container
- [ ] Create ChatMessage component
- [ ] Build ChatInput with all features
- [ ] Add message animations

### Phase 3: Activity Log (Day 3)
- [ ] Implement ExpeditionActivityLog
- [ ] Create ActivityLogItem component
- [ ] Add timeline styling
- [ ] Implement smooth scrolling

### Phase 4: Polish & Interactions (Day 4)
- [ ] Add all animations and transitions
- [ ] Implement mock data generators
- [ ] Add loading states
- [ ] Optimize performance
- [ ] Add keyboard shortcuts

## Future API Integration Points

### Chat Interface
```typescript
// Future API calls
const sendMessage = async (content: string) => {
  const response = await api.post(`/api/expeditions/${expeditionId}/messages`, {
    content
  });
  return response.data;
};

// WebSocket for real-time updates
const connectToExpeditionChat = (expeditionId: string) => {
  // WebSocket connection logic
};
```

### Activity Log
```typescript
// Future API calls
const fetchActivities = async (expeditionId: string) => {
  const response = await api.get(`/api/expeditions/${expeditionId}/activities`);
  return response.data;
};

// Real-time activity updates
const subscribeToActivities = (expeditionId: string) => {
  // SSE or WebSocket subscription
};
```

## Accessibility Considerations

1. **Keyboard Navigation**
   - Tab through interactive elements
   - Arrow keys for message navigation
   - Escape to clear input

2. **Screen Readers**
   - Proper ARIA labels
   - Live regions for new messages
   - Semantic HTML structure

3. **Visual Accessibility**
   - High contrast mode support
   - Focus indicators
   - Readable font sizes

## Performance Considerations

1. **Component Optimization**
   - React.memo for static components
   - Efficient re-renders with proper keys

2. **CSS Performance**
   - Hardware-accelerated animations
   - Efficient transitions

3. **Clean Code**
   - Simple state management
   - No unnecessary complexity

## Success Metrics

1. **Visual Appeal**
   - Professional and modern appearance
   - Smooth interactions
   - Consistent with brand

2. **Usability**
   - Intuitive chat interface
   - Clear activity timeline
   - Responsive on all devices

3. **Performance**
   - < 100ms interaction response
   - Smooth 60fps animations
   - Efficient memory usage

This implementation plan provides a solid foundation for building a professional expedition details page that can be easily extended with API integration in the future.