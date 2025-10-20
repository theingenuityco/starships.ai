# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature will follow the existing email verification pattern and maintain consistency with the 6-layer architecture.

**Status**: 🟡 Planned  
**Priority**: High  
**Estimated Timeline**: 6 hours (following existing patterns)  
**Architecture Pattern**: Fix repository anti-patterns while adding password reset

## 📊 Live Progress Tracker

**Overall Progress**: 0% Complete (0/5 phases)

| Phase | Status | Progress | Completion |
|-------|--------|----------|------------|
| **Phase 1** - Foundation & Migration Fix | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 2** - Password Reset Implementation | 🔴 Not Started | 0/4 tasks | 0% |
| **Phase 3** - API Routes & Email Service | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 4** - Frontend Implementation | 🔴 Not Started | 0/3 tasks | 0% |
| **Phase 5** - Testing & Cleanup | 🔴 Not Started | 0/3 tasks | 0% |

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

**Complete SQL Migration**:
```sql
-- Migration: Add password reset tokens table
-- Description: Add password reset tokens table for password recovery functionality
-- Author: Engineering Team
-- Version: 1.0.0
-- Date: 2025-01-19

-- ============================================================================
-- PASSWORD RESET TOKENS TABLE
-- ============================================================================

CREATE TABLE password_reset_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Password reset token indexes (same pattern as email verification)
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_email ON password_reset_tokens(email);

-- Comment for documentation
COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens for account recovery - 1 hour expiry for security';
```

### Phase 2: Password Reset Implementation (2 hours) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 2.1: Add Protocol Layer Types 🔴 Not Started
**File**: `packages/protocol/src/domains/auth.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add AuthPasswordResetResponse interface
- [ ] 🔴 Add AuthPasswordResetConfirmResponse interface

**Implementation Details**:
```typescript
// Response for forgot password request
export interface AuthPasswordResetResponse {
  success: boolean;
  message: string;
  emailSent: boolean;
}

// Response for password reset confirmation
export interface AuthPasswordResetConfirmResponse {
  success: boolean;
  message: string;
  redirectUrl: string; // '/login?reset=success'
}

// Update existing interface to include confirmPassword
export interface AuthPasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string; // Added for validation
}
```

#### Task 2.2: Create PasswordResetTokenEntity 🔴 Not Started
**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity pattern exactly
- [ ] 🔴 Update for 1-hour expiry instead of 24 hours
- [ ] 🔴 Update `packages/models/src/entities/index.ts` to export new entity

**Key Implementation Note**:
```typescript
// In createFromUserData method, change expiry from 24 hours to 1 hour:
const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
```

#### Task 2.3: Create PasswordResetTokenRepository 🔴 Not Started
**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository pattern exactly
- [ ] 🔴 Update table name to password_reset_tokens
- [ ] 🔴 Add token cleanup method for expired tokens
- [ ] 🔴 Update `packages/models/src/repositories/index.ts` to export new repository

**Token Cleanup Implementation**:
```typescript
/**
 * Clean up expired password reset tokens (called before generating new ones)
 * Simple strategy: clean expired tokens for the user when generating new token
 */
async generateToken(userId: string, email: string): Promise<string> {
  // Clean expired tokens for this user first
  await this.cleanupExpiredTokensForUser(userId);
  
  // Then generate new token (existing logic)
  // ...
}

