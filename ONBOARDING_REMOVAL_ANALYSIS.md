# Onboarding Flow Removal Analysis

## Status: **DONE** (restored pre-onboarding flow)

## Overview
This document outlined all components, files, and dependencies removed or modified to completely remove the Aria onboarding flow and restore the pre-onboarding app flow (login creates starship + Daedalus/Gaia, redirect to ship or profile).

---

## 🗑️ Files to DELETE

### Server Routes
- `packages/server/src/routes/onboarding.ts` - Main onboarding routes file
- `packages/server/src/routes/__tests__/onboarding.test.ts` - Onboarding route tests

### Server Services
- `packages/server/src/services/OnboardingRecommendationService.ts` - Deterministic recommendation service

### Client Components
- `packages/client/src/components/onboarding/OnboardingPage.tsx` - Main onboarding page component
- `packages/client/src/app/onboarding/page.tsx` - Onboarding route page

### Client Hooks
- `packages/client/src/hooks/useOnboarding.ts` - Main onboarding hooks (session, start, recommendations, apply, finish)
- `packages/client/src/hooks/useOnboardingChatStart.ts` - Chat start hook
- `packages/client/src/hooks/useOnboardingChatSkip.ts` - Chat skip hook
- `packages/client/src/hooks/useOnboardingSession.ts` - LocalStorage-based session hook (legacy)

### Models/Entities
- `packages/models/src/entities/OnboardingSessionEntity.ts` - Onboarding session entity
- `packages/models/src/repositories/OnboardingSessionRepository.ts` - Onboarding session repository

### Protocol Types
- `packages/protocol/src/domains/onboarding.ts` - All onboarding type definitions

---

## ✏️ Files to MODIFY

### Database Migrations
**New migration needed:**
- Create migration to:
  1. Drop `onboarding_sessions` table
  2. Drop `users.onboarding_completed` column
  3. Update any existing users to remove onboarding_completed flag

### Server Routes

#### `packages/server/src/index.ts`
- **Remove:** `import onboardingRoutes from '@/routes/onboarding'`
- **Remove:** `app.use('/api/v1', onboardingRoutes)`

#### `packages/server/src/routes/auth.ts`
- **Remove:** `import { OnboardingSessionRepository } from '@starships/models'`
- **Remove:** `ensureOnboardingSessionLinkedToExistingStarship()` function (lines ~54-80)
- **Modify:** `POST /auth/login` - Remove onboarding session linking logic
- **Modify:** `POST /auth/oauth/callback` - Remove onboarding session linking logic
- **Remove:** `onboardingRequired` from login response
- **Remove:** `onboardingCompleted` checks and redirects

### Server Services

#### `packages/server/src/services/UserService.ts`
- **Remove:** `onboardingCompleted: false` from user creation (line ~100)

#### `packages/server/src/services/ConversationService.ts`
- **Remove:** `onboardingSystemPrompt` extraction and injection logic (lines ~1390-1414, ~1693-1722)
- **Remove:** All references to `onboardingSystemPrompt` in conversation state handling

### Client Components

#### `packages/client/src/components/conversation/ConversationSummaryBar.tsx`
- **Remove:** `isOnboardingConversation` detection logic
- **Remove:** "Skip onboarding" button and related UI
- **Remove:** `useOnboardingChatSkip` import and usage

#### `packages/client/src/components/conversation/ConversationInterface.tsx`
- **Remove:** `onboardingConnectorProviders` state and related logic
- **Remove:** Onboarding-specific connector panel rendering

#### `packages/client/src/components/conversation/ConversationList.tsx`
- **Remove:** `isOnboardingConversation()` helper function
- **Remove:** Onboarding conversation filtering/styling

#### `packages/client/src/components/auth/JwtAuthGate.tsx`
- **Remove:** `isOnboardingConversation` detection
- **Remove:** Onboarding redirect logic (lines ~47-56, ~95)
- **Remove:** `onboardingCompleted` checks

#### `packages/client/src/app/login/page.tsx`
- **Remove:** Onboarding redirect logic (lines ~80-98)

#### `packages/client/src/app/profile/page.tsx`
- **Remove:** Any onboarding-related redirects (if any)

#### `packages/client/src/app/client-layout.tsx`
- **Remove:** `isOnboardingConversationRoute` detection
- **Remove:** Navigation hiding logic for onboarding conversations (lines ~140-177)

#### `packages/client/src/components/conversation/ConversationMessageInput.tsx`
- **Remove:** Onboarding-related example prompts (if any)

### Client Hooks

#### `packages/client/src/hooks/useAuth.ts`
- **Remove:** `onboardingCompleted` from `AuthUser` type
- **Remove:** `onboardingRequired` from auth response type
- **Remove:** `isPreOnboardingAllowedReturnUrl()` function
- **Remove:** All onboarding redirect logic in login/register/OAuth flows
- **Remove:** `onboardingCompleted` checks in redirect handlers

### Models

#### `packages/models/src/index.ts`
- **Remove:** `export { OnboardingSessionEntity } from './entities/OnboardingSessionEntity'`
- **Remove:** `export { OnboardingSessionRepository } from './repositories/OnboardingSessionRepository'`

#### `packages/models/src/repositories/index.ts`
- **Remove:** `export { OnboardingSessionRepository } from './OnboardingSessionRepository'`

#### `packages/models/src/entities/UserEntity.ts`
- **Remove:** `onboardingCompleted` field from entity
- **Remove:** `onboardingCompleted` from validation/defaults

#### `packages/models/src/repositories/UserRepository.ts`
- **Remove:** `onboardingCompleted: false` from user creation defaults

#### `packages/models/src/repositories/__tests__/UserRepository.test.ts`
- **Remove:** All `onboardingCompleted: false` from test fixtures

