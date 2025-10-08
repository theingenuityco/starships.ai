# Email Verification Implementation Plan

## Overview

Implementation of email verification for password-based user registration following the established **6-Layer Architecture Pattern** to enhance security by preventing fake registrations and ensuring valid email addresses before granting access to starship creation and core functionality.

## Architectural Compliance

This implementation strictly follows the [Layered Architecture Patterns](./layered-architecture-patterns.md) established in the Starships.ai codebase, ensuring:

- **Zero layer jumping violations**
- **Consistent validation patterns** across all layers
- **Proper data transformation** with established entity patterns
- **Business logic isolation** in the service layer
- **Complete separation of concerns**

## Current State Analysis

### ✅ Existing Infrastructure We Can Leverage

- Database schema already includes `email_verified BOOLEAN NOT NULL DEFAULT false` in users table
- UserEntity supports `emailVerified` field following Layer 2 patterns
- OAuth authentication code system provides robust token pattern we can reuse
- Waitlist integration is already working and tested
- Environment configuration patterns are established

### 🔍 Critical Starship Creation Points Identified

1. **Registration Flow**: `packages/server/src/routes/auth.ts:147` - Creates starship immediately after registration if waitlist approved
2. **Login Flow**: `packages/server/src/routes/auth.ts:282` - Creates starship for newly approved users during login
3. **OAuth Flow**: `packages/server/src/services/UserService.ts:323` - Creates starship for new OAuth users

## Implementation Strategy

### 🎯 Core Principle: Follow 6-Layer Architecture

- **Layer 1 (Domain)**: Extend existing protocol contracts
- **Layer 2 (Entity)**: Leverage existing OAuthAuthCodeEntity with purpose field
- **Layer 3 (Repository)**: Extend existing OAuthAuthCodeRepository
- **Layer 4 (Service)**: Add business logic to UserService and create EmailService
- **Layer 5 (API Routes)**: Modify existing auth routes following established patterns
- **Layer 6 (Client)**: Extend existing useAuth hook and LoginForm component

## 6-Layer Architecture Implementation

### Layer 1: Domain Model Extensions (Protocol)

**Extend `packages/protocol/src/domains/auth.ts`:**

```typescript
// ADD email verification interfaces following established patterns
export interface EmailVerificationRequest {
  email: string;
}

export interface EmailVerificationResponse {
  emailVerificationSent: boolean;
  email: string;
  message: string;
  expiresIn: string;
}

export interface ResendVerificationRequest {
  email: string;
}

// EXTEND existing AuthLoginResponse interface:
export interface AuthLoginResponse {
  // ... existing fields ...
  emailNotVerified?: boolean;
  canResendVerification?: boolean;
}

// EXTEND existing AuthRegisterResponse interface:
export interface AuthRegisterResponse {
  // ... existing fields ...
  emailVerificationSent?: boolean;
}
```

### Layer 2: Entity Layer Extensions (Models)

**Extend `packages/models/src/entities/OAuthAuthCodeEntity.ts`:**

Following the established entity pattern with proper validation and transformation:

```typescript
// EXTEND existing OAuthAuthCodeModel interface:
export interface OAuthAuthCodeModel {
  // ... existing fields ...
  purpose?: 'oauth_exchange' | 'email_verification';
}

// ADD to OAuthAuthCodeEntity class:
export class OAuthAuthCodeEntity implements OAuthAuthCodeModel {
  // ... existing fields ...

  @Expose()
  @IsOptional()
  @IsIn(['oauth_exchange', 'email_verification'])
  purpose?: 'oauth_exchange' | 'email_verification';

  // ADD factory method following established patterns:
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

  // ADD validation for email verification purpose:
  static async validateEmailVerification(data: unknown): Promise<void> {
    await this.validate(data, 'create');
    // Additional email verification specific validation if needed
  }
}
```

### Layer 3: Repository Layer Extensions (Models)

**Extend `packages/models/src/repositories/OAuthAuthCodeRepository.ts`:**

Following the established repository pattern with proper error handling:

```typescript
export class OAuthAuthCodeRepository extends BaseRepository {
  // ... existing methods ...

  /**
   * Generate email verification token (reuses OAuth infrastructure)
   * Follows established repository patterns
   */
  async generateEmailVerificationToken(userId: string, email: string): Promise<string> {
    return this.executeWithErrorHandling(
      async () => {
        const code = crypto.randomBytes(32).toString('hex');
        const id = nanoid();

        // Use existing factory pattern
        const entityData = OAuthAuthCodeEntity.createForEmailVerification(userId, email, code);

        // Validate using Entity layer
        await OAuthAuthCodeEntity.validateEmailVerification({ id, ...entityData });

        // Convert to database format
        const dbData = toDatabase({ id, ...entityData });

        const connection = this.getConnection();

        // Insert with conflict handling
        await connection.queryOne(
          `INSERT INTO oauth_auth_codes (id, code, user_id, email, consumed, created_at, expires_at, purpose) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [dbData.id, dbData.code, dbData.user_id, dbData.email, dbData.consumed, dbData.created_at, dbData.expires_at, dbData.purpose]
        );

        return code;
      },
      'generateEmailVerificationToken',
      'oauth_auth_codes'
    );
  }

  /**
   * Validate email verification token (reuses OAuth infrastructure)
   * Follows established atomic transaction patterns
   */
  async validateAndConsumeEmailVerificationToken(token: string): Promise<{ userId: string; email: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        return await connection.transaction(async (tx) => {
          const result = await tx.query(
            `UPDATE oauth_auth_codes 
           SET consumed = true
           WHERE code = $1 
             AND purpose = 'email_verification'
             AND NOT consumed 
             AND expires_at > NOW()
           RETURNING user_id, email`,
            [token]
          );

          const row = result.rows[0];
          return row ? { userId: row.user_id, email: row.email } : null;
        });
      },
      'validateAndConsumeEmailVerificationToken',
      'oauth_auth_codes'
    );
  }
}
```

### Layer 4: Service Layer Implementation (Server)

**Create `packages/server/src/services/EmailService.ts`:**

Following established service patterns with proper error handling:

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getEnvConfig } from '@starships/env';

export class EmailService {
  private sesClient: SESClient;
  private env = getEnvConfig();

  constructor() {
    this.sesClient = new SESClient({
      region: this.env.AWS_SES_REGION,
    });
  }

  /**
   * Send verification email following established service patterns
   * Business logic: Email template generation and delivery
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${this.env.PUBLIC_URL}/auth/verify-email?token=${token}`;

    const command = new SendEmailCommand({
      Source: `${this.env.EMAIL_FROM_NAME} <${this.env.EMAIL_FROM_ADDRESS}>`,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: 'Verify your Starship account' },
        Body: {
          Html: { Data: this.generateEmailTemplate(verificationUrl) },
          Text: { Data: this.generateTextTemplate(verificationUrl) },
        },
      },
    });

    try {
      await this.sesClient.send(command);
    } catch (error: any) {
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  private generateEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Verify Your Starship Account</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a202c;">🚀 Welcome to Starships.ai!</h1>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #2d3748;">Verify Your Email Address</h2>
            <p>Thanks for signing up! Please click the button below to verify your email address and create your starship:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
                 style="background: #4299e1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Verify Email & Create Starship
              </a>
            </div>
            <p style="font-size: 14px; color: #718096;">
              If the button doesn't work, copy and paste this link: <br>
              <a href="${verificationUrl}">${verificationUrl}</a>
            </p>
          </div>
          <div style="font-size: 12px; color: #a0aec0; text-align: center;">
            <p>This verification link expires in 24 hours.</p>
            <p>If you didn't create an account with Starships.ai, you can safely ignore this email.</p>
          </div>
        </body>
      </html>
    `;
  }

  private generateTextTemplate(verificationUrl: string): string {
    return `
      Welcome to Starships.ai!
      
      Please verify your email address by clicking this link:
      ${verificationUrl}
      
      This link expires in 24 hours.
      
      If you didn't create an account with Starships.ai, you can safely ignore this email.
    `;
  }
}
```

**Extend `packages/server/src/services/UserService.ts`:**

Add email verification business logic following established patterns:

```typescript
export class UserService {
  // ... existing methods ...

  /**
   * Send email verification (business logic layer)
   * Orchestrates repository and email service calls
   */
  async sendEmailVerification(userId: string, email: string): Promise<void> {
    // Business validation: User must exist
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'userId');
    }

    // Business rule: User must not already be verified
    if (user.emailVerified) {
      throw new ValidationError('User email is already verified', 'emailVerified');
    }

    // Generate token using repository
    const oauthRepo = new OAuthAuthCodeRepository();
    const token = await oauthRepo.generateEmailVerificationToken(userId, email);

    // Send email using email service
    const emailService = new EmailService();
    await emailService.sendVerificationEmail(email, token);
  }

  /**
   * Verify email address (business logic layer)
   * Handles multi-step verification and starship creation
   */
  async verifyEmailAddress(token: string): Promise<{
    userId: string;
    email: string;
    starshipCreated: boolean;
  }> {
    // Validate and consume token
    const oauthRepo = new OAuthAuthCodeRepository();
    const verification = await oauthRepo.validateAndConsumeEmailVerificationToken(token);

    if (!verification) {
      throw new ValidationError('Invalid or expired verification token', 'token');
    }

    // Mark user as verified
    await this.updateUserProfile(verification.userId, { emailVerified: true });

    // Business logic: Check waitlist and create starship if approved
    const waitlistService = new WaitlistService(new WaitlistRepository());
    const waitlistStatus = await waitlistService.getDetailedStatus(verification.email);

    let starshipCreated = false;
    if (waitlistStatus.status === 'approved') {
      try {
        const defaultStarship = await StarshipService.createDefaultStarship(verification.userId);
        if (defaultStarship) {
          await StarshipService.createDefaultAgent(verification.userId, defaultStarship.id);
          starshipCreated = true;
        }
      } catch (error) {
        console.error(`[EMAIL-VERIFY] Failed to create starship:`, error);
        // Continue - user can create starship later
      }
    }

    return {
      userId: verification.userId,
      email: verification.email,
      starshipCreated,
    };
  }
}
```

### Layer 5: API Routes Layer Extensions (Server)

**Modify `packages/server/src/routes/auth.ts`:**

Following established API patterns with Zod validation and proper error handling:

#### Registration Flow Changes:

```typescript
// ADD Zod schema for email verification
const EmailVerificationSchema = z.object({
  email: z.string().email('Invalid email format'),
});

// MODIFY existing registration route:
router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    // ... existing validation and user creation logic ...

    // ✅ MODIFY: Create user with emailVerified: false, NO starship creation
    const user = await UserService.createUser({
      email,
      password,
      name,
      displayName: name,
      emailVerified: false, // ✅ Force unverified following business rules
    });

    // ✅ DELEGATE to service layer (no direct repository calls)
    const userService = new UserService();
    await userService.sendEmailVerification(user.id, email);

    // ✅ RETURN email verification response following protocol contracts
    const response: EmailVerificationResponse = {
      emailVerificationSent: true,
      email: email,
      message: 'Registration successful! Please check your email to verify your account.',
      expiresIn: '24 hours',
    };

    sendSuccess(res, response, 201);
  } catch (error: any) {
    handleError(error, res, 'user registration');
  }
});
```

#### Add Email Verification Endpoint:

```typescript
/**
 * Verify email address using existing OAuth token infrastructure
 * GET /auth/verify-email?token=xxx
 * Follows established route patterns with Zod validation
 */
router.get('/auth/verify-email', async (req: Request, res: Response) => {
  try {
    // Validate query parameters using Zod
    const queryValidation = validateData(z.object({ token: z.string().min(1, 'Token is required') }), req.query, res, 'verification token');
    if (!queryValidation) return;

    const { token } = queryValidation;

    // ✅ DELEGATE to service layer (no direct repository calls)
    const userService = new UserService();
    const result = await userService.verifyEmailAddress(token);

    // Determine redirect URL based on business logic results
    const env = getEnvConfig();
    const redirectUrl = result.starshipCreated
      ? `${env.PUBLIC_URL}/login?verification=success&starship=true`
      : `${env.PUBLIC_URL}/login?verification=success&waitlisted=true`;

    return res.redirect(redirectUrl);
  } catch (error: any) {
    console.error('[EMAIL-VERIFY] Error:', error);
    const env = getEnvConfig();

    if (error instanceof ValidationError) {
      return res.redirect(`${env.PUBLIC_URL}/login?verification=expired`);
    }

    return res.redirect(`${env.PUBLIC_URL}/login?verification=error`);
  }
});
```

#### Add Resend Verification Endpoint:

```typescript
/**
 * Resend verification email using established patterns
 * POST /auth/resend-verification
 * Follows established route patterns with Zod validation
 */
router.post('/auth/resend-verification', async (req: Request, res: Response) => {
  try {
    // Validate request body using Zod
    const bodyValidation = validateData(EmailVerificationSchema, req.body, res, 'resend verification data');
    if (!bodyValidation) return;

    const { email } = bodyValidation;

    // ✅ DELEGATE to service layer for business logic
    const userService = new UserService();
    const user = await userService.getUserByEmail(email);

    if (!user || user.emailVerified) {
      // Don't reveal if user exists (security best practice)
      return sendSuccess(res, {
        message: 'If an unverified account exists, a verification email has been sent.',
      });
    }

    // Send verification email via service layer
    await userService.sendEmailVerification(user.id, email);

    sendSuccess(res, {
      message: 'Verification email sent successfully.',
    });
  } catch (error: any) {
    handleError(error, res, 'resend verification email');
  }
});
```

#### Login Flow Changes:

```typescript
// MODIFY existing login route to add email verification check:
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    // ... existing validation and password check ...

    // ✅ ADD: Email verification gate following business rules
    if (!user.emailVerified) {
      const response: Partial<AuthLoginResponse> = {
        emailNotVerified: true,
        email: user.email,
        message: 'Please verify your email address before signing in.',
        canResendVerification: true,
      };

      return sendSuccess(res, response, 200);
    }

    // ... rest of existing login logic continues unchanged ...
  } catch (error: any) {
    handleError(error, res, 'user login');
  }
});
```

### Layer 6: Client Layer Extensions

**Extend `packages/client/src/hooks/useAuth.ts`:**

Following established client patterns with TanStack Query:

```typescript
// EXTEND existing interfaces following protocol contracts:
interface AuthLoginResponse {
  // ... existing fields ...
  emailNotVerified?: boolean;
  canResendVerification?: boolean;
}

interface AuthRegisterResponse {
  // ... existing fields ...
  emailVerificationSent?: boolean;
}

// ADD email verification query keys following established patterns:
export const AUTH_QUERY_KEYS = {
  // ... existing keys ...
  emailVerification: () => [...AUTH_QUERY_KEYS.all, 'email-verification'] as const,
} as const;

// ADD resend verification mutation following established patterns:
export function useResendVerification() {
  return useMutation({
    mutationFn: async (email: string) => {
      const response = await api.post('/api/v1/auth/resend-verification', { email });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Verification email sent! Please check your email.');
    },
    onError: (error: any) => {
      toast.error('Failed to send verification email. Please try again.');
    },
  });
}
```

**Extend `packages/client/src/components/auth/LoginForm.tsx`:**

Following established component patterns with proper state management:

```typescript
// ADD to existing state following established patterns:
const [emailVerificationStatus, setEmailVerificationStatus] = useState<{
  needsVerification: boolean;
  email: string;
  message: string;
} | null>(null);

// Get resend verification mutation
const resendVerificationMutation = useResendVerification();

// MODIFY existing handleLogin following established patterns:
const handleLogin = async (e: React.FormEvent) => {
  // ... existing validation ...

  const result = await login(loginData.email, loginData.password);

  // ✅ HANDLE email verification response following protocol contracts
  if (result.emailNotVerified) {
    setEmailVerificationStatus({
      needsVerification: true,
      email: result.email || loginData.email,
      message: result.message || 'Please verify your email address.'
    });
    return;
  }

  // ... rest of existing login logic ...
};

// MODIFY existing handleRegister following established patterns:
const handleRegister = async (e: React.FormEvent) => {
  // ... existing validation ...

  const result = await register(registerData.email, registerData.password, registerData.name);

  // ✅ HANDLE email verification response following protocol contracts
  if (result.emailVerificationSent) {
    setEmailVerificationStatus({
      needsVerification: false,
      email: result.email || registerData.email,
      message: result.message || 'Please check your email to verify your account.'
    });
    // Clear form following established UX patterns
    setRegisterData({ email: '', password: '', name: '', confirmPassword: '' });
    return;
  }

  // ... rest of existing register logic ...
};

// ADD resend verification handler following established patterns:
const handleResendVerification = async (email: string) => {
  resendVerificationMutation.mutate(email);
};

// ADD email verification UI following established component patterns:
{emailVerificationStatus && (
  <Alert className="mb-4 border-blue-200 bg-blue-50">
    <Mail className="h-4 w-4" />
    <AlertTitle>
      {emailVerificationStatus.needsVerification ? 'Email Verification Required' : 'Check Your Email'}
    </AlertTitle>
    <AlertDescription className="space-y-2">
      <p className="text-blue-800">{emailVerificationStatus.message}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleResendVerification(emailVerificationStatus.email)}
        disabled={resendVerificationMutation.isPending}
      >
        {resendVerificationMutation.isPending ? 'Sending...' : 'Resend Verification Email'}
      </Button>
    </AlertDescription>
  </Alert>
)}
```

## Environment Configuration Extensions

**Extend `packages/env/src/types.ts`:**

```typescript
export interface EnvironmentConfig {
  // ... existing configuration ...

  // ✅ ADD Email Service Configuration following established patterns
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  AWS_SES_REGION?: string;
}
```

**Extend `packages/env/src/index.ts`:**

```typescript
export function getEnvConfig(): EnvironmentConfig {
  return {
    // ... existing config ...

    // ✅ ADD Email Service Configuration
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS || 'noreply@starships.ai',
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'Starships.ai',
    AWS_SES_REGION: process.env.AWS_SES_REGION || 'us-east-1',
  };
}
```

## Database Schema Extension

**Modify existing `packages/models/migrations/000_postgresql_schema.sql`:**

```sql
-- EXTEND existing oauth_auth_codes table for email verification
ALTER TABLE oauth_auth_codes
ADD COLUMN purpose VARCHAR(20) DEFAULT 'oauth_exchange'
CHECK (purpose IN ('oauth_exchange', 'email_verification'));

-- Update existing index to include purpose for efficient queries:
DROP INDEX idx_oauth_auth_codes_code;
CREATE INDEX idx_oauth_auth_codes_code ON oauth_auth_codes(code, purpose) WHERE NOT consumed;
```

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
POST / auth / resend - verification;
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
AWS_SES_REGION=ap-south-1

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