private async cleanupExpiredTokensForUser(userId: string): Promise<void> {
  await connection.query(
    `DELETE FROM password_reset_tokens 
     WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId]
  );
}
```

#### Task 2.4: Add Password Reset to UserService 🔴 Not Started
**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 1 hour | **Started**: - | **Completed**: -

**Sub-tasks** (0/4 complete):
- [ ] 🔴 Add `passwordResetTokenRepository` as class property
- [ ] 🔴 Add `sendPasswordReset(email: string)` method with user validation
- [ ] 🔴 Add `resetPassword(token: string, newPassword: string, confirmPassword: string)` method
- [ ] 🔴 Follow exact pattern of email verification methods

**User Validation Logic**:
```typescript
// Add to imports at top of UserService.ts:
import { ValidationError } from '@starships/errors';
import bcrypt from 'bcrypt';
import { PasswordResetTokenRepository } from '@starships/models';
import { logger } from '@/utils/logger';
import { EmailService } from './EmailService';

// Add as class properties:
private passwordResetTokenRepository: PasswordResetTokenRepository;
private emailService: EmailService;

// In constructor, add:
this.passwordResetTokenRepository = new PasswordResetTokenRepository();
this.emailService = new EmailService(); // Or use ServiceFactory.createEmailService() if needed

/**
 * Send password reset email (with user validation)
 */
async sendPasswordReset(email: string): Promise<void> {
  // Find user by email
  const user = await this.getUserByEmail(email);
  
  // SECURITY: Always return success message (prevent user enumeration)
  if (!user) {
    logger.info('[UserService] Password reset requested for non-existent email', { email });
    return; // Silent success
  }
  
  // BUSINESS RULE: Only users with passwords can reset passwords
  if (!user.hasPassword) {
    logger.info('[UserService] Password reset requested for OAuth-only user', { 
      userId: user.id, 
      email,
      authMethods: user.authMethods 
    });
    return; // Silent success (OAuth users should use "Set Password" instead)
  }
  
  // Generate and send reset token
  const token = await this.passwordResetTokenRepository.generateToken(user.id, email);
  await this.emailService.sendPasswordResetEmail(email, token);
  
  logger.info('[UserService] Password reset email sent', { userId: user.id, email });
}

/**
 * Reset password using token
 */
async resetPassword(token: string, newPassword: string, confirmPassword: string): Promise<{
  userId: string;
  email: string;
}> {
  // Validate passwords match
  if (newPassword !== confirmPassword) {
    throw new ValidationError('Passwords do not match', 'confirmPassword');
  }
  
  // Validate password strength
  if (newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters long', 'newPassword');
  }
  
  // Validate and consume token
  const tokenData = await this.passwordResetTokenRepository.validateAndConsumeToken(token);
  if (!tokenData) {
    throw new ValidationError('Invalid or expired reset token', 'token');
  }
  
  // Hash new password and update user
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await this.userRepository.update(tokenData.userId, { password: hashedPassword });
  
  logger.info('[UserService] Password reset successful', { 
    userId: tokenData.userId,
    email: tokenData.email 
  });
  
  return {
    userId: tokenData.userId,
    email: tokenData.email
  };
}
```

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

**API Implementation with Error Handling**:
```typescript
// Zod schemas
const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters'),
});

const ResetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token format').regex(/^[a-f0-9]{64}$/, 'Invalid token format'), // 32 bytes as hex = 64 chars
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password must be less than 255 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Forgot password endpoint
router.post('/auth/forgot-password', passwordResetRateLimit, async (req: Request, res: Response) => {
  try {
    const bodyValidation = validateData(ForgotPasswordSchema, req.body, res, 'forgot password data');
    if (!bodyValidation) return;

    const { email } = bodyValidation;
    const userService = ServiceFactory.createUserService();
    
    await userService.sendPasswordReset(email);
    
    // SECURITY: Always return same message (prevent user enumeration)
    sendSuccess(res, {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
      emailSent: true
    } as AuthPasswordResetResponse);
  } catch (error) {
    handleError(error, res, 'password reset request');
  }
});

// Reset password endpoint
router.post('/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const bodyValidation = validateData(ResetPasswordSchema, req.body, res, 'reset password data');
    if (!bodyValidation) return;

    const { token, newPassword, confirmPassword } = bodyValidation;
    const userService = ServiceFactory.createUserService();
    
    await userService.resetPassword(token, newPassword, confirmPassword);
    
    sendSuccess(res, {
      success: true,
      message: 'Password reset successful. You can now log in with your new password.',
      redirectUrl: '/login?reset=success'
    } as AuthPasswordResetConfirmResponse);
  } catch (error) {
    handleError(error, res, 'password reset confirmation');
  }
});
```

#### Task 3.2: Extend EmailService 🔴 Not Started
**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add `sendPasswordResetEmail()` method
- [ ] 🔴 Create password reset email template (copy verification template pattern)

**Email Template Implementation**:
```typescript
/**
 * Send password reset email following sendVerificationEmail pattern
 */
async sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${this.env.PUBLIC_URL}/reset-password?token=${token}`;
  
  const command = new SendEmailCommand({
    Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Reset your Starship password' },
      Body: {
        Html: { Data: this.generatePasswordResetTemplate(resetUrl) },
        Text: { Data: this.generatePasswordResetTextTemplate(resetUrl) },
      },
    },
  });
  
  try {
    await this.sesClient.send(command);
    logger.info('[EmailService] Password reset email sent', { email });
  } catch (error) {
    logger.error('[EmailService] Failed to send password reset email', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      email 
    });
    throw new Error(`Failed to send password reset email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

private generatePasswordResetTemplate(resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Reset Your Starship Password</title></head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a202c;">🔐 Password Reset Request</h1>
        </div>
        <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin-top: 0; color: #2d3748;">Reset Your Password</h2>
          <p>You requested to reset your password. Click the button below to create a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #e53e3e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #718096;">
            If the button doesn't work, copy and paste this link: <br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
        </div>
        <div style="font-size: 12px; color: #a0aec0; text-align: center;">
          <p style="color: #e53e3e; font-weight: bold;">This reset link expires in 1 hour.</p>
          <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        </div>
      </body>
    </html>
  `;
}

private generatePasswordResetTextTemplate(resetUrl: string): string {
  return `
    Password Reset Request
    
    You requested to reset your password. Click this link to create a new password:
    ${resetUrl}
    
    This link expires in 1 hour.
    
    If you didn't request a password reset, please ignore this email or contact support if you have concerns.
  `;
}

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

**Frontend Error State Handling**:
```typescript
// In ResetPasswordForm component
const ResetPasswordForm = ({ token }: { token: string }) => {
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState(true);
  
  const resetPassword = useResetPassword({
    onSuccess: () => {
      toast.success('Password reset successful!');
      router.push('/login?reset=success');
    },
    onError: (error) => {
      if (error.message.includes('Invalid or expired')) {
        setIsValidToken(false);
        setError('This password reset link has expired or is invalid.');
      } else if (error.message.includes('do not match')) {
        setError('Passwords do not match.');
      } else {
        setError(error.message || 'Failed to reset password. Please try again.');
      }
    }
  });
  
  // Show error state for invalid token
  if (!isValidToken) {
    return (
      <div className="text-center">
        <h2>Invalid Reset Link</h2>
        <p>{error}</p>
        <Button onClick={() => router.push('/forgot-password')}>
          Request New Reset Link
        </Button>
      </div>
    );
  }
  
  // Rest of form implementation...
};
```

#### Task 4.2: Create Password Reset Pages 🔴 Not Started
**Files**: `forgot-password/page.tsx`, `reset-password/page.tsx`, `login/page.tsx` update
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Create forgot password page
- [ ] 🔴 Create reset password page with token from URL
- [ ] 🔴 Update login page to handle `?reset=success` query param

**Login Page Integration**:
```typescript
// In login/page.tsx, add after imports:
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

// Inside LoginPage component:
const searchParams = useSearchParams();

useEffect(() => {
  // Show success message if redirected after password reset
  if (searchParams.get('reset') === 'success') {
    toast.success('Password reset successful! You can now log in with your new password.');
  }
}, [searchParams]);
```

**Auto-Login Decision**: 
- **NO auto-login after password reset** - Follow security best practice
- Users must manually log in with new password
- This verifies they remember the new password
- Consistent with most secure applications

#### Task 4.3: Add Password Reset to useAuth Hook 🔴 Not Started
**File**: `packages/client/src/hooks/useAuth.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add `useForgotPassword` mutation
- [ ] 🔴 Add `useResetPassword` mutation
- [ ] 🔴 Add password reset query keys to AUTH_QUERY_KEYS

**Hook Implementation**:
```typescript
// Add to AUTH_QUERY_KEYS
export const AUTH_QUERY_KEYS = {
  all: ['auth'] as const,
  user: () => [...AUTH_QUERY_KEYS.all, 'user'] as const,
  me: () => [...AUTH_QUERY_KEYS.user(), 'me'] as const,
  emailVerification: () => [...AUTH_QUERY_KEYS.all, 'email-verification'] as const,
  passwordReset: () => [...AUTH_QUERY_KEYS.all, 'password-reset'] as const,
} as const;

// Forgot password mutation
export function useForgotPassword() {
  return useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await api.post('/api/v1/auth/forgot-password', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Password reset link sent! Check your email.');
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.error?.message || 
        'Failed to send reset email. Please try again.'
      );
    },
  });
}

