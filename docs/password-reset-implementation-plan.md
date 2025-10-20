# Password Reset Feature Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding password reset functionality to the Starships.ai platform. The feature follows existing email verification patterns and maintains consistency with the established 6-layer architecture.

**Status**: 🟡 Planned  
**Priority**: High  
**Estimated Timeline**: 4 hours (following existing patterns)  
**Architecture Pattern**: Elegant addition mirroring email verification workflows

## 📊 Live Progress Tracker

**Overall Progress**: 0% Complete (0/5 phases)

| Phase                                      | Status         | Progress  | Completion |
| ------------------------------------------ | -------------- | --------- | ---------- |
| **Phase 1** - Migration Fix                | 🔴 Not Started | 0/2 tasks | 0%         |
| **Phase 2** - Password Reset Core          | 🔴 Not Started | 0/4 tasks | 0%         |
| **Phase 3** - API Routes & Email Service   | 🔴 Not Started | 0/3 tasks | 0%         |
| **Phase 4** - Frontend Implementation      | 🔴 Not Started | 0/3 tasks | 0%         |
| **Phase 5** - Testing & Verification       | 🔴 Not Started | 0/3 tasks | 0%         |

**Legend**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⚠️ Blocked

## ⚡ Key Design Decisions

- **Pattern Reuse**: Mirror existing email verification token workflows (64-hex tokens, one-time-use, atomic consumption)
- **Consistent Dependencies**: Follow established UserService dependency patterns (constructor injection where needed)
- **Standard API Patterns**: Use existing Zod validation, response helpers, and route conventions
- **Security First**: 1-hour token expiry, rate limiting, user enumeration prevention
- **Migration Sequencing**: Fix duplicate migration numbering to maintain proper sequence

## 🔍 Architecture Assessment

Based on comprehensive codebase analysis, this implementation:

✅ **Aligns with existing patterns**: Reuses established token workflows, SES email conventions, and API response patterns  
✅ **Maintains consistency**: Follows server route validation, model repository patterns, and client hook structures  
✅ **Minimal changes required**: Builds on proven email verification foundation without architectural overhaul  
✅ **Security conscious**: Implements user enumeration prevention and proper token lifecycle management

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

The implementation follows the established 6-layer architecture:

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

### Phase 1: Migration Fix (10 minutes) 🔴 Not Started

**Phase Progress**: 0/2 tasks complete (0%)

#### Task 1.1: Fix Migration Sequencing 🔴 Not Started

**Issue**: Current migrations have duplicate `002_` files, breaking sequential numbering
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Current state**:
- `002_add_email_verification_tokens.sql` ✅ Keep as-is
- `002_add_promo_redemptions.sql` ❌ Duplicate number  
- `003_remove_waitlist_table.sql` ✅ Correctly sequenced

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Rename `002_add_promo_redemptions.sql` to `003_add_promo_redemptions.sql`
- [ ] 🔴 Rename `003_remove_waitlist_table.sql` to `004_remove_waitlist_table.sql`

#### Task 1.2: Create Password Reset Database Table 🔴 Not Started

**File**: `004_add_password_reset_tokens.sql` (next available sequence number)
**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/1 complete):
- [ ] 🔴 Create migration file following email verification table pattern

**Complete SQL Migration**:

```sql
-- Migration: Add password reset tokens table
-- Description: Password reset tokens for account recovery functionality
-- Author: Engineering Team
-- Version: 1.0.0

CREATE TABLE password_reset_tokens (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes following email verification pattern
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_email ON password_reset_tokens(email);

COMMENT ON TABLE password_reset_tokens IS 'Password reset tokens for account recovery - 1 hour expiry for security';
```

### Phase 2: Password Reset Core (1.5 hours) 🔴 Not Started

**Phase Progress**: 0/4 tasks complete (0%)

#### Task 2.1: Add Protocol Layer Types 🔴 Not Started

