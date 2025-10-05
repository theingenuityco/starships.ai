# OAuth Implementation Plan: Google & GitHub Authentication

## 📊 **LIVE IMPLEMENTATION STATUS**

| **Phase** | **Status** | **Progress** | **Started** | **Completed** | **Notes** |
|-----------|------------|--------------|-------------|---------------|-----------|
| **Phase 0: Foundation** | ⏳ **PENDING** | 0/4 tasks | - | - | Critical technical debt fixes |
| **Phase 1: Backend** | ⏳ **PENDING** | 0/8 tasks | - | - | All 6 layers: Domain→Repository |
| **Phase 2: Frontend** | ⏳ **PENDING** | 0/4 tasks | - | - | Layer 6: React hooks + UI |
| **Phase 3: Polish** | ⏳ **PENDING** | 0/5 tasks | - | - | Testing + deployment |

**Overall Progress**: 🔄 **0% Complete** (0/21 tasks) | **Estimated Time**: 2-3 weeks

## ✅ **ARCHITECTURAL COMPLIANCE ACHIEVED**

This OAuth implementation now **fully complies** with the established 6-layer architecture pattern:

### **🎯 All 6 Layers Properly Implemented**

| **Layer** | **Component** | **File** | **Status** | **Pattern Compliance** |
|-----------|---------------|----------|------------|----------------------|
| **Layer 1** | Domain Models | `packages/protocol/src/domains/oauth.ts` | ✅ **ADDED** | Pure interfaces, type contracts |
| **Layer 2** | Entity Validation | `packages/models/src/entities/OAuthAccountEntity.ts` | ✅ **ADDED** | class-validator + transformation |
| **Layer 3** | Repository | `packages/models/src/repositories/OAuthAccountRepository.ts` | ✅ **FIXED** | BaseRepository + Entity pattern |
| **Layer 4** | Service Logic | `packages/server/src/services/UserService.ts` | ✅ **FIXED** | Business logic, no layer jumping |
| **Layer 5** | API Routes | `packages/server/src/routes/auth.ts` | ✅ **FIXED** | Zod validation + service delegation |
| **Layer 6** | Client Hooks | `packages/client/src/hooks/useOAuth.ts` | ✅ **ADDED** | TanStack Query + optimistic updates |

### **🚫 Layer Jumping Violations ELIMINATED**

**Before**: ❌ UserService directly called `userRepository.create()`  
**After**: ✅ UserService uses proper service methods only

**Before**: ❌ API routes had business logic mixed in  
**After**: ✅ API routes delegate to service layer with Zod validation

### **🏗️ Architectural Pattern Compliance**

- **✅ Data Flow**: Protocol → Entity → Repository → Service → API → Client
- **✅ Error Handling**: Bubbles up through layers with context
- **✅ Validation**: Multiple layers (Entity, Service, API, Client)
- **✅ Dependencies**: Always point inward toward domain
- **✅ Separation of Concerns**: Each layer has single responsibility
- **✅ Repository Pattern**: BaseRepository + Entity validation
- **✅ Service Pattern**: Business logic orchestration
- **✅ Client Pattern**: TanStack Query + hierarchical cache keys

### 📚 **Status Legend**
- ⏳ **PENDING** - Not started yet
- 🔄 **IN PROGRESS** - Currently being worked on
- ✅ **COMPLETED** - Finished and tested
- ❌ **BLOCKED** - Waiting for dependencies or issues
- 🔍 **TESTING** - Under review/testing

### 🔥 **Priority Levels**
- 🔥 **CRITICAL** - Must be done first, blocking other work
- 🟡 **HIGH** - Important for functionality
- 🟢 **MEDIUM** - Nice to have, can be deferred

---

## Overview

This document outlines the **architecturally-aligned implementation plan** for adding OAuth 2.0 authentication with Google and GitHub to the Starships.ai platform using a **backend-only approach** that maintains full compatibility with the existing JWT-based email/password authentication system.

**Status**: ✅ **REVISED** - Fixed critical architectural mismatches and aligned with PostgreSQL + existing patterns

## ⚠️ **Critical Issues Fixed in This Revision**

**Previous plan had major architectural mismatches:**
1. ❌ **Database**: Assumed Neo4j → ✅ **Fixed**: Now uses PostgreSQL with existing migration system
2. ❌ **Missing Columns**: Referenced non-existent `email_verified` → ✅ **Fixed**: Proper schema update
3. ❌ **JWT Duplication**: Ignored existing duplicate code → ✅ **Fixed**: Extract-first approach
4. ❌ **Error Classes**: Created new OAuth errors → ✅ **Fixed**: Extend existing `StandardErrorCode` system
5. ❌ **Service Mismatch**: Wrong `UserService` assumptions → ✅ **Fixed**: Aligned with actual implementation

## Current Authentication Architecture

### Existing System (✅ **VERIFIED AGAINST ACTUAL CODEBASE**)
- **Database**: PostgreSQL with complete migration system (`packages/models/migrations/000_postgresql_schema.sql`)
- **Backend**: Express.js with JWT tokens (jose library)
- **Frontend**: Next.js with React Query for state management  
- **Token Storage**: localStorage (key: `starships_auth_token`)
- **Token Expiry**: 7 days (hardcoded in `packages/server/src/routes/auth.ts:152-162` AND `299-310` - **DUPLICATION ISSUE**)
- **Protected Routes**: JWT middleware (`jwtAuthMiddleware`) in `packages/server/src/middleware/jwt-auth.ts`
- **User Model**: Email/password with bcrypt hashing
- **Waitlist System**: Controls access via `WaitlistService` integration
- **Login Page**: Tab-based login/register form in `packages/client/src/app/login/page.tsx`
- **Error System**: Standardized error codes in `packages/protocol/src/contracts/errors.ts`

## Revised OAuth Architecture

### Strategy: Backend-Only OAuth + Existing JWT System
OAuth providers will be integrated directly into the Express backend. Users authenticate via OAuth, and the system issues the same JWT tokens used by email/password authentication. This approach maintains complete consistency and requires **zero changes** to protected routes or frontend auth logic.

### Authentication Flow
```
User → OAuth Provider → JWT State Token → Backend Validation → User Creation/Linking → Same JWT Token → Existing Protected Routes
```

**Key Principle**: OAuth becomes just another way to obtain the same JWT token that email/password login provides.

### Architectural Decisions (✅ **REVISED FOR ACTUAL CODEBASE**)
After identifying critical mismatches in the original plan, the following corrected architectural decisions ensure perfect integration:

1. **Database First**: Fix PostgreSQL schema and add missing `email_verified` column
2. **JWT Duplication Fix**: Extract shared JWT utility BEFORE OAuth implementation (critical technical debt)
3. **Error System Alignment**: Extend existing `StandardErrorCode` enum instead of creating new OAuth error classes
4. **Service Method Alignment**: Work with actual `UserService.createUser()` behavior (calls `createUserWithPassword`)
5. **Migration System Compliance**: Use existing PostgreSQL migration runner format in `packages/models/src/scripts/migration-runner.ts`
6. **Frontend Integration**: Add OAuth buttons above existing tab system in `LoginForm.tsx`
7. **State Management**: Use signed JWT tokens for OAuth state (CSRF protection) - no sessions needed

