# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature will follow the existing email verification pattern and maintain consistency with the 6-layer architecture.

**Status**: 🟡 Planned (Architecture Refined)  
**Priority**: High  
**Estimated Timeline**: 2-3 days (reduced due to elegant extensions)  
**Architecture Pattern**: Token-based (extending email verification pattern)

## 📊 Live Progress Tracker

**Overall Progress**: 0% Complete (0/6 phases)

| Phase | Status | Progress | Completion |
|-------|--------|----------|------------|
| **Phase 1** - Database & Backend Foundation | 🔴 Not Started | 0/4 tasks | 0% |
| **Phase 2** - Service & Email Layer | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 3** - API Routes & Middleware | 🔴 Not Started | 0/2 tasks | 0% |
| **Phase 4** - Frontend Components | 🔴 Not Started | 0/4 tasks | 0% |
| **Phase 5** - Pages & Routing | 🔴 Not Started | 0/2 tasks | 0% |
| **Phase 6** - Testing & Documentation | 🔴 Not Started | 0/3 tasks | 0% |

**Legend**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## ⚡ Key Design Decisions

- **Extend existing patterns** instead of creating new files
- **Reuse EmailVerificationTokenEntity pattern** for PasswordResetTokenEntity
- **Keep password reset in UserService** (no separate orchestrator needed)
- **Extend EmailVerificationErrors** → AuthenticationErrors (unified error handling)
- **Eliminate client type duplication** by using protocol layer consistently

## Background

### Current State
- ✅ **Implemented**: Password change for logged-in users
- ✅ **Implemented**: Set password for OAuth-only users  
- ❌ **Missing**: Forgot password functionality for locked-out users
- ❌ **Missing**: Self-service password recovery

### Business Impact
- Users who forget passwords cannot access their accounts
- Support team must manually reset passwords
- Poor user experience leading to potential churn
- Security risk from manual password resets

## Architecture Overview

The implementation will follow the established 6-layer architecture:

```
┌─────────────────┐
│  Client Layer   │ → React components & hooks
├─────────────────┤
│   API Routes    │ → REST endpoints with Zod validation
├─────────────────┤
│  Service Layer  │ → Business logic & orchestration
├─────────────────┤
│ Repository Layer│ → Database operations
├─────────────────┤
│  Entity Layer   │ → Validation & transformation
├─────────────────┤
│ Protocol Layer  │ → Type definitions & interfaces
└─────────────────┘
```

## Implementation Phases

### Phase 1: Database & Backend Foundation (Day 1) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 1.1: Fix Migration Conflicts & Add Password Reset Table 🔴 Not Started
**Action**: Rename conflicting migration first, then add password reset
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Rename `002_add_email_verification_tokens.sql` → `004_add_email_verification_tokens.sql`
- [ ] 🔴 Create `005_add_password_reset_tokens.sql` (follow exact email verification pattern)
- [ ] 🔴 Copy email verification table structure with these changes:
  - Table name: `password_reset_tokens`
  - Expiry: `DEFAULT (NOW() + INTERVAL '1 hour')` (instead of 24 hours)
  - Comment: 'Password reset tokens - 1 hour expiry for security'

#### Task 1.2: Entity Layer 🔴 Not Started
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity.ts as template
- [ ] 🔴 Change class name to PasswordResetTokenEntity
- [ ] 🔴 Update factory method expiry: 1 hour instead of 24 hours
- [ ] 🔴 Keep all validation methods identical (reuse email/token transformers)

#### Task 1.3: Repository Layer 🔴 Not Started
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository.ts as template
- [ ] 🔴 Change table name from 'email_verification_tokens' to 'password_reset_tokens'
- [ ] 🔴 Add `invalidateExistingTokens()` method (unique to password reset)
- [ ] 🔴 Keep same methods: `generateToken()`, `validateAndConsumeToken()`, `getTokenInfo()`

#### Task 1.4: Error Handling (Elegant Extension) 🔴 Not Started
**Action**: Extend existing EmailVerificationErrors instead of creating new file
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/5 complete):
- [ ] 🔴 Rename `EmailVerificationErrors.ts` → `AuthenticationErrors.ts`
- [ ] 🔴 Rename `EmailVerificationError` → `AuthenticationError` (keep alias for compatibility)
- [ ] 🔴 Add `PasswordResetSendError` class (follows same pattern as EmailVerificationSendError)
- [ ] 🔴 Reuse `InvalidTokenError` for both email verification and password reset
- [ ] 🔴 Update exports in `errors/index.ts`

