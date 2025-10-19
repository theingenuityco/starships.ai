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

- **Clean Architecture** - Fix inconsistent patterns while implementing password reset
- **Proper Dependency Injection** - Create ServiceContainer for consistent service instantiation
- **Dedicated AuthenticationService** - Extract authentication logic from bloated UserService
- **Unified Token Management** - Create TokenManagementService for all token types
- **Standardized Rate Limiting** - Consistent time windows and patterns
- **No Backward Compatibility** - Clean implementation since no production users
- **Fix Migration Numbering** - Resolve duplicate 002 migration files
- **Elegant Foundation** - Create maintainable patterns for future features

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

### Phase 1: Foundation & Migration Fix (Day 1) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 1.1: Fix Migration Numbering Crisis 🔴 Not Started
**Action**: Resolve duplicate 002 migration files
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Rename `002_add_promo_redemptions.sql` to `003_add_promo_redemptions.sql`
- [ ] 🔴 Rename `003_remove_waitlist_table.sql` to `004_remove_waitlist_table.sql`
- [ ] 🔴 Keep `002_add_email_verification_tokens.sql` as is

#### Task 1.2: Enhance ServiceFactory with Proper Dependency Injection 🔴 Not Started
**File**: `packages/server/src/services/ServiceFactory.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add repository factory methods to ServiceFactory
- [ ] 🔴 Update service creation methods to use proper DI
- [ ] 🔴 Ensure AuthenticationService gets all required dependencies

#### Task 1.3: Create Password Reset Database Table 🔴 Not Started
**File**: `005_add_password_reset_tokens.sql`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create migration file `005_add_password_reset_tokens.sql`
- [ ] 🔴 Copy email verification table structure with 1-hour expiry

### Phase 2: Service Architecture Refactor (Day 1-2) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 2.1: Add Protocol Layer Types 🔴 Not Started
**File**: `packages/protocol/src/domains/auth.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add AuthPasswordResetResponse and AuthPasswordResetConfirmResponse interfaces
- [ ] 🔴 Add TokenType enum and TokenConfig interface (if needed for client/server sharing)

#### Task 2.2: Create AuthenticationService 🔴 Not Started
**File**: `packages/server/src/services/AuthenticationService.ts`
**Assignee**: TBD | **Estimated**: 3 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Extract email verification logic from UserService
- [ ] 🔴 Implement password reset methods
- [ ] 🔴 Use proper dependency injection
- [ ] 🔴 Add comprehensive error handling

#### Task 2.3: Create PasswordResetTokenRepository 🔴 Not Started
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository pattern
- [ ] 🔴 Update for password_reset_tokens table

#### Task 2.4: Refactor UserService 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Remove inline repository instantiations
- [ ] 🔴 Delegate authentication operations to AuthenticationService
- [ ] 🔴 Use proper dependency injection pattern

### Phase 3: Token Management System (Day 2) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 3.1: Create PasswordResetTokenEntity 🔴 Not Started
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity pattern
- [ ] 🔴 Update for 1-hour expiry and password reset context

#### Task 3.2: Integrate TokenManagementService 🔴 Not Started
**File**: Multiple files
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Register TokenManagementService in ServiceContainer
- [ ] 🔴 Register PasswordResetTokenRepository in container
- [ ] 🔴 Update AuthenticationService to use TokenManagementService