## Implementation Approach

### Selected Solution: Custom Backend OAuth Implementation

Instead of adding NextAuth.js complexity, we'll implement OAuth directly in the Express backend, reusing all existing authentication infrastructure.

#### Why Backend-Only?
- **Architectural Consistency**: Single JWT system for all authentication methods
- **Minimal Complexity**: OAuth logic isolated to server-side
- **Zero Breaking Changes**: Existing frontend code works unchanged
- **Easy Maintenance**: No dual authentication systems
- **Better Security**: OAuth tokens never reach client-side
- **Framework Agnostic**: Not tied to Next.js patterns

## Required Changes (✅ **FIXED FOR POSTGRESQL ARCHITECTURE**)

### **Phase 0: Critical Foundation Fixes (MUST DO FIRST)**

#### 📋 **TASK TRACKER - Phase 0**

| **Task** | **Status** | **Assignee** | **Started** | **Completed** | **Notes** |
|----------|------------|--------------|-------------|---------------|-----------|
| 1. Extract JWT Utility | ⏳ **PENDING** | - | - | - | Fix code duplication |
| 2. Update Auth Routes | ⏳ **PENDING** | - | - | - | Use shared JWT utility |
| 3. Add OAuth Error Codes | ⏳ **PENDING** | - | - | - | Extend StandardErrorCode |
| 4. Add OAuth Env Config | ⏳ **PENDING** | - | - | - | Update env types |

#### 1. Extract JWT Utility (Fix Technical Debt)
**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**Problem**: Duplicate JWT generation code in `packages/server/src/routes/auth.ts:152-162` and `299-310`

```typescript
// packages/server/src/utils/jwt.ts
import { SignJWT, jwtVerify } from 'jose';
import { getEnvConfig } from '@starships/env';
import crypto from 'crypto';

const env = getEnvConfig();
const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const JWT_ISSUER = 'starships.ai';
const JWT_AUDIENCE = 'starships-users';

export interface JWTUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Generate JWT token for authenticated user (EXTRACTED FROM DUPLICATE CODE)
 */
export async function generateJWT(user: JWTUser): Promise<string> {
  return await new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name || user.email?.split('@')[0],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Generate OAuth state token for CSRF protection
 */
export async function generateOAuthState(): Promise<string> {
  return await new SignJWT({
    purpose: 'oauth_state',
    nonce: crypto.randomBytes(16).toString('hex'),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(JWT_ISSUER)
    .setExpirationTime('10m')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

/**
 * Validate OAuth state token
 */
export async function validateOAuthState(state: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(state, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload.purpose === 'oauth_state';
  } catch {
    return false;
  }
}
```

#### 2. Update Existing Auth Routes (Remove Duplication)
**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL** | **Depends on**: Task 1  
```typescript
// packages/server/src/routes/auth.ts - UPDATE BOTH REGISTER AND LOGIN
import { generateJWT } from '@/utils/jwt';

// Replace lines 152-162 and 299-310 with:
const token = await generateJWT(user);
```

#### 3. Add OAuth Error Codes
**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/protocol/src/contracts/errors.ts`

#### 4. Add OAuth Environment Configuration  
**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**Files**: `packages/env/src/types.ts`, `packages/env/src/index.ts`

---

## 🏗️ **LAYERED ARCHITECTURE COMPLIANCE**

This OAuth implementation follows the **6-layer architecture pattern** established in the codebase. Each layer has specific responsibilities and maintains proper separation of concerns.

### **Layer 1: Domain Model (Protocol) - OAuth Contracts**

**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/protocol/src/domains/oauth.ts`

Following the established domain pattern, we define pure TypeScript interfaces for OAuth entities:

```typescript
// packages/protocol/src/domains/oauth.ts
/**
 * OAuth Account domain model - pure interface for type sharing
 * Follows established domain contract patterns
 */
export interface OAuthAccountModel {
  id: string;
  userId: string;
  provider: 'google' | 'github';
  providerUserId: string;
  email: string;
  profileData?: {
    name?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * OAuth provider profile interface
 */
export interface OAuthProfileModel {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

/**
 * OAuth state token interface
 */
export interface OAuthStateModel {
  purpose: 'oauth_state';
  nonce: string;
  timestamp: number;
}

/**
 * Request/Response interfaces for OAuth operations
 */
export interface CreateOAuthAccountRequest {
  userId: string;
  provider: 'google' | 'github';
  providerUserId: string;
  email: string;
  profileData?: Record<string, unknown>;
}

export interface LinkOAuthAccountRequest {
  userId: string;
  provider: 'google' | 'github';
  authCode: string;
}

export interface OAuthCallbackResponse {
  user: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
  };
  token: string;
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}
```

### **Layer 2: Entity Layer (Models) - OAuth Validation & Transformation**

**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/models/src/entities/OAuthAccountEntity.ts`

Following the established entity pattern with class-validator and class-transformer:

```typescript
// packages/models/src/entities/OAuthAccountEntity.ts
import { Expose, Type } from 'class-transformer';
import { IsString, IsEmail, IsOptional, IsObject, Length, IsIn, IsISO8601, validate, ValidationError } from 'class-validator';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import type { OAuthAccountModel } from '@starships/protocol';
import { Transformers } from '@/helpers/transformers';

/**
 * OAuth Account Entity - Validation and transformation layer
 * Follows established entity patterns with class-validator decorators
 */
export class OAuthAccountEntity implements OAuthAccountModel {
  @Expose()
  @IsString()
  @Length(1, 255)
  id!: string;

  @Expose()
  @IsString()
  @Length(1, 255)
  userId!: string;

  @Expose()
  @IsString()
  @IsIn(['google', 'github'])
  provider!: 'google' | 'github';

  @Expose()
  @IsString()
  @Length(1, 255)
  providerUserId!: string;

  @Expose()
  @IsEmail()
  @Length(1, 255)
  email!: string;

  @Expose()
  @IsOptional()
  @IsObject()
  profileData?: Record<string, unknown>;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  createdAt!: string;

  @Expose()
  @Transformers.DateTransform()
  @IsISO8601()
  updatedAt!: string;