### Protocol

#### `packages/protocol/src/domains/user.ts`
- **Remove:** `onboardingCompleted: boolean` from `UserModel` interface

#### `packages/protocol/src/domains/auth.ts`
- **Remove:** `onboardingCompleted: boolean` from auth response types
- **Remove:** `onboardingRequired: boolean` from auth response types

#### `packages/protocol/src/index.ts`
- **Remove:** All onboarding-related exports

### Client API

#### `packages/client/src/lib/api.ts`
- **Remove:** Onboarding route from retry logic (if any)

### Documentation

#### `packages/docs/content/docs/getting-started/index.mdx`
- **Update:** Remove references to automatic onboarding setup
- **Update:** Document new user flow (if different)

---

## 🔄 Database Changes Required

### New Migration
Create a new migration (e.g., `085_remove_onboarding.ts`) that:

1. **Drops `onboarding_sessions` table:**
   ```sql
   DROP TABLE IF EXISTS onboarding_sessions;
   ```

2. **Removes `onboarding_completed` column from `users`:**
   ```sql
   ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;
   ```

3. **Drops related indexes:**
   - `idx_onboarding_sessions_starship_id`
   - `idx_onboarding_sessions_completed_at`

---

## 🔍 Additional Considerations

### Starship Provisioning
**Current behavior:** Starship is created during onboarding
**New behavior needed:** 
- Decide when starship should be created:
  - Option A: On user registration (email verification)
  - Option B: On first login
  - Option C: On first starship access
- Update `RegistrationOrchestrator` or `UserService` accordingly
- Ensure welcome credits (200) are still granted

### Aria Deployment
**Current behavior:** Aria is deployed during onboarding
**New behavior needed:**
- Decide if Aria should be auto-deployed on starship creation
- Or let users deploy Aria manually from marketplace
- Update starship creation logic accordingly

### User Flow After Removal
**Questions to answer:**
1. What happens when a new user logs in for the first time?
2. Do they get a starship automatically?
3. Do they get any default agents?
4. Where do they land after login?
5. How do they discover features?

### Existing Users
**Migration considerations:**
- Users with `onboarding_completed = false` will need handling
- Consider setting all existing users to `onboarding_completed = true` in migration
- Or create a data migration to provision starships for users without them

### Conversation State Cleanup
**Existing conversations:**
- Conversations with `state.isOnboardingConversation = true` will remain
- Consider cleanup migration to remove these flags
- Or leave them (they'll just be ignored)

---

## 📋 Removal Checklist

### Phase 1: Analysis & Planning
- [x] Identify all files referencing onboarding
- [x] Document dependencies
- [x] Create removal plan
- [ ] Review with team
- [ ] Decide on new user flow

### Phase 2: Database
- [ ] Create migration to drop `onboarding_sessions` table
- [ ] Create migration to drop `users.onboarding_completed` column
- [ ] Create data migration for existing users (if needed)
- [ ] Test migrations up/down

### Phase 3: Backend Removal
- [ ] Delete onboarding routes file
- [ ] Delete onboarding service
- [ ] Remove onboarding imports from server index
- [ ] Remove onboarding logic from auth routes
- [ ] Remove onboarding logic from conversation service
- [ ] Remove onboarding from user service
- [ ] Remove onboarding entity/repository
- [ ] Remove onboarding from models exports
- [ ] Update/remove tests

### Phase 4: Frontend Removal
- [ ] Delete onboarding page components
- [ ] Delete onboarding hooks
- [ ] Remove onboarding from auth hooks
- [ ] Remove onboarding from conversation components
- [ ] Remove onboarding from layout components
- [ ] Remove onboarding from auth gate
- [ ] Remove onboarding from login page
- [ ] Update/remove tests

### Phase 5: Protocol & Types
- [ ] Remove onboarding types from protocol
- [ ] Remove onboarding from protocol exports
- [ ] Update user/auth types

### Phase 6: New User Flow
- [ ] Implement new starship provisioning logic
- [ ] Implement new default agent deployment (if needed)
- [ ] Update login redirect logic
- [ ] Update documentation

### Phase 7: Testing
- [ ] Test new user registration flow
- [ ] Test new user login flow
- [ ] Test existing user login flow
- [ ] Test starship creation
- [ ] Test agent deployment
- [ ] Integration tests
- [ ] E2E tests

### Phase 8: Cleanup
- [ ] Remove unused imports
- [ ] Remove dead code
- [ ] Update documentation
- [ ] Code review
- [ ] Merge to main

---

## 🚨 Breaking Changes

1. **API Endpoints Removed:**
   - `POST /api/v1/onboarding/start`
   - `POST /api/v1/onboarding/chat/start`
   - `POST /api/v1/onboarding/chat/skip`
   - `GET /api/v1/onboarding/session`
   - `POST /api/v1/onboarding/recommendations`
   - `POST /api/v1/onboarding/aria/suggest`
   - `POST /api/v1/onboarding/apply`
   - `POST /api/v1/onboarding/finish`

2. **Database Schema:**
   - `onboarding_sessions` table will be removed
   - `users.onboarding_completed` column will be removed

3. **Type Changes:**
   - `UserModel.onboardingCompleted` removed
   - `AuthUser.onboardingCompleted` removed
   - All onboarding-related types removed

4. **Client Routes:**
   - `/onboarding` route will be removed

---

## 📝 Notes

- The `ensureAriaOnStarship()` function in `onboarding.ts` should be moved to `StarshipService` if Aria auto-deployment is desired
- The onboarding system prompt logic in `ConversationService` can be completely removed
- Consider keeping the recommendation logic if it's useful elsewhere (but remove onboarding-specific parts)
- The `OnboardingRecommendationService` has deterministic goal→connector/agent mapping that might be useful to preserve elsewhere
