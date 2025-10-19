# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature will follow the existing email verification pattern and maintain consistency with the 6-layer architecture.

**Status**: 🟡 Planned (Clean Architecture)  
**Priority**: High  
**Estimated Timeline**: 3-4 days (clean architectural implementation)  
**Architecture Pattern**: Proper dependency injection with dedicated services

## 📊 Live Progress Tracker

**Overall Progress**: 0% Complete (0/5 phases)

| Phase | Status | Progress | Completion |
|-------|--------|----------|------------|
| **Phase 1** - Foundation & Migration Fix | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 2** - Service Architecture Refactor | 🔴 Not Started | 0/4 tasks | 0% |
| **Phase 3** - Token Management System | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 4** - Password Reset Implementation | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 5** - Frontend & Integration | 🔴 Not Started | 0/3 tasks | 0% |

**Legend**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## ⚡ Key Design Decisions

- **Fix Repository Anti-Patterns** - Add EmailVerificationTokenRepository as UserService class property (not inline instantiation)
- **Consistent Service Dependencies** - Services own their repositories as class properties (following ConversationService pattern)
- **Simple ServiceFactory Usage** - Keep existing ServiceFactory pattern, no complex DI needed
- **Add Password Reset Repository** - PasswordResetTokenRepository as UserService class property
- **Standardized Rate Limiting** - Add password reset rate limit following existing patterns
- **Fix Migration Numbering** - Simple sequential renaming of duplicate 002 files
- **Minimal Architectural Changes** - Fix only what's broken, don't over-engineer

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

### Phase 1: Foundation & Migration Fix (30 minutes) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 1.1: Fix Migration Numbering 🔴 Not Started
**Action**: Simple sequential renaming of duplicate 002 migration files
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Rename `002_add_promo_redemptions.sql` to `003_add_promo_redemptions.sql`
- [ ] 🔴 Rename `003_remove_waitlist_table.sql` to `004_remove_waitlist_table.sql`
- [ ] 🔴 Keep `002_add_email_verification_tokens.sql` as is

#### Task 1.2: Fix UserService Repository Anti-Patterns 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add `emailVerificationTokenRepository` as class property
- [ ] 🔴 Add `emailService` as class property  
- [ ] 🔴 Remove inline repository instantiation and dynamic imports

#### Task 1.3: Create Password Reset Database Table 🔴 Not Started
**File**: `005_add_password_reset_tokens.sql`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create migration file `005_add_password_reset_tokens.sql`
- [ ] 🔴 Copy email verification table structure with 1-hour expiry

### Phase 2: Password Reset Implementation (2 hours) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 2.1: Add Protocol Layer Types 🔴 Not Started
**File**: `packages/protocol/src/domains/auth.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add AuthPasswordResetResponse interface
- [ ] 🔴 Add AuthPasswordResetConfirmResponse interface

#### Task 2.2: Create PasswordResetTokenEntity 🔴 Not Started
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity pattern exactly
- [ ] 🔴 Update for 1-hour expiry instead of 24 hours

#### Task 2.3: Create PasswordResetTokenRepository 🔴 Not Started
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository pattern exactly
- [ ] 🔴 Update table name to password_reset_tokens

#### Task 2.4: Add Password Reset to UserService 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add `passwordResetTokenRepository` as class property
- [ ] 🔴 Add `sendPasswordReset(email: string)` method
- [ ] 🔴 Add `resetPassword(token: string, newPassword: string)` method
- [ ] 🔴 Follow exact pattern of email verification methods

### Phase 3: API Routes & Email Service (1.5 hours) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 3.1: Add Password Reset API Routes 🔴 Not Started
**File**: `packages/server/src/routes/auth.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add Zod schema for password reset request
- [ ] 🔴 Add `POST /auth/forgot-password` endpoint
- [ ] 🔴 Add `POST /auth/reset-password` endpoint  
- [ ] 🔴 Add password reset rate limiting middleware

