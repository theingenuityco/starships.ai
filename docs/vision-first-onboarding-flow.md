# Vision-First Onboarding Flow Implementation Plan

## 🚀 Live Implementation Progress Tracker

### Overall Progress: ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

| Phase | Status | Progress | Owner | Start Date | End Date |
|-------|--------|----------|-------|------------|----------|
| **Phase 1: Foundation** | 🔴 Not Started | ⬜⬜⬜⬜⬜ 0% | - | - | - |
| **Phase 2: Integration** | 🔴 Not Started | ⬜⬜⬜⬜⬜ 0% | - | - | - |
| **Phase 3: Backend** | 🔴 Not Started | ⬜⬜⬜⬜⬜ 0% | - | - | - |
| **Phase 4: Polish** | 🔴 Not Started | ⬜⬜⬜⬜⬜ 0% | - | - | - |
| **Phase 5: Testing** | 🔴 Not Started | ⬜⬜⬜⬜⬜ 0% | - | - | - |

### Detailed Task Progress

#### Phase 1: Landing Page Sibil Integration (0/8 tasks)
- ⬜ Create `LandingSibilWidget` component
- ⬜ Implement simplified Sibil API
- ⬜ Position widget with animations
- ⬜ Vision capture & validation
- ⬜ Loading states
- ⬜ SessionStorage integration
- ⬜ CTA button transformation
- ⬜ Error handling

#### Phase 2: Session & Auth (0/15 tasks)
- ⬜ `useOnboardingSession` hook
- ⬜ Storage schema
- ⬜ Cross-tab sync
- ⬜ TTL cleanup
- ⬜ URL fallback
- ⬜ Dynamic LoginButton
- ⬜ Query param handling
- ⬜ State preservation
- ⬜ Kinde callback
- ⬜ Error recovery
- ⬜ Return flow

#### Phase 3: Modal & Backend (0/16 tasks)
- ⬜ Vision step component
- ⬜ AI name suggestions
- ⬜ Class recommendations
- ⬜ Progress indicator
- ⬜ Vision editing UI
- ⬜ Validation rules
- ⬜ Skip option
- ⬜ API endpoint modification
- ⬜ Transaction handling
- ⬜ Content filtering
- ⬜ Rate limiting

#### Phase 4: Fleet & Polish (0/8 tasks)
- ⬜ Query param parsing
- ⬜ Auto-open modal
- ⬜ Progress indicator
- ⬜ Exit confirmation
- ⬜ Existing user handling
- ⬜ Help tooltips
- ⬜ Skip option

#### Phase 5: Testing & QA (0/10 tasks)
- ⬜ Unit tests
- ⬜ Integration tests
- ⬜ E2E scenarios
- ⬜ Mobile testing
- ⬜ Performance testing
- ⬜ Security review
- ⬜ Accessibility audit
- ⬜ Bug fixes
- ⬜ Documentation
- ⬜ Deployment prep

### Legend
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- 🔵 Blocked
- ⬜ Todo
- ✅ Done

---

## Overview
Transform the user onboarding experience to be vision-first, where users enter their vision on the landing page and are guided through starship creation with their vision pre-populated. This creates a seamless journey from idea to execution.

## Current State Analysis

### Existing Components
1. **Landing Page** (`packages/client/src/app/page.tsx`)
   - Shows "Launch Your Starship" button for non-authenticated users
   - Uses `LoginButton` component with hardcoded `/fleet` redirect
   - Has typewriter effect showing different vision examples
   - No vision capture capability

2. **Authentication** (`packages/client/src/components/auth/LoginButton.tsx`)
   - Uses `LoginLink` from Kinde with `postLoginRedirectURL="/fleet"`
   - No dynamic redirect URL support
   - No vision preservation mechanism

3. **Sibil Chat** (`packages/client/src/components/sibil/SibilChatInterface.tsx`)
   - Exists as a standalone chat component
   - Requires authentication (`userId`)
   - Can handle vision refinement proposals
   - Uses Socket.IO for streaming
   - Not designed for pre-auth usage

4. **Fleet Page** (`packages/client/src/app/fleet/page.tsx`)
   - Protected by `AuthGate` component
   - Shows `StarshipDashboard` with existing starships
   - No onboarding flow detection

5. **Starship Creation** (`packages/client/src/components/command-deck/starship/StarshipCreateModal.tsx`)
   - Multi-step wizard (3 steps: Name, Class Selection, Review)
   - No vision field currently
   - Creates starship with name and class only
   - Uses `useStarshipStore` for state management

