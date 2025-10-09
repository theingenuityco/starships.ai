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

## Critical Issues & Elegant Solutions Identified

### ✅ Issues Identified and ELEGANTLY RESOLVED Through Comprehensive Codebase Analysis

After systematically analyzing all 6 layers of the current architecture, the following critical gaps were identified and **ELEGANTLY FIXED** in this updated plan:

1. **✅ FIXED - Database Schema Architecture**: 
   - **Issue**: Original plan suggested extending `oauth_auth_codes` which violates Single Responsibility Principle
   - **Solution**: Create dedicated `email_verification_tokens` table with proper separation of concerns
   - **Evidence**: OAuth codes have 5-minute expiration, email verification needs 24-hour expiration

2. **✅ FIXED - Environment Configuration Pattern Mismatch**: 
   - **Issue**: Plan showed inconsistent required vs optional environment variables
   - **Solution**: Follow exact pattern from current `getEnvConfig()` - add to `requiredEnvVars` object with fail-fast validation
   - **Evidence**: Current pattern requires `POSTGRES_HOST`, `PUBLIC_URL` etc. with no fallbacks

3. **✅ FIXED - Service Layer Constructor Pattern**: 
   - **Issue**: Plan didn't match current service injection patterns  
   - **Solution**: Follow exact `UserService` constructor pattern (no parameters) with internal repository instantiation
   - **Evidence**: Current services instantiate repositories internally: `this.userRepository = new UserRepository()`

4. **✅ FIXED - Client Hook Interface Consistency**: 
   - **Issue**: Plan interfaces didn't match current `useAuth.ts` structure
   - **Solution**: Extend existing `AuthLoginResponse` and `AuthRegisterResponse` interfaces properly  
   - **Evidence**: Current interfaces already have `waitlisted?`, `status?`, `message?` fields

5. **✅ FIXED - Database Index Strategy**: 
   - **Issue**: New table indexes didn't follow established patterns
   - **Solution**: Follow exact index patterns from current schema with proper WHERE clauses and GIN indexes
   - **Evidence**: Current schema uses `WHERE NOT consumed` and proper index naming conventions

6. **✅ FIXED - Service Method Naming Consistency**: 
   - **Issue**: Plan methods didn't match current service naming patterns
   - **Solution**: Follow exact naming from `UserService` - use `getUserByEmail()`, `createUser()` patterns
   - **Evidence**: Current service uses consistent verb-noun naming conventions

### ✅ Elegant Solutions Following Established Patterns

**🎯 Database Schema Solution (UPDATED)**: 
- Create dedicated `email_verification_tokens` table for clean separation of concerns
- Follows single responsibility principle - each table serves one purpose
- No migration needed - just add new table without touching existing OAuth infrastructure
- Different expiration times (24 hours vs 5 minutes) appropriate for each use case

**🎯 Dependency Management Solution**: 
- Add `@aws-sdk/client-ses` only to `packages/server/package.json` where needed
- No existing AWS dependencies - clean addition following workspace patterns

**🎯 Service Layer Solution (FIXED)**: 
- Create `EmailService` following exact `UserService` constructor pattern (no parameters)
- Internal repository instantiation: `this.emailVerificationTokenRepo = new EmailVerificationTokenRepository()`
- Use `getEnvConfig()` for environment access, matching current service patterns
- Proper error handling following established service layer patterns

**🎯 Environment Configuration Solution (FIXED)**: 
- Add email configuration to `requiredEnvVars` object in `getEnvConfig()` with fail-fast validation
- Follow exact pattern: check if missing, throw error with helpful message
- No fallback values - application crashes on startup if email config missing (following established pattern)
- Pattern: `EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS` in requiredEnvVars object

**🎯 Client Hook Solution (FIXED)**: 
- Add `useResendVerification` following exact TanStack Query patterns from existing hooks
- Extend existing `AuthLoginResponse`/`AuthRegisterResponse` interfaces by adding optional fields
- Follow current pattern: `emailNotVerified?: boolean` (optional fields with descriptive names)
- Integrate with main `useAuth` hook using established patterns from current implementation

**🎯 Protocol Layer Solution (FIXED)**: 
- Extend existing auth interfaces in `packages/protocol/src/domains/auth.ts` 
- Add fields to existing interfaces rather than creating new ones
- Follow current optional field pattern: `waitlisted?: boolean`, `status?: 'pending' | 'approved'`

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
  user?: AuthUser;
  token?: string;
  starship?: { slug: string };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
  // ✅ ADD email verification fields
  emailNotVerified?: boolean;
  canResendVerification?: boolean;
}

// EXTEND existing AuthRegisterResponse interface:
export interface AuthRegisterResponse {
  user?: AuthUser;
  token?: string;
  starship?: { slug: string };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
  // ✅ ADD email verification fields
  emailVerificationSent?: boolean;
}
```

### Layer 2: Entity Layer Implementation (Models)

**Create `packages/models/src/entities/EmailVerificationTokenEntity.ts`:**

Following the established entity pattern from `UserEntity.ts` and `OAuthAuthCodeEntity.ts` with proper validation and transformation:

```typescript
/**
 * Email Verification Token Entity - Database-backed email verification
 * 
 * Follows the established Entity pattern for email verification token management.
 * Separate from OAuth system for clean separation of concerns.
 */

import { Expose, Transform } from 'class-transformer';
import { IsString, IsEmail, IsBoolean, IsISO8601, Length, validate, ValidationError } from 'class-validator';

/**
 * Email Verification Token domain model for protocol sharing
 */
export interface EmailVerificationTokenModel {
  id: string;
  token: string;
  userId: string;
  email: string;
  consumed: boolean;
  createdAt: string;
  expiresAt: string;
}

/**
 * Email Verification Token Transformers - Following established patterns
 */
export class EmailVerificationTokenTransformers {
  /**
   * Transform email to ensure consistency
   */
  static EmailTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.toLowerCase().trim();
    });
  }

  /**
   * Transform token to ensure consistency
   */
  static TokenTransform() {
    return Transform(({ value }) => {
      if (!value || typeof value !== 'string') return value;
      return value.trim();
    });
  }
}

export class EmailVerificationTokenEntity implements EmailVerificationTokenModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @EmailVerificationTokenTransformers.TokenTransform()
  @IsString()
  @Length(64, 64) // Exactly 64 characters for hex-encoded 32 bytes
  token!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @EmailVerificationTokenTransformers.EmailTransform()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @Length(1, 255)
  email!: string;

  @Expose()
  @IsBoolean()
  consumed!: boolean;

  @Expose()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @IsISO8601()
  expiresAt!: string;

  /**
   * Validation method - Following established Entity pattern
   */
  static async validate(data: unknown, operation: 'create' | 'update' = 'create'): Promise<void> {
    if (!data || typeof data !== 'object') {
      throw new Error('Data must be an object');
    }

    const dataRecord = data as Record<string, unknown>;
    const entity = new EmailVerificationTokenEntity();

    if (operation === 'create') {
      // Set defaults for creation
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      Object.assign(entity, {
        id: dataRecord.id || 'temp-id',
        createdAt: dataRecord.createdAt || now,
        expiresAt: dataRecord.expiresAt || expiresAt,
        consumed: dataRecord.consumed || false,
        ...dataRecord,
      });
    } else {
      Object.assign(entity, dataRecord);
    }

    const errors = await validate(entity, {
      skipMissingProperties: operation === 'update',
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const errorMessages = errors
        .map((error: ValidationError) => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new Error(`Email Verification Token validation failed: ${errorMessages}`);
    }
  }

  /**
   * Create from user data - factory method
   */
  static createFromUserData(userId: string, email: string, token: string): Partial<EmailVerificationTokenModel> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    return {
      userId,
      email,
      token,
      consumed: false,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
```

### Layer 3: Repository Layer Implementation (Models)

**Create `packages/models/src/repositories/EmailVerificationTokenRepository.ts`:**

Following the established repository pattern with proper error handling:

```typescript
/**
 * Email Verification Token Repository - Database-backed email verification management
 * 
 * Follows the established BaseRepository pattern for email verification token persistence.
 * Separate from OAuth system for clean separation of concerns.
 */

import { EmailVerificationTokenEntity } from '@/entities/EmailVerificationTokenEntity';
import { toDatabase } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

export class EmailVerificationTokenRepository extends BaseRepository {
  constructor() {
    super('EmailVerificationTokenRepository');
  }

  /**
   * Generate and store a secure email verification token
   * Returns the generated token for email sending
   */
  async generateToken(userId: string, email: string): Promise<string> {
    return this.executeWithErrorHandling(async () => {
      // Generate cryptographically secure token (64 hex chars = 32 bytes)
      const token = crypto.randomBytes(32).toString('hex');
      const id = nanoid();
      
      // Create entity data using factory method
      const entityData = EmailVerificationTokenEntity.createFromUserData(userId, email, token);
      
      // Validate before database insertion
      await EmailVerificationTokenEntity.validate({ id, ...entityData }, 'create');
      
      // Convert to database format
      const dbData = toDatabase({ id, ...entityData });
      
      const connection = this.getConnection();
      
      // Insert with conflict handling (token collisions are extremely rare but possible)
      try {
        await connection.queryOne(
          `INSERT INTO email_verification_tokens (id, token, user_id, email, consumed, created_at, expires_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [dbData.id, dbData.token, dbData.user_id, dbData.email, dbData.consumed, dbData.created_at, dbData.expires_at]
        );
        
        return token;
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') { // PostgreSQL unique constraint violation
          // Extremely rare - retry with new token
          return this.generateToken(userId, email);
        }
        throw error;
      }
    }, 'generateToken', 'email_verification_tokens');
  }

  /**
   * Validate and consume an email verification token atomically
   * Returns user data if successful, null if token is invalid/expired/consumed
   */
  async validateAndConsumeToken(token: string): Promise<{ userId: string; email: string } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      // Atomic transaction to prevent race conditions
      return await connection.transaction(async (tx) => {
        // Find and update in one atomic operation
        const result = await tx.query(
          `UPDATE email_verification_tokens 
           SET consumed = true
           WHERE token = $1 
             AND NOT consumed 
             AND expires_at > NOW()
           RETURNING user_id, email`,
          [token]
        );
        
        const row = result.rows.length > 0 ? result.rows[0] : null;
        
        if (!row) {
          return null;
        }
        
        return {
          userId: row.user_id as string,
          email: row.email as string,
        };
      });
    }, 'validateAndConsumeToken', 'email_verification_tokens');
  }

  /**
   * Clean up expired email verification tokens
   * Returns number of tokens deleted
   */
  async cleanupExpiredTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const pool = connection.getPool();
      const result = await pool.query(
        `DELETE FROM email_verification_tokens WHERE expires_at <= NOW()`
      );
      
      return result.rowCount || 0;
    }, 'cleanupExpiredTokens', 'email_verification_tokens');
  }

  /**
   * Count active (non-expired, non-consumed) email verification tokens
   */
  async countActiveTokens(): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      
      const result = await connection.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM email_verification_tokens 
         WHERE expires_at > NOW() AND NOT consumed`
      );
      
      return result ? parseInt(result.count, 10) : 0;
    }, 'countActiveTokens', 'email_verification_tokens');
  }
}
```

### Layer 4: Service Layer Implementation (Server)

**Create `packages/server/src/services/EmailService.ts`:**

**🎯 ELEGANT SOLUTION**: Following the established service patterns from `WaitlistService.ts` - uses constructor dependency injection for repositories, proper error handling, logging patterns, and interface definitions for return types.

Following established service patterns with proper error handling:

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getEnvConfig } from '@starships/env';
import { EmailVerificationTokenRepository } from '@starships/models';
import { logger } from '@/utils/logger';

export class EmailService {
  private sesClient: SESClient;
  private env: ReturnType<typeof getEnvConfig>;
  private emailVerificationTokenRepo: EmailVerificationTokenRepository;

  constructor() {
    // ✅ Follow exact UserService constructor pattern (no parameters)
    this.env = getEnvConfig();
    this.emailVerificationTokenRepo = new EmailVerificationTokenRepository();
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
// ADD imports at top of file
import { EmailVerificationTokenRepository, WaitlistRepository } from '@starships/models';
import { EmailService } from '@/services/EmailService';
import { StarshipService } from '@/services/StarshipService';
import { WaitlistService } from '@/services/WaitlistService';

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

    // Generate token using dedicated repository
    const emailVerificationTokenRepo = new EmailVerificationTokenRepository();
    const token = await emailVerificationTokenRepo.generateToken(userId, email);

    // Send email using email service - follows current service patterns
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
    const emailVerificationTokenRepo = new EmailVerificationTokenRepository();
    const verification = await emailVerificationTokenRepo.validateAndConsumeToken(token);

    if (!verification) {
      throw new ValidationError('Invalid or expired verification token', 'token');
    }

    // Mark user as verified
    await this.updateUserProfile(verification.userId, { emailVerified: true });

    // Business logic: Check waitlist and create starship if approved
    // ✅ Follow current service instantiation pattern
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
        logger.error(`[EMAIL-VERIFY] Failed to create starship:`, error);
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

**🎯 ELEGANT SOLUTION**: The auth routes already have excellent patterns with Zod validation, proper error handling, service layer delegation, and consistent response formats. We extend the existing registration/login routes and add new endpoints following identical patterns. The existing `validateData` helper function ensures consistent validation across all endpoints.

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
    const response: AuthRegisterResponse = {
      emailVerificationSent: true,
      message: 'Registration successful! Please check your email to verify your account.',
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
      const response: AuthLoginResponse = {
        emailNotVerified: true,
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

**🎯 ELEGANT SOLUTION**: The codebase already has perfect TanStack Query patterns with individual hook functions (`useLogin`, `useRegister`, etc.) and a main `useAuth` hook that orchestrates them. We add `useResendVerification` following the exact same pattern and expose it through the main hook.

Following established client patterns with TanStack Query:

```typescript
// EXTEND existing interfaces following protocol contracts:
interface AuthLoginResponse {
  user?: AuthUser;
  token?: string;
  starship?: { slug: string };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
  // ✅ ADD email verification fields
  emailNotVerified?: boolean;
  canResendVerification?: boolean;
}

interface AuthRegisterResponse {
  user?: AuthUser;
  token?: string;
  starship?: { slug: string };
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
  // ✅ ADD email verification fields
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

**🎯 ELEGANT SOLUTION**: The environment configuration follows fail-fast validation with no fallback values, matching the critical infrastructure pattern.

```typescript
export interface EnvironmentConfig {
  // ... existing configuration ...

  // ✅ ADD Email Service Configuration following established patterns
  EMAIL_FROM_ADDRESS: string;
  EMAIL_FROM_NAME: string;
  AWS_SES_REGION: string;
}
```

**Extend `packages/env/src/index.ts`:**

```typescript
export function getEnvConfig(): EnvironmentConfig {
  // Validate critical environment variables for production safety
  const requiredEnvVars = {
    PUBLIC_URL: process.env.PUBLIC_URL,
    CLIENT_URL: process.env.CLIENT_URL,
    SERVER_URL: process.env.SERVER_URL,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE,
    // ✅ ADD Required Email Configuration following exact current pattern
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    AWS_SES_REGION: process.env.AWS_SES_REGION,
  };

  // Check for missing required environment variables (follows exact current pattern)
  const missing = Object.entries(requiredEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`);
  }

  return {
    // ... existing config ...

    // ✅ ADD Email Service Configuration (required, no fallbacks) following current pattern
    EMAIL_FROM_ADDRESS: requiredEnvVars.EMAIL_FROM_ADDRESS!,
    EMAIL_FROM_NAME: requiredEnvVars.EMAIL_FROM_NAME!,
    AWS_SES_REGION: requiredEnvVars.AWS_SES_REGION!,
  };
}
```

## Database Schema Extension

**Add to `packages/models/migrations/000_postgresql_schema.sql`:**

**🎯 ELEGANT SOLUTION**: Create dedicated `email_verification_tokens` table following exact current schema patterns. Clean separation from OAuth infrastructure.

```sql
-- ============================================================================
-- EMAIL VERIFICATION TOKENS TABLE (following current schema patterns)
-- ============================================================================

CREATE TABLE email_verification_tokens (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    token VARCHAR(64) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Email verification token indexes (following exact current patterns)
CREATE INDEX idx_email_verification_tokens_token ON email_verification_tokens(token) WHERE NOT consumed;
CREATE INDEX idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_tokens_email ON email_verification_tokens(email);

-- Comment for documentation (following current pattern)
COMMENT ON TABLE email_verification_tokens IS 'Email verification tokens for user registration - separate from OAuth for clean architecture';
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

## Files to Modify and Create

### ✅ Database Schema:

- `packages/models/migrations/000_postgresql_schema.sql` - Add dedicated `email_verification_tokens` table

### ✅ New Entities:

- `packages/models/src/entities/EmailVerificationTokenEntity.ts` - NEW: Email verification token entity

### ✅ New Repositories:

- `packages/models/src/repositories/EmailVerificationTokenRepository.ts` - NEW: Email verification repository

### ✅ Configuration:

- `packages/env/src/types.ts` - Add required SES configuration types
- `packages/env/src/index.ts` - Add required SES configuration values (fail-fast)

### ✅ Protocol Extensions:

- `packages/protocol/src/domains/auth.ts` - Extend existing auth interfaces

### ✅ Server Services:

- `packages/server/src/services/EmailService.ts` - NEW: Amazon SES email service
- `packages/server/src/services/UserService.ts` - ADD: Email verification business logic methods

### ✅ Server Routes:

- `packages/server/src/routes/auth.ts` - Modify registration/login, add verification endpoints

### ✅ Client Hooks:

- `packages/client/src/hooks/useAuth.ts` - Extend existing interfaces and add resend mutation

### ✅ Client Components:

- `packages/client/src/components/auth/LoginForm.tsx` - Add verification UI and handlers

### ✅ Package Dependencies:

- `packages/server/package.json` - Add `@aws-sdk/client-ses` dependency

## Implementation Phases & Progress Tracker

### Phase 1: Backend Infrastructure ⏳ `0/5 Complete`

- [ ] **Task 1.1**: Add dedicated email verification tokens table
  - **File**: `packages/models/migrations/000_postgresql_schema.sql`
  - **Status**: ❌ Not Started
  - **Dependencies**: None
  - **Estimated Time**: 15 minutes

- [ ] **Task 1.2**: Create EmailVerificationTokenEntity
  - **File**: `packages/models/src/entities/EmailVerificationTokenEntity.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 1.1
  - **Estimated Time**: 45 minutes

- [ ] **Task 1.3**: Create EmailVerificationTokenRepository
  - **File**: `packages/models/src/repositories/EmailVerificationTokenRepository.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 1.2
  - **Estimated Time**: 60 minutes

- [ ] **Task 1.4**: Add required SES configuration to environment
  - **Files**: `packages/env/src/types.ts`, `packages/env/src/index.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: None
  - **Estimated Time**: 20 minutes

- [ ] **Task 1.5**: Export new entities and repositories in models package
  - **Files**: `packages/models/src/index.ts` or equivalent
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 1.2, Task 1.3
  - **Estimated Time**: 10 minutes

### Phase 2: Email Service ⏳ `0/3 Complete`

- [ ] **Task 2.1**: Install AWS SES dependency
  - **File**: `packages/server/package.json`
  - **Status**: ❌ Not Started
  - **Dependencies**: None
  - **Estimated Time**: 5 minutes

- [ ] **Task 2.2**: Create EmailService with SES integration and constructor injection
  - **File**: `packages/server/src/services/EmailService.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 2.1, Task 1.4, Task 1.3
  - **Estimated Time**: 75 minutes

- [ ] **Task 2.3**: Design professional verification email template
  - **File**: `packages/server/src/services/EmailService.ts` (email templates)
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 2.2
  - **Estimated Time**: 30 minutes

### Phase 3: Authentication Flow ⏳ `0/7 Complete`

- [ ] **Task 3.1**: Extend protocol layer interfaces
  - **File**: `packages/protocol/src/domains/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: None
  - **Estimated Time**: 25 minutes

- [ ] **Task 3.2**: Add email verification methods to UserService
  - **File**: `packages/server/src/services/UserService.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 1.3, Task 2.2
  - **Estimated Time**: 60 minutes

- [ ] **Task 3.3**: Add email verification Zod schemas
  - **File**: `packages/server/src/routes/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.1
  - **Estimated Time**: 15 minutes

- [ ] **Task 3.4**: Modify registration route to send email verification
  - **File**: `packages/server/src/routes/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.2, Task 3.3
  - **Estimated Time**: 35 minutes

- [ ] **Task 3.5**: Add email verification endpoint
  - **File**: `packages/server/src/routes/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.2, Task 3.3
  - **Estimated Time**: 35 minutes

- [ ] **Task 3.6**: Add resend verification endpoint
  - **File**: `packages/server/src/routes/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.2, Task 3.3
  - **Estimated Time**: 25 minutes

- [ ] **Task 3.7**: Modify login route to check email verification
  - **File**: `packages/server/src/routes/auth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.1
  - **Estimated Time**: 20 minutes

### Phase 4: Client-Side Integration ⏳ `0/3 Complete`

- [ ] **Task 4.1**: Add resend verification hook to useAuth
  - **File**: `packages/client/src/hooks/useAuth.ts`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 3.1, Task 3.6
  - **Estimated Time**: 30 minutes

- [ ] **Task 4.2**: Update LoginForm with verification UI components
  - **File**: `packages/client/src/components/auth/LoginForm.tsx`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 4.1
  - **Estimated Time**: 45 minutes

- [ ] **Task 4.3**: Handle verification responses and states in LoginForm
  - **File**: `packages/client/src/components/auth/LoginForm.tsx`
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 4.2
  - **Estimated Time**: 30 minutes

### Phase 5: Testing & Validation ⏳ `0/4 Complete`

- [ ] **Task 5.1**: Test email delivery with SES (manual testing)
  - **Files**: Environment setup + manual testing
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 2.2, AWS SES setup
  - **Estimated Time**: 30 minutes

- [ ] **Task 5.2**: Test verification flow end-to-end
  - **Files**: Full stack testing
  - **Status**: ❌ Not Started
  - **Dependencies**: All previous tasks
  - **Estimated Time**: 45 minutes

- [ ] **Task 5.3**: Test error cases (expired tokens, invalid tokens)
  - **Files**: Backend + frontend error handling
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 5.2
  - **Estimated Time**: 30 minutes

- [ ] **Task 5.4**: Test resend functionality
  - **Files**: Frontend resend button + backend endpoint
  - **Status**: ❌ Not Started
  - **Dependencies**: Task 5.2
  - **Estimated Time**: 20 minutes

## Overall Progress Summary

- **Total Tasks**: 21
- **Completed**: 0 ✅
- **In Progress**: 0 🚧
- **Not Started**: 21 ❌
- **Estimated Total Time**: ~8.5 hours
- **Current Phase**: Phase 1 (Backend Infrastructure)

## Environment Variables Required

**🚨 CRITICAL**: These are now **REQUIRED** environment variables. Application will crash on startup if missing.

```bash
# Amazon SES Configuration (REQUIRED - NO FALLBACKS)
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

**🎯 ELEGANT SOLUTION**: Add dependency only to the server package where it's needed, following the established workspace pattern. No AWS dependencies exist currently, so this is a clean addition.

- `@aws-sdk/client-ses` - Amazon SES SDK for Node.js (add to `packages/server/package.json` only)

### Existing Dependencies Leveraged:

- Existing Entity and Repository patterns (followed exactly for EmailVerificationTokenEntity/Repository)
- Existing environment configuration system (enhanced with fail-fast validation)
- Existing authentication flow patterns (extended, not replaced)
- Existing database connection and transaction handling (reused for email verification tokens)
- Existing service dependency injection patterns (followed for EmailService constructor)
- Existing TanStack Query patterns (extended for email verification hooks)

## Notes

This implementation prioritizes:

1. **Code reuse** over new file creation
2. **Proven patterns** over novel approaches
3. **Security** without complexity
4. **User experience** with clear messaging
5. **Maintainability** through consistent patterns

The approach leverages the existing robust OAuth token infrastructure, ensuring consistency with established security patterns while adding minimal complexity to the codebase.
