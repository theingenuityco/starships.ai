# Email Change Verification - Implementation Plan

## Overview

This document provides a systematic implementation plan for adding email change verification to the Starships.ai application. The feature will prevent unverified email changes by requiring users to verify ownership of their new email address before the change takes effect.

**Current State**: Users can change email directly without verification (security risk)  
**Target State**: Email changes require verification via email sent to new address  
**Timeline**: 5 phases, estimated 2-3 days of development

---

## 🔍 Analysis & Gap Resolution

### Issues Identified and Elegant Solutions

#### ✅ **GAP 1: Route Location Inconsistency**

**Issue**: Plan puts email change routes in `users.ts`, but auth flows (email verification, password reset) are in `auth.ts`.

**Analysis**:

- Email verification: `/auth/verify-email` (GET, token-based, no auth) → in `auth.ts` ✓
- Password reset: `/auth/reset-password` (POST, token-based, no auth) → in `auth.ts` ✓
- User profile update: `/users/:id/profile` (PUT, authenticated) → in `users.ts` ✓

**Elegant Resolution**:

- Email change verification route (GET, token-based, no auth) → **Extend `auth.ts` EMAIL VERIFICATION ROUTES section**
- User management routes (POST, authenticated) → **Extend `users.ts` USER MANAGEMENT ENDPOINTS section**
- **No new files needed** - extend existing route files following established patterns

#### ✅ **GAP 2: Verification URL Pattern**

**Issue**: Plan uses `/users/email/change/verify?token=xxx`, but auth flows use `/auth/verify-email?token=xxx`.

**Analysis**:

- Email verification: `/auth/verify-email?token=xxx` (GET with redirect)
- Password reset link: `/reset-password?token=xxx` (frontend page, then POST to `/auth/reset-password`)

**Elegant Resolution**:

- Use `/auth/email/change/verify?token=xxx` (GET with redirect, like email verification)
- **Extend existing auth.ts route structure** - add to EMAIL VERIFICATION ROUTES section (after email verification routes)
- Follow exact same pattern as `GET /auth/verify-email` route

#### ✅ **GAP 3: Redirect URL Problem - MAJOR**

**Issue**: Plan redirects to `${PUBLIC_URL}/ship/{slug}/settings/profile?emailChange=success`, but we don't have the `slug` in the backend route handler. Also, email change verification can be clicked by either logged-in or logged-out users.

**Analysis**:

- OAuth linking uses duplicate code pattern (lines 465-505 in `auth.ts` - same logic twice!)
- Pattern: Get user's starships → find first active → build redirect path → fallback to `/profile`
- This pattern is duplicated in OAuth success and error handlers
- Email verification always redirects to `/login` (user not logged in yet)
- OAuth linking redirects to profile page (user IS logged in)
- Email change verification could be clicked by either logged-in or logged-out user

**Elegant Resolution**:

- **Extend UserService** with reusable helper method: `getProfileRedirectPath(userId: string): Promise<string>`
- This method encapsulates the starship lookup logic:
  ```typescript
  async getProfileRedirectPath(userId: string): Promise<string> {
    try {
      const starshipRepo = new StarshipRepository();
      const userStarships = await starshipRepo.findByOwner(userId);
      const firstStarship = userStarships.find((ship) => ship.status === 'active') || userStarships[0];
      return firstStarship ? `/ship/${firstStarship.slug}/settings/profile` : '/profile';
    } catch (error) {
      logger.warn('[UserService] Failed to get starship for redirect', { userId, error });
      return '/profile';
    }
  }
  ```
- **Create helper function** in `auth.ts` route: `getAuthenticatedUserFromRequest(req: Request): Promise<UserModel | null>`
  - This helper tries to extract and verify JWT from Authorization header
  - Returns user if authenticated, null if not (doesn't throw errors)
  - Follows the `optionalJwtAuth` middleware pattern but as a helper function
  - **Note**: Email links clicked directly won't have Authorization header (browser redirects don't include it), so this will return `null` for direct link clicks, which is correct behavior

  ```typescript
  async function getAuthenticatedUserFromRequest(req: Request): Promise<UserModel | null> {
    try {
      // Try Authorization header (frontend sends JWT via Authorization header)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        if (token && token.length >= 10) {
          const { payload } = await verifyJWT(token);
          const user = await UserService.getUserById(payload.sub as string);
          if (user) return user;
        }
      }

      // Email links clicked directly won't have Authorization header (browser redirects)
      // This is expected - return null for unauthenticated users
      return null;
    } catch (error) {
      // Silently fail - user is not authenticated
      return null;
    }
  }
  ```

- **In email change verification route**:
  - After validating email change token and completing change, get `userId` from token
  - Check if user is authenticated: `const authenticatedUser = await getAuthenticatedUserFromRequest(req)`
  - If authenticated AND userId matches: Use `getProfileRedirectPath(userId)` → redirect to profile page
  - If not authenticated OR userId mismatch: Redirect to `/login?emailChange=success`
  - This handles both logged-in and logged-out scenarios elegantly
- **Bonus**: Refactor OAuth handlers to use `getProfileRedirectPath()` method (removes duplication!)
- This approach is elegant because:
  - ✅ Reuses existing JWT verification logic
  - ✅ Doesn't require new middleware
  - ✅ Handles both authenticated and unauthenticated users
  - ✅ Matches OAuth pattern (logged in → profile) and email verification pattern (logged out → login)

#### ✅ **GAP 4: Rate Limiting**

**Issue**: Plan says 3-5 per hour, but actual `rateLimiters.sensitive` = 20 per hour.

**Analysis**:

- `rateLimiters.sensitive` = 20 requests per hour (1 hour window)
- Used for: password reset, email verification resend
- This is appropriate for email change operations

**Elegant Resolution**:

- Use existing `rateLimiters.sensitive` (20/hour)
- **No changes needed** - follows existing pattern exactly

#### ✅ **GAP 5: Error Code**

**Issue**: Plan uses `EMAIL_CHANGE_REQUIRES_VERIFICATION` which is not in standard error codes.

**Analysis**:

- `ValidationError` class: `new ValidationError(message, field, details, cause)`
- `InvalidTokenError` exists (extends `EmailVerificationError`, which extends `ValidationError`)
- Standard error codes include `VALIDATION_ERROR`, `TOKEN_INVALID`

**Elegant Resolution**:

- For blocking direct email update: Use `ValidationError('Email changes require verification. Please use the email change flow.', 'email')`
- For token errors: **Reuse existing InvalidTokenError** (it's generic enough - "Invalid or expired verification token")
- **No new error classes needed** - extend existing error system
- If needed, can extend `InvalidTokenError` message but keep same class

#### ✅ **GAP 6: Query Parameter Handling**

**Issue**: Profile page doesn't handle `emailChange` query param.

**Analysis**:

- `OAuthAccountsSettings` uses `useSearchParams()` in component (lines 100-117)
- `LoginForm` uses `useSearchParams()` in component (lines 80-121)
- `AccountForm` currently doesn't use `useSearchParams()`

**Elegant Resolution**:

- **Extend AccountForm component** to handle query params (like OAuth pattern)
- Add `useSearchParams()` hook import and usage in `AccountForm`
- Handle `emailChange=success` and `emailChange=error` in `useEffect`
- Show toast notifications (like OAuth and login patterns)
- Use `toast.success()` and `toast.error()` (already imported via hooks)
- **No new components needed** - extend existing component following exact same pattern

#### ✅ **GAP 7: Profile Page Route Structure**

**Issue**: Plan mentions profile page but doesn't specify exact component.

**Analysis**:

- Profile settings page: `/ship/[slug]/settings/[tab]/page.tsx`
- Renders `AccountForm` component in profile tab (line 73)
- `AccountForm` is the right place for query param handling

**Elegant Resolution**:

- Query param handling in `AccountForm` component (rendered in profile tab)
- **No changes to route file needed** - extend existing component

---

## Phase 1: Database Layer Foundation

**Goal**: Create database schema and data access layer for email change tokens  
**Dependencies**: None  
**Estimated Time**: 2-3 hours

### Task 1.1: Create Database Migration

**File**: `packages/models/migrations/002_add_email_change_tokens.sql`

**Acceptance Criteria**:

- [ ] Create `email_change_tokens` table with all required fields
- [ ] Add foreign key constraint to `users(id) ON DELETE CASCADE`
- [ ] Set default expiry to 1 hour (`NOW() + INTERVAL '1 hour'`)
- [ ] Add unique constraint on `token` field
- [ ] Create indexes following password reset token pattern:
  - [ ] `idx_email_change_tokens_token` (partial index WHERE NOT consumed)
  - [ ] `idx_email_change_tokens_expires_at`
  - [ ] `idx_email_change_tokens_user_id`
  - [ ] `idx_email_change_tokens_new_email`

**SQL Structure**:

```sql
-- Migration: Add email change tokens table
-- Description: Enables email change verification flow
-- Created: 2025-01-XX

CREATE TABLE email_change_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_email VARCHAR(255) NOT NULL,
    new_email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes following password reset token pattern
CREATE INDEX idx_email_change_tokens_token ON email_change_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_email_change_tokens_expires_at ON email_change_tokens(expires_at);
CREATE INDEX idx_email_change_tokens_user_id ON email_change_tokens(user_id);
CREATE INDEX idx_email_change_tokens_new_email ON email_change_tokens(new_email);
```

**Testing**:

- [ ] Run migration on test database
- [ ] Verify table structure matches requirements
- [ ] Verify indexes are created
- [ ] Verify foreign key constraint works (deletes cascade)

---

### Task 1.2: Create EmailChangeTokenEntity

**File**: `packages/models/src/entities/EmailChangeTokenEntity.ts`

**Acceptance Criteria**:

- [ ] Create `EmailChangeTokenModel` interface matching database schema
- [ ] Create `EmailChangeTokenEntity` class with validation decorators
- [ ] Add transformers for token and email fields (similar to `PasswordResetTokenEntity`)
- [ ] Implement `validate()` static method for create/update operations
- [ ] Implement `createFromUserData()` factory method
- [ ] Validate token format (64-char hex)
- [ ] Validate email format (both old and new)
- [ ] Set default expiry to 1 hour

**Reference Files**:

- `packages/models/src/entities/PasswordResetTokenEntity.ts`
- `packages/models/src/entities/EmailVerificationTokenEntity.ts`

**Testing**:

- [ ] Unit test entity validation (valid data)
- [ ] Unit test entity validation (invalid token format)
- [ ] Unit test entity validation (invalid email format)
- [ ] Unit test factory method

---

### Task 1.3: Create EmailChangeTokenRepository

**File**: `packages/models/src/repositories/EmailChangeTokenRepository.ts`

**Acceptance Criteria**:

- [ ] Extend `BaseRepository` following existing patterns
- [ ] Implement `generateToken(userId, oldEmail, newEmail)`:
  - [ ] Generate cryptographically secure 64-char hex token
  - [ ] Handle token collisions (retry up to 3 times)
  - [ ] Insert token with 1-hour expiry
  - [ ] Return token string
- [ ] Implement `validateAndConsumeToken(token)`:
  - [ ] Atomic transaction to validate and consume
  - [ ] Check token exists, not consumed, not expired
  - [ ] Return `{ userId, oldEmail, newEmail }` or null
  - [ ] Mark token as consumed
- [ ] Implement `getTokenInfo(token)`:
  - [ ] Get token info without consuming
  - [ ] Return `{ userId, oldEmail, newEmail, valid, expired, consumed }`
- [ ] Implement `getPendingTokenForUser(userId)`:
  - [ ] Get active (non-consumed, non-expired) token for user
  - [ ] Return token info or null
- [ ] Implement `cancelTokenForUser(userId)`:
  - [ ] Mark all pending tokens for user as consumed
  - [ ] Return number of cancelled tokens
- [ ] Implement `cleanupExpiredTokens()`:
  - [ ] Delete expired tokens (optional, for maintenance)

**Reference Files**:

- `packages/models/src/repositories/PasswordResetTokenRepository.ts`
- `packages/models/src/repositories/EmailVerificationTokenRepository.ts`

**Testing**:

- [ ] Unit test `generateToken()` - creates valid token
- [ ] Unit test `generateToken()` - handles collisions
- [ ] Unit test `validateAndConsumeToken()` - valid token
- [ ] Unit test `validateAndConsumeToken()` - expired token
- [ ] Unit test `validateAndConsumeToken()` - already consumed
- [ ] Unit test `validateAndConsumeToken()` - atomic operation
- [ ] Unit test `getPendingTokenForUser()` - returns pending token
- [ ] Unit test `cancelTokenForUser()` - cancels pending tokens
- [ ] Integration test: Full flow (generate → validate → consume)

---

### Task 1.4: Export New Types and Repository

**File**: `packages/models/src/index.ts`

**Acceptance Criteria**:

- [ ] Export `EmailChangeTokenEntity`
- [ ] Export `EmailChangeTokenRepository`
- [ ] Follow existing export patterns

**Testing**:

- [ ] Verify imports work in other packages
- [ ] Check TypeScript compilation

---

**Phase 1 Complete Checklist**:

- [ ] All database migrations tested and working
- [ ] All entities validate correctly
- [ ] All repository methods tested
- [ ] Code follows existing patterns
- [ ] TypeScript compilation passes
- [ ] No linting errors

---

## Phase 2: Backend Service Layer

**Goal**: Implement business logic for email change flows  
**Dependencies**: Phase 1 complete  
**Estimated Time**: 3-4 hours

### Task 2.1: Add Email Change Methods to EmailService

**File**: `packages/server/src/services/EmailService.ts`

**Acceptance Criteria**:

- [ ] Add `sendEmailChangeVerificationEmail(newEmail, token, oldEmail)` method
- [ ] Generate verification URL: `${PUBLIC_URL}/api/v1/auth/email/change/verify?token=${token}`
- [ ] Create HTML email template:
  - [ ] Subject: "Confirm your new email address"
  - [ ] Message: "You requested to change your email from [old] to [new]"
  - [ ] Call-to-action button: "Confirm Email Change"
  - [ ] Expiry warning: "This link expires in 1 hour"
  - [ ] Security notice for unsolicited emails
- [ ] Create plain text email template (fallback)
- [ ] Use AWS SES `SendEmailCommand` to send email
- [ ] Add error handling and logging
- [ ] Follow existing email template patterns

**Reference Files**:

- `packages/server/src/services/EmailService.ts` (lines 131-161 for password reset template)

**Testing**:

- [ ] Unit test: Email template generation
- [ ] Unit test: URL generation
- [ ] Integration test: Send test email (mock SES)
- [ ] Verify email renders correctly in email clients

---

### Task 2.2: Add Email Change Methods to UserService

**File**: `packages/server/src/services/UserService.ts`

**Acceptance Criteria**:

- [ ] Add `initiateEmailChange(userId, newEmail)`:
  - [ ] Validate user exists
  - [ ] Validate new email format
  - [ ] Check if new email already exists (throw error if exists)
  - [ ] Check if new email is same as current (no-op)
  - [ ] Cancel any existing pending email change tokens for user
  - [ ] Generate token using `EmailChangeTokenRepository`
  - [ ] Send verification email using `EmailService`
  - [ ] Log operation
- [ ] Add `completeEmailChange(token)`:
  - [ ] Validate and consume token (atomic)
  - [ ] Get user from database using `userId` from token
  - [ ] **SECURITY CHECK**: Verify user's current email matches token's `oldEmail`:
    - [ ] If user's current email !== token's `oldEmail`, throw `InvalidTokenError` (token is stale - user may have changed email already)
    - [ ] This prevents race conditions where user changes email twice before verifying first change
  - [ ] Check if new email still available (race condition check)
  - [ ] Update user email in database
  - [ ] Set `emailVerified = true` if not already
  - [ ] Cancel all other pending email change tokens for user
  - [ ] Return `{ userId, oldEmail, newEmail }`
  - [ ] Log operation
- [ ] Add `cancelEmailChange(userId)`:
  - [ ] Validate user exists
  - [ ] Cancel pending token for user
  - [ ] Log operation
- [ ] Add `getPendingEmailChange(userId)`:
  - [ ] Get pending token info for user
  - [ ] Return `{ newEmail, expiresAt }` or null
  - [ ] Handle no pending token gracefully
- [ ] **NEW**: Add `getProfileRedirectPath(userId)` helper method:
  - [ ] Encapsulate starship lookup logic (currently duplicated in OAuth handlers)
  - [ ] Get user's starships using `StarshipRepository.findByOwner(userId)`
  - [ ] Find first active starship or first starship
  - [ ] Return `/ship/${slug}/settings/profile` if starship found, else `/profile`
  - [ ] Handle errors gracefully (return `/profile` on error)
  - [ ] Log warnings for errors
  - [ ] **Bonus**: This refactors OAuth code to remove duplication (can update OAuth handlers to use this)

**Reference Files**:

- `packages/server/src/services/UserService.ts` (lines 829-851 for email verification)
- `packages/server/src/services/UserService.ts` (lines 921-947 for password reset)

**Testing**:

- [ ] Unit test `initiateEmailChange()` - valid new email
- [ ] Unit test `initiateEmailChange()` - email already exists
- [ ] Unit test `initiateEmailChange()` - same email (no-op)
- [ ] Unit test `initiateEmailChange()` - cancels old token
- [ ] Unit test `completeEmailChange()` - valid token
- [ ] Unit test `completeEmailChange()` - expired token
- [ ] Unit test `completeEmailChange()` - email taken (race condition)
- [ ] Unit test `cancelEmailChange()` - cancels pending token
- [ ] Unit test `getPendingEmailChange()` - returns pending status
- [ ] Integration test: Full flow (initiate → verify → complete)

---

### Task 2.3: Modify updateUserProfile to Reject Direct Email Changes

**File**: `packages/server/src/services/UserService.ts` (lines 171-210)

**Acceptance Criteria**:

- [ ] Detect if email is being changed in `updateUserProfile()`
- [ ] If email is being changed, throw `ValidationError`:
  - [ ] Error message: "Email changes require verification. Please use the email change flow."
  - [ ] Field: `'email'` (second parameter - follows ValidationError pattern)
  - [ ] **ELEGANT**: Use existing `ValidationError` class - no new error class needed
  - [ ] Error code will be `VALIDATION_ERROR` automatically (from ValidationError class)
- [ ] Allow other profile fields (displayName, avatar) to update normally
- [ ] Update existing validation logic (lines 178-184) - add email change check before email uniqueness check

**Testing**:

- [ ] Test: Direct email update throws error
- [ ] Test: Display name update still works
- [ ] Test: Avatar update still works
- [ ] Test: Password update still works
- [ ] Test: Mixed update (displayName + email) throws error

---

### Task 2.4: Add Protocol Types

**File**: `packages/protocol/src/domains/user.ts`

**Acceptance Criteria**:

- [ ] Add `InitiateEmailChangeRequest` interface:
  ```typescript
  export interface InitiateEmailChangeRequest {
    newEmail: string;
  }
  ```
- [ ] Add `VerifyEmailChangeRequest` interface:
  ```typescript
  export interface VerifyEmailChangeRequest {
    token: string;
  }
  ```
- [ ] Add `EmailChangeStatusResponse` interface:
  ```typescript
  export interface EmailChangeStatusResponse {
    pending: boolean;
    newEmail?: string;
    expiresAt?: string;
  }
  ```
- [ ] Add `EmailChangeCompleteResponse` interface:
  ```typescript
  export interface EmailChangeCompleteResponse {
    userId: string;
    oldEmail: string;
    newEmail: string;
  }
  ```

**Testing**:

- [ ] Verify TypeScript compilation
- [ ] Verify types are exported correctly

---

**Phase 2 Complete Checklist**:

- [ ] All service methods implemented
- [ ] All service methods tested
- [ ] Email templates created and tested
- [ ] Direct email update blocked
- [ ] Protocol types added
- [ ] Error handling comprehensive
- [ ] Logging added for all operations

---

## Phase 3: API Routes and Endpoints

**Goal**: Create API endpoints for email change operations  
**Dependencies**: Phase 2 complete  
**Estimated Time**: 2-3 hours

### Task 3.1: Create Email Change API Routes

**Files**:

- `packages/server/src/routes/users.ts` (user management routes)
- `packages/server/src/routes/auth.ts` (verification route)

**Acceptance Criteria**:

- [ ] Add Zod schema for email change requests in `users.ts`:
  ```typescript
  const InitiateEmailChangeSchema = z.object({
    newEmail: EmailSchema,
  });
  ```
- [ ] Add route in `users.ts`: `POST /users/:id/email/change`
  - [ ] JWT authentication required
  - [ ] User can only change their own email
  - [ ] Validate request body
  - [ ] Call `UserService.initiateEmailChange()`
  - [ ] Return success response
  - [ ] Add rate limiting (use `rateLimiters.sensitive` - 20/hour)
- [ ] Add route in `auth.ts`: `GET /auth/email/change/verify?token=xxx`
  - [ ] **Extend EMAIL VERIFICATION ROUTES section** (after email verification route)
  - [ ] No authentication required (token-based, like email verification)
  - [ ] Validate token format (64-char hex) using same Zod schema pattern
  - [ ] Call `UserService.completeEmailChange()` to get `{ userId, oldEmail, newEmail }`
  - [ ] **ELEGANT**: Check if user is authenticated using `getAuthenticatedUserFromRequest(req)` helper:
    - [ ] Helper function tries to extract and verify JWT from Authorization header
    - [ ] Returns `UserModel | null` (doesn't throw errors if not authenticated)
    - [ ] Follows `optionalJwtAuth` middleware pattern but as a helper function
  - [ ] **ELEGANT**: Determine redirect based on authentication status:
    - [ ] If authenticated AND userId matches: Use `UserService.getProfileRedirectPath(userId)` → redirect to `${PUBLIC_URL}${redirectPath}?emailChange=success`
      - [ ] This handles starship lookup internally (returns `/ship/{slug}/settings/profile` or `/profile`)
    - [ ] If not authenticated OR userId mismatch: Redirect to `${PUBLIC_URL}/login?emailChange=success`
      - [ ] Matches email verification pattern (user not logged in → login page)
  - [ ] Handle errors (redirect to `${PUBLIC_URL}/login?emailChange=error`)
  - [ ] Follow exact same pattern as `GET /auth/verify-email` route
- [ ] Add route in `users.ts`: `POST /users/:id/email/change/resend`
  - [ ] JWT authentication required
  - [ ] User can only resend their own email change
  - [ ] Get pending token and resend email
  - [ ] Return success response
  - [ ] Add rate limiting (use `rateLimiters.sensitive`)
- [ ] Add route in `users.ts`: `POST /users/:id/email/change/cancel`
  - [ ] JWT authentication required
  - [ ] User can only cancel their own email change
  - [ ] Call `UserService.cancelEmailChange()`
  - [ ] Return success response
- [ ] Add route in `users.ts`: `GET /users/:id/email/change/status`
  - [ ] JWT authentication required
  - [ ] User can only check their own status
  - [ ] Call `UserService.getPendingEmailChange()`
  - [ ] Return status response

**Reference Files**:

- `packages/server/src/routes/auth.ts` (lines 291-322 for email verification - follow exact pattern)
- `packages/server/src/services/UserService.ts` (new `getProfileRedirectPath` helper method)
- `packages/server/src/routes/auth.ts` (lines 465-505 for OAuth redirect pattern - will be refactored to use helper)

**Testing**:

- [ ] Test: Initiate email change (valid)
- [ ] Test: Initiate email change (invalid email)
- [ ] Test: Initiate email change (existing email)
- [ ] Test: Initiate email change (unauthorized user)
- [ ] Test: Verify email change (valid token) - redirects correctly
- [ ] Test: Verify email change (valid token, no starship) - fallback redirect
- [ ] Test: Verify email change (expired token)
- [ ] Test: Verify email change (invalid token)
- [ ] Test: Resend verification email
- [ ] Test: Cancel email change
- [ ] Test: Get email change status
- [ ] Test: Rate limiting works (20/hour)
- [ ] Test: Authorization checks

---

### Task 3.2: Add Error Handling for Email Change

**Files**:

- `packages/server/src/services/UserService.ts` (error throwing)
- `packages/server/src/routes/auth.ts` (error handling in routes)

**Acceptance Criteria**:

- [ ] **ELEGANT**: Use existing error classes - no new error classes needed
- [ ] Use `ValidationError` for email change validation errors:
  - [ ] `new ValidationError('Email changes require verification...', 'email')`
  - [ ] `new ValidationError('Email already exists...', 'email')`
- [ ] Use `InvalidTokenError` for token-related errors:
  - [ ] **Reuse existing InvalidTokenError** from `EmailVerificationErrors.ts`
  - [ ] It's generic enough: "Invalid or expired verification token"
  - [ ] Can be used for email change token errors too
- [ ] Use existing `handleError()` utility in routes (already handles AppError subclasses)
- [ ] Ensure proper error codes (`VALIDATION_ERROR`, `TOKEN_INVALID`, etc.) - all from existing error classes

**Testing**:

- [ ] Test error responses are formatted correctly
- [ ] Test error messages are user-friendly

---

**Phase 3 Complete Checklist**:

- [ ] All API routes implemented
- [ ] All routes tested
- [ ] Authentication/authorization working
- [ ] Rate limiting working (20/hour)
- [ ] Error handling comprehensive
- [ ] Redirect logic works correctly (with starship slug)
- [ ] Fallback redirect works (no starship)

---

## Phase 4: Frontend Integration

**Goal**: Integrate email change flow into UI  
**Dependencies**: Phase 3 complete  
**Estimated Time**: 4-5 hours

### Task 4.1: Create useEmailChange Hook

**File**: `packages/client/src/hooks/useEmailChange.ts`

**Acceptance Criteria**:

- [ ] Create `useInitiateEmailChange()` mutation hook:
  - [ ] Call `POST /users/:id/email/change`
  - [ ] Show success toast
  - [ ] Handle errors
  - [ ] Invalidate email change status query
- [ ] Create `useResendEmailChangeVerification()` mutation hook:
  - [ ] Call `POST /users/:id/email/change/resend`
  - [ ] Show success toast
  - [ ] Handle errors
- [ ] Create `useCancelEmailChange()` mutation hook:
  - [ ] Call `POST /users/:id/email/change/cancel`
  - [ ] Show success toast
  - [ ] Handle errors
  - [ ] Invalidate email change status query
- [ ] Create `useEmailChangeStatus()` query hook:
  - [ ] Call `GET /users/:id/email/change/status`
  - [ ] Poll/refetch on mount
  - [ ] Return `{ pending, newEmail, expiresAt }` or null

**Reference Files**:

- `packages/client/src/hooks/useUsers.ts` (lines 214-279)

**Testing**:

- [ ] Test: Hook calls correct API endpoints
- [ ] Test: Error handling works
- [ ] Test: Toast notifications appear
- [ ] Test: Query invalidation works

---

### Task 4.2: Modify useAccountForm Hook

**File**: `packages/client/src/hooks/useAccountForm.ts`

**Acceptance Criteria**:

- [ ] Add state for pending email change:
  ```typescript
  const [pendingEmailChange, setPendingEmailChange] = useState<{
    newEmail: string;
    expiresAt: string;
  } | null>(null);
  ```
- [ ] Add `useEmailChangeStatus()` hook to fetch pending status on mount
- [ ] Modify `onSave()` method:
  - [ ] Detect if email is being changed
  - [ ] If email changed, call `initiateEmailChange()` instead of direct update
  - [ ] Update pending state after successful initiation
  - [ ] If other fields changed, use existing update flow
- [ ] Add `resendEmailChangeVerification()` method
- [ ] Add `cancelEmailChange()` method:
  - [ ] Call cancel API
  - [ ] Clear pending state
  - [ ] Reset email field to current email
- [ ] Update `dirty` calculation to exclude email if pending
- [ ] Return pending state and methods from hook

**Testing**:

- [ ] Test: Email change initiates email change flow
- [ ] Test: Other fields still update directly
- [ ] Test: Pending state updates correctly
- [ ] Test: Cancel resets form correctly
- [ ] Test: Status polling works

---

### Task 4.3: Create EmailChangePending Component

**File**: `packages/client/src/components/profile/EmailChangePending.tsx`

**Acceptance Criteria**:

- [ ] Display pending email change state:
  - [ ] Show "Verification email sent to [newEmail]"
  - [ ] Show expiry countdown (e.g., "Expires in 45 minutes")
  - [ ] Show "Resend Email" button
  - [ ] Show "Cancel" button
  - [ ] Handle loading states
  - [ ] Handle errors
- [ ] Use existing UI components (Card, Button, etc.)
- [ ] Follow existing design patterns
- [ ] Make it visually distinct (warning/info style)

**Reference Files**:

- `packages/client/src/components/profile/AccountDetailsCard.tsx`
- `packages/client/src/components/profile/OAuthAccountsSettings.tsx` (for query param handling pattern)

**Testing**:

- [ ] Test: Component renders correctly
- [ ] Test: Countdown timer works
- [ ] Test: Buttons trigger correct actions
- [ ] Test: Loading states display
- [ ] Test: Error states display

---

### Task 4.4: Modify AccountDetailsCard Component

**File**: `packages/client/src/components/profile/AccountDetailsCard.tsx`

**Acceptance Criteria**:

- [ ] Accept `pendingEmailChange` prop
- [ ] Accept `onResendEmail` prop
- [ ] Accept `onCancelEmailChange` prop
- [ ] Display pending state if `pendingEmailChange` exists:
  - [ ] Disable email input
  - [ ] Show new email address in input (read-only)
  - [ ] Show `EmailChangePending` component below input
- [ ] When no pending state:
  - [ ] Enable email input
  - [ ] Show current email
  - [ ] Show note: "Changing email will send a verification email to the new address"
  - [ ] Handle email input changes (only when not pending)

**Testing**:

- [ ] Test: Email input disabled when pending
- [ ] Test: New email displayed when pending
- [ ] Test: Current email displayed when not pending
- [ ] Test: Pending component renders correctly
- [ ] Test: Resend and cancel buttons work

---

### Task 4.5: Update AccountForm Component

**File**: `packages/client/src/components/profile/AccountForm.tsx`

**Acceptance Criteria**:

- [ ] Pass pending email change state to `AccountDetailsCard`
- [ ] Pass resend and cancel handlers to `AccountDetailsCard`
- [ ] Ensure pending state is fetched on mount
- [ ] **ELEGANT**: Extend AccountForm to handle query parameters (like OAuth pattern):
  - [ ] Import `useSearchParams` from `next/navigation` (add to existing imports)
  - [ ] Add `const searchParams = useSearchParams()` in component
  - [ ] Add `useEffect` to handle `emailChange` query param (like OAuth pattern):
    - [ ] Get `emailChange` query param: `searchParams?.get('emailChange')`
    - [ ] Handle `emailChange=success`:
      - [ ] Show success toast: `toast.success('Email changed successfully!')`
      - [ ] Clear pending state (if exists)
      - [ ] Refresh user data (invalidate queries)
    - [ ] Handle `emailChange=error`:
      - [ ] Show error toast: `toast.error('Email change failed. Please try again.')`
    - [ ] Use ref to prevent duplicate toasts (like LoginForm pattern)
  - [ ] **Optional**: Clear query param after handling (use `router.replace` without param)
  - [ ] Follow exact same pattern as `OAuthAccountsSettings.tsx` (lines 100-117)
  - [ ] **No new components needed** - extend existing component

**Reference Files**:

- `packages/client/src/components/profile/OAuthAccountsSettings.tsx` (lines 100-117 for query param handling - exact pattern)
- `packages/client/src/components/auth/LoginForm.tsx` (lines 80-121 for query param handling with refs pattern)

**Testing**:

- [ ] Test: Pending state passed correctly
- [ ] Test: Handlers work correctly
- [ ] Test: Verification redirect handled (`emailChange=success`)
- [ ] Test: Error redirect handled (`emailChange=error`)
- [ ] Test: Success toast appears
- [ ] Test: Query param cleared after handling

---

### Task 4.6: Update Profile Page Route Handler

**File**: `packages/client/src/app/ship/[slug]/settings/[tab]/page.tsx`

**Acceptance Criteria**:

- [ ] **NOTE**: Query parameter handling is done in `AccountForm` component (Task 4.5)
- [ ] No changes needed to this file - `AccountForm` handles it
- [ ] Verify `AccountForm` is rendered in the profile tab

**Testing**:

- [ ] Test: Success redirect works (handled by AccountForm)
- [ ] Test: Error redirect works (handled by AccountForm)
- [ ] Test: Toast notifications appear (handled by AccountForm)

---

**Phase 4 Complete Checklist**:

- [ ] All hooks implemented and tested
- [ ] All components implemented and tested
- [ ] UI shows pending state correctly
- [ ] Resend and cancel buttons work
- [ ] Email change flow works end-to-end
- [ ] Verification redirect works (with query params)
- [ ] Query parameter handling works correctly
- [ ] Error handling comprehensive
- [ ] Loading states work
- [ ] Toast notifications work

---

## Phase 5: Testing, Edge Cases, and Polish

**Goal**: Comprehensive testing and edge case handling  
**Dependencies**: Phase 4 complete  
**Estimated Time**: 2-3 hours

### Task 5.1: Comprehensive Testing

**Acceptance Criteria**:

- [ ] **Happy Path Tests**:
  - [ ] Initiate email change → Receive email → Click link → Email updated
  - [ ] Resend email → Receive new email
  - [ ] Cancel email change → Form resets
- [ ] **Error Cases**:
  - [ ] Invalid email format
  - [ ] Email already exists
  - [ ] Expired token
  - [ ] Already used token
  - [ ] Invalid token format
  - [ ] No pending token (resend/cancel)
- [ ] **Edge Cases**:
  - [ ] Change email twice before verifying (first cancelled)
  - [ ] New email becomes taken between request and verification
  - [ ] Token expires before clicking
  - [ ] User cancels then tries to verify old token
  - [ ] User tries to change to their current email (no-op)
  - [ ] Multiple pending tokens (should cancel all)
  - [ ] User has no starship (redirect fallback works)
- [ ] **UI Tests**:
  - [ ] Pending state displays correctly
  - [ ] Countdown timer works
  - [ ] Buttons work correctly
  - [ ] Form resets correctly
  - [ ] Redirects work correctly
  - [ ] Query param handling works

**Testing**:

- [ ] Manual testing of all flows
- [ ] Automated tests (unit + integration)
- [ ] Browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsive testing

---

### Task 5.2: Rate Limiting

**Acceptance Criteria**:

- [ ] Verify rate limiting is applied:
  - [ ] `POST /users/:id/email/change`: `rateLimiters.sensitive` (20 requests per hour)
  - [ ] `POST /users/:id/email/change/resend`: `rateLimiters.sensitive` (20 requests per hour)
- [ ] Use existing rate limiter (`rateLimiters.sensitive`)
- [ ] Return appropriate error messages

**Reference Files**:

- `packages/server/src/routes/auth.ts` (rate limiting examples)
- `packages/server/src/middleware/rateLimiter.ts` (rate limit configuration)

**Testing**:

- [ ] Test: Rate limit enforced (20/hour)
- [ ] Test: Error message clear
- [ ] Test: Rate limit resets correctly

---

### Task 5.3: Logging and Monitoring

**Acceptance Criteria**:

- [ ] Add structured logging for all email change operations:
  - [ ] Email change initiated (userId, newEmail)
  - [ ] Email change verified (userId, oldEmail, newEmail)
  - [ ] Email change cancelled (userId)
  - [ ] Email change resend (userId)
  - [ ] Email change errors (with context)
- [ ] Use existing logger patterns
- [ ] Include relevant context (userId, email, token hash - not full token)

**Testing**:

- [ ] Test: Logs appear correctly
- [ ] Test: Logs include all relevant context
- [ ] Test: Sensitive data (tokens) are not logged

---

### Task 5.4: Error Messages and User Feedback

**Acceptance Criteria**:

- [ ] All error messages are user-friendly
- [ ] Toast notifications are clear and actionable
- [ ] Loading states are clear
- [ ] Success messages are clear
- [ ] Email template is professional and clear

**Testing**:

- [ ] Review all error messages
- [ ] Review all toast notifications
- [ ] Review email template
- [ ] User testing feedback

---

### Task 5.5: Documentation

**Acceptance Criteria**:

- [ ] Update API documentation (if applicable)
- [ ] Update README if needed
- [ ] Document email change flow
- [ ] Document any new environment variables (none expected)

**Testing**:

- [ ] Documentation is clear and accurate
- [ ] Examples are provided

---

**Phase 5 Complete Checklist**:

- [ ] All tests passing
- [ ] All edge cases handled
- [ ] Rate limiting working (20/hour)
- [ ] Logging comprehensive
- [ ] Error messages user-friendly
- [ ] Documentation updated
- [ ] Code review ready

---

## Implementation Summary

### File Changes Overview

**New Files** (5):

1. `packages/models/migrations/002_add_email_change_tokens.sql`
2. `packages/models/src/entities/EmailChangeTokenEntity.ts`
3. `packages/models/src/repositories/EmailChangeTokenRepository.ts`
4. `packages/client/src/hooks/useEmailChange.ts`
5. `packages/client/src/components/profile/EmailChangePending.tsx`

**Modified Files** (9):

1. `packages/models/src/index.ts` (exports)
2. `packages/protocol/src/domains/user.ts` (types)
3. `packages/server/src/services/EmailService.ts` (new method - extend existing)
4. `packages/server/src/services/UserService.ts` (new methods + modify existing + helper method)
5. `packages/server/src/routes/auth.ts` (verification route - extend EMAIL VERIFICATION ROUTES section)
6. `packages/server/src/routes/users.ts` (user management routes - extend USER MANAGEMENT ENDPOINTS section)
7. `packages/client/src/hooks/useAccountForm.ts` (email change logic - extend existing)
8. `packages/client/src/components/profile/AccountDetailsCard.tsx` (pending state - extend existing)
9. `packages/client/src/components/profile/AccountForm.tsx` (integrate pending state + query params - extend existing)

**Bonus Refactoring** (optional but recommended):

- `packages/server/src/routes/auth.ts` (OAuth handlers - refactor to use `getProfileRedirectPath` helper, removes duplication)

### Dependencies

- **Phase 1** → **Phase 2** → **Phase 3** → **Phase 4** → **Phase 5**
- Each phase must be completed before moving to next
- Can test each phase independently

### Estimated Timeline

- **Phase 1**: 2-3 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 2-3 hours
- **Phase 4**: 4-5 hours
- **Phase 5**: 2-3 hours
- **Total**: 13-18 hours (2-3 days)

### Success Criteria

✅ Users can initiate email change  
✅ Verification email sent to new address  
✅ Users can verify email change via link  
✅ Users can resend verification email  
✅ Users can cancel email change  
✅ UI shows pending state clearly  
✅ Direct email updates are blocked  
✅ All edge cases handled  
✅ Comprehensive error handling  
✅ Security best practices followed  
✅ Redirect works correctly (with starship slug)  
✅ Query parameter handling works

---

## Security Checklist

- [ ] Token is cryptographically secure (64-char hex)
- [ ] Token expiry is 1 hour (industry standard)
- [ ] Token validation is atomic
- [ ] Email uniqueness checked during verification (race condition)
- [ ] Rate limiting on sensitive endpoints (20/hour)
- [ ] User can only change their own email
- [ ] Verification link doesn't require authentication
- [ ] All pending tokens cancelled when new one created
- [ ] Error messages don't leak information
- [ ] Sensitive data (tokens) not logged

---

## Testing Checklist

### Backend Tests

- [ ] Email change initiation (valid)
- [ ] Email change initiation (invalid email)
- [ ] Email change initiation (existing email)
- [ ] Email change verification (valid token)
- [ ] Email change verification (expired token)
- [ ] Email change verification (already used)
- [ ] Email change verification (redirect with slug)
- [ ] Email change verification (redirect fallback - no starship)
- [ ] Email change resend
- [ ] Email change cancel
- [ ] Email change status
- [ ] Direct email update blocked
- [ ] Rate limiting works (20/hour)
- [ ] Authorization checks

### Frontend Tests

- [ ] Email change initiation
- [ ] Pending state display
- [ ] Resend email
- [ ] Cancel email change
- [ ] Verification redirect (success)
- [ ] Verification redirect (error)
- [ ] Query parameter handling
- [ ] Error handling
- [ ] Loading states
- [ ] Toast notifications

### Integration Tests

- [ ] Full flow: Initiate → Verify → Complete
- [ ] Full flow: Initiate → Cancel
- [ ] Full flow: Initiate → Resend → Verify
- [ ] Edge case: Change email twice
- [ ] Edge case: Expired token
- [ ] Edge case: Email taken during verification
- [ ] Edge case: User has no starship (redirect fallback)

---

## Rollout Plan

1. **Development**: Follow phases 1-5
2. **Code Review**: Review all changes
3. **Staging Testing**: Full test suite on staging
4. **User Acceptance Testing**: Test with real users (optional)
5. **Production Deployment**: Deploy with feature flag (optional)
6. **Monitoring**: Monitor logs and errors
7. **Documentation**: Update user-facing docs if needed

---

## Notes

- Follow existing code patterns throughout
- Maintain consistency with password reset and email verification flows
- Ensure backward compatibility (no breaking changes)
- All changes should be testable
- Consider adding feature flag for gradual rollout (optional)

## Elegant Solutions Summary

### Code Reuse & Extension Strategy

1. **No New Error Classes**: Reuse existing `ValidationError` and `InvalidTokenError`
2. **No New Route Files**: Extend existing `auth.ts` and `users.ts` route files
3. **No New Components**: Extend existing `AccountForm` component
4. **Helper Method**: Create `getProfileRedirectPath()` in UserService to:
   - Encapsulate starship lookup logic
   - Remove duplication in OAuth handlers
   - Reuse in email change verification
5. **Pattern Matching**: Follow exact patterns from existing code:
   - Email verification route pattern
   - OAuth query param handling pattern
   - LoginForm query param handling pattern
6. **Extension over Creation**: Extend existing functionality rather than creating new files/components

### Benefits

- ✅ Less code to maintain
- ✅ Consistent patterns across codebase
- ✅ Removes existing duplication (OAuth handlers)
- ✅ Easier to test (follows existing test patterns)
- ✅ Easier to understand (follows established conventions)

---

## Follow-Up Questions & Concerns

### Questions to Resolve Before Implementation

1. **OAuth Refactoring**:
   - **Question**: Should we refactor OAuth handlers to use `getProfileRedirectPath()` helper as part of this feature?
   - **Impact**: Removes code duplication (lines 465-505 in `auth.ts`)
   - **Recommendation**: Yes, but can be done in separate commit if preferred

2. **Token Error Reuse**:
   - **Question**: Is `InvalidTokenError` generic enough for email change tokens, or should we extend it?
   - **Current**: `InvalidTokenError` extends `EmailVerificationError` (which extends `ValidationError`)
   - **Analysis**: The message is generic: "Invalid or expired verification token" - works for any token
   - **Elegant Solution**: Reuse `InvalidTokenError` as-is (it's generic enough)
   - **Alternative**: Could create `EmailChangeTokenError` extending `InvalidTokenError` if we need specific messages, but not necessary
   - **Recommendation**: Reuse as-is (follows DRY principle, message is generic enough)

3. **Redirect Fallback Behavior**:
   - **Question**: If user has no starship, redirect to `/login?emailChange=success` or `/profile?emailChange=success`?
   - **Analysis**:
     - Email verification: Always `/login?verification=success` (user not logged in yet)
     - OAuth linking: `/ship/{slug}/settings/profile` if starship, `/profile?oauth_link=success` if no starship (user logged in)
     - Email change: User might not be logged in when clicking link (session expired, different browser)
   - **Elegant Solution**:
     - If starship found: `/ship/{slug}/settings/profile?emailChange=success` (matches OAuth pattern)
     - If no starship: `/login?emailChange=success` (matches email verification pattern - user might not be logged in)
   - **Implementation**: Helper method returns `/profile` if no starship, but route handler checks and redirects to `/login` if no starship
   - **Recommendation**: `/login?emailChange=success` for no starship (consistent with email verification, safer for logged-out users)

4. **Email Change Status Polling**:
   - **Question**: Should we poll for email change status, or just fetch on mount?
   - **Analysis**: OAuth doesn't poll, just fetches on mount
   - **Recommendation**: Fetch on mount only (no polling)

5. **Toast Notification Timing**:
   - **Question**: Should we show toast immediately or wait for query param?
   - **Analysis**: OAuth shows toast on query param, LoginForm shows toast on query param
   - **Recommendation**: Show toast on query param (consistent with existing patterns)

6. **Error Message Specificity**:
   - **Question**: Should error messages distinguish between expired token vs invalid token?
   - **Analysis**: `InvalidTokenError` message is generic: "Invalid or expired verification token"
   - **Recommendation**: Keep generic (consistent with email verification), but could add details if needed

7. **Helper Method Location**:
   - **Question**: Should `getProfileRedirectPath()` be in `UserService` or a separate utility?
   - **Analysis**: It's user-related logic, uses `StarshipRepository`, fits in `UserService`
   - **Recommendation**: Keep in `UserService` (matches existing service patterns)

### Potential Edge Cases to Consider

1. **User changes email while logged out**:
   - Scenario: User initiates email change, logs out, then clicks verification link
   - **Resolution**: Token-based verification doesn't require login (already handled)

2. **User has multiple starships**:
   - Scenario: User has multiple starships, which one to redirect to?
   - **Resolution**: Use first active starship or first starship (same as OAuth pattern)

3. **User deletes starship between request and verification**:
   - Scenario: User initiates email change, deletes starship, then verifies
   - **Resolution**: Fallback to `/login` or `/profile` (handled by helper method)

4. **Concurrent email change requests**:
   - Scenario: User initiates two email changes quickly
   - **Resolution**: Cancel old token when new one is created (already in plan)

5. **Email change while OAuth linking in progress**:
   - Scenario: User initiates email change, then starts OAuth linking
   - **Resolution**: Both use different tokens, shouldn't conflict

### Concerns Addressed

- ✅ **No hacky solutions**: All solutions extend existing functionality
- ✅ **No duct-taping**: All solutions follow established patterns
- ✅ **Code reuse**: Maximum reuse of existing code
- ✅ **Consistency**: Follows exact patterns from existing code
- ✅ **Maintainability**: Less code, more reusable helpers

---

## Key Decisions Made

1. **Route Location**: Email change verification route in `auth.ts` EMAIL VERIFICATION ROUTES section (matches auth flows), user management routes in `users.ts` USER MANAGEMENT ENDPOINTS section
2. **Verification URL**: `/auth/email/change/verify?token=xxx` (consistent with `/auth/verify-email`)
3. **Redirect Pattern**: **Extend UserService with `getProfileRedirectPath()` helper** (encapsulates starship lookup, can refactor OAuth to use it)
4. **Error Code**: Use existing `ValidationError` and `InvalidTokenError` classes (no new error classes needed)
5. **Rate Limiting**: Use existing `rateLimiters.sensitive` (20/hour, follows existing pattern)
6. **Query Parameter Handling**: **Extend AccountForm component** with `useSearchParams()` (like OAuth settings pattern)
7. **Code Reuse**: Extend existing functionality rather than creating new files/components where possible