**File**: `packages/protocol/src/domains/auth.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Add AuthPasswordResetResponse interface
- [ ] 🔴 Add AuthPasswordResetConfirmResponse interface

**Implementation**:

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

// Request for password reset confirmation
export interface AuthPasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}
```

#### Task 2.2: Create PasswordResetTokenEntity 🔴 Not Started

**File**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Copy EmailVerificationTokenEntity pattern with 1-hour expiry
- [ ] 🔴 Export from `packages/models/src/index.ts`

**Key difference from email verification**:
```typescript
// Change expiry from 24 hours to 1 hour in createFromUserData method
const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
```

#### Task 2.3: Create PasswordResetTokenRepository 🔴 Not Started

**File**: `packages/models/src/repositories/PasswordResetTokenRepository.ts`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Copy EmailVerificationTokenRepository pattern exactly
- [ ] 🔴 Update table name to `password_reset_tokens`
- [ ] 🔴 Export from `packages/models/src/index.ts`

**Token cleanup strategy** (mirrors existing EmailVerificationTokenRepository precedent):
```typescript
// Simple cleanup: remove expired tokens when generating new ones
async generateToken(userId: string, email: string): Promise<string> {
  // Clean expired tokens for this user first
  await this.cleanupExpiredTokensForUser(userId);
  // Generate new token using existing pattern from EmailVerificationTokenRepository
  // ...
}

private async cleanupExpiredTokensForUser(userId: string): Promise<void> {
  await connection.query(
    `DELETE FROM password_reset_tokens WHERE user_id = $1 AND expires_at <= NOW()`,
    [userId]
  );
}
```

**Note**: This cleanup approach allows multiple concurrent reset tokens per user but removes expired ones before generating new tokens. This is simpler than implementing complex token revocation logic.

#### Task 2.4: Add Password Reset to UserService 🔴 Not Started

**File**: `packages/server/src/services/UserService.ts`
**Assignee**: TBD | **Estimated**: 45 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add password reset repository as class property (following existing constructor pattern)
- [ ] 🔴 Add `sendPasswordReset(email: string)` method with user validation
- [ ] 🔴 Add `resetPassword(token: string, newPassword: string, confirmPassword: string)` method

**Dependency pattern** (consistent with existing UserService constructor):
```typescript
// Add to constructor alongside existing dependencies
constructor() {
  this.userRepository = new UserRepository();
  this.oauthRepository = new OAuthAccountRepository();
  this.passwordResetTokenRepository = new PasswordResetTokenRepository(); // NEW
}
```

**Note**: This follows the established pattern where UserService instantiates core repositories as class properties in the constructor, consistent with other services like ConversationService and AgentService.

**User validation logic**:
```typescript
async sendPasswordReset(email: string): Promise<void> {
  const user = await this.getUserByEmail(email);
  
  // SECURITY: Always return success (prevent user enumeration)
  if (!user) {
    logger.info('[UserService] Password reset requested for non-existent email', { email });
    return; // Silent success
  }
  
  // BUSINESS RULE: Only users with passwords can reset passwords
  if (!user.hasPassword) {
    logger.info('[UserService] Password reset requested for OAuth-only user', { 
      userId: user.id, email, authMethods: user.authMethods 
    });
    return; // Silent success (OAuth users use "Set Password" flow)
  }
  
  // Generate and send reset token using existing email service pattern
  const token = await this.passwordResetTokenRepository.generateToken(user.id, email);
  const { ServiceFactory } = await import('./ServiceFactory');
  const emailService = ServiceFactory.createEmailService();
  await emailService.sendPasswordResetEmail(email, token);
  
  logger.info('[UserService] Password reset email sent', { userId: user.id, email });
}
```

**Note**: The dynamic ServiceFactory import pattern is intentionally used here (consistent with existing email verification methods) to avoid circular dependencies. This is the established pattern in the current codebase.

### Phase 3: API Routes & Email Service (1 hour) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 3.1: Add Password Reset API Routes 🔴 Not Started

