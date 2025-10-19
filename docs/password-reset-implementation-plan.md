# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature will follow the existing email verification pattern and maintain consistency with the 6-layer architecture.

**Status**: 🟡 Planned (Simplified & Focused)  
**Priority**: High  
**Estimated Timeline**: 1-1.5 days (focused implementation)  
**Architecture Pattern**: Token-based (mirroring email verification pattern exactly)

## 📊 Live Progress Tracker

**Overall Progress**: 0% Complete (0/5 phases)

| Phase | Status | Progress | Completion |
|-------|--------|----------|------------|
| **Phase 1** - Database & Backend Foundation | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 2** - Service & Email Layer | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 3** - API Routes & Middleware | 🔴 Not Started | 0/2 tasks | 0% |
| **Phase 4** - Frontend Components | 🔴 Not Started | 0/4 tasks | 0% |
| **Phase 5** - Pages & Routing | 🔴 Not Started | 0/2 tasks | 0% |

**Legend**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## ⚡ Key Design Decisions

- **Mirror email verification exactly** - copy and adapt existing patterns
- **Reuse EmailVerificationTokenEntity pattern** for PasswordResetTokenEntity
- **Keep password reset in UserService** (no separate orchestrator needed)
- **Create separate PasswordResetErrors.ts** (no renaming of existing files)
- **Follow existing service instantiation patterns** (no constructor injection changes)
- **Simple rate limiting** following email verification patterns
- **Generic error messages** to prevent user enumeration
- **Focus on core functionality** - no architectural refactoring

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

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 1.1: Add Password Reset Database Table 🔴 Not Started
**Action**: Create password reset tokens table following email verification pattern
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create new migration file `006_add_password_reset_tokens.sql`
- [ ] 🔴 Copy email verification table structure with these changes:
  - Table name: `password_reset_tokens`
  - Expiry: `DEFAULT (NOW() + INTERVAL '1 hour')` (instead of 24 hours)
  - Comment: 'Password reset tokens - 1 hour expiry for security'

#### Task 1.2: Entity Layer 🔴 Not Started
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity.ts as template
- [ ] 🔴 Change class name to PasswordResetTokenEntity  
- [ ] 🔴 Update factory method expiry: 1 hour instead of 24 hours

#### Task 1.3: Repository Layer 🔴 Not Started
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository.ts as template
- [ ] 🔴 Change table name from 'email_verification_tokens' to 'password_reset_tokens'
- [ ] 🔴 Keep same methods: `generateToken()`, `validateAndConsumeToken()`, `getTokenInfo()`

### Phase 2: Service & Email Layer (Day 1) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 2.1: User Service Updates 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add `requestPasswordReset(email)` method following `sendEmailVerification()` pattern
- [ ] 🔴 Add `validateResetToken(token)` method following `getVerificationTokenInfo()` pattern  
- [ ] 🔴 Add `resetPasswordWithToken(token, password)` method following `verifyEmailAddress()` pattern
- [ ] 🔴 Use same error handling and instantiation patterns as email verification

#### Task 2.2: Email Service Updates 🔴 Not Started
**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add `sendPasswordResetEmail(email, token)` method copying `sendVerificationEmail` pattern
- [ ] 🔴 Create password reset email template copying verification template
- [ ] 🔴 Update template to include 1-hour expiry warning

#### Task 2.3: Error Handling 🔴 Not Started
**File**: `packages/server/src/errors/PasswordResetErrors.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create new PasswordResetErrors.ts file copying EmailVerificationErrors.ts pattern
- [ ] 🔴 Add PasswordResetSendError and PasswordResetTokenError classes

### Phase 3: API Routes & Middleware (Day 1) 🔴 Not Started

**Phase Progress**: 0/2 tasks complete (0%)

#### Task 3.1: Rate Limiting 🔴 Not Started
**File**: `packages/server/src/middleware/rate-limit.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add `forgotPasswordRateLimit` following existing pattern (3 requests per 15 minutes)
- [ ] 🔴 Add `resetPasswordRateLimit` following existing pattern (5 requests per 5 minutes)

#### Task 3.2: API Endpoints 🔴 Not Started
**File**: `packages/server/src/routes/auth.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add Zod schemas copying existing auth schemas pattern
- [ ] 🔴 Add `POST /auth/forgot-password` endpoint following resend-verification pattern
- [ ] 🔴 Add `POST /auth/reset-password` endpoint following set-password pattern
- [ ] 🔴 Follow existing validation and response patterns exactly

### Phase 4: Frontend Components (Day 1) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 4.1: Auth Hook Updates 🔴 Not Started
**File**: `packages/client/src/hooks/useAuth.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add AUTH_QUERY_KEYS for password reset following existing pattern
- [ ] 🔴 Add `requestPasswordReset` mutation copying `resendVerification` pattern
- [ ] 🔴 Add `resetPassword` mutation copying `login` pattern

