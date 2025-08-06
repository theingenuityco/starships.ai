# Vision-First Onboarding Flow Implementation Plan

## Overview
Transform the user onboarding experience to be vision-first, where users enter their vision on the landing page and are guided through starship creation with their vision pre-populated.

## Current State Analysis

### Existing Components
1. **Landing Page** (`packages/client/src/app/page.tsx`)
   - Shows "Launch Your Starship" button for non-authenticated users
   - Redirects to Kinde authentication
   - No vision capture capability

2. **Sibil Chat** (`packages/client/src/components/sibil/SibilChatInterface.tsx`)
   - Exists as a standalone chat component
   - Can handle vision refinement proposals
   - Not integrated into landing page

3. **Fleet Page** (`packages/client/src/app/fleet/page.tsx`)
   - Shows StarshipDashboard with existing starships
   - Has create modal without vision field

4. **Starship Creation** (`packages/client/src/components/command-deck/starship/StarshipCreateModal.tsx`)
   - Multi-step wizard (3 steps)
   - No vision field currently
   - Creates starship with name and class only

5. **Vision Model** (`packages/models/src/types.ts`)
   - Vision entity has: statement, confidence, refinementCount
   - Linked to starshipId

## Proposed User Journey

### Phase 1: Landing Page Vision Capture
**User State:** Non-authenticated visitor

1. User lands on homepage
2. Above the current hero section, display Sibil chat widget
3. Sibil prompts: "What's your vision? Tell me what you want to build..."
4. User enters their vision statement
5. Sibil responds: "Awesome! To help you achieve [brief summary], let's create your starship..."
6. Store vision in sessionStorage with key `pendingVision`

### Phase 2: Authentication Flow
**Trigger:** User clicks "Create My Starship" after vision entry

1. Redirect to Kinde authentication
2. After successful auth, redirect to `/fleet?onboarding=true&vision=true`
3. Check for `pendingVision` in sessionStorage

### Phase 3: Starship Creation with Vision
**Location:** Fleet page with modal auto-opened

1. Auto-open StarshipCreateModal when query params indicate onboarding
2. Add new step to creation wizard: "Vision Definition"
3. Pre-populate vision field from sessionStorage
4. User can refine vision before proceeding
5. Continue with existing name and class selection

### Phase 4: Vision Chamber Integration
**Post-Creation:** After starship is created

1. Create vision record linked to new starship
2. Redirect to `/ship/[slug]/vision-chamber`
3. Show onboarding tooltip: "Your vision has been set! You can refine it here anytime"

## Implementation Tasks

### 1. Landing Page Sibil Integration
- [ ] Create `LandingSibilWidget` component
- [ ] Position above hero section
- [ ] Implement vision capture flow
- [ ] Store vision in sessionStorage
- [ ] Add transition animations

### 2. Session Storage Management
- [ ] Create `useVisionSession` hook
- [ ] Handle vision persistence across auth
- [ ] Clear after starship creation
- [ ] Add fallback for storage issues

### 3. Authentication Flow Updates
- [ ] Modify login redirect to include query params
- [ ] Handle post-auth routing logic
- [ ] Preserve vision through auth flow

### 4. StarshipCreateModal Enhancement
- [ ] Add vision step (new step 2)
- [ ] Create vision input component
- [ ] Integrate with form validation
- [ ] Update step counter (now 4 steps)

### 5. Backend Integration
- [ ] Add vision field to starship creation API
- [ ] Create vision record on starship creation
- [ ] Handle vision validation

### 6. Fleet Page Onboarding Logic
- [ ] Detect onboarding query params
- [ ] Auto-open creation modal
- [ ] Show onboarding hints
- [ ] Handle edge cases (existing users, etc.)

## Technical Considerations

### State Management
```typescript
interface OnboardingState {
  pendingVision: string | null;
  isOnboarding: boolean;
  visionConfidence: number;
  sibilSuggestions?: string[];
}
```

### SessionStorage Keys
- `pendingVision`: User's initial vision statement
- `onboardingStarted`: Timestamp of onboarding start
- `sibilContext`: Any context from Sibil conversation

### API Endpoints Needed
1. `POST /api/starships` - Modified to accept vision
2. `POST /api/visions` - Create vision record
3. `GET /api/sibil/onboarding` - Get onboarding prompts

## Edge Cases & Error Handling

### Scenario 1: User Already Authenticated
- Skip auth flow
- Direct to fleet with modal

### Scenario 2: Session Storage Unavailable
- Fallback to URL params (base64 encoded)
- Show manual vision input

### Scenario 3: User Abandons Flow
- Clear session storage after 1 hour
- Allow restart from landing

### Scenario 4: Multiple Tabs
- Handle concurrent sessions
- Use most recent vision

### Scenario 5: Existing User Returns
- Don't show onboarding Sibil
- Show regular "Launch Your Starship" flow

## UI/UX Considerations

### Landing Page Sibil Widget
```
┌─────────────────────────────────┐
│  🤖 Sibil AI                    │
│                                 │
│  "What's your vision?"          │
│  "Tell me what you want         │
│   to build..."                  │
│                                 │
│  [Input field..................] │
│  [Send →]                       │
└─────────────────────────────────┘
```

### Transitions
1. Sibil slides in from right on page load
2. Smooth fade when transitioning to auth
3. Modal auto-open with fade-in on fleet page

### Mobile Responsiveness
- Full-width Sibil on mobile
- Sticky positioning during scroll
- Touch-friendly input controls

## Success Metrics
1. **Conversion Rate**: Landing → Starship Created
2. **Vision Quality**: Average refinement count
3. **Time to Creation**: Landing → First Starship
4. **Drop-off Points**: Where users abandon

## Rollback Plan
1. Feature flag: `ENABLE_VISION_ONBOARDING`
2. Fallback to current flow if disabled
3. Preserve existing create flow as backup

## Testing Strategy

### Unit Tests
- Vision session storage hook
- Sibil widget interactions
- Modal vision step

### Integration Tests
- Full onboarding flow
- Auth persistence
- Error scenarios

### E2E Tests
- Complete user journey
- Multiple device types
- Network failure handling

## Timeline Estimate
- **Phase 1**: Landing Sibil Widget - 2 days
- **Phase 2**: Session Management - 1 day  
- **Phase 3**: Modal Enhancement - 2 days
- **Phase 4**: Backend Integration - 1 day
- **Phase 5**: Testing & Polish - 2 days

**Total**: ~8 days of development

## Questions for Clarification

1. **Sibil Personality**: Should Sibil have specific onboarding phrases/personality?
2. **Vision Length**: Min/max character limits for vision statements?
3. **Analytics**: Which events should we track?
4. **A/B Testing**: Should we test against current flow?
5. **Fallback**: What if Sibil API is down during onboarding?

## Next Steps
1. Review and approve this plan
2. Create feature branch `feature/vision-first-onboarding`
3. Implement Phase 1 (Landing Sibil Widget)
4. Test with internal team
5. Iterate based on feedback