#### Task 3.3: Standardize Rate Limiting 🔴 Not Started
**File**: `packages/server/src/middleware/unified-rate-limit.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Create AuthRateLimits with SENSITIVE, REGISTRATION, GENERAL tiers
- [ ] 🔴 Standardize time windows (5min, 15min, 1hour)
- [ ] 🔴 Update existing rate limits to use new system

### Phase 4: Password Reset Implementation (Day 3) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 4.1: API Routes Implementation 🔴 Not Started
**File**: `packages/server/src/routes/auth.ts`
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add Zod schemas for password reset requests
- [ ] 🔴 Add `POST /auth/forgot-password` endpoint with proper rate limiting
- [ ] 🔴 Add `POST /auth/reset-password` endpoint
- [ ] 🔴 Use AuthenticationService instead of UserService

#### Task 4.2: Email Service Extension 🔴 Not Started
**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add sendPasswordResetEmail() method following sendVerificationEmail() pattern
- [ ] 🔴 Add generatePasswordResetTemplate() method mirroring existing template style
- [ ] 🔴 Include 1-hour expiry warning in templates

#### Task 4.3: Update ServiceFactory Registration 🔴 Not Started
**File**: `packages/server/src/services/ServiceFactory.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add createAuthenticationService() method to ServiceFactory
- [ ] 🔴 Ensure routes can access AuthenticationService via ServiceFactory

### Phase 5: Frontend & Integration (Day 3-4) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 5.1: Frontend Hooks & Forms 🔴 Not Started
**Files**: `useAuth.ts`, `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add password reset mutations to useAuth hook
- [ ] 🔴 Create ForgotPasswordForm component
- [ ] 🔴 Create ResetPasswordForm component
- [ ] 🔴 Add "Forgot Password?" link to LoginForm

#### Task 5.2: Pages & Routing 🔴 Not Started
**Files**: `forgot-password/page.tsx`, `reset-password/page.tsx`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Create forgot password page
- [ ] 🔴 Create reset password page with token handling

#### Task 5.3: Integration Testing & Cleanup 🔴 Not Started
**File**: Multiple files
**Assignee**: TBD | **Estimated**: 2 hours | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Test complete password reset flow
- [ ] 🔴 Verify all services use proper DI
- [ ] 🔴 Remove any remaining anti-patterns
- [ ] 🔴 Run lint and type-check

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

### Total Estimated Time: **18 hours** in 2-3 days

| Phase | Tasks | Est. Time | 
|-------|-------|-----------|
| **Phase 1** | 3 tasks | 1.5 hours |
| **Phase 2** | 4 tasks | 6 hours |
| **Phase 3** | 3 tasks | 2.5 hours |
| **Phase 4** | 3 tasks | 3 hours |
| **Phase 5** | 3 tasks | 5 hours |

### Clean Architecture Timeline

```
Day 1 (7h): Migration fix, ServiceFactory enhancement, AuthenticationService, password reset table
Day 2 (6h): Complete service refactoring, PasswordResetTokenRepository, rate limiting standardization  
Day 3 (5h): API implementation, email service extension, frontend components, testing
```

**Key Benefits**:
- **Clean Architecture**: Proper dependency injection and service separation
- **Future-Proof**: Extensible foundation for authentication features
- **Maintainable**: Consistent patterns across the entire codebase
- **No Technical Debt**: Fix existing inconsistencies while adding new feature

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

### ✅ **Clean Architecture Approach**

| Component | Approach |
|-----------|----------|
| **Foundation** | Enhanced ServiceFactory with proper dependency injection |
| **Services** | AuthenticationService in existing services/ folder |
| **Database** | Password reset table + fix migration numbering |
| **Repositories** | PasswordResetTokenRepository following existing patterns |
| **Rate Limiting** | Standardized AuthRateLimits with consistent time windows |
| **Email** | Extend existing EmailService with password reset methods |
| **Routes** | Clean API endpoints using AuthenticationService via ServiceFactory |
| **Frontend** | Password reset forms and pages |

### 🎯 **Key Benefits**

- **Clean Architecture** - Proper separation of concerns and DI
- **Future-Proof** - Extensible foundation for 2FA, magic links, etc.
- **Maintainable** - Consistent patterns that scale
- **No Technical Debt** - Fix existing issues while adding features
- **Professional Codebase** - Architecture that new developers can understand

---

**Document Version**: 5.0.0 (Clean Architecture Implementation)  
**Created**: 2025-01-19  
**Refactored**: 2025-01-19  
**Author**: System Architecture Team  
**Status**: Ready for Implementation (clean architecture approach)