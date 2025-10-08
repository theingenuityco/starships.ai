# Email Verification Implementation Plan

## Overview
Implementation of email verification for password-based user registration to enhance security by preventing fake registrations and ensuring valid email addresses before granting access to starship creation and core functionality.

## Current State Analysis

### ✅ Existing Infrastructure We Can Leverage
- Database schema already includes `email_verified BOOLEAN NOT NULL DEFAULT false` in users table
- UserEntity supports `emailVerified` field in the model
- OAuth authentication code system provides robust token pattern we can reuse
- Waitlist integration is already working and tested
- Environment configuration patterns are established

### 🔍 Critical Starship Creation Points Identified
1. **Registration Flow**: `packages/server/src/routes/auth.ts:147` - Creates starship immediately after registration if waitlist approved
2. **Login Flow**: `packages/server/src/routes/auth.ts:282` - Creates starship for newly approved users during login
3. **OAuth Flow**: `packages/server/src/services/UserService.ts:323` - Creates starship for new OAuth users

## Implementation Strategy

### 🎯 Core Principle: Maximize Code Reuse
- Extend existing OAuth token system for email verification (no new database table)
- Leverage existing environment configuration patterns
- Build on existing authentication flow patterns
- Minimize new file creation, maximize existing file enhancement

## Technical Implementation

### 1. Database Schema Extension (No Migration Files)

**Modify existing `packages/models/migrations/000_postgresql_schema.sql`:**

```sql
-- EXTEND existing oauth_auth_codes table for email verification
ALTER TABLE oauth_auth_codes 
ADD COLUMN purpose VARCHAR(20) DEFAULT 'oauth_exchange' 
CHECK (purpose IN ('oauth_exchange', 'email_verification'));

-- Update existing index to include purpose:
DROP INDEX idx_oauth_auth_codes_code;
CREATE INDEX idx_oauth_auth_codes_code ON oauth_auth_codes(code, purpose) WHERE NOT consumed;
```

### 2. Entity Layer Extensions

**Extend `packages/models/src/entities/OAuthAuthCodeEntity.ts`:**

```typescript
// ADD to existing OAuthAuthCodeModel interface:
export interface OAuthAuthCodeModel {
  // ... existing fields ...
  purpose?: 'oauth_exchange' | 'email_verification';
}

// ADD factory method for email verification:
static createForEmailVerification(userId: string, email: string, code: string): Partial<OAuthAuthCodeModel> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours vs 5 min for OAuth

  return {
    userId,
    email,
    code,
    consumed: false,
    purpose: 'email_verification',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}
```

### 3. Repository Layer Extensions

**Extend `packages/models/src/repositories/OAuthAuthCodeRepository.ts`:**

```typescript
// ADD methods for email verification:
async generateEmailVerificationToken(userId: string, email: string): Promise<string>
async validateAndConsumeEmailVerificationToken(token: string): Promise<{userId: string, email: string} | null>
```

### 4. Environment Configuration

**Extend `packages/env/src/types.ts` and `packages/env/src/index.ts`:**

```typescript
// ADD to EnvironmentConfig interface:
EMAIL_FROM_ADDRESS?: string;
EMAIL_FROM_NAME?: string;
AWS_SES_REGION?: string;
```

### 5. Email Service Implementation

**Create single new file `packages/server/src/services/EmailService.ts`:**
- Amazon SES integration using AWS SDK
- Email template for verification with professional design
- Error handling and logging

### 6. Authentication Flow Modifications

**Modify `packages/server/src/routes/auth.ts`:**

#### Registration Flow Changes:
- Create user with `emailVerified: false`
- Generate verification token using existing OAuth system
- Send verification email
- Return email verification response (NO JWT token, NO starship creation)

#### Add Email Verification Endpoint:
```typescript
GET /auth/verify-email?token=xxx
```
- Validates token using existing OAuth validation system
- Marks user as email verified
- Creates starship/agent if waitlist approved
- Redirects to login with success message

#### Add Resend Verification Endpoint:
```typescript
POST /auth/resend-verification
```
- Generates new verification token
- Sends fresh verification email

#### Login Flow Changes:
- Add email verification check before proceeding
- Block unverified users with resend option
- Continue with existing logic for verified users

### 7. Client-Side Updates

**Extend `packages/client/src/hooks/useAuth.ts`:**
- Add email verification response types to existing interfaces
- No new hooks needed, extend existing auth hook

**Extend `packages/client/src/components/auth/LoginForm.tsx`:**
- Add email verification status UI
- Add resend verification functionality
- Handle email verification responses in existing handlers

## User Experience Flow

### 🎯 Registration Flow:
```
User submits registration form
  ↓
Server creates user (emailVerified: false)
  ↓
Server sends verification email
  ↓
User sees: "Check your email to verify your account"
  ↓
NO starship created, NO JWT token provided
```