### Phase 2: Service & Email Layer (Day 1-2) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 2.1: User Service Updates (Extend Existing) 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/6 complete):
- [ ] 🔴 Add `passwordResetTokenRepository` to constructor (follows existing pattern)
- [ ] 🔴 Add `requestPasswordReset(email): Promise<AuthPasswordResetResponse>` method
- [ ] 🔴 Add `validateResetToken(token): Promise<AuthPasswordResetValidateResponse>` method
- [ ] 🔴 Add `resetPasswordWithToken(token, password): Promise<AuthPasswordResetCompleteResponse>` method
- [ ] 🔴 Follow existing `sendEmailVerification()` pattern for implementation
- [ ] 🔴 Prevent password reset for OAuth-only users (check `hasPassword` field)

#### Task 2.2: Email Service Updates (Follow Verification Pattern) 🔴 Not Started
**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 1.5 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/5 complete):
- [ ] 🔴 Add `sendPasswordResetEmail(email, token)` method (copy `sendVerificationEmail` pattern)
- [ ] 🔴 Create `generatePasswordResetTemplate()` method (copy verification template)
- [ ] 🔴 Create `generatePasswordResetTextTemplate()` method
- [ ] 🔴 Use red color scheme (vs blue for verification) to distinguish
- [ ] 🔴 Include 1-hour expiry warning (vs 24-hour for verification)

#### Task 2.3: Protocol Layer Updates (Extend Existing) 🔴 Not Started
**File**: `packages/protocol/src/domains/auth.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add `AuthPasswordResetResponse` interface (follows EmailVerificationResponse pattern)
- [ ] 🔴 Add `AuthPasswordResetValidateResponse` interface
- [ ] 🔴 Add `AuthPasswordResetCompleteResponse` interface
- [ ] 🔴 Update error codes to include password reset errors

### Phase 3: API Routes & Middleware (Day 2) 🔴 Not Started

**Phase Progress**: 0/2 tasks complete (0%)

#### Task 3.1: Rate Limiting (Extend Existing Pattern) 🔴 Not Started
**File**: `packages/server/src/middleware/rate-limit.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add `passwordResetRequestRateLimit` (15 min, 5 requests - matches emailVerificationRateLimit)
- [ ] 🔴 Add `passwordResetCompleteRateLimit` (5 min, 3 requests - matches resendVerificationRateLimit)
- [ ] 🔴 Follow exact same pattern as existing rate limiters
- [ ] 🔴 Use consistent error message format

#### Task 3.2: API Endpoints (Extend Existing Routes) 🔴 Not Started
**File**: `packages/server/src/routes/auth.ts`
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/6 complete):
- [ ] 🔴 Add Zod schemas following existing pattern (ForgotPasswordSchema, ResetPasswordSchema)
- [ ] 🔴 Add `POST /auth/forgot-password` endpoint (apply passwordResetRequestRateLimit)
- [ ] 🔴 Add `POST /auth/reset-password` endpoint (apply passwordResetCompleteRateLimit)
- [ ] 🔴 Add `GET /auth/reset-password/validate` endpoint (no rate limit - just validation)
- [ ] 🔴 Follow existing `validateData` helper pattern for Zod validation
- [ ] 🔴 Use existing `handleError` and `sendSuccess` response helpers

### Phase 4: Frontend Components (Day 2-3) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 4.1: Auth Hook Updates (Remove Duplication & Extend) 🔴 Not Started
**File**: `packages/client/src/hooks/useAuth.ts`
**Assignee**: TBD | **Estimated**: 1.5 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/6 complete):
- [ ] 🔴 REMOVE local type definitions (AuthUser, AuthMethod, AuthLoginResponse, etc.)
- [ ] 🔴 IMPORT types from `@starships/protocol` instead
- [ ] 🔴 Add AUTH_QUERY_KEYS for password reset (follows existing pattern)
- [ ] 🔴 Add `requestPasswordReset` mutation (follows `resendVerification` pattern)
- [ ] 🔴 Add `validateResetToken` query (follows TanStack Query pattern)
- [ ] 🔴 Add `resetPassword` mutation (follows `login` pattern)