6. **Vision Model** (`packages/models/src/types.ts`)
   - Vision entity has: `statement`, `confidence`, `refinementCount`, `lastRefined`
   - Linked to `starshipId` (requires starship to exist first)
   - No temporary/pending vision storage

## Proposed User Journey

### Phase 1: Landing Page Vision Capture
**User State:** Non-authenticated visitor

1. User lands on homepage
2. Sibil widget appears above the hero section (with subtle animation)
3. Sibil prompts: "What's your vision? Tell me what you want to build..."
4. User enters their vision statement (min 20 chars, max 500 chars)
5. Sibil analyzes and responds: "Awesome! To help you achieve `[AI-generated summary]`, let's create your starship. Click below to begin!"
6. Store vision and Sibil's analysis in sessionStorage
7. Transform "Launch Your Starship" button to "Create My Starship" with pulsing effect

### Phase 2: Authentication Flow
**Trigger:** User clicks "Create My Starship" after vision entry

1. Store complete onboarding state before redirect
2. Redirect to Kinde authentication with custom return URL
3. After successful auth, Kinde redirects to `/fleet?onboarding=true`
4. Fleet page detects onboarding param and retrieves stored vision

### Phase 3: Starship Creation with Vision
**Location:** Fleet page with modal auto-opened

1. Fleet page detects `onboarding=true` query param
2. Auto-open `StarshipCreateModal` with vision pre-filled
3. Modified wizard flow (4 steps):
   - Step 1: Vision Review & Refinement (NEW)
   - Step 2: Starship Name (can be AI-suggested based on vision)
   - Step 3: Class Selection (with AI recommendation)
   - Step 4: Review & Create
4. Create starship with vision in single transaction

### Phase 4: Post-Creation Onboarding
**After starship creation:**

1. Redirect to `/ship/[slug]/vision-chamber`
2. Show welcome message: "Welcome aboard, Captain! Your vision has been set."
3. Trigger celebratory animation
4. Show quick tour tooltips for key features

## Implementation Tasks

### 1. Landing Page Sibil Integration
- [ ] Create `LandingSibilWidget` component (non-authenticated version)
- [ ] Implement simplified Sibil API for pre-auth users
- [ ] Position above hero section with slide-in animation
- [ ] Implement vision capture and validation (20-500 chars)
- [ ] Add "analyzing vision" loading state
- [ ] Store vision + AI analysis in sessionStorage
- [ ] Transform CTA button after vision entry
- [ ] Handle Sibil API errors gracefully

### 2. Session Storage Management
- [ ] Create `useOnboardingSession` hook with TypeScript types
- [ ] Implement storage schema versioning
- [ ] Add encryption for sensitive data
- [ ] Handle cross-tab synchronization
- [ ] Add automatic cleanup (TTL: 2 hours)
- [ ] Implement fallback to URL state (base64 encoded)
- [ ] Add storage quota detection
- [ ] Create migration strategy for schema changes

### 3. Authentication Flow Updates
- [ ] Create dynamic `LoginButton` component
- [ ] Implement `postLoginRedirectURL` with query params
- [ ] Add onboarding state preservation
- [ ] Handle Kinde callback properly
- [ ] Test with different auth providers
- [ ] Add auth error recovery
- [ ] Implement "return to vision" flow

### 4. StarshipCreateModal Enhancement
- [ ] Add Vision step as Step 1 (total 4 steps)
- [ ] Create `VisionReviewStep` component
- [ ] Implement AI-powered name suggestions
- [ ] Add class recommendation based on vision
- [ ] Update progress indicator for 4 steps
- [ ] Add vision editing with diff display
- [ ] Implement vision validation rules
- [ ] Add "Skip vision" option for edge cases

### 5. Backend Integration
- [ ] Modify `POST /api/starships` to accept vision
- [ ] Create transaction for starship + vision creation
- [ ] Add vision validation middleware
- [ ] Implement vision character limits
- [ ] Add profanity/content filtering
- [ ] Create vision metrics tracking
- [ ] Add rollback mechanism for failed creation
- [ ] Implement rate limiting for vision API