#### Task 4.2: Forgot Password Form 🔴 Not Started
**File**: `packages/client/src/components/auth/ForgotPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy LoginForm pattern for email input and validation
- [ ] 🔴 Use requestPasswordReset mutation
- [ ] 🔴 Show success/error states following existing patterns

#### Task 4.3: Reset Password Form 🔴 Not Started
**File**: `packages/client/src/components/auth/ResetPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy SetPasswordDialog password input patterns
- [ ] 🔴 Use resetPassword mutation
- [ ] 🔴 Handle token validation and password reset flow

#### Task 4.4: Login Form Updates 🔴 Not Started
**File**: `packages/client/src/components/auth/LoginForm.tsx`
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/1 complete):
- [ ] 🔴 Add "Forgot Password?" link below password field

### Phase 5: Pages & Routing (Day 1) 🔴 Not Started

**Phase Progress**: 0/2 tasks complete (0%)

#### Task 5.1: Forgot Password Page 🔴 Not Started
**File**: `packages/client/src/app/forgot-password/page.tsx`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy login page structure and replace form with ForgotPasswordForm
- [ ] 🔴 Add "Back to login" link

#### Task 5.2: Reset Password Page 🔴 Not Started
**File**: `packages/client/src/app/reset-password/page.tsx`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy login page structure and replace form with ResetPasswordForm
- [ ] 🔴 Handle token from URL searchParams

**Note**: Documentation and testing will be handled in a separate PR to keep this implementation focused

## Security Considerations

### Simple Security Implementation
- **Token Generation**: 32-byte cryptographically secure random tokens (same as email verification)
- **Token Expiry**: 1-hour lifetime (shorter than email verification's 24 hours)
- **Token Consumption**: One-time use with atomic database operations (same pattern)
- **Rate Limiting**: Simple IP-based rate limiting following existing patterns
- **Error Messages**: Generic messages to prevent user enumeration
- **User Validation**: Allow password reset for users with `hasPassword = true`

## Testing Strategy

### Manual Testing Checklist
- [ ] Happy path: Valid email → receive email → reset password → login
- [ ] Expired token handling
- [ ] Invalid token handling
- [ ] Rate limiting triggers correctly
- [ ] OAuth-only users cannot reset
- [ ] Password validation works
- [ ] Email arrives within reasonable time

**Note**: Automated testing will be implemented in a separate PR

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

## 📈 Simplified Time Estimates

### Total Estimated Time: **7.5 hours** in 1-1.5 days

| Phase | Tasks | Est. Time | 
|-------|-------|-----------|
| **Phase 1** | 3 tasks | 1.75 hours |
| **Phase 2** | 3 tasks | 2 hours |
| **Phase 3** | 2 tasks | 1.25 hours |
| **Phase 4** | 4 tasks | 2 hours |
| **Phase 5** | 2 tasks | 0.5 hours |

### Focused Timeline

```
Day 1 (7.5h): Database table, Entity/Repository copy, Service methods, API endpoints, Frontend forms, Pages
```

**Key Benefits**:
- **Simple copying**: Mirror email verification patterns exactly
- **No refactoring**: Don't touch existing working code
- **Focused scope**: Core password reset functionality only

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

## 🎯 Simplified Implementation Summary

### ✅ **Simple Copy & Adapt Approach**

| Component | Approach |
|-----------|----------|
| **Database** | Copy email verification table schema, change name and expiry |
| **Entity** | Copy EmailVerificationTokenEntity, rename class |
| **Repository** | Copy EmailVerificationTokenRepository, change table name |
| **Service** | Add 3 methods to UserService following existing patterns |
| **Routes** | Add 2 endpoints following existing auth route patterns |
| **Client** | Add 2 mutations following existing auth hook patterns |
| **Forms** | Copy existing form patterns, adapt for password reset |
| **Pages** | Copy login page structure, swap forms |

### 🎯 **Key Benefits**

- **Simple and fast** - mirror existing patterns exactly
- **Low risk** - no changes to working code
- **Consistent UX** - users see familiar interfaces
- **Easy maintenance** - same patterns throughout codebase
- **Focused scope** - core functionality only

---

**Document Version**: 4.0.0 (Simplified Implementation)  
**Created**: 2025-01-19  
**Simplified**: 2025-01-19  
**Author**: System Architecture Team  
**Status**: Ready for Implementation (simple copy & adapt approach)