#### Task 4.2: Forgot Password Form (Follow SetPasswordDialog Pattern) 🔴 Not Started
**File**: `packages/client/src/components/auth/ForgotPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/5 complete):
- [ ] 🔴 Copy SetPasswordDialog.tsx as template for form patterns
- [ ] 🔴 Use same UI components (Input, Label, Button, Alert)
- [ ] 🔴 Follow same error handling and loading patterns
- [ ] 🔴 Use same validation approach (client-side + server response)
- [ ] 🔴 Show success state similar to email verification pattern

#### Task 4.3: Reset Password Form (Extend SetPasswordDialog) 🔴 Not Started
**File**: `packages/client/src/components/auth/ResetPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 1.5 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/5 complete):
- [ ] 🔴 Copy SetPasswordDialog.tsx as template (same password input patterns)
- [ ] 🔴 Add token validation on mount using `validateResetToken` hook
- [ ] 🔴 Handle token states: valid, expired, consumed, invalid
- [ ] 🔴 Use same password validation as SetPasswordDialog
- [ ] 🔴 Follow SecurityCard.tsx pattern for password confirmation

#### Task 4.4: Login Form Updates (Minimal Addition) 🔴 Not Started
**File**: `packages/client/src/components/auth/LoginForm.tsx`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add single "Forgot Password?" link below password field
- [ ] 🔴 Use existing Link component and styling patterns
- [ ] 🔴 Link to `/forgot-password` route

### Phase 5: Pages & Routing (Day 2-3) 🔴 Not Started

**Phase Progress**: 0/2 tasks complete (0%)

#### Task 5.1: Forgot Password Page (Follow Login Page Pattern) 🔴 Not Started
**File**: `packages/client/src/app/forgot-password/page.tsx`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy login page structure and layout
- [ ] 🔴 Replace LoginForm with ForgotPasswordForm
- [ ] 🔴 Keep same Card container and styling
- [ ] 🔴 Add "Back to login" link (follows existing navigation patterns)

#### Task 5.2: Reset Password Page (Follow Login Page Pattern) 🔴 Not Started
**File**: `packages/client/src/app/reset-password/page.tsx`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy login page structure and layout
- [ ] 🔴 Replace LoginForm with ResetPasswordForm
- [ ] 🔴 Handle token from searchParams (Next.js 13+ pattern)
- [ ] 🔴 Add redirect logic after successful reset

### Phase 6: Testing & Documentation (Day 3) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 6.1: Follow Existing Test Patterns 🔴 Not Started
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy email verification test structure for password reset tests
- [ ] 🔴 Test repository methods (follow EmailVerificationTokenRepository test patterns)
- [ ] 🔴 Test service methods (follow UserService test patterns)
- [ ] 🔴 Test API endpoints (follow auth route test patterns)

#### Task 6.2: Integration Testing 🔴 Not Started
**Assignee**: TBD | **Estimated**: 1.5 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Test complete forgot password flow (email → token → reset → login)
- [ ] 🔴 Test token expiry and cleanup
- [ ] 🔴 Test rate limiting triggers and recovery
- [ ] 🔴 Test OAuth user restrictions (hasPassword check)

#### Task 6.3: Documentation Updates 🔴 Not Started
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Update existing API documentation (add 3 new endpoints)
- [ ] 🔴 Add password reset section to existing auth documentation
- [ ] 🔴 Update CHANGELOG.md with new feature

## Security Considerations

### Token Security
- **Generation**: 32-byte cryptographically secure random tokens
- **Storage**: Hashed tokens in database (future enhancement)
- **Expiry**: 1-hour lifetime (shorter than email verification)
- **Consumption**: One-time use with atomic database operations

### Rate Limiting
- **Forgot Password**: 3 requests per 15 minutes per IP
- **Reset Password**: Standard API rate limits apply
- **Error Messages**: Generic to prevent user enumeration

### Information Disclosure Prevention
- Never reveal if email exists in system
- Same response time for all requests
- Generic success messages
- Log attempts for monitoring

### OAuth User Handling
- Prevent password reset for OAuth-only accounts
- Suggest using OAuth provider for recovery
- Allow password reset only for users with existing passwords

## Testing Strategy

### Manual Testing Checklist
- [ ] Happy path: Valid email → receive email → reset password → login
- [ ] Expired token handling
- [ ] Invalid token handling
- [ ] Rate limiting triggers correctly
- [ ] OAuth-only users cannot reset
- [ ] Password validation works
- [ ] Email arrives within reasonable time