// Reset password mutation
export function useResetPassword() {
  const router = useRouter();
  
  return useMutation({
    mutationFn: async (data: { token: string; newPassword: string; confirmPassword: string }) => {
      const response = await api.post('/api/v1/auth/reset-password', data);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success('Password reset successful!');
      router.push('/login?reset=success');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error?.message || 'Failed to reset password';
      toast.error(message);
      throw error; // Re-throw for component error handling
    },
  });
}
```

### Phase 5: Testing & Cleanup (30 minutes) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 5.1: Manual Testing 🔴 Not Started
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/6 complete):
- [ ] 🔴 Test forgot password flow end-to-end
- [ ] 🔴 Test expired token handling
- [ ] 🔴 Test rate limiting triggers
- [ ] 🔴 Verify email delivery
- [ ] 🔴 Test OAuth-only user cannot reset (silent success)
- [ ] 🔴 Test non-existent email (silent success)

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

### Specific Error Handling
- **Non-existent user**: Silent success (same message as valid user)
- **OAuth-only user**: Silent success (logs for monitoring, but no error to user)
- **Already consumed token**: "Invalid or expired reset token"
- **Expired token**: "Invalid or expired reset token"
- **Password mismatch**: "Passwords do not match"
- **Weak password**: "Password must be at least 8 characters long"

## Testing Strategy

### Manual Testing Checklist
- [ ] Happy path: Valid email → receive email → reset password → login
- [ ] Expired token handling
- [ ] Invalid token handling
- [ ] Rate limiting triggers correctly
- [ ] OAuth-only users cannot reset (silent success)
- [ ] Non-existent email (silent success)
- [ ] Password validation works (length, confirmation match)
- [ ] Email arrives within reasonable time
- [ ] Frontend error states display correctly
- [ ] Redirect to login page works after successful reset
- [ ] Toast messages appear correctly

**Note**: Automated testing will be implemented in a separate PR

## Rollback Plan

If issues arise during deployment:

1. **Database**: No destructive changes, new table only
2. **Backend**: Feature flag to disable endpoints
3. **Frontend**: Hide "Forgot Password" link via feature flag
4. **Email**: Disable password reset emails in EmailService

## Success Metrics

**Note**: Metrics tracking to be implemented in a future iteration. Initial implementation focuses on core functionality.

Future metrics to track:
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

### Total Estimated Time: **6 hours** (includes all gap fixes)

| Phase | Tasks | Est. Time | 
|-------|-------|-----------|
| **Phase 1** - Foundation | 3 tasks | 30 minutes |
| **Phase 2** - Password Reset Core | 4 tasks | 2.5 hours |
| **Phase 3** - API & Email | 3 tasks | 1.5 hours |
| **Phase 4** - Frontend | 3 tasks | 1 hour |
| **Phase 5** - Testing | 3 tasks | 30 minutes |

### Realistic Timeline

```
Morning (3h): Foundation fixes, password reset entity/repository, UserService updates with validation
Afternoon (3h): API routes, email templates, frontend components with error handling, testing
```

**Key Benefits**:
- **Follows Existing Patterns**: Uses established service patterns from ConversationService, AgentService
- **Fixes Anti-Patterns**: Removes inline repository instantiation in UserService
- **Complete Implementation**: Addresses all security, validation, and error handling concerns
- **Elegant Solution**: 6 hours for full-featured implementation vs 18 hours over-engineered

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

**Document Version**: 8.0.0 (Final Implementation Plan - All Gaps Resolved)  
**Created**: 2025-01-19  
**Last Updated**: 2025-01-20  
**Author**: Engineering Team  
**Status**: Ready for Implementation (all gaps addressed, fully detailed implementation plan)

## 🔧 **Gaps Addressed in v8.0.0**

### **v8.0.0 Updates** (All Remaining Gaps Fixed)
1. **Executive Summary** - Updated timeline to 6 hours and correct approach
2. **Progress Tracker** - Fixed to show actual 5 phases
3. **Email Templates** - Added complete implementation code
4. **Orchestrator Decision** - Documented: not needed for simple flow
5. **Missing Imports** - Added all required imports to code snippets
6. **Login Page Integration** - Added query param handling for success message
7. **Auto-Login Decision** - Clarified: NO auto-login for security
8. **ServiceFactory** - Confirmed createEmailService() exists
9. **SQL Migration** - Added complete CREATE TABLE statement
10. **ValidationError** - Confirmed from @starships/errors
11. **Token Format** - Confirmed 64-char hex (32 bytes)
12. **Success Metrics** - Deferred to future iteration

## 🔧 **Gaps Addressed in v7.0.0**

### **1. Response Type Definitions** ✅
- Added complete `AuthPasswordResetResponse` and `AuthPasswordResetConfirmResponse` interfaces
- Includes `redirectUrl` field for post-reset navigation

### **2. User Validation Logic** ✅  
- Only users with `hasPassword = true` can reset passwords
- OAuth-only users get silent success (logged for monitoring)
- Non-existent users get silent success (security best practice)

### **3. Password Confirmation Field** ✅
- Updated `AuthPasswordResetConfirm` to include `confirmPassword` field
- Added client-side and server-side password matching validation

### **4. Error Handling Specifics** ✅
- Defined exact error messages for all scenarios
- Frontend error state handling for invalid/expired tokens
- Graceful error recovery with "Request New Reset Link" option

### **5. Token Cleanup Strategy** ✅
- Simple cleanup: remove expired tokens for user when generating new token
- No complex background jobs needed - cleanup on-demand

### **6. Redirect Logic After Reset** ✅
- Redirect to `/login?reset=success` with toast message
- Simple and elegant user experience

### **7. Repository & Entity Index Updates** ✅
- Added tasks to update `packages/models/src/repositories/index.ts`
- Added tasks to update `packages/models/src/entities/index.ts`

### **8. Frontend Error States** ✅
- Invalid token detection and error UI
- Network error handling in mutations
- Password validation error display

### **9. Complete API Error Handling** ✅
- Comprehensive Zod validation schemas
- Consistent error response format
- Rate limiting integration

### **10. Testing Coverage** ✅
- Expanded manual testing checklist
- OAuth-only user testing
- Frontend error state testing