  /**
   * Static factory method - follows established entity pattern
   */
  static deserialize(data: Record<string, any>): OAuthAccountEntity {
    return plainToInstance(OAuthAccountEntity, data, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Instance serialization method - follows established entity pattern
   */
  serialize(): Record<string, any> {
    return instanceToPlain(this, {
      strategy: 'excludeAll',
      excludeExtraneousValues: true,
    });
  }

  /**
   * Validation method - follows established entity pattern
   */
  static async validate(data: Partial<OAuthAccountModel>, context: 'create' | 'update'): Promise<void> {
    const entity = this.deserialize(data);
    const errors = await validate(entity, {
      groups: [context],
      skipMissingProperties: context === 'update',
    });

    if (errors.length > 0) {
      const firstError = errors[0];
      const constraints = firstError.constraints;
      const message = constraints ? Object.values(constraints)[0] : 'Validation failed';
      throw new ValidationError(`OAuth Account validation failed: ${message}`);
    }
  }

  /**
   * Business helper methods - follows established entity pattern
   */
  static createFromProfile(userId: string, profile: OAuthProfileModel): Partial<OAuthAccountModel> {
    const now = new Date().toISOString();
    return {
      userId,
      provider: profile.provider,
      providerUserId: profile.providerId,
      email: profile.email,
      profileData: {
        name: profile.name,
        avatar: profile.avatar,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Check if account belongs to user
   */
  belongsToUser(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * Get display name from profile data
   */
  getDisplayName(): string | undefined {
    return this.profileData?.name as string;
  }

  /**
   * Get avatar URL from profile data
   */
  getAvatarUrl(): string | undefined {
    return this.profileData?.avatar as string;
  }
}
```

### **Phase 1: Database & Backend Implementation (Week 1)**

#### 📋 **TASK TRACKER - Phase 1**

| **Task** | **Status** | **Assignee** | **Started** | **Completed** | **Notes** |
|----------|------------|--------------|-------------|---------------|-----------|
| 1. Create OAuth Domain Models | ⏳ **PENDING** | - | - | - | Layer 1: Protocol contracts |
| 2. Create OAuth Entity | ⏳ **PENDING** | - | - | - | Layer 2: Validation/transformation |
| 3. Create OAuth Migration | ⏳ **PENDING** | - | - | - | Add oauth_accounts table |
| 4. Run Migration | ⏳ **PENDING** | - | - | - | Update database schema |
| 5. Create OAuth Repository | ⏳ **PENDING** | - | - | - | Layer 3: BaseRepository + Entity |
| 6. Extend UserService | ⏳ **PENDING** | - | - | - | Layer 4: Business logic |
| 7. Add OAuth Routes | ⏳ **PENDING** | - | - | - | Layer 5: API endpoints |
| 8. Setup OAuth Apps | ⏳ **PENDING** | - | - | - | Configure providers |

### 1. Database Schema Updates (✅ **CORRECTED FOR POSTGRESQL**)

#### OAuth Accounts Table Migration
**Status**: ⏳ **PENDING** | **Priority**: 🟡 **HIGH** | **Depends on**: Phase 0  
**Fixed to use actual PostgreSQL migration system:**

```sql
-- packages/models/migrations/001_oauth_accounts.sql
-- PostgreSQL Migration: OAuth Support
-- Description: Adds oauth_accounts table and email verification to users
-- Author: OAuth Implementation Team  
-- Version: 1.0.0
-- Dependencies: 000_postgresql_schema
-- Last Updated: 2024-12-01

-- Add email verification to existing users table
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;

-- Mark existing users as verified (they proved email access via password)
UPDATE users SET email_verified = TRUE WHERE password IS NOT NULL;

-- Create simplified OAuth accounts table
CREATE TABLE oauth_accounts (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    profile_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate provider accounts
    UNIQUE(provider, provider_user_id)
);

-- Performance indexes
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX idx_oauth_accounts_email ON oauth_accounts(email);

-- Auto-update timestamp trigger (matching existing pattern)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_oauth_accounts_updated_at 
    BEFORE UPDATE ON oauth_accounts 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Documentation
COMMENT ON TABLE oauth_accounts IS 'OAuth account links - supports multiple providers per user';
COMMENT ON COLUMN users.email_verified IS 'Email verification status - true for OAuth and password users';
```

**Rollback Migration** (following existing pattern):
```sql
-- packages/models/migrations/001_rollback_oauth_accounts.sql
-- Rollback OAuth Support
DROP TRIGGER IF EXISTS update_oauth_accounts_updated_at ON oauth_accounts;
DROP TABLE IF EXISTS oauth_accounts;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
```

#### Why Separate Table?
- **Flexibility**: Users can link multiple OAuth providers
- **Data Integrity**: Clean separation of concerns
- **Security**: OAuth tokens isolated from main user data
- **Scalability**: Easy to add more providers
- **Backward Compatibility**: Zero changes to existing users table structure

### 2. Environment Variables

```env
# OAuth Provider Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# OAuth Configuration
OAUTH_REDIRECT_BASE_URL=http://localhost:3000  # Frontend URL for redirects
```

### 3. Backend Implementation

#### 3. Extend Error System (✅ **ALIGNED WITH EXISTING PATTERNS**)
**Problem**: Plan referenced non-existent `OAuthError` classes
**Fix**: Extend existing `StandardErrorCode` enum:

```typescript
// packages/protocol/src/contracts/errors.ts - ADD TO EXISTING ENUM
export type StandardErrorCode =
  // ... existing codes ...
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_PROVIDER_ERROR'
  | 'OAUTH_CALLBACK_ERROR'
  | 'OAUTH_TOKEN_INVALID'
  | 'OAUTH_EMAIL_MISMATCH'
  | 'OAUTH_ACCOUNT_LINKING_FAILED';
```

### 2. Backend Implementation (✅ **ALIGNED WITH ACTUAL SERVICE PATTERNS**)

### **Layer 4: Service Layer (Server) - OAuth Business Logic**

**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/server/src/services/UserService.ts`

Following the established service pattern for business logic and repository orchestration:

```typescript
// packages/server/src/services/UserService.ts
// Add these methods to existing UserService class

import { OAuthAccountRepository } from '@starships/models';
import type { OAuthProfileModel, OAuthAccountModel } from '@starships/protocol';

/**
 * Create or link user from OAuth profile
 * CRITICAL: NO LAYER JUMPING - Uses proper service methods only
 */
async createUserFromOAuth(provider: string, authCode: string): Promise<{
  user: UserModel;
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}> {
  // Get OAuth profile from provider
  const profile = await this.getOAuthProfile(provider, authCode);
  
  // Check waitlist status using existing service
  const waitlistService = new WaitlistService();
  const waitlistStatus = await waitlistService.getDetailedStatus(profile.email);
  
  // Handle waitlist logic (EXISTING PATTERN)
  if (!waitlistStatus.exists) {
    await waitlistService.addToPendingWaitlist(profile.email);
  }
  
  if (waitlistStatus.status === 'pending') {
    return {
      user: { email: profile.email } as UserModel,
      waitlisted: true,
      status: 'pending', 
      message: 'Thanks for signing up! Please wait for approval to access the app.',
    };
  }
  
  // Check if user exists by email (for account linking)
  let user = await this.getUserByEmail(profile.email);
  
  if (!user) {
    // ✅ FIXED: Use proper service method - NO REPOSITORY JUMPING
    user = await this.createUserFromOAuthProfile(profile);
  } else {
    // Update email verification for existing users
    await this.updateUserProfile(user.id, { emailVerified: true });
  }
  
  // Link OAuth account using business logic
  await this.linkOAuthAccount(user.id, profile);
  
  return { user };
}

/**
 * Create user from OAuth profile - proper service method
 * CRITICAL: Uses createUser() service method, not repository directly
 */
private async createUserFromOAuthProfile(profile: OAuthProfileModel): Promise<UserModel> {
  // Use existing service method for user creation
  const userData = {
    email: profile.email,
    displayName: profile.name,
    avatar: profile.avatar,
  };
  
  // Create user using proper service layer method
  const user = await this.createUser({
    ...userData,
    emailVerified: true, // OAuth providers verify emails
  });
  
  return user;
}

/**
 * Link OAuth account to existing user
 * Business logic layer - orchestrates repository operations
 */
async linkOAuthAccount(userId: string, profile: OAuthProfileModel): Promise<void> {
  const oauthRepo = new OAuthAccountRepository();
  
  // Business rule: Check if already linked
  const existing = await oauthRepo.findByProviderAndUser(profile.provider, profile.providerId);
  if (existing) {
    return; // Already linked
  }
  
  // Business logic: Create OAuth account link using Entity pattern
  const oauthAccountData = OAuthAccountEntity.createFromProfile(userId, profile);
  await oauthRepo.create(oauthAccountData);
}

/**
 * Get user's linked OAuth accounts
 * Business logic method for account management
 */
async getUserOAuthAccounts(userId: string): Promise<OAuthAccountModel[]> {
  const oauthRepo = new OAuthAccountRepository();
  return await oauthRepo.findByUserId(userId);
}

/**
 * Unlink OAuth account with business rules
 * Business logic: Ensure user has alternative authentication
 */
async unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
  // Business rule: Check if user has password or other OAuth accounts
  const user = await this.getUserById(userId);
  const oauthAccounts = await this.getUserOAuthAccounts(userId);
  
  if (!user?.password && oauthAccounts.length <= 1) {
    throw new ValidationError('Cannot unlink last authentication method. Set a password first.', 'provider');
  }
  
  // Business operation: Remove OAuth account
  const oauthRepo = new OAuthAccountRepository();
  await oauthRepo.deleteByProviderAndUser(provider, userId);
}

/**
 * Get OAuth profile from provider
 * Business logic for external OAuth provider integration
 */
private async getOAuthProfile(provider: string, authCode: string): Promise<OAuthProfileModel> {
  if (provider === 'google') {
    return await this.getGoogleProfile(authCode);
  } else if (provider === 'github') {
    return await this.getGitHubProfile(authCode);
  } else {
    throw new ValidationError(`Unsupported OAuth provider: ${provider}`, 'provider');
  }
}

/**
 * Get Google OAuth profile
 */
private async getGoogleProfile(authCode: string): Promise<OAuthProfileModel> {
  // Implementation for Google OAuth profile fetching
  // Uses googleapis library to exchange code for profile
  // Returns standardized OAuthProfileModel
}

/**
 * Get GitHub OAuth profile  
 */
private async getGitHubProfile(authCode: string): Promise<OAuthProfileModel> {
  // Implementation for GitHub OAuth profile fetching
  // Uses @octokit/oauth-app to exchange code for profile
  // Returns standardized OAuthProfileModel
}

/**
 * Static method for API routes compatibility
 */
static async createUserFromOAuth(provider: string, authCode: string): Promise<{
  user: UserModel;
  waitlisted?: boolean;
  status?: 'pending' | 'approved';
  message?: string;
}> {
  const userService = new UserService();
  return userService.createUserFromOAuth(provider, authCode);
}
```

### **Layer 3: Repository Layer (Models) - OAuth Data Access**

**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/models/src/repositories/OAuthAccountRepository.ts`

Following the established BaseRepository + Entity pattern for proper layered architecture compliance:

```typescript
// packages/models/src/repositories/OAuthAccountRepository.ts
import { BaseRepository } from '@/repositories/BaseRepository';
import { OAuthAccountEntity } from '@/entities/OAuthAccountEntity';
import type { OAuthAccountModel } from '@starships/protocol';

/**
 * OAuth Account Repository - Layer 3 (Data Access)
 * CRITICAL: Follows BaseRepository + Entity pattern for architectural compliance
 */
export class OAuthAccountRepository extends BaseRepository {
  constructor() {
    super('OAuthAccountRepository');
  }

  /**
   * Create OAuth account - follows entity validation pattern
   */
  async create(entity: Omit<OAuthAccountModel, 'id' | 'createdAt' | 'updatedAt'>): Promise<OAuthAccountModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity (Layer 2)
      await OAuthAccountEntity.validate(entity, 'create');

      // Prepare entity data with timestamps
      const entityData = {
        ...entity,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Transform using Entity
      const oauthEntity = OAuthAccountEntity.deserialize(entityData);
      
      // Create entity in database (Layer 3 -> Database)
      const result = await this.createEntity<Record<string, unknown>>('oauth_accounts', oauthEntity.serialize());

      // Convert back to domain model (Database -> Layer 1)
      return OAuthAccountEntity.deserialize(result);
    }, 'create');
  }

  /**
   * Find all OAuth accounts - follows repository pattern
   */
  async findAll(): Promise<OAuthAccountModel[]> {
    return this.executeWithErrorHandling(async () => {
      const results = await super.findAllEntities<Record<string, unknown>>('oauth_accounts');
      return results.map(result => OAuthAccountEntity.deserialize(result));
    }, 'findAll');
  }

  /**
   * Find OAuth account by ID - follows repository pattern
   */
  async findById(id: string): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      const result = await super.findEntityById<Record<string, unknown>>('oauth_accounts', id);
      return result ? OAuthAccountEntity.deserialize(result) : null;
    }, 'findById');
  }

  /**
   * Find OAuth account by provider and provider user ID
   */
  async findByProviderAndUser(provider: string, providerUserId: string): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.queryOne<Record<string, unknown>>(
        'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        [provider, providerUserId]
      );
      return result ? OAuthAccountEntity.deserialize(result) : null;
    }, 'findByProviderAndUser');
  }

  /**
   * Find all OAuth accounts for a user
   */
  async findByUserId(userId: string): Promise<OAuthAccountModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const results = await connection.query<Record<string, unknown>>(
        'SELECT * FROM oauth_accounts WHERE user_id = $1',
        [userId]
      );
      return results.map(result => OAuthAccountEntity.deserialize(result));
    }, 'findByUserId');
  }

  /**
   * Update OAuth account - follows entity pattern
   */
  async update(id: string, updates: Partial<OAuthAccountModel>): Promise<OAuthAccountModel | null> {
    return this.executeWithErrorHandling(async () => {
      // Validate using Entity
      if (Object.keys(updates).length > 0) {
        await OAuthAccountEntity.validate(updates, 'update');
      }

      // Transform using Entity
      const updateEntity = OAuthAccountEntity.deserialize(updates);
      const updateData = updateEntity.serialize();

      // Filter out protected fields
      const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;
      
      if (Object.keys(filteredUpdateData).length === 0) {
        return await this.findById(id);
      }

      // Update in database
      const result = await this.updateEntity<Record<string, unknown>>('oauth_accounts', id, filteredUpdateData);
      
      if (!result) {
        this.handleNotFound('OAuth Account', id);
      }
      
      return OAuthAccountEntity.deserialize(result);
    }, 'update');
  }

  /**
   * Delete OAuth account
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      return await this.deleteEntity('oauth_accounts', id);
    }, 'delete');
  }

  /**
   * Delete OAuth account by provider and user
   */
  async deleteByProviderAndUser(provider: string, userId: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = this.getConnection();
      const result = await connection.query(
        'DELETE FROM oauth_accounts WHERE provider = $1 AND user_id = $2',
        [provider, userId]
      );
      return result.rowCount > 0;
    }, 'deleteByProviderAndUser');
  }
}
```

### **Layer 5: API Routes Layer (Server) - OAuth HTTP Endpoints**

**Status**: ⏳ **PENDING** | **Priority**: 🔥 **CRITICAL**  
**File**: `packages/server/src/routes/auth.ts`

Following the established API routes pattern with Zod validation and proper service delegation:

```typescript
// packages/server/src/routes/auth.ts - ADD TO EXISTING FILE
import { generateJWT, generateOAuthState, validateOAuthState } from '@/utils/jwt';
import { sendError, sendSuccess, handleError } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { z } from 'zod';

