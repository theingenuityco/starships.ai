# Waitlist Integration Implementation Plan

## 📊 Progress Tracker

### Overall Progress: 53% Complete
🟦🟦🟦🟦🟦⬜⬜⬜⬜⬜ 28/53 tasks

### By Section:
- **Backend**: 🟦🟦🟦🟦⬜ 78% (14/18 tasks)
- **Frontend**: 🟦🟦🟦⬜⬜ 63% (10/16 tasks)
- **Database**: 🟦🟦🟦🟦🟦 100% (3/3 tasks)
- **Testing**: ⬜⬜⬜⬜⬜ 0% (0/9 tasks)
- **Cleanup**: ⬜⬜⬜⬜⬜ 0% (0/7 tasks) **[NEW]**

### Status Legend:
- ⬜ Not Started
- 🔄 In Progress
- ✅ Completed
- ❌ Blocked
- ⏭️ Skipped

### Last Updated: 2025-09-18 (17:00 UTC)

### Quick Status Update Guide:
```
To update task status, replace the symbol:
- [ ] ⬜ → [ ] 🔄  (mark as in progress)
- [ ] 🔄 → [x] ✅  (mark as completed)
- [ ] ⬜ → [ ] ❌  (mark as blocked)
- [ ] ⬜ → [ ] ⏭️  (mark as skipped)
```

---

## Overview

Integrate waitlist functionality seamlessly into the authentication flow, eliminating the separate waitlist page and automatically managing user access based on approval status.

## Current State

- Waitlist system exists but is **completely disconnected** from auth flow
- Separate `/waitlist` page that users must navigate to
- Waitlist routes exist at `/api/v1/waitlist/*` with cookie session
- No enforcement of waitlist approval during registration
- Users can bypass waitlist by directly accessing login/register
- Existing waitlist DB has 4 approved emails in Neo4j
- WaitlistRepository has basic methods but missing pending workflow
- Auth types defined locally in client, not in protocol package

## Desired State

- Waitlist check integrated into signup/signin flow
- Automatic addition of new users to waitlist with `pending` status
- Access control based on waitlist status (`approved` vs `pending`)
- Seamless UX with appropriate messaging
- Consistent state management across frontend and backend
- Proper error handling and recovery
- **Remove cookie-based sessions** - use direct DB checks only
- **Remove standalone /waitlist page** after integration
- **Return HTTP 200** with waitlist info for pending users

## User Flow

### Registration Flow
```
User attempts Sign Up with email/password
                ↓
        Validate email format
                ↓
        Check Waitlist DB
                ↓
    ┌───────────┴───────────┐
    │     Email exists?      │
    └───────────┬───────────┘
         No ↓        ↓ Yes
            ↓        ↓
    Add to waitlist  Check status
    (status: pending)     ↓
            ↓        ┌────┴────┐
            ↓    pending    approved
            ↓        ↓          ↓
    Show waitlist    ↓    Check if user exists
    message ←────────┘         ↓
                          Yes ↓   ↓ No
                              ↓   ↓
                    Return error  Create account
                    "User exists" Continue to app
```

### Login Flow
```
User attempts Sign In with email/password
                ↓
        Check User DB
                ↓
    ┌───────────┴───────────┐
    │     User exists?       │
    └───────────┬───────────┘
         No ↓        ↓ Yes
            ↓        ↓
    Check Waitlist   Validate password
            ↓              ↓
    Show appropriate  Successful login
    message
```

## Implementation Tasks

### 1. Backend Changes

#### 1.1 Update WaitlistRepository (`/packages/models/src/repositories/WaitlistRepository.ts`)

- [x] ✅ Add method `addPendingEmail(email: string, notes?: string): Promise<WaitlistEntry>`
  ```typescript
  async addPendingEmail(email: string, notes?: string): Promise<WaitlistEntry> {
    const normalizedEmail = this.normalizeEmail(email);
    const query = `
      CREATE (w:Waitlist {
        email: $email,
        status: 'pending',
        notes: $notes,
        createdAt: datetime()
      })
      RETURN w
    `;
    // Handle unique constraint violation
  }
  ```
- [x] ✅ Add method `getStatusByEmail(email: string): Promise<'approved' | 'pending' | null>`
  ```typescript
  async getStatusByEmail(email: string): Promise<'approved' | 'pending' | null> {
    const normalizedEmail = this.normalizeEmail(email);
    const query = `
      MATCH (w:Waitlist {email: $email})
      RETURN w.status as status
    `;
    // Return null if not found
  }
  ```
- [x] ✅ Add method `updateStatus(email: string, status: 'approved' | 'pending'): Promise<boolean>`
- [x] ✅ Ensure unique constraint on email field in `initializeSchema()`

#### 1.2 Update WaitlistService (`/packages/server/src/services/WaitlistService.ts`)

- [x] ✅ Update interface for detailed status:
  ```typescript
  export interface WaitlistStatusResult {
    exists: boolean;
    status: 'approved' | 'pending' | null;
    message: string;
    email?: string;
  }
  ```
- [x] ✅ Add method `addToPendingWaitlist(email: string): Promise<WaitlistStatusResult>`
  ```typescript
  async addToPendingWaitlist(email: string): Promise<WaitlistStatusResult> {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      
      // Check if already exists
      const existingStatus = await this.waitlistRepo.getStatusByEmail(normalizedEmail);
      if (existingStatus) {
        return {
          exists: true,
          status: existingStatus,
          message: existingStatus === 'approved' 
            ? 'Email is approved for registration'
            : 'You are already on our waitlist. Stay tuned!',
          email: normalizedEmail
        };
      }
      
      // Add to waitlist
      await this.waitlistRepo.addPendingEmail(normalizedEmail, 'Auto-added via signup');
      logger.info(`Added ${normalizedEmail} to waitlist with pending status`);
      
      return {
        exists: false,
        status: 'pending',
        message: 'Thanks for your interest! We have added you to the waitlist. Stay tuned!',
        email: normalizedEmail
      };
    } catch (error) {
      logger.error('Error adding to waitlist:', error);
      throw error;
    }
  }
  ```
- [x] ✅ Update `checkApproval()` to return `WaitlistStatusResult`
- [x] ✅ Add method `getDetailedStatus(email: string): Promise<WaitlistStatusResult>`
- [x] ✅ Add comprehensive logging for all waitlist operations

#### 1.3 Modify Auth Routes (`/packages/server/src/routes/auth.ts`)

- [x] ✅ Import WaitlistService and initialize:
  ```typescript
  import { WaitlistService } from '@/services/WaitlistService';
  import { getConnection, WaitlistRepository } from '@starships/models';
  
  // Initialize at module level
  const initWaitlistService = () => {
    const connection = getConnection();
    const waitlistRepo = new WaitlistRepository(connection);
    return new WaitlistService(waitlistRepo);
  };
  ```

- [x] ✅ In `/auth/register` endpoint:
  ```typescript
  try {
    // Validate request body first
    const bodyValidation = validateData(RegisterSchema, req.body, res, 'registration data');
    if (!bodyValidation) return;
    
    const { email, password, name } = bodyValidation;
    
    // Initialize waitlist service
    const waitlistService = initWaitlistService();
    
    // Check waitlist status first
    const waitlistStatus = await waitlistService.getDetailedStatus(email);
    
    // If not in waitlist, add as pending
    if (!waitlistStatus.exists) {
      const addResult = await waitlistService.addToPendingWaitlist(email);
      return sendSuccess(res, {
        waitlisted: true,
        status: 'pending',
        message: addResult.message,
      }, 200);
    }
    
    // If pending, return waitlist message
    if (waitlistStatus.status === 'pending') {
      return sendSuccess(res, {
        waitlisted: true,
        status: 'pending',
        message: waitlistStatus.message,
      }, 200);
    }
    
    // Only proceed if approved
    if (waitlistStatus.status !== 'approved') {
      return sendError(res, 'FORBIDDEN', 'Registration not allowed', 403);
    }
    
    // Check if user already exists
    const existingUser = await UserService.getUserByEmail(email);
    if (existingUser) {
      return sendError(res, 'RESOURCE_CONFLICT', 'User already exists', 409);
    }
    
    // Continue with user creation for approved emails...
    // [existing registration logic]
    
  } catch (error) {
    logger.error('[AUTH] Registration error:', error);
    handleError(error, res, 'user registration');
  }
  ```

- [x] ✅ In `/auth/login` endpoint:
  ```typescript
  // After checking user doesn't exist
  if (!user) {
    // Check waitlist status
    const waitlistService = initWaitlistService();
    const waitlistStatus = await waitlistService.getDetailedStatus(email);
    
    if (!waitlistStatus.exists) {
      // Not in system at all
      return sendError(res, 'AUTHENTICATION_FAILED', 'Invalid credentials', 401);
    }
    
    if (waitlistStatus.status === 'pending') {
      // On waitlist but not approved
      return sendSuccess(res, {
        waitlisted: true,
        status: 'pending',
        message: 'You are on our waitlist. Please wait for approval to access the app.',
      }, 200);
    }
    
    // Approved but no account - suggest registration
    return sendError(res, 'AUTHENTICATION_FAILED', 'No account found. Please sign up first.', 401);
  }
  ```

### 2. Frontend Changes

#### 2.1 Create Auth Response Types (`/packages/protocol/src/domains/auth.ts`) **[NEW FILE]**

- [x] ✅ Create new auth types file in protocol package
- [x] ✅ Add comprehensive waitlist response types:
  ```typescript
  export interface AuthWaitlistResponse {
    waitlisted: boolean;
    status: 'pending' | 'approved';
    message: string;
    email?: string;
  }
  
  export interface AuthRegisterResponse {
    user?: AuthUser;
    token?: string;
    starship?: { id: string; slug: string; name: string };
    waitlisted?: boolean;
    status?: 'pending' | 'approved';
    message?: string;
  }
  
  export interface AuthLoginResponse {
    user?: AuthUser;
    token?: string;
    starship?: { id: string; slug: string; name: string };
    waitlisted?: boolean;
    status?: 'pending' | 'approved';
    message?: string;
  }
  ```

#### 2.2 Update LoginForm Component (`/packages/client/src/components/auth/LoginForm.tsx`)

- [x] ✅ Add state for waitlist status:
  ```typescript
  const [waitlistStatus, setWaitlistStatus] = useState<{
    isWaitlisted: boolean;
    message: string;
  } | null>(null);
  ```

- [x] ✅ Update registration handler:
  ```typescript
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setWaitlistStatus(null);
    
    // Validation...
    
    const result = await register(registerData.email, registerData.password, registerData.name);
    
    // Check if waitlisted response
    if (result.waitlisted) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: result.message || 'You have been added to the waitlist!'
      });
      // Optionally clear form
      setRegisterData({ email: '', password: '', name: '', confirmPassword: '' });
      return;
    }
    
    if (!result.success) {
      setFormError(result.error || 'Registration failed');
    }
  }
  ```

- [x] ✅ Update login handler for waitlist check:
  ```typescript
  const handleLogin = async (e: React.FormEvent) => {
    // Similar pattern - check for waitlisted response
    const result = await login(loginData.email, loginData.password);
    
    if (result.waitlisted) {
      setWaitlistStatus({
        isWaitlisted: true,
        message: result.message || 'You are on our waitlist. Stay tuned!'
      });
      return;
    }
    // Continue with normal login flow
  }
  ```

- [x] ✅ Render waitlist message when applicable:
  ```typescript
  {waitlistStatus && (
    <WaitlistMessage 
      message={waitlistStatus.message}
      onClose={() => setWaitlistStatus(null)}
    />
  )}
  ```

#### 2.3 Create Waitlist Message Component (`/packages/client/src/components/auth/WaitlistMessage.tsx`)

- [x] ✅ Create animated waitlist confirmation component:
  ```typescript
  'use client'
  
  import { motion } from 'motion/react';
  import { Rocket, Clock, CheckCircle } from 'lucide-react';
  import { Card } from '@/components/ui/card';
  
  interface WaitlistMessageProps {
    message: string;
    onClose?: () => void;
  }
  
  export function WaitlistMessage({ message, onClose }: WaitlistMessageProps) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="p-6 bg-primary/10 border-primary/30">
          <div className="flex items-start space-x-3">
            <motion.div
              initial={{ rotate: -10 }}
              animate={{ rotate: 10 }}
              transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2 }}
            >
              <Clock className="h-6 w-6 text-primary" />
            </motion.div>
            
            <div className="flex-1">
              <h3 className="font-semibold mb-2 flex items-center">
                <Rocket className="h-5 w-5 mr-2" />
                You're on the waitlist!
              </h3>
              <p className="text-muted-foreground">{message}</p>
            </div>
            
            {onClose && (
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                ×
              </button>
            )}
          </div>
        </Card>
      </motion.div>
    );
  }
  ```

#### 2.4 Update useAuth Hook (`/packages/client/src/hooks/useAuth.ts`)

- [x] ✅ Handle waitlist response type
- [x] ✅ Don't treat waitlist response as error
- [x] ✅ Return waitlist status in hook response

### 3. Database Updates

#### 3.1 Update Waitlist Schema

- [x] ✅ Ensure `status` field supports 'pending' and 'approved' values
- [x] ✅ Add index on (email, status) for efficient queries
- [x] ✅ Verify unique constraint on email

### 4. Testing

#### 4.1 Backend Tests

- [ ] ⬜ Test adding new email to waitlist
- [ ] ⬜ Test checking pending status
- [ ] ⬜ Test registration flow with approved email
- [ ] ⬜ Test registration flow with pending email
- [ ] ⬜ Test registration flow with new email

#### 4.2 Frontend Tests

- [ ] ⬜ Test waitlist message display
- [ ] ⬜ Test registration flow UI for all scenarios
- [ ] ⬜ Test login attempt with pending status

### 5. Migration & Deployment

#### 5.1 Data Migration

- [ ] ⬜ No migration needed - existing approved emails remain approved
- [ ] ⬜ New signups automatically get pending status

#### 5.2 Deployment Steps

1. Deploy backend changes first (backward compatible)
2. Deploy frontend changes
3. Test with new email addresses
4. Monitor logs for any issues

## Success Criteria

- [ ] ⬜ New users attempting signup are automatically added to waitlist
- [ ] ⬜ Pending users see friendly waitlist message
- [ ] ⬜ Approved users can register and use app normally
- [ ] ⬜ No separate waitlist page needed
- [ ] ⬜ Existing approved emails continue to work

## Rollback Plan

If issues occur:

1. Revert frontend changes (users can still use direct registration)
2. Revert backend changes if needed
3. No data changes required - waitlist entries remain valid

## Timeline

- Backend changes: 2 hours
- Frontend changes: 2 hours
- Testing: 1 hour
- Total: ~5 hours

## Error Handling & Edge Cases

### Backend Error Scenarios
1. **Database Connection Failure**
   - Gracefully handle Neo4j connection errors
   - Return 503 Service Unavailable with retry-after header
   - Log error for monitoring

2. **Duplicate Email Constraint Violation**
   - Check for existing entry before insert
   - Return appropriate status if already exists
   - Handle race conditions with proper error catching

3. **Invalid Email Format**
   - Validate email format before DB operations
   - Return 400 Bad Request with specific error message
   - Prevent malformed data from entering system

4. **Service Initialization Failure**
   - Wrap service initialization in try-catch
   - Provide fallback behavior or queue for retry
   - Alert monitoring systems

### Frontend Error Scenarios
1. **Network Failures**
   - Display user-friendly error messages
   - Implement retry mechanism with exponential backoff
   - Cache form data to prevent loss

2. **Invalid Response Format**
   - Validate API responses against expected schema
   - Handle unexpected response gracefully
   - Log anomalies for debugging

3. **State Management Issues**
   - Clear stale state on component unmount
   - Handle concurrent requests properly
   - Prevent duplicate submissions

## Security Considerations

1. **Rate Limiting**
   - Implement rate limiting on waitlist endpoints (5 requests per minute per IP)
   - Use Redis or in-memory store for tracking
   - Return 429 Too Many Requests when exceeded

2. **Email Validation**
   - Validate email format on both frontend and backend
   - Normalize emails (lowercase, trim whitespace)
   - Consider email verification for production

3. **SQL/Cypher Injection Prevention**
   - Use parameterized queries for all Neo4j operations
   - Never concatenate user input into queries
   - Validate and sanitize all inputs

4. **Authentication Bypass Prevention**
   - Always check waitlist status before user creation
   - Don't leak information about existing users
   - Use consistent error messages to prevent enumeration

5. **CSRF Protection**
   - Ensure CSRF tokens on state-changing operations
   - Validate origin headers
   - Use SameSite cookies

## Monitoring & Observability

1. **Metrics to Track**
   - Waitlist additions per hour/day
   - Conversion rate (pending → approved → registered)
   - API response times for waitlist endpoints
   - Error rates by type

2. **Logging Requirements**
   - Log all waitlist status changes
   - Include request IDs for tracing
   - Log with appropriate levels (INFO for additions, ERROR for failures)
   - Structure logs for easy parsing

3. **Alerts to Configure**
   - High error rate on waitlist endpoints (> 5% in 5 minutes)
   - Database connection failures
   - Unusual spike in waitlist additions (potential abuse)
   - Service initialization failures

## Testing Strategy

### Unit Tests
- Repository methods with mocked Neo4j
- Service layer with mocked repository
- API endpoint handlers with mocked services
- Frontend component state management

### Integration Tests
- Full flow: Registration with pending email
- Full flow: Registration with approved email
- Full flow: Login with waitlisted email
- Database constraint validation

### E2E Tests
- User journey: Sign up → Waitlist → Approval → Registration
- Error scenarios: Network failures, invalid data
- Performance: Response times under load

## Performance Considerations

1. **Database Optimization**
   - Index on email field for fast lookups
   - Composite index on (email, status) for filtered queries
   - Connection pooling for Neo4j

2. **Caching Strategy**
   - Cache approved emails in memory (5-minute TTL)
   - Clear cache on status changes
   - Consider Redis for distributed caching

3. **API Response Optimization**
   - Return minimal data in waitlist responses
   - Use proper HTTP status codes for caching
   - Implement pagination if listing waitlist entries

## Existing Infrastructure (Not in Original Plan)

### Already Implemented:
1. **Waitlist Routes** (`/packages/server/src/routes/waitlist.ts`)
   - `/api/v1/waitlist/check` - Check approval status
   - `/api/v1/waitlist/status` - Get session status
   - `/api/v1/waitlist/logout` - Clear session
   - Uses cookie-based sessions

2. **Client Waitlist API** (`/packages/client/src/lib/waitlist-api.ts`)
   - `checkWaitlistApproval()`
   - `getWaitlistStatus()`
   - `clearWaitlistSession()`

3. **Waitlist Page** (`/packages/client/src/app/waitlist/page.tsx`)
   - Standalone waitlist entry page
   - Can be removed or repurposed

4. **Protocol Types** (`/packages/protocol/src/domains/waitlist.ts`)
   - `WaitlistStatus` type includes 'pending'
   - `WaitlistEntryModel` interface exists

### Key Gaps to Address:
1. **No auth.ts in protocol** - Need to create this file
2. **Repository missing pending methods** - Need to add 3 methods
3. **Service missing pending flow** - Need to enhance
4. **Zero integration** between waitlist and auth systems

### Architectural Decisions:
1. ✅ **Create `/packages/protocol/src/domains/auth.ts`** for shared auth types
2. ✅ **Remove cookie-based waitlist sessions** - use direct DB checks
3. ✅ **Return HTTP 200 with waitlist info** for pending users
4. ✅ **Remove `/waitlist` page** after integration complete

## Notes

- Keep implementation simple - no priority queues or referral systems
- Focus on clean UX and clear messaging
- Ensure backward compatibility with existing approved emails
- Log all waitlist additions for tracking
- Consider future migration path to remove waitlist when going public
- Document admin procedures for approving users
- Leverage existing waitlist infrastructure where possible
- Consider removing standalone `/waitlist` page after integration

## 📋 Task Breakdown Summary

### Backend Tasks (18 total)
1. **WaitlistRepository** (4 tasks)
   - ⬜ addPendingEmail method
   - ⬜ getStatusByEmail method
   - ⬜ updateStatus method
   - ⬜ Schema constraints

2. **WaitlistService** (8 tasks)
   - ⬜ Update interface
   - ⬜ addToPendingWaitlist method
   - ⬜ Update checkApproval
   - ⬜ getDetailedStatus method
   - ⬜ Comprehensive logging

3. **Auth Routes** (3 tasks)
   - ⬜ Import and initialize service
   - ⬜ Update register endpoint
   - ⬜ Update login endpoint

### Frontend Tasks (15 total)
1. **API Types** (1 task)
   - ⬜ Add response types

2. **LoginForm** (5 tasks)
   - ⬜ Add waitlist state
   - ⬜ Update registration handler
   - ⬜ Update login handler
   - ⬜ Render waitlist message

3. **WaitlistMessage Component** (1 task)
   - ⬜ Create component

4. **useAuth Hook** (3 tasks)
   - ⬜ Handle waitlist response
   - ⬜ Don't treat as error
   - ⬜ Return status in hook

### Database Tasks (3 total)
- ⬜ Ensure status field values
- ⬜ Add composite index
- ⬜ Verify unique constraint

### Testing Tasks (9 total)
1. **Backend Tests** (5 tasks)
2. **Frontend Tests** (3 tasks)
3. **Migration** (1 task)

### Cleanup Tasks (After Integration)
1. **Remove Standalone Waitlist Components**:
   - ⬜ Delete `/packages/client/src/app/waitlist/page.tsx`
   - ⬜ Remove `/packages/client/src/app/api/waitlist/*` routes
   - ⬜ Remove cookie handling from `/packages/server/src/routes/waitlist.ts`
   - ⬜ Update navigation to remove waitlist page links

2. **Refactor Existing Code**:
   - ⬜ Remove `waitlist_validated` cookie references
   - ⬜ Clean up unused waitlist API functions if any
   - ⬜ Update client-layout.tsx to remove waitlist exceptions

### To Update Progress:
1. Edit this file and change ⬜ to 🔄 when starting a task
2. Change 🔄 to ✅ when completing a task
3. Update the progress percentages at the top
4. Update the "Last Updated" date
