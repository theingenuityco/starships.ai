# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature will follow the existing email verification pattern and maintain consistency with the 6-layer architecture.

**Status**: 🔴 Not Started  
**Priority**: High  
**Estimated Timeline**: 3-4 days  
**Architecture Pattern**: Token-based (following email verification pattern)

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

### Phase 1: Database & Backend Foundation (Day 1)

#### Task 1.1: Database Migration
**File**: `packages/models/migrations/004_add_password_reset_tokens.sql`
- [ ] Create password_reset_tokens table
- [ ] Add indexes for performance
- [ ] Set 1-hour expiry default
- [ ] Add cascade delete for user references

#### Task 1.2: Entity Layer
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
- [ ] Create PasswordResetTokenEntity class
- [ ] Implement validation methods
- [ ] Add transformers for email/token
- [ ] Create factory method for token creation

#### Task 1.3: Repository Layer
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
- [ ] Extend BaseRepository
- [ ] Implement `generateToken()` method
- [ ] Implement `validateAndConsumeToken()` method
- [ ] Add `invalidateExistingTokens()` helper
- [ ] Add `getTokenInfo()` for validation

#### Task 1.4: Error Handling
**File**: `packages/server/src/errors/PasswordResetErrors.ts`
- [ ] Create PasswordResetError base class
- [ ] Add InvalidPasswordResetTokenError
- [ ] Add PasswordResetSendError
- [ ] Extend from existing error hierarchy

### Phase 2: Service & Email Layer (Day 1-2)

#### Task 2.1: User Service Updates
**File**: `packages/server/src/services/UserService.ts`
- [ ] Add `requestPasswordReset(email)` method
- [ ] Add `resetPasswordWithToken(token, password)` method
- [ ] Add `validateResetToken(token)` method
- [ ] Implement security checks for OAuth users
- [ ] Add comprehensive logging

#### Task 2.2: Email Service Updates
**File**: `packages/server/src/services/EmailService.ts`
- [ ] Add `sendPasswordResetEmail()` method
- [ ] Create HTML email template
- [ ] Create text email template
- [ ] Include 1-hour expiry warning
- [ ] Style consistently with verification emails

#### Task 2.3: Service Factory
**File**: `packages/server/src/services/ServiceFactory.ts`
- [ ] Add createPasswordResetTokenRepository method
- [ ] Wire up dependencies

### Phase 3: API Routes & Middleware (Day 2)

#### Task 3.1: Rate Limiting
**File**: `packages/server/src/middleware/rate-limit.ts`
- [ ] Add passwordResetRateLimit (3 per 15 min)
- [ ] Configure IP-based limiting
- [ ] Add appropriate error messages

#### Task 3.2: API Endpoints
**File**: `packages/server/src/routes/auth.ts`
- [ ] Add `POST /auth/forgot-password` endpoint
- [ ] Add `POST /auth/reset-password` endpoint
- [ ] Add `GET /auth/reset-password/validate` endpoint
- [ ] Implement Zod schemas for validation
- [ ] Apply rate limiting middleware
- [ ] Add proper error handling

### Phase 4: Frontend Components (Day 2-3)

#### Task 4.1: Auth Hook Updates
**File**: `packages/client/src/hooks/useAuth.ts`
- [ ] Add `requestPasswordReset` mutation
- [ ] Add `resetPassword` mutation
- [ ] Add `validateResetToken` query
- [ ] Handle error states
- [ ] Add loading states

#### Task 4.2: Forgot Password Form
**File**: `packages/client/src/components/auth/ForgotPasswordForm.tsx`
- [ ] Create form component
- [ ] Add email input with validation
- [ ] Show success message after submission
- [ ] Handle rate limiting errors
- [ ] Add loading states

#### Task 4.3: Reset Password Form
**File**: `packages/client/src/components/auth/ResetPasswordForm.tsx`
- [ ] Create form component
- [ ] Add password/confirm password inputs
- [ ] Validate token on mount
- [ ] Handle expired tokens
- [ ] Show success and redirect

#### Task 4.4: Login Form Updates
**File**: `packages/client/src/components/auth/LoginForm.tsx`
- [ ] Add "Forgot Password?" link
- [ ] Position below password field
- [ ] Style consistently

### Phase 5: Pages & Routing (Day 3)

#### Task 5.1: Forgot Password Page
**File**: `packages/client/src/app/forgot-password/page.tsx`
- [ ] Create page component
- [ ] Add page layout and styling
- [ ] Include back to login link
- [ ] Add meta tags for SEO

#### Task 5.2: Reset Password Page
**File**: `packages/client/src/app/reset-password/page.tsx`
- [ ] Create page component
- [ ] Handle token from query params
- [ ] Show appropriate error states
- [ ] Redirect after success

### Phase 6: Testing & Documentation (Day 3-4)

#### Task 6.1: Unit Tests
- [ ] Test token generation and validation
- [ ] Test service methods
- [ ] Test API endpoints
- [ ] Test React components

#### Task 6.2: Integration Tests
- [ ] Test complete forgot password flow
- [ ] Test token expiry
- [ ] Test rate limiting
- [ ] Test OAuth user restrictions

#### Task 6.3: Documentation
- [ ] Update API documentation
- [ ] Add user guide
- [ ] Document security considerations
- [ ] Update changelog

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

## Timeline

```
Day 1: Database, Entity, Repository, Errors
Day 2: Services, Email Templates, API Routes
Day 3: Frontend Components, Pages
Day 4: Testing, Documentation, Review
```

## Approval & Sign-off

- [ ] Architecture Review
- [ ] Security Review
- [ ] Code Review
- [ ] Testing Complete
- [ ] Documentation Complete
- [ ] Deployment Ready

## Notes

- Follow existing email verification pattern for consistency
- Maintain clean separation between layers
- Comprehensive logging at each step
- Consider future enhancements (2FA, security questions)

---

**Document Version**: 1.0.0  
**Created**: 2025-01-19  
**Author**: System Architecture Team  
**Status**: Draft - Pending Review