**File**: `packages/server/src/routes/auth.ts`
**Assignee**: TBD | **Estimated**: 30 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add Zod schemas for password reset requests
- [ ] 🔴 Add `POST /auth/forgot-password` endpoint
- [ ] 🔴 Add `POST /auth/reset-password` endpoint

**API implementation following existing patterns**:

```typescript
// Add to imports
import { passwordResetRateLimit } from '@/middleware/rate-limit';

// Zod schemas following existing validation patterns
const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email must be less than 255 characters'),
});

const ResetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid token format').regex(/^[a-f0-9]{64}$/, 'Invalid token format'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(255, 'Password must be less than 255 characters'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Endpoints using existing response helper patterns
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
      emailSent: true,
    } as AuthPasswordResetResponse);
  } catch (error) {
    handleError(error, res, 'password reset request');
  }
});

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
      redirectUrl: '/login?reset=success',
    } as AuthPasswordResetConfirmResponse);
  } catch (error) {
    handleError(error, res, 'password reset confirmation');
  }
});
```

#### Task 3.2: Extend EmailService 🔴 Not Started

**File**: `packages/server/src/services/EmailService.ts`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/1 complete):
- [ ] 🔴 Add `sendPasswordResetEmail()` method following existing verification email pattern

**Implementation following SES patterns**:

```typescript
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
```

#### Task 3.3: Add Password Reset Rate Limiting 🔴 Not Started

**File**: `packages/server/src/middleware/rate-limit.ts`
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/1 complete):
- [ ] 🔴 Add `passwordResetRateLimit` following existing middleware patterns

**Rate limit implementation**:

```typescript
/**
 * Password reset rate limit
 * Prevents email bombing attacks on password reset endpoint
 * 
 * Configuration:
 * - 5 requests per 15 minutes per IP for password reset attempts
 * - 429 status code with descriptive error message
 */
export const passwordResetRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window per IP
  message: {
    error: {
      message: 'Too many password reset attempts. Please try again in 15 minutes.',
      code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
      type: 'RATE_LIMIT_ERROR'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!ip) {
      throw new Error('Cannot determine client IP address for rate limiting');
    }
    return ip;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        message: 'Too many password reset attempts. Please try again in 15 minutes.',
        code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
        type: 'RATE_LIMIT_ERROR'
      }
    });
  },
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});
```

### Phase 4: Frontend Implementation (1 hour) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 4.1: Add Password Reset Hooks to useAuth 🔴 Not Started

**File**: `packages/client/src/hooks/useAuth.ts`
**Assignee**: TBD | **Estimated**: 20 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Add `useForgotPassword` mutation
- [ ] 🔴 Add `useResetPassword` mutation
- [ ] 🔴 Add password reset query keys to AUTH_QUERY_KEYS

**Hook implementation following existing fetch patterns**:

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
      const response = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to send reset email');
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success('Password reset link sent! Check your email.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to send reset email. Please try again.');
    },
  });
}

// Reset password mutation
export function useResetPassword(options?: { onSuccess?: (data: any) => void; onError?: (error: any) => void }) {
  const router = useRouter();
  return useMutation({
    mutationFn: async (data: { token: string; newPassword: string; confirmPassword: string }) => {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to reset password');
      }
      return result.data;
    },
    onSuccess: (data) => {
      toast.success('Password reset successful!');
      router.push('/login?reset=success');
      options?.onSuccess?.(data);
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to reset password';
      toast.error(message);
      options?.onError?.(error);
      throw error; // Re-throw for component error handling
    },
  });
}
```

#### Task 4.2: Create Password Reset Forms 🔴 Not Started

**Files**: Create new React components
**Assignee**: TBD | **Estimated**: 25 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Create ForgotPasswordForm component
- [ ] 🔴 Create ResetPasswordForm component with token handling
- [ ] 🔴 Add "Forgot Password?" link to LoginForm

**Error handling pattern**:

```typescript
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

#### Task 4.3: Create Password Reset Pages 🔴 Not Started