### Automated Testing
- Unit tests for all new methods
- Integration tests for complete flows
- Load testing for rate limiters
- Security testing for token validation

## Rollback Plan

If issues arise during deployment:

1. **Database**: No destructive changes, new table only
2. **Backend**: Feature flag to disable endpoints
3. **Frontend**: Hide "Forgot Password" link via feature flag
4. **Email**: Disable password reset emails in EmailService

## Success Metrics

- **Adoption Rate**: % of users using password reset
- **Success Rate**: % of initiated resets completed
- **Time to Complete**: Average time from request to login
- **Support Tickets**: Reduction in password-related tickets
- **Security**: No unauthorized password resets

## Dependencies

### External Dependencies
- AWS SES for email delivery (existing)
- PostgreSQL for token storage (existing)
- bcrypt for password hashing (existing)

### Internal Dependencies
- Email verification system (template)
- User service (existing)
- Authentication system (existing)
- Rate limiting middleware (existing)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Email delivery failure | Low | High | Retry mechanism, monitoring |
| Token collision | Very Low | Medium | UUID generation, unique constraint |
| Brute force attacks | Medium | High | Rate limiting, token complexity |
| User enumeration | Medium | Medium | Generic messages, consistent timing |
| OAuth user confusion | Low | Low | Clear messaging, different email |

## 📈 Detailed Time Estimates

### Total Estimated Time: **18.5 hours** across 3 days

| Phase | Tasks | Est. Time | Day |
|-------|-------|-----------|-----|
| **Phase 1** | 4 tasks | 3.25 hours | Day 1 |
| **Phase 2** | 3 tasks | 4.25 hours | Day 1-2 |
| **Phase 3** | 2 tasks | 3 hours | Day 2 |
| **Phase 4** | 4 tasks | 4 hours | Day 2-3 |
| **Phase 5** | 2 tasks | 1.25 hours | Day 3 |
| **Phase 6** | 3 tasks | 4.25 hours | Day 3 |

### Refined Timeline

```
Day 1 (7.5h): Database migration fix, Entity/Repository (copy existing), Error extension, Start services
Day 2 (7h): Complete services, Email templates, API routes, Protocol types, Start frontend
Day 3 (4h): Complete frontend, Pages, Testing, Documentation
```

**Time Saved**: 6+ hours due to elegant extensions rather than new implementations

## 🎯 Progress Tracking Instructions

### Status Updates
- **🔴 Not Started** → **🟡 In Progress** → **🟢 Complete** → **⚠️ Blocked**
- Update **Assignee** when work begins
- Update **Started** timestamp when moving to In Progress
- Update **Completed** timestamp when marking Complete
- Update phase progress percentages as tasks complete

### Completion Criteria
- [ ] All sub-tasks marked complete
- [ ] Code review passed
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Ready for deployment

## Approval & Sign-off

- [ ] Architecture Review
- [ ] Security Review
- [ ] Code Review
- [ ] Testing Complete
- [ ] Documentation Complete
- [ ] Deployment Ready

## Elegant Solutions Summary

### ✅ **Elegant Extensions vs New Implementations**

| Component | ❌ Original Plan | ✅ Refined Approach |
|-----------|------------------|---------------------|
| **Protocol Types** | Create new types | Extend existing auth.ts with response types |
| **Error Handling** | New PasswordResetErrors.ts | Rename EmailVerificationErrors → AuthenticationErrors |
| **Repository** | New implementation | Copy EmailVerificationTokenRepository pattern |
| **Entity** | New implementation | Copy EmailVerificationTokenEntity pattern |
| **Service** | New orchestrator | Extend existing UserService |
| **Rate Limiting** | Single rate limiter | Two rate limiters following existing pattern |
| **Client Types** | Keep duplicates | Remove duplicates, import from protocol |
| **Migration** | New 004 migration | Fix conflicts first, then 005 migration |

### 🎯 **Key Benefits**

- **50% less code** due to copying/extending existing patterns
- **Zero architectural debt** - follows established patterns exactly
- **Consistent UX** - users see familiar interfaces and error messages
- **Easier maintenance** - same patterns throughout codebase
- **Faster implementation** - no need to design from scratch

---

**Document Version**: 2.0.0 (Refined)  
**Created**: 2025-01-19  
**Refined**: 2025-01-19  
**Author**: System Architecture Team  
**Status**: Ready for Implementation