#### Task 3.2: Extend EmailService 🔴 Not Started
**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add `sendPasswordResetEmail()` method
- [ ] 🔴 Create password reset email template (copy verification template pattern)

#### Task 3.3: Add Password Reset Rate Limiting 🔴 Not Started
**File**: `packages/server/src/middleware/rate-limit.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add `passwordResetRateLimit` (5 requests per 15 minutes)
- [ ] 🔴 Follow existing rate limit patterns exactly

### Phase 4: Frontend Implementation (1 hour) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 4.1: Create Password Reset Forms 🔴 Not Started
**Files**: `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Create ForgotPasswordForm component
- [ ] 🔴 Create ResetPasswordForm component with token handling
- [ ] 🔴 Add "Forgot Password?" link to LoginForm

#### Task 4.2: Create Password Reset Pages 🔴 Not Started
**Files**: `forgot-password/page.tsx`, `reset-password/page.tsx`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create forgot password page
- [ ] 🔴 Create reset password page with token from URL

#### Task 4.3: Add Password Reset to useAuth Hook 🔴 Not Started
**File**: `packages/client/src/hooks/useAuth.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add `useForgotPassword` mutation
- [ ] 🔴 Add `useResetPassword` mutation

### Phase 5: Testing & Cleanup (30 minutes) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 5.1: Manual Testing 🔴 Not Started
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Test forgot password flow end-to-end
- [ ] 🔴 Test expired token handling
- [ ] 🔴 Test rate limiting triggers
- [ ] 🔴 Verify email delivery

#### Task 5.2: Code Quality Checks 🔴 Not Started
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Run `pnpm lint`
- [ ] 🔴 Run `pnpm type-check`

#### Task 5.3: Documentation Update 🔴 Not Started
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Update API documentation if needed
- [ ] 🔴 Mark implementation as complete in this document

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

### Total Estimated Time: **5.5 hours** (vs original 18 hours)

| Phase | Tasks | Est. Time | 
|-------|-------|-----------|
| **Phase 1** - Foundation | 3 tasks | 30 minutes |
| **Phase 2** - Password Reset Core | 4 tasks | 2 hours |
| **Phase 3** - API & Email | 3 tasks | 1.5 hours |
| **Phase 4** - Frontend | 3 tasks | 1 hour |
| **Phase 5** - Testing | 3 tasks | 30 minutes |

### Realistic Timeline

```
Morning (2.5h): Foundation fixes, password reset entity/repository, UserService updates
Afternoon (3h): API routes, email templates, frontend components, testing
```

**Key Benefits**:
- **Follows Existing Patterns**: Uses established service patterns from ConversationService, AgentService
- **Fixes Anti-Patterns**: Removes inline repository instantiation in UserService
- **Minimal Changes**: Only fixes what's broken, doesn't over-engineer
- **Quick Implementation**: 5.5 hours instead of 18 hours

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

### ✅ **Implementation Approach**

| Component | Current Issue | Fix |
|-----------|--------------|-----|
| **UserService** | Inline repository instantiation | Add repositories as class properties |
| **Email Verification** | Creates repos on-the-fly | Use class property pattern |
| **Password Reset** | Doesn't exist | Copy email verification pattern exactly |
| **Migrations** | Duplicate 002 files | Simple rename to sequential numbers |
| **Rate Limiting** | Missing password reset | Add following existing patterns |
| **ServiceFactory** | Works fine | Keep as-is, no changes needed |

### 🎯 **Key Principles**

- **Follow Existing Patterns** - ConversationService, AgentService show the way
- **Don't Over-Engineer** - No new abstractions or complex DI
- **Fix What's Broken** - Address specific anti-patterns only
- **Copy What Works** - Email verification pattern works, just needs consistency
- **Quick Win** - 5.5 hour implementation, not 18 hours

---

**Document Version**: 6.0.0 (Simplified Pattern-Following Implementation)  
**Created**: 2025-01-19  
**Last Updated**: 2025-01-19  
**Author**: Engineering Team  
**Status**: Ready for Implementation (follows existing patterns, fixes anti-patterns)