**Files**: Create new Next.js pages
**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/3 complete):
- [ ] 🔴 Create `forgot-password/page.tsx`
- [ ] 🔴 Create `reset-password/page.tsx` with token from URL
- [ ] 🔴 Update `login/page.tsx` to handle `?reset=success` query param

**Login page integration**:

```typescript
// In login/page.tsx, add success message handling
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const searchParams = useSearchParams();

useEffect(() => {
  if (searchParams.get('reset') === 'success') {
    toast.success('Password reset successful! You can now log in with your new password.');
  }
}, [searchParams]);
```

### Phase 5: Testing & Verification (30 minutes) 🔴 Not Started

**Phase Progress**: 0/3 tasks complete (0%)

#### Task 5.1: Verify API Prefix Mounting 🔴 Not Started

**Issue**: Confirm password reset routes work correctly with existing URL routing
**Assignee**: TBD | **Estimated**: 10 minutes | **Started**: - | **Completed**: -

**Context**: The routing already works correctly:
- **Server**: `app.use('/api/v1', authRoutes)` mounts auth routes at `/api/v1`
- **Routes**: `router.post('/auth/forgot-password', ...)` defines route path
- **Result**: `/api/v1` + `/auth/forgot-password` = `/api/v1/auth/forgot-password`
- **Client**: Calls `/api/v1/auth/forgot-password` - perfect match ✅
- **Reverse Proxy**: Forwards `/api/*` to backend server correctly

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Test `POST /api/v1/auth/forgot-password` endpoint responds correctly
- [ ] 🔴 Test `POST /api/v1/auth/reset-password` endpoint responds correctly

#### Task 5.2: Manual End-to-End Testing 🔴 Not Started

**Assignee**: TBD | **Estimated**: 15 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/6 complete):
- [ ] 🔴 Test forgot password flow end-to-end
- [ ] 🔴 Test expired token handling
- [ ] 🔴 Test rate limiting triggers correctly
- [ ] 🔴 Verify email delivery and template rendering
- [ ] 🔴 Test OAuth-only user cannot reset (silent success)
- [ ] 🔴 Test non-existent email (silent success)

#### Task 5.3: Code Quality Checks 🔴 Not Started

**Assignee**: TBD | **Estimated**: 5 minutes | **Started**: - | **Completed**: -

**Sub-tasks** (0/2 complete):
- [ ] 🔴 Run `pnpm lint`
- [ ] 🔴 Run `pnpm type-check`

## Security Considerations

### Token Security
- **Generation**: 32-byte cryptographically secure random tokens (64-hex chars)
- **Expiry**: 1-hour lifetime (more restrictive than email verification's 24 hours)  
- **Consumption**: One-time use with atomic database operations
- **Storage**: Plaintext tokens in database (consistent with existing email verification precedent)

### User Enumeration Prevention
- **Non-existent user**: Silent success with identical response message
- **OAuth-only user**: Silent success with logging for monitoring
- **Consistent timing**: All responses return the same generic success message

### Rate Limiting
- **Password reset requests**: 5 attempts per 15 minutes per IP
- **Consistent with existing patterns**: Follows established rate limit middleware structure

### Error Handling
- **Invalid/expired token**: "Invalid or expired reset token"
- **Password mismatch**: "Passwords do not match"  
- **Weak password**: "Password must be at least 8 characters long"

## Testing Strategy

### Manual Testing Checklist
- [ ] Happy path: Valid email → receive email → reset password → login
- [ ] Expired token handling returns appropriate error
- [ ] Invalid token handling returns appropriate error  
- [ ] Rate limiting triggers correctly after 5 attempts
- [ ] OAuth-only users get silent success (no password reset allowed)
- [ ] Non-existent email gets silent success (prevent enumeration)
- [ ] Password validation enforces minimum length and confirmation match
- [ ] Email delivery works and templates render correctly
- [ ] Frontend error states display appropriately
- [ ] Login page success message appears after reset
- [ ] API prefix mounting works correctly (`/api/v1/auth/*`)

## Risk Assessment

| Risk                     | Likelihood | Impact | Mitigation                              |
| ------------------------ | ---------- | ------ | --------------------------------------- |
| Email delivery failure   | Low        | High   | SES retry mechanism, error monitoring   |
| Token collision          | Very Low   | Medium | UUID generation, unique constraint      |
| Brute force attacks      | Medium     | High   | Rate limiting, token complexity         |
| User enumeration         | Medium     | Medium | Generic messages, consistent timing     |
| API prefix mismatch      | Low        | High   | Verify mounting configuration           |

## Implementation Notes

### Key Pattern Alignments
- **Token workflow**: Mirrors existing email verification (generate → store → validate → consume)
- **API validation**: Uses established Zod schemas and response helper patterns  
- **Email service**: Follows SES template and delivery conventions
- **Client hooks**: Consistent with existing useAuth mutation patterns
- **Rate limiting**: Matches established middleware structure and error formats
- **URL routing**: Server mounts routes at `/api/v1` + route path = full client URL path
- **Dependency management**: Uses constructor injection for repositories, dynamic imports for services (avoiding circular dependencies)

### Migration Considerations  
- **Database**: Non-destructive changes (new table only)
- **Rollback**: Can disable endpoints via feature flags if needed
- **Sequence**: Fixes existing migration numbering conflict

## Dependencies

### External Dependencies (Existing)
- AWS SES for email delivery
- PostgreSQL for token storage  
- bcrypt for password hashing

### Internal Dependencies (Existing)
- Email verification system (pattern template)
- User authentication system
- Rate limiting middleware
- Response helper utilities

## Success Criteria

- [ ] Users can successfully request password reset via email
- [ ] Password reset tokens expire after 1 hour as designed
- [ ] Rate limiting prevents abuse (5 requests per 15 minutes)
- [ ] User enumeration is prevented (consistent responses)
- [ ] OAuth-only users are handled appropriately (silent success)
- [ ] Email delivery works reliably with professional templates
- [ ] Frontend provides clear error handling and user feedback
- [ ] All existing functionality remains unaffected

---

**Document Version**: 9.0.0 (GPT-5 Analysis Integration)  
**Created**: 2025-01-19  
**Last Updated**: 2025-01-20  
**Author**: Engineering Team  
**Status**: Ready for Implementation (aligned with GPT-5 recommendations)

## 🔧 Updates in v9.0.0 (GPT-5 Analysis Integration)

### Major Changes
1. **Removed Phase 0**: Eliminated unnecessary "anti-pattern fixes" based on GPT-5's assessment that existing patterns are acceptable
2. **Fixed migration sequencing**: Corrected to use next available number (004) instead of 005  
3. **Streamlined timeline**: Reduced from 6.5 hours to 4 hours by removing unnecessary architectural changes
4. **Added API prefix verification**: Included task to verify existing `/api/v1` routing works correctly (no changes needed)
5. **Simplified dependency management**: Uses existing UserService patterns without forced refactoring

### Documentation Clarifications Added
- **API routing explanation**: Clarified how server mounting (`/api/v1`) + route paths create full URLs
- **Dependency pattern justification**: Explained why dynamic ServiceFactory imports are used (circular dependency prevention)
- **Token cleanup strategy**: Documented the simple approach vs complex revocation logic
- **Pattern consistency notes**: Added explicit references to existing codebase patterns being followed

### Pattern Confirmations  
- **Token management**: Confirmed 64-hex plaintext tokens following email verification precedent
- **Rate limiting**: Confirmed existing middleware patterns with non-standard error codes (consistent with current implementation)
- **Email service**: Confirmed SES integration following established patterns
- **User validation**: Confirmed silent success for OAuth-only and non-existent users

### Key Improvements
- **Evidence-based approach**: All decisions backed by actual codebase analysis
- **Minimal disruption**: No unnecessary changes to working patterns
- **Practical focus**: Addresses real issues (migration numbering, API mounting) rather than theoretical concerns
- **Consistent implementation**: Mirrors proven email verification workflows throughout