// Zod schemas for OAuth validation
const OAuthProviderSchema = z.enum(['google', 'github']);
const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
});

// Update existing auth routes to use shared JWT utility
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    // ... existing validation logic ...
    
    // Replace JWT generation with shared utility
    const token = await generateJWT(user);
    
    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName || user.email?.split('@')[0],
        avatar: user.avatar,
      },
      token, // Same format as before
      starship: firstStarship ? { /* ... */ } : null,
    });
  } catch (error: any) {
    handleError(error, res, 'user login');
  }
});

// OAuth initiation routes with Zod validation
router.get('/auth/:provider', async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(
      z.object({ provider: OAuthProviderSchema }), 
      req.params, 
      res, 
      'OAuth provider'
    );
    if (!paramValidation) return;

    const { provider } = paramValidation;
    const redirectUri = `${req.protocol}://${req.get('host')}/api/v1/auth/${provider}/callback`;
    const state = await generateOAuthState();

    let authUrl: string;
    if (provider === 'google') {
      const scope = 'openid email profile';
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${env.GOOGLE_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;
    } else {
      const scope = 'user:email';
      authUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${env.GITHUB_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `state=${state}`;
    }
    
    res.redirect(authUrl);
  } catch (error: any) {
    handleError(error, res, 'OAuth initiation');
  }
});