### 📧 Email Verification:
```
User receives professional email with verification link
  ↓
User clicks "Verify Email & Create Starship" button
  ↓
Server validates token and marks user verified
  ↓
Server creates starship/agent (if waitlist approved)
  ↓
User redirected to login with success message
```

### 🔐 Login Flow:
```
Verified user: Normal login → Access to starship
Unverified user: Blocked with "Please verify email" + resend button
```

## Security Benefits

### 🛡️ Enhanced Security:
1. **Prevents fake registrations** with others' email addresses
2. **Blocks resource waste** - no starships created for unverified accounts
3. **Creates verification incentive** - users must verify to access features
4. **Maintains waitlist security** - verified users still need waitlist approval
5. **Reuses proven security patterns** from OAuth implementation

### 🔒 Token Security:
- 64-character hex tokens (same security as OAuth)
- 24-hour expiration (appropriate for email checking)
- One-time use with database enforcement
- Atomic validation and consumption (prevents race conditions)

## Files to Modify (Not Create)

### ✅ Database Schema:
- `packages/models/migrations/000_postgresql_schema.sql` - Add purpose column to oauth_auth_codes

### ✅ Entities:
- `packages/models/src/entities/OAuthAuthCodeEntity.ts` - Add email verification factory method

### ✅ Repositories:
- `packages/models/src/repositories/OAuthAuthCodeRepository.ts` - Add email verification methods

### ✅ Utilities:
- `packages/server/src/utils/jwt.ts` - Add email verification token functions

### ✅ Configuration:
- `packages/env/src/types.ts` - Add SES configuration types
- `packages/env/src/index.ts` - Add SES configuration values

### ✅ Server Routes:
- `packages/server/src/routes/auth.ts` - Modify registration/login, add verification endpoints

### ✅ Client Hooks:
- `packages/client/src/hooks/useAuth.ts` - Extend existing interfaces for email verification

### ✅ Client Components:
- `packages/client/src/components/auth/LoginForm.tsx` - Add verification UI and handlers

## New Files (Minimal)

### ✅ Single New File:
- `packages/server/src/services/EmailService.ts` - Amazon SES email service

## Implementation Phases

### Phase 1: Backend Infrastructure
1. Extend database schema with purpose column
2. Extend OAuthAuthCodeEntity for email verification
3. Extend OAuthAuthCodeRepository with email verification methods
4. Add SES configuration to environment

### Phase 2: Email Service
1. Create EmailService with SES integration
2. Design professional verification email template
3. Add JWT utilities for email verification tokens

### Phase 3: Authentication Flow
1. Modify registration route to send email instead of creating starship
2. Add email verification endpoint
3. Add resend verification endpoint
4. Modify login route to check email verification

### Phase 4: Client-Side Integration
1. Extend auth hook interfaces
2. Update LoginForm with verification UI
3. Handle verification responses and states

### Phase 5: Testing & Validation
1. Test email delivery with SES
2. Test verification flow end-to-end
3. Test error cases (expired tokens, invalid tokens)
4. Test resend functionality

## Environment Variables Required

```bash
# Amazon SES Configuration
EMAIL_FROM_ADDRESS=noreply@starships.ai
EMAIL_FROM_NAME=Starships.ai
AWS_SES_REGION=us-east-1

# AWS credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Rollback Strategy

Since we're extending existing systems rather than creating new ones:
- Database changes are additive (new column with defaults)
- Code changes are primarily additions to existing files
- No breaking changes to existing OAuth or authentication flows
- Easy to disable feature by skipping email verification check

## Testing Strategy

### Unit Tests:
- EmailService SES integration
- Email verification token generation/validation
- Registration flow modifications

### Integration Tests:
- End-to-end email verification flow
- Error handling for expired/invalid tokens
- Resend verification functionality

### Manual Testing:
- Actual email delivery through SES
- Email template rendering and links
- User experience flow from registration to starship access

## Success Metrics

### Security Improvements:
- 100% of password-based users have verified email addresses
- Elimination of fake registrations with invalid emails
- Reduced spam and abuse potential

### User Experience:
- Clear messaging about verification requirement
- Professional email design with clear call-to-action
- Smooth flow from registration to starship access

## Dependencies

### New Dependencies:
- `@aws-sdk/client-ses` - Amazon SES SDK for Node.js

### Existing Dependencies Leveraged:
- Existing OAuth token system infrastructure
- Existing environment configuration system
- Existing authentication flow patterns
- Existing database connection and transaction handling

## Notes

This implementation prioritizes:
1. **Code reuse** over new file creation
2. **Proven patterns** over novel approaches  
3. **Security** without complexity
4. **User experience** with clear messaging
5. **Maintainability** through consistent patterns

The approach leverages the existing robust OAuth token infrastructure, ensuring consistency with established security patterns while adding minimal complexity to the codebase.