### 6. Fleet Page Onboarding Detection
- [ ] Parse and validate query parameters
- [ ] Auto-open modal with animation
- [ ] Add onboarding progress indicator
- [ ] Implement "exit onboarding" confirmation
- [ ] Handle existing user with starships
- [ ] Add analytics tracking
- [ ] Create help tooltips
- [ ] Implement skip onboarding option

### 7. Pre-Auth Sibil API
- [ ] Create `/api/sibil/preview` endpoint
- [ ] Use GPT-3.5-turbo for cost optimization
- [ ] Implement rate limiting (5 requests/minute)
- [ ] Add simple vision analysis without user context
- [ ] Cache responses for common visions
- [ ] Add fallback responses for API failures

## Technical Architecture

### State Management
```typescript
interface OnboardingState {
  // Vision Data
  pendingVision: string | null;
  visionAnalysis: {
    summary: string;
    suggestedName: string;
    recommendedClass: 'scout' | 'cruiser';
    confidence: number;
    keywords: string[];
  } | null;
  
  // Flow State
  isOnboarding: boolean;
  onboardingStep: 'vision' | 'auth' | 'creation' | 'complete';
  startedAt: number;
  
  // Sibil Context
  sibilSessionId: string;
  sibilMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  
  // Error Handling
  lastError: string | null;
  retryCount: number;
}
```

### Storage Schema
```typescript
interface StorageSchema {
  version: number; // Current: 1
  data: OnboardingState;
  metadata: {
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    deviceId: string;
  };
}
```

### API Endpoints

#### 1. Pre-Auth Vision Analysis
```typescript
POST /api/sibil/preview
Request: {
  vision: string;
  sessionId?: string;
}
Response: {
  analysis: VisionAnalysis;
  sessionId: string;
  suggestions: string[];
}

// Implementation: Use GPT-3.5-turbo for cost savings
const model = 'gpt-3.5-turbo'; // ~10x cheaper than GPT-4
```

#### 2. Enhanced Starship Creation
```typescript
POST /api/starships
Request: {
  name: string;
  class: 'scout' | 'cruiser';
  vision?: {
    statement: string;
    confidence?: number;
    sibilSessionId?: string;
  };
}
Response: {
  starship: Starship;
  vision: Vision;
}
```

#### 3. Onboarding Metrics
```typescript
POST /api/analytics/onboarding
Request: {
  event: 'vision_entered' | 'auth_started' | 'starship_created' | 'onboarding_complete';
  data: any;
  sessionId: string;
}
```

## Critical Edge Cases & Solutions

### Authentication Edge Cases

#### Scenario 1: User Already Authenticated
**Problem:** User enters vision but is already logged in
**Solution:** 
- Check auth status before showing Sibil
- If authenticated, redirect directly to `/fleet?onboarding=true`
- Skip Kinde redirect entirely

#### Scenario 2: User Has Existing Starships
**Problem:** Returning user shouldn't see onboarding
**Solution:**
- Check starship count on landing page load
- If starships > 0, show normal flow
- Add "Create with Vision" as optional button

#### Scenario 3: Auth Provider Timeout
**Problem:** Kinde auth times out or fails
**Solution:**
- Preserve vision for 24 hours
- Show "Continue where you left off" on return
- Email recovery link with vision preserved

### Storage Edge Cases

#### Scenario 4: Session Storage Unavailable
**Problem:** Browser blocks storage or quota exceeded
**Solution:**
```typescript
// Fallback chain:
1. Try sessionStorage
2. Fall back to localStorage  
3. Fall back to URL state (compressed)
4. Fall back to cookie (vision ID only)
5. Show manual input as last resort
```

#### Scenario 5: Multiple Tabs/Windows
**Problem:** User opens multiple tabs during onboarding
**Solution:**
- Use BroadcastChannel API for tab sync
- Lock onboarding to single tab
- Show "Onboarding in progress in another tab" message

#### Scenario 6: Browser Crash/Refresh
**Problem:** User refreshes or browser crashes mid-flow
**Solution:**
- Save state after every step
- Implement state recovery on page load
- Show "Continue onboarding?" prompt

### Vision Edge Cases

#### Scenario 7: Inappropriate Vision Content
**Problem:** User enters inappropriate/harmful content
**Solution:**
- Simple keyword filter for obvious violations
- Basic profanity check using a lightweight library
- Gentle redirect: "Let's focus on building something positive!"
- No complex moderation API to keep it simple

#### Scenario 8: Vision Too Vague
**Problem:** User enters "make money" or "be successful"
**Solution:**
- Sibil prompts for more details
- Provide examples of good visions
- Minimum complexity requirement

#### Scenario 9: Duplicate Vision
**Problem:** User enters same vision as existing starship
**Solution:**
- Check for duplicates before creation
- Warn user about existing similar vision
- Allow continuation with confirmation

### API Edge Cases

#### Scenario 10: Sibil API Failure
**Problem:** Pre-auth Sibil endpoint fails
**Solution:**
```typescript
const fallbackResponses = {
  generic: "That's an interesting vision! Let's create your starship to make it reality.",
  saas: "Perfect for a Scout class starship! Let's get started.",
  platform: "This sounds like a Cruiser class mission! Let's begin."
};
```

#### Scenario 11: Rate Limiting Hit
**Problem:** User hits rate limit on vision API
**Solution:**
- Show cooldown timer
- Allow manual progression
- Cache successful responses

#### Scenario 12: Network Interruption
**Problem:** Network fails during critical operations
**Solution:**
- Implement retry with exponential backoff
- Queue operations for when network returns
- Show offline mode UI

### User Behavior Edge Cases

#### Scenario 13: Vision Spam/Testing
**Problem:** User enters "test", "asdf", etc.
**Solution:**
- Detect test patterns
- Gently guide to real vision
- Block after 3 test attempts

#### Scenario 14: Back Button Usage
**Problem:** User uses browser back during flow
**Solution:**
- Implement proper history management
- Warn before leaving onboarding
- Allow resume from any step

#### Scenario 15: Direct URL Access
**Problem:** User bookmarks/shares onboarding URL
**Solution:**
- Validate all required state present
- Redirect to start if incomplete
- Support deep linking where possible

## UI/UX Specifications

### Landing Page Sibil Widget Design
```
┌─────────────────────────────────────────┐
│  🤖 Sibil AI              [Minimize -]  │
├─────────────────────────────────────────┤
│                                         │
│  "What's your vision?"                  │
│  "Tell me what you want to build..."    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Type your vision here...         │   │
│  │                                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  [Examples ↓]            [Send →]       │
│                                         │
│  Character count: 0/500                 │
└─────────────────────────────────────────┘

Example visions (on click):
• "I want to build the best cosmic TV in the world"
• "Create an AI-powered learning platform for kids"
• "Launch a marketplace for sustainable products"
• "Build a tool that helps developers ship faster"
```

### Component States
```typescript
type WidgetState = 
  | 'greeting'      // Initial prompt
  | 'listening'     // User typing
  | 'analyzing'     // Processing vision
  | 'responding'    // Showing response
  | 'ready'         // Ready to proceed
  | 'error'         // Error state
  | 'minimized';    // Collapsed view
```

### Animation Sequences

#### Entry Animation (Page Load)
```css
1. Delay: 2s after page load
2. Slide in from right (transform: translateX(100%))
3. Duration: 0.5s ease-out
4. Subtle bounce effect at end
5. Glow effect on appearance
```

#### Interaction Animations
- **Typing:** Pulse effect on input border
- **Sending:** Button transforms to loading spinner
- **Analyzing:** Shimmer effect on Sibil avatar
- **Response:** Typewriter effect for Sibil's message
- **CTA Transform:** "Launch" button morphs to "Create" with pulse

### Responsive Breakpoints
```scss
// Mobile (< 640px)
- Full width widget
- Fixed bottom position
- Larger touch targets (min 44px)
- Simplified animations

// Tablet (640px - 1024px)  
- 80% width widget
- Centered positioning
- Standard animations

// Desktop (> 1024px)
- 400px fixed width
- Right-side positioning
- Full animations
- Hover effects enabled
```

### Accessibility Requirements
- [ ] ARIA labels for all interactive elements
- [ ] Keyboard navigation support (Tab, Enter, Escape)
- [ ] Screen reader announcements for state changes
- [ ] Respect prefers-reduced-motion
- [ ] Minimum contrast ratio 4.5:1
- [ ] Focus indicators visible
- [ ] Alternative text for emojis

## Success Metrics & KPIs

### Metrics (Simplified - No Analytics Tracking)
Since we're not using analytics tools, we'll track basic success metrics through:

1. **Server Logs**
   - Vision API call success/failure rates
   - Starship creation success rates
   - Error frequencies

2. **Database Queries** (Manual Checks)
   - Vision-to-starship conversion rate
   - Average vision length
   - Time from vision to starship creation

3. **User Feedback**
   - Direct user reports
   - Support tickets
   - Team testing observations

## Deployment Strategy

### Feature Flags
```typescript
const FLAGS = {
  ENABLE_VISION_ONBOARDING: false,     // Master switch
  ENABLE_SIBIL_WIDGET: false,          // Landing Sibil
  ENABLE_VISION_STEP: false,           // Modal vision step
  ENABLE_AI_SUGGESTIONS: false,        // AI-powered suggestions
  VISION_ONBOARDING_PERCENTAGE: 0,     // % of users in test
};
```

### Rollout Plan
1. **Week 1**: Internal testing (team only)
2. **Week 2**: 5% of new users
3. **Week 3**: 25% of new users
4. **Week 4**: 50% of new users
5. **Week 5**: 100% deployment

### Rollback Criteria
- Conversion rate drops > 20%
- Error rate > 5%
- Page load time increases > 500ms
- Critical bug discovered

## Testing Strategy

### Unit Tests
```typescript
describe('LandingSibilWidget', () => {
  test('renders initial greeting');
  test('validates vision length');
  test('handles API errors');
  test('stores vision in session');
});

describe('useOnboardingSession', () => {
  test('persists across page refresh');
  test('handles storage quota exceeded');
  test('syncs across tabs');
  test('cleans up after TTL');
});
```

### Integration Tests
- Auth flow with vision preservation
- Modal auto-open on fleet page
- Vision creation with starship
- Error recovery flows

### E2E Test Scenarios
1. **Happy Path**: Vision → Auth → Create → Success
2. **Resume Flow**: Abandon and return
3. **Error Recovery**: API failures at each step
4. **Mobile Journey**: Touch interactions
5. **Accessibility**: Keyboard-only navigation

### Performance Tests
- Widget load time < 200ms
- API response time < 500ms
- No memory leaks in long sessions
- Storage usage < 50KB

## Security Considerations

### Data Protection
- [ ] Sanitize vision input (XSS prevention)
- [ ] Validate vision length server-side
- [ ] Rate limit by IP and session
- [ ] Simple profanity filter (no external API)
- [ ] Clear data after successful creation

### Privacy
- [ ] No PII in vision statements
- [ ] No analytics tracking (per your preference)
- [ ] Clear vision data after use

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- Landing Sibil widget component
- Basic vision capture
- Session storage hook
- UI animations

### Phase 2: Integration (Days 3-4)
- Auth flow modifications
- Fleet page detection
- Modal enhancement
- Vision step component

### Phase 3: Backend (Days 5-6)
- API endpoint creation
- Database modifications
- Transaction handling
- Validation logic

### Phase 4: Polish (Days 7-8)
- Error handling
- Edge cases
- Performance optimization
- Accessibility

### Phase 5: Testing (Days 9-10)
- Unit test suite
- Integration tests
- E2E scenarios
- Bug fixes

## Dependencies & Risks

### Technical Dependencies
- Kinde Auth SDK version compatibility
- Socket.IO for Sibil streaming
- Browser storage API availability
- AI model API stability

### Risks & Mitigations
| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Sibil API downtime | High | Low | Fallback responses ready |
| Storage quota issues | Medium | Medium | Multiple fallback layers |
| Auth provider changes | High | Low | Abstract auth interface |
| Poor vision quality | Medium | High | Validation & examples |
| Mobile compatibility | Medium | Medium | Thorough device testing |

## Questions Resolved

1. **Sibil Pre-Auth Model**: GPT-3.5-turbo for cost optimization
2. **Vision Examples**: "I want to build the best cosmic TV in the world" + 3 others
3. **Starship Limits**: No limits on starship creation
4. **Analytics**: No analytics tracking (keep it simple)
5. **Content Moderation**: Simple keyword filter, no external API

## Simplified Implementation Approach

### Keep It Simple Principles
1. **No External Services**: No analytics, no complex moderation APIs
2. **Cost Optimization**: GPT-3.5-turbo for pre-auth Sibil
3. **Basic Validation**: Simple keyword filters, no ML moderation
4. **Minimal Dependencies**: Use existing libraries where possible
5. **Progressive Enhancement**: Ship basic version, enhance later

### MVP Features Only
- ✅ Basic vision capture on landing
- ✅ Vision persistence through auth
- ✅ Pre-filled vision in creation modal
- ✅ Simple profanity filter
- ✅ Error recovery basics

### Defer for Later
- ❌ Complex analytics tracking
- ❌ A/B testing framework
- ❌ Advanced content moderation
- ❌ Multi-language support
- ❌ Voice input for vision

## Environment Configuration

### Required Environment Variables
```bash
# .env.local (client)
NEXT_PUBLIC_ENABLE_VISION_ONBOARDING=false
NEXT_PUBLIC_ENABLE_SIBIL_WIDGET=false
NEXT_PUBLIC_ENABLE_VISION_STEP=false
NEXT_PUBLIC_ENABLE_AI_SUGGESTIONS=false
NEXT_PUBLIC_VISION_ONBOARDING_PERCENTAGE=0
NEXT_PUBLIC_SIBIL_PREVIEW_TIMEOUT=5000

# .env (server)
OPENAI_API_KEY=your_key_here
SIBIL_PREVIEW_MODEL=gpt-3.5-turbo
VISION_RATE_LIMIT_PER_MINUTE=5
VISION_MIN_LENGTH=20
VISION_MAX_LENGTH=500
SESSION_TTL_HOURS=2
```

### Feature Flag Usage
```typescript
// In components
import { FLAGS } from '@/lib/onboarding/constants';

if (FLAGS.ENABLE_VISION_ONBOARDING) {
  // Show new onboarding flow
}

// Progressive rollout
const shouldShowOnboarding = () => {
  const random = Math.random() * 100;
  return random < FLAGS.VISION_ONBOARDING_PERCENTAGE;
};
```

## Quick Reference Commands

### Development
```bash
# Start development
pnpm dev

# Run with feature flags
NEXT_PUBLIC_ENABLE_VISION_ONBOARDING=true pnpm dev

# Test storage fallbacks
# Open DevTools > Application > Storage > Clear
```

### Testing
```bash
# Run unit tests
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Test specific component
pnpm test LandingSibilWidget
```

### Deployment
```bash
# Build for production
pnpm build

# Preview production build
pnpm preview

# Deploy with feature flags off
NEXT_PUBLIC_ENABLE_VISION_ONBOARDING=false pnpm build
```

## Progress Update Instructions

### How to Update Progress Tracker
1. Edit this document's progress section
2. Change ⬜ to ✅ for completed tasks
3. Update percentages: `⬜⬜⬜⬜⬜` to `✅✅⬜⬜⬜` (40%)
4. Change phase status: 🔴 → 🟡 → 🟢
5. Add dates and owner names
6. Commit with message: `chore: update vision onboarding progress - [task name]`

### Daily Standup Template
```markdown
## Vision Onboarding - Day X Update

**Yesterday:**
- Completed: [task]
- Progress: [description]

**Today:**
- Working on: [task]
- Goal: [specific outcome]

**Blockers:**
- [Any issues]

**Progress:** Phase X - XX% complete
```

## Communication Channels

### For Questions
- Technical: Create issue in repo with `vision-onboarding` label
- Design: Comment on Figma designs (if applicable)
- General: Team Slack channel

### Status Updates
- Daily: Update progress tracker in this doc
- Weekly: Demo progress to stakeholders
- Completion: Full demo and handoff

## Next Steps

1. ✅ Review and approve enhanced plan
2. ✅ Continue implementation on `onboardingflow` branch (NO BRANCH SWITCHING)
3. Set up feature flags in environment
4. Implement Phase 1 components
5. Daily progress reviews
6. Stakeholder demo after Phase 2

## Final Checklist Before Starting

- [ ] Plan reviewed and approved
- [ ] Team assigned to phases
- [ ] Environment variables configured
- [ ] ✅ Working on `onboardingflow` branch (NO NEW BRANCHES)
- [ ] Dependencies installed
- [ ] Testing environment ready
- [ ] Progress tracker bookmarked
- [ ] Communication channels confirmed

---

**Document Version:** 2.0
**Last Updated:** [Current Date]
**Owner:** Development Team
**Status:** Ready for Implementation

## File Structure & Component Reference

### New Files to Create
```
packages/client/src/
├── components/
│   ├── onboarding/
│   │   ├── LandingSibilWidget.tsx      # Pre-auth Sibil widget
│   │   ├── VisionReviewStep.tsx        # Modal vision step
│   │   ├── OnboardingProgress.tsx      # Progress indicator
│   │   └── VisionExamples.tsx          # Example visions dropdown
│   ├── auth/
│   │   └── DynamicLoginButton.tsx      # Enhanced login with params
│   └── vision/
│       └── VisionInput.tsx             # Reusable vision input
├── hooks/
│   ├── useOnboardingSession.ts         # Session management
│   ├── useVisionValidation.ts          # Vision validation
│   └── useOnboardingFlow.ts            # Flow orchestration
├── lib/
│   ├── onboarding/
│   │   ├── storage.ts                  # Storage utilities
│   │   ├── validation.ts               # Validation rules
│   │   └── constants.ts                # Onboarding constants
│   └── sibil/
│       └── preview-api.ts              # Pre-auth Sibil API

packages/server/src/
├── api/
│   ├── sibil/
│   │   └── preview.ts                  # Pre-auth endpoint
│   └── starships/
│       └── create-with-vision.ts       # Enhanced creation
└── middleware/
    └── vision-validation.ts            # Vision middleware
```

### Files to Modify
```
packages/client/src/
├── app/page.tsx                        # Add LandingSibilWidget
├── app/fleet/page.tsx                  # Add onboarding detection
├── components/
│   ├── auth/LoginButton.tsx            # Make dynamic
│   └── command-deck/starship/
│       └── StarshipCreateModal.tsx     # Add vision step

packages/models/src/
├── types.ts                            # Add PendingVision type
└── repositories/
    └── StarshipRepository.ts           # Add createWithVision
```

## Component Specifications

### 1. LandingSibilWidget Component
```typescript
interface LandingSibilWidgetProps {
  onVisionSubmit: (vision: string) => void;
  onMinimize?: () => void;
  className?: string;
}

interface WidgetState {
  status: 'greeting' | 'listening' | 'analyzing' | 'responding' | 'ready' | 'error' | 'minimized';
  vision: string;
  analysis: VisionAnalysis | null;
  error: string | null;
  characterCount: number;
  showExamples: boolean;
}

// Key methods:
- validateVision(vision: string): ValidationResult
- analyzeVision(vision: string): Promise<VisionAnalysis>
- handleSubmit(): void
- storeInSession(): void
- transformCTAButton(): void
```

### 2. useOnboardingSession Hook
```typescript
interface OnboardingSession {
  vision: string | null;
  analysis: VisionAnalysis | null;
  step: OnboardingStep;
  startedAt: number;
  sessionId: string;
}

interface UseOnboardingSessionReturn {
  session: OnboardingSession | null;
  saveVision: (vision: string, analysis: VisionAnalysis) => void;
  updateStep: (step: OnboardingStep) => void;
  clearSession: () => void;
  restoreSession: () => OnboardingSession | null;
  isExpired: boolean;
}

// Storage priority:
1. sessionStorage (primary)
2. localStorage (fallback)
3. URL state (emergency)
4. Cookie (last resort)
```

### 3. VisionReviewStep Component
```typescript
interface VisionReviewStepProps {
  initialVision: string;
  analysis: VisionAnalysis;
  onConfirm: (vision: string) => void;
  onEdit: () => void;
  onSkip?: () => void;
}

// Features:
- Display original vision
- Show AI analysis/summary
- Edit button with inline editing
- Character counter
- Validation feedback
- Skip option (if allowed)
```

## Implementation Checklist

### Pre-Implementation Setup
- [ ] Create feature branch: `git checkout -b feature/vision-first-onboarding`
- [ ] Set up feature flags in `.env`
- [ ] Create folder structure
- [ ] Install any needed dependencies

### Phase 1 Implementation Details
```typescript
// 1. LandingSibilWidget.tsx structure
export const LandingSibilWidget: React.FC = () => {
  // State management
  const [widgetState, setWidgetState] = useState<WidgetState>()
  const { saveVision } = useOnboardingSession()
  
  // Animation refs
  const widgetRef = useRef<HTMLDivElement>(null)
  
  // Core functions
  const handleVisionSubmit = async (vision: string) => {
    // 1. Validate
    // 2. Call preview API
    // 3. Store in session
    // 4. Transform CTA
  }
  
  return (
    <motion.div
      ref={widgetRef}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ delay: 2, duration: 0.5 }}
    >
      {/* Widget content */}
    </motion.div>
  )
}
```

### Phase 2 Implementation Details
```typescript
// 2. Dynamic LoginButton.tsx
interface DynamicLoginButtonProps {
  postLoginRedirectURL?: string;
  preserveOnboarding?: boolean;
  children: React.ReactNode;
}

export const DynamicLoginButton = ({ 
  postLoginRedirectURL = '/fleet',
  preserveOnboarding = false,
  children 
}: DynamicLoginButtonProps) => {
  const { session } = useOnboardingSession();
  
  // Build redirect URL with params
  const redirectUrl = preserveOnboarding && session
    ? `${postLoginRedirectURL}?onboarding=true`
    : postLoginRedirectURL;
    
  return (
    <LoginLink postLoginRedirectURL={redirectUrl}>
      {children}
    </LoginLink>
  );
}
```

## Troubleshooting Guide

### Common Issues & Solutions

#### Issue 1: Vision not persisting through auth
**Symptoms:** Vision lost after Kinde redirect
**Solutions:**
1. Check sessionStorage availability
2. Verify storage key consistency
3. Check TTL hasn't expired
4. Try localStorage fallback

#### Issue 2: Modal not auto-opening
**Symptoms:** Fleet page loads but no modal
**Solutions:**
1. Verify query params present
2. Check useEffect dependencies
3. Ensure modal state initialized
4. Check for race conditions

#### Issue 3: Sibil API timeout
**Symptoms:** Widget stuck in "analyzing" state
**Solutions:**
1. Implement 5s timeout
2. Show fallback response
3. Allow manual progression
4. Check rate limits

#### Issue 4: Mobile keyboard issues
**Symptoms:** Widget jumps when keyboard opens
**Solutions:**
1. Use `position: fixed` on mobile
2. Adjust viewport meta tag
3. Handle resize events
4. Test on real devices

## Testing Checklist

### Manual Testing Script
1. **Fresh User Flow**
   - [ ] Clear all storage
   - [ ] Load landing page
   - [ ] Wait for Sibil widget
   - [ ] Enter vision
   - [ ] Click transformed button
   - [ ] Complete auth
   - [ ] Verify modal opens
   - [ ] Check vision pre-filled
   - [ ] Complete creation
   - [ ] Verify vision in chamber

2. **Error Recovery**
   - [ ] Kill network during analysis
   - [ ] Refresh during each step
   - [ ] Use back button
   - [ ] Open multiple tabs
   - [ ] Fill storage quota

3. **Edge Cases**
   - [ ] Enter 19 chars (too short)
   - [ ] Enter 501 chars (too long)
   - [ ] Enter profanity
   - [ ] Submit empty vision
   - [ ] Rapid submissions

## Appendix: Code Examples

### Vision Validation with Simple Profanity Check
```typescript
// Simple profanity list - no external API needed
const BLOCKED_WORDS = ['spam', 'test', 'asdf', 'xxx'];

const validateVision = (vision: string): ValidationResult => {
  const trimmed = vision.trim().toLowerCase();
  
  if (trimmed.length < 20) {
    return { valid: false, error: 'Vision too short - tell us more!' };
  }
  
  if (trimmed.length > 500) {
    return { valid: false, error: 'Vision too long - keep it concise!' };
  }
  
  // Simple profanity check
  if (BLOCKED_WORDS.some(word => trimmed.includes(word))) {
    return { valid: false, error: "Let's focus on building something positive!" };
  }
  
  // Check for test/spam patterns
  if (/^(test|testing|asdf|qwerty|123)/i.test(trimmed)) {
    return { valid: false, error: 'Please enter a real vision for your project' };
  }
  
  return { valid: true };
};
```

### Storage Fallback Chain
```typescript
const storeVision = async (vision: string): Promise<boolean> => {
  // Try sessionStorage first
  try {
    sessionStorage.setItem('pendingVision', vision);
    return true;
  } catch (e) {
    console.warn('SessionStorage failed:', e);
  }
  
  // Try localStorage
  try {
    localStorage.setItem('pendingVision', vision);
    return true;
  } catch (e) {
    console.warn('LocalStorage failed:', e);
  }
  
  // Try URL state
  try {
    const encoded = btoa(vision);
    history.replaceState({ vision: encoded }, '');
    return true;
  } catch (e) {
    console.warn('URL state failed:', e);
  }
  
  // Last resort: cookie
  try {
    document.cookie = `vision=${vision}; max-age=7200`;
    return true;
  } catch (e) {
    console.error('All storage methods failed');
    return false;
  }
};
```