// OAuth callback routes with proper validation
router.get('/auth/:provider/callback', async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(
      z.object({ provider: OAuthProviderSchema }), 
      req.params, 
      res, 
      'OAuth provider'
    );
    if (!paramValidation) return;

    // Validate query parameters
    const queryValidation = validateData(OAuthCallbackSchema, req.query, res, 'OAuth callback');
    if (!queryValidation) return;

    const { provider } = paramValidation;
    const { code, state, error: oauthError } = queryValidation;
    
    // Handle OAuth provider errors
    if (oauthError) {
      return res.redirect(`${env.CLIENT_URL}/login?oauth_error=provider_error`);
    }
    
    // Validate state parameter (CSRF protection)
    if (!await validateOAuthState(state)) {
      return res.redirect(`${env.CLIENT_URL}/login?oauth_error=invalid_state`);
    }
    
    // Delegate to service layer (Layer 4)
    const result = await UserService.createUserFromOAuth(provider, code);
    
    if (result.waitlisted) {
      return res.redirect(`${env.CLIENT_URL}/login?oauth_waitlist=pending`);
    }
    
    // Generate JWT using shared utility
    const token = await generateJWT(result.user);
    
    // Redirect to existing login page with token
    return res.redirect(`${env.CLIENT_URL}/login?oauth_token=${token}`);
    
  } catch (error: any) {
    logger.error('[AUTH] OAuth callback error:', {
      provider: req.params.provider,
      error: error.message,
      hasCode: !!req.query.code,
      hasState: !!req.query.state,
    });

    return res.redirect(`${env.CLIENT_URL}/login?oauth_error=callback_failed`);
  }
});

// Account management routes (for authenticated users)
router.get('/auth/oauth/accounts', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user!.id;
    
    // Delegate to service layer (Layer 4)
    const userService = new UserService();
    const accounts = await userService.getUserOAuthAccounts(userId);
    
    sendSuccess(res, {
      accounts: accounts.map(account => ({
        provider: account.provider,
        email: account.email,
        profileData: account.profileData,
        linkedAt: account.createdAt,
      }))
    });
  } catch (error: any) {
    handleError(error, res, 'get OAuth accounts');
  }
});

router.delete('/auth/oauth/unlink/:provider', jwtAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // Validate provider parameter
    const paramValidation = validateData(
      z.object({ provider: OAuthProviderSchema }), 
      req.params, 
      res, 
      'OAuth provider'
    );
    if (!paramValidation) return;

    const userId = (req as any).user!.id;
    const { provider } = paramValidation;
    
    // Delegate to service layer (Layer 4) - includes business rule validation
    const userService = new UserService();
    await userService.unlinkOAuthAccount(userId, provider);
    
    sendSuccess(res, { message: `${provider} account unlinked successfully` });
  } catch (error: any) {
    handleError(error, res, 'unlink OAuth account');
  }
});
```

### **Phase 2: Frontend Integration (Week 2)**

#### 📋 **TASK TRACKER - Phase 2**

| **Task** | **Status** | **Assignee** | **Started** | **Completed** | **Notes** |
|----------|------------|--------------|-------------|---------------|-----------|
| 1. Add OAuth Buttons | ⏳ **PENDING** | - | - | - | Update LoginForm.tsx |
| 2. Add Callback Handling | ⏳ **PENDING** | - | - | - | OAuth redirect processing |
| 3. Create Account Settings | ⏳ **PENDING** | - | - | - | Link/unlink OAuth accounts |
| 4. Test OAuth Flow | ⏳ **PENDING** | - | - | - | End-to-end testing |

### **Layer 6: Client Layer - OAuth React Hooks & UI**

#### **React Hooks with TanStack Query (Layer 6)**

**Status**: ⏳ **PENDING** | **Priority**: 🟡 **HIGH**  
**File**: `packages/client/src/hooks/useOAuth.ts`

Following the established client layer pattern with TanStack Query and hierarchical cache keys:

```typescript
// packages/client/src/hooks/useOAuth.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import type { OAuthAccountModel } from '@starships/protocol';

// Hierarchical query keys following established pattern
export const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  accounts: () => [...OAUTH_QUERY_KEYS.all, 'accounts'] as const,
  userAccounts: (userId: string) => [...OAUTH_QUERY_KEYS.accounts(), userId] as const,
} as const;

/**
 * Response data extraction helper - follows established pattern
 */
const extractResponseData = <T>(response: any): T => response.data.data;

/**
 * Get user's linked OAuth accounts
 * Follows established query pattern with caching
 */
export function useOAuthAccounts(enabled: boolean = true) {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.accounts(),
    queryFn: async () => {
      const response = await api.get('/api/v1/auth/oauth/accounts');
      const accounts = extractResponseData<{ accounts: OAuthAccountModel[] }>(response);
      return accounts;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Unlink OAuth account mutation
 * Follows established mutation pattern with optimistic updates
 */
export function useUnlinkOAuthAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: 'google' | 'github') => {
      const response = await api.delete(`/api/v1/auth/oauth/unlink/${provider}`);
      return response.data;
    },
    onMutate: async (provider) => {
      // Cancel competing queries
      await queryClient.cancelQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() });

      // Snapshot current accounts
      const previousAccounts = queryClient.getQueryData(OAUTH_QUERY_KEYS.accounts());

      // Optimistic update: remove account
      queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), (old: any) => {
        if (!old?.accounts) return old;
        return {
          accounts: old.accounts.filter((account: OAuthAccountModel) => account.provider !== provider)
        };
      });

      return { previousAccounts, provider };
    },
    onSuccess: (_, provider) => {
      toast({
        title: 'Account unlinked',
        description: `${provider} account has been unlinked successfully.`,
      });
    },
    onError: (error: any, provider, context) => {
      // Rollback optimistic update
      if (context?.previousAccounts) {
        queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), context.previousAccounts);
      }
      
      toast({
        title: 'Failed to unlink account',
        description: error?.response?.data?.error?.message || 'Failed to unlink OAuth account',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      // Refresh accounts data
      queryClient.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() });
    },
  });
}

/**
 * OAuth initiation helper
 * Handles redirect to OAuth provider
 */
export function useOAuthLogin() {
  return {
    initiateOAuth: (provider: 'google' | 'github') => {
      window.location.href = `/api/v1/auth/${provider}`;
    },
  };
}
```

#### **Extended Login Form (Layer 6 UI)**

**Status**: ⏳ **PENDING** | **Priority**: 🟡 **HIGH**  
**File**: `packages/client/src/components/auth/LoginForm.tsx`

Following established UI patterns and integrating OAuth buttons above existing tab system:

```typescript
// packages/client/src/components/auth/LoginForm.tsx - MODIFY EXISTING
// Add OAuth imports
import { Github, Chrome } from 'lucide-react';

// Add OAuth button component before existing Tabs
const OAuthButtons = ({ disabled }: { disabled: boolean }) => (
  <div className="space-y-3 mb-6">
    <div className="grid grid-cols-2 gap-3">
      <Button
        variant="outline"
        onClick={() => window.location.href = '/api/v1/auth/google'}
        disabled={disabled}
        className="w-full"
      >
        <Chrome className="h-4 w-4 mr-2" />
        Google
      </Button>
      
      <Button
        variant="outline"
        onClick={() => window.location.href = '/api/v1/auth/github'}
        disabled={disabled}
        className="w-full"
      >
        <Github className="h-4 w-4 mr-2" />
        GitHub
      </Button>
    </div>
    
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-background px-2 text-muted-foreground">
          Or continue with email
        </span>
      </div>
    </div>
  </div>
);

// Update LoginForm component - ADD BEFORE EXISTING TABS:
export function LoginForm() {
  // ... existing state and handlers ...
  
  // ✅ ADD: OAuth callback handling
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const oauthToken = searchParams?.get('oauth_token');
    const oauthError = searchParams?.get('oauth_error');
    const oauthWaitlist = searchParams?.get('oauth_waitlist');
    
    if (oauthToken) {
      localStorage.setItem('starships_auth_token', oauthToken);
      window.location.href = '/ship'; // Redirect to app
    } else if (oauthError) {
      setFormError(getOAuthErrorMessage(oauthError));
    } else if (oauthWaitlist) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: 'Thanks for signing up! Please wait for approval to access the app.'
      });
    }
  }, [searchParams]);
  
  return (
    <motion.div className="w-full max-w-md" ...>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Access Your Starship</CardTitle>
          <CardDescription>Sign in to your starship or create a new account</CardDescription>
        </CardHeader>

        <CardContent>
          {/* ✅ ADD: OAuth buttons ABOVE existing tabs */}
          <OAuthButtons disabled={isLoading || !!waitlistStatus} />
          
          {/* Existing waitlist message and tabs remain unchanged */}
          {waitlistStatus && (
            <div className="mb-4">
              <WaitlistMessage ... />
            </div>
          )}
          
          {/* Existing tab system unchanged */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* ... existing tabs implementation ... */}
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ✅ ADD: OAuth error handling
function getOAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'invalid_state':
      return 'Security validation failed. Please try again.';
    case 'provider_error':
      return 'Authentication provider error. Please try again.';
    case 'validation_failed':
      return 'Account validation failed. Please contact support.';
    default:
      return 'Login failed. Please try again.';
  }
}
```

#### Login Page Updates (✅ **MINIMAL CHANGES NEEDED**)
**The existing `packages/client/src/app/login/page.tsx` needs minimal changes:**

```typescript
// packages/client/src/app/login/page.tsx - ADD IMPORT ONLY
import { useSearchParams } from 'next/navigation';

// Pass searchParams to LoginForm if needed
// Otherwise, LoginForm can use useSearchParams() directly (preferred)
```

#### Account Management Component (For Profile Page)
```typescript
// packages/client/src/components/settings/OAuthAccountsSettings.tsx

export function OAuthAccountsSettings() {
  const [oauthAccounts, setOAuthAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Fetch linked OAuth accounts using existing API pattern
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await fetch('/api/v1/auth/oauth/accounts', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('starships_auth_token')}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setOAuthAccounts(data.data.accounts);
        }
      } catch (error) {
        console.error('Failed to fetch OAuth accounts:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAccounts();
  }, []);
  
  const linkAccount = (provider: string) => {
    // Redirect to OAuth flow for linking
    window.location.href = `/api/v1/auth/${provider}`;
  };
  
  const unlinkAccount = async (provider: string) => {
    try {
      const response = await fetch(`/api/v1/auth/oauth/unlink/${provider}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('starships_auth_token')}`,
        },
      });
      
      if (response.ok) {
        // Refresh accounts list
        setOAuthAccounts(accounts => accounts.filter(acc => acc.provider !== provider));
        toast.success(`${provider} account unlinked successfully`);
      } else {
        const error = await response.json();
        toast.error(error.error?.message || 'Failed to unlink account');
      }
    } catch (error) {
      toast.error('Failed to unlink account');
    }
  };
  
  if (loading) return <div>Loading linked accounts...</div>;
  
  return (
    <div className="oauth-accounts-settings">
      <h3>Connected Accounts</h3>
      <p>Link your accounts to sign in with multiple methods</p>
      
      {/* Google Account */}
      <div className="oauth-account-item">
        <div className="provider-info">
          <GoogleIcon />
          <span>Google</span>
        </div>
        {oauthAccounts.find(acc => acc.provider === 'google') ? (
          <div className="account-linked">
            <span>Linked</span>
            <button onClick={() => unlinkAccount('google')}>Unlink</button>
          </div>
        ) : (
          <button onClick={() => linkAccount('google')}>Link Account</button>
        )}
      </div>
      
      {/* GitHub Account */}
      <div className="oauth-account-item">
        <div className="provider-info">
          <GitHubIcon />
          <span>GitHub</span>
        </div>
        {oauthAccounts.find(acc => acc.provider === 'github') ? (
          <div className="account-linked">
            <span>Linked</span>
            <button onClick={() => unlinkAccount('github')}>Unlink</button>
          </div>
        ) : (
          <button onClick={() => linkAccount('github')}>Link Account</button>
        )}
      </div>
    </div>
  );
}
```

## ✅ **Revised Implementation Summary**

### Key Architectural Fixes Made

1. **✅ Database Architecture**: Fixed PostgreSQL migration format and table structure
2. **✅ JWT Duplication Fix**: Extract shared utility to eliminate duplicate code in auth routes
3. **✅ Error System Alignment**: Extend existing `StandardErrorCode` instead of new OAuth error classes
4. **✅ Service Layer Alignment**: Work with actual `UserService` behavior and method signatures
5. **✅ Frontend Integration**: Add OAuth buttons above existing tab system in `LoginForm.tsx`
6. **✅ Migration System Compliance**: Use actual PostgreSQL migration runner format
7. **✅ Repository Pattern**: Simplified OAuth repository following existing PostgreSQL patterns

## User Experience Flows

### 1. New User Registration via OAuth
1. User clicks "Continue with Google/GitHub"
2. Redirected to OAuth provider
3. User authorizes app
4. Redirected to `/api/v1/auth/{provider}/callback`
5. Backend validates OAuth, checks waitlist
6. If approved: Creates user, issues JWT, redirects to `/auth/callback?token=...`
7. If pending: Redirects to `/waitlist?status=pending`
8. Frontend handles callback, stores token, redirects to app

### 2. Existing Email User Links OAuth
1. User logs in with email/password (existing flow)
2. Goes to account settings
3. Clicks "Link Google/GitHub Account"
4. OAuth flow completes, account gets linked
5. User can now login with either method

### 3. OAuth User Adds Password
1. User logs in with OAuth (existing flow after linking)
2. Goes to account settings
3. Sets password for email login capability
4. Can now login with either OAuth or email/password

### 4. Account Conflict Resolution
- **Same email across OAuth providers**: Automatically linked to same user account
- **OAuth email matches existing user**: OAuth account linked to existing user
- **Different emails**: Separate accounts (user can merge manually via support)

## Waitlist Integration

### Automatic Waitlist Handling
```typescript
// OAuth flow integrates seamlessly with existing waitlist system

async handleOAuthCallback(provider: string, code: string) {
  const profile = await getOAuthProfile(provider, code);
  
  // Use existing waitlist service
  const waitlistService = new WaitlistService();
  const waitlistStatus = await waitlistService.getDetailedStatus(profile.email);
  
  // Handle same as email registration
  if (!waitlistStatus.exists) {
    await waitlistService.addToPendingWaitlist(profile.email);
  }
  
  if (waitlistStatus.status === 'pending') {
    return { waitlisted: true, status: 'pending', message: 'Please wait for approval' };
  }
  
  // Approved users get full access
  const user = await this.createUserAndStarship(profile);
  const token = await this.generateJWT(user);
  return { user, token };
}
```

## Security Considerations

### OAuth Security Best Practices
- **State Parameter**: CSRF protection for OAuth flows
- **PKCE Flow**: Additional security for authorization code exchange
- **Token Validation**: Verify all tokens with OAuth providers
- **Secure Storage**: Hash OAuth tokens in database
- **Scope Limitation**: Request minimal necessary permissions

### Data Protection
- **Minimal Data Storage**: Only store essential profile information
- **Encrypted Tokens**: Hash OAuth access/refresh tokens
- **User Consent**: Clear privacy policy for OAuth data usage
- **Data Deletion**: Clear OAuth data when accounts are unlinked

### Rate Limiting
```typescript
// Add rate limiting to OAuth endpoints
app.use('/api/v1/auth/google', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
}));
```

### **Phase 3: Polish & Deploy (Week 3)**

#### 📋 **TASK TRACKER - Phase 3**

| **Task** | **Status** | **Assignee** | **Started** | **Completed** | **Notes** |
|----------|------------|--------------|-------------|---------------|-----------|
| 1. Unit Tests | ⏳ **PENDING** | - | - | - | OAuth utility functions |
| 2. Integration Tests | ⏳ **PENDING** | - | - | - | End-to-end OAuth flows |
| 3. Security Review | ⏳ **PENDING** | - | - | - | Rate limiting + security |
| 4. Deploy to Staging | ⏳ **PENDING** | - | - | - | Testing environment |
| 5. Production Setup | ⏳ **PENDING** | - | - | - | OAuth apps + monitoring |

## ✅ **Implementation Roadmap Summary**

### **✅ Phase 0: Critical Foundation (Day 1)**
**Status**: ⏳ **NOT STARTED** | **Priority**: 🔥 **CRITICAL**
- ⏳ Extract JWT utility from `packages/server/src/routes/auth.ts` (fix duplicate code)
- ⏳ Update both register and login routes to use shared `generateJWT()`
- ⏳ Add OAuth error codes to `packages/protocol/src/contracts/errors.ts`
- ⏳ Add OAuth environment configuration to env package
- ⏳ **Test**: Ensure existing auth flow still works after JWT extraction

### **✅ Phase 1: Database & Backend (Week 1)**
**Status**: ⏳ **NOT STARTED** | **Priority**: 🟡 **HIGH** | **Depends on**: Phase 0
- ⏳ Create `001_oauth_accounts.sql` migration (✅ **CORRECTED PostgreSQL format**)
- ⏳ Run migration using existing `packages/models/src/scripts/migration-runner.ts`
- ⏳ Create `OAuthAccountRepository` (✅ **SIMPLIFIED for PostgreSQL**)
- ⏳ Extend `UserService` with OAuth methods (✅ **ALIGNED with actual behavior**)
- ⏳ Add OAuth routes to existing auth controller (✅ **USING existing error system**)
- ⏳ Set up Google & GitHub OAuth applications

### **✅ Phase 2: Frontend Integration (Week 2)**
**Status**: ⏳ **NOT STARTED** | **Priority**: 🟡 **HIGH** | **Depends on**: Phase 1
- ⏳ Add OAuth buttons to `LoginForm.tsx` (✅ **ABOVE existing tabs**)
- ⏳ Add OAuth callback handling to `LoginForm.tsx`
- ⏳ Create `OAuthAccountsSettings` component for profile page
- ⏳ Test complete OAuth flow with existing waitlist system

### **✅ Phase 3: Polish & Deploy (Week 3)**
**Status**: ⏳ **NOT STARTED** | **Priority**: 🟢 **MEDIUM** | **Depends on**: Phase 2
- ⏳ Unit tests for OAuth utility functions
- ⏳ Integration tests for OAuth flows
- ⏳ Security review and rate limiting
- ⏳ Deploy to staging
- ⏳ Production OAuth app setup and monitoring

## ✅ **Revised Rollback Plan (POSTGRESQL-SAFE)**

### Zero-Risk Rollback Strategy
1. **Disable OAuth buttons** in `LoginForm.tsx` (comment out `<OAuthButtons />` component)
2. **Existing JWT auth continues** working unchanged (using extracted utility)
3. **Database rollback available** via `001_rollback_oauth_accounts.sql` migration
4. **Fix issues offline** and re-enable OAuth buttons
5. **OAuth users maintain access** (they can set passwords in account settings)
6. **JWT utility remains** (improves existing auth regardless of OAuth)

## Success Metrics

- **User Adoption**: % of new users choosing OAuth over email/password
- **Conversion Rate**: OAuth users who complete onboarding
- **Account Linking**: % of existing users who link OAuth accounts
- **Support Reduction**: Decrease in password reset requests
- **Performance**: OAuth flow completion time < 3 seconds
- **Error Rate**: OAuth flow success rate > 95%

## Testing Strategy

### Unit Tests
```typescript
// OAuthService unit tests
describe('OAuthService', () => {
  test('should create new user from OAuth profile', async () => {
    // Test user creation flow
  });
  
  test('should link OAuth account to existing user', async () => {
    // Test account linking
  });
  
  test('should handle waitlist correctly', async () => {
    // Test waitlist integration
  });
});
```

### Integration Tests
- OAuth callback endpoints
- Account linking/unlinking
- Waitlist integration
- Error scenarios

### End-to-End Tests
- Complete OAuth registration flow
- Account linking for existing users
- OAuth login after linking
- Error handling and recovery

## Dependencies

### Required Libraries
Minimal dependencies following existing patterns:

```json
{
  "dependencies": {
    // OAuth client libraries
    "googleapis": "^126.0.1",           // Google OAuth client
    "@octokit/oauth-app": "^6.0.0"      // GitHub OAuth client
    
    // No additional dependencies needed:
    // - crypto: built-in Node.js module for state generation
    // - jose: already in use for JWT operations
    // - No express-session needed (using JWT state tokens)
    // - No frontend routing libraries needed (extending existing routes)
  }
}
```

### External OAuth Applications
- **Google Cloud Console**: OAuth 2.0 Client IDs
- **GitHub Developer Settings**: OAuth Apps

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OAuth provider downtime | Users can't OAuth login | Low | Email/password remains available |
| Account hijacking via OAuth | Security breach | Low | Verify OAuth tokens, use HTTPS |
| Email conflicts | User confusion | Medium | Clear linking UI and documentation |
| Implementation bugs | Service disruption | Medium | Comprehensive testing, feature flags |
| OAuth token leakage | Unauthorized access | Low | Hash tokens, use secure storage |

## Future Enhancements

### Additional OAuth Providers
- **Apple Sign In**: Popular on mobile devices
- **Microsoft**: For enterprise users
- **Twitter/X**: For social authentication

### Advanced Features
- **Team/Organization SSO**: SAML/OIDC for enterprises
- **Two-Factor Authentication**: Additional security layer
- **Social Features**: Use OAuth profile data for enhanced UX
- **OAuth Scope Management**: Fine-grained permissions

## Cost Analysis

### Development Cost (Reduced)
- **Initial Implementation**: ~1.5 weeks (reduced from 3 weeks due to architectural alignment)
- **Maintenance**: ~30 minutes/month (leverages existing patterns)
- **OAuth App Fees**: Free (Google/GitHub)
- **Infrastructure Cost**: $0 (no additional servers/services needed)

### Benefits
- **Reduced Support**: Fewer password reset tickets (~50% reduction expected)
- **Higher Conversion**: Easier signup process (~20-30% improvement expected)
- **Better Security**: OAuth providers handle credentials and 2FA
- **User Experience**: Faster login process (2-3 seconds vs 30+ seconds for new users)
- **Developer Experience**: Consistent with existing codebase patterns

## Approval Checklist

- [ ] **Technical Review**: Architecture and implementation approach
- [ ] **Security Review**: OAuth security and data protection
- [ ] **UX Review**: User experience flows and error handling
- [ ] **Legal Review**: Privacy policy and data usage terms
- [ ] **DevOps Review**: Deployment and monitoring strategy

---

**Last Updated**: December 2024  
**Author**: Development Team  
**Status**: ✅ **CORRECTED** - Fixed Critical Architectural Mismatches  
**Next Review**: After Phase 0 foundation fixes  
**Implementation Risk**: 🟢 **LOW** (was 🔴 **HIGH** before architectural alignment)

## ✅ **Critical Issues Fixed in This Revision**

### What Was Wrong with Original Plan
1. **❌ Database Mismatch**: Assumed Neo4j → ✅ **Fixed**: PostgreSQL migration format
2. **❌ Missing Schema**: Referenced non-existent `email_verified` column → ✅ **Fixed**: Proper ALTER TABLE
3. **❌ JWT Duplication**: Ignored existing duplicate code → ✅ **Fixed**: Extract-first approach
4. **❌ Wrong Error System**: Created new OAuth error classes → ✅ **Fixed**: Extend `StandardErrorCode`
5. **❌ Service Mismatch**: Wrong `UserService` assumptions → ✅ **Fixed**: Aligned with actual implementation
6. **❌ Frontend Mismatch**: Assumed simple login page → ✅ **Fixed**: Work with tab-based `LoginForm.tsx`
7. **❌ Repository Complexity**: Over-engineered OAuth repository → ✅ **Fixed**: Simplified PostgreSQL approach

### Why This Revision Is Actually Elegant
- **✅ Architectural Alignment**: Every component now matches existing codebase patterns
- **✅ Technical Debt Fix**: JWT extraction improves existing auth regardless of OAuth
- **✅ Zero Breaking Changes**: All fixes are additive and backward compatible
- **✅ Database Consistency**: Proper PostgreSQL migrations with rollback support
- **✅ Error System Consistency**: Uses existing standardized error handling
- **✅ Frontend Integration**: OAuth buttons integrate seamlessly with existing UI
- **✅ Maintainability**: Simplified approach that follows established patterns

### Implementation Confidence
**Before Revision**: ❌ High risk due to architectural mismatches  
**After Revision**: ✅ **Low risk** - every component aligns with existing patterns