# Kinde Authentication Implementation Guide

## 🎯 Document Focus

This guide provides step-by-step implementation of Kinde authentication with:
- **Quick setup** - Get authentication working in minutes
- **Development workflow** - Day-to-day development practices
- **Essential troubleshooting** - Common setup and configuration issues
- **Basic component usage** - How to use auth components in your app

## 📋 When to Use This Guide

- Setting up authentication for the first time
- Configuring development environment
- Learning basic component usage
- Solving common setup issues

## 📚 Related Documentation

- [Authentication Integration Guide](authentication-integration.md) - Architecture and advanced patterns
- [API Design Documentation](api-design.md) - API authentication patterns

## 🔐 Security Status: COMPLETE & SECURE

✅ **Token-Based API Authentication**: All APIs validate Kinde JWT tokens
✅ **User Identity from Tokens**: User ID derived from cryptographically verified tokens
✅ **Zero Client Trust**: Server never trusts client-sent user IDs
✅ **Automatic Data Scoping**: All API calls scoped to authenticated user only
✅ **Production Ready**: Follows security best practices

## Quick Start Guide

### Authentication Flow Overview
1. **Unauthenticated User** → Beautiful login screen with space theme
2. **Login Button Click** → Redirects to Kinde's hosted authentication page
3. **User Authenticates** → Via Kinde's UI (supports email, social logins, etc.)
4. **Kinde Redirects Back** → User lands on Command Deck with full access
5. **Session Management** → Handled automatically by Kinde SDK

> **For detailed architecture and security patterns, see [Authentication Integration Guide](authentication-integration.md#authentication-overview)**

### Protected Areas
- **Frontend Routes**: All routes protected via AuthGate component
- **Backend APIs**: All `/v1/*` endpoints require JWT token validation

> **For comprehensive API security architecture, see [API Authentication](authentication-integration.md#backend-authentication-integration)**

## Essential Components

### Auth API Route
**File**: `packages/client/src/app/api/auth/[kindeAuth]/route.ts`
```typescript
import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";

export const GET = handleAuth();
```
- Handles all Kinde authentication callbacks and requests
- Required for OAuth flow to work properly

### Auth Hook
**File**: `packages/client/src/hooks/useAuth.ts`
- Provides unified access to authentication state
- Exports user info, loading states, and auth components
- Automatically configures API client with tokens

**Basic Usage**:
```typescript
const { isAuthenticated, user, isLoading } = useAuth()
```

### Basic Components

#### AuthGate
**File**: `packages/client/src/components/auth/AuthGate.tsx`
```typescript
<AuthGate>
  <ProtectedContent />
</AuthGate>
```
- Handles authentication state routing
- Shows login UI for unauthenticated users
- Renders protected content for authenticated users

#### LoginButton
**File**: `packages/client/src/components/auth/LoginButton.tsx`
```typescript
<LoginButton>Sign In</LoginButton>
```
- Redirects to Kinde's hosted login page
- Customizable styling and content

#### LogoutButton
**File**: `packages/client/src/components/auth/LogoutButton.tsx`
```typescript
<LogoutButton>Sign Out</LogoutButton>
```
- Handles user logout via Kinde
- Integrated into user profile dropdown

#### UserProfile
**File**: `packages/client/src/components/auth/UserProfile.tsx`
```typescript
<UserProfile mode="collapsed" />
<UserProfile mode="expanded" />
```
- Shows user avatar, name, email, and status
- Two display modes: collapsed and expanded
- Theme-aware with hover effects

> **For detailed component architecture and advanced patterns, see [Frontend Authentication Components](authentication-integration.md#frontend-authentication-components)**

## Configuration Setup

### Step 1: Environment Variables

Create `packages/client/.env.local`:
```env
# Kinde Authentication Configuration
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
KINDE_ISSUER_URL=https://your_subdomain.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
KINDE_DEBUG_MODE=true

# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Backend** (`packages/server/.env`):
```env
# Required for JWT token validation
KINDE_ISSUER_URL=https://your_subdomain.kinde.com
KINDE_CLIENT_ID=your_kinde_client_id

# Neo4j database connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
```

### Step 2: Kinde Dashboard Setup

1. **Create a Kinde application**
2. **Set allowed callback URLs**:
   - `http://localhost:3000/api/auth/kinde_callback` (development)
   - `https://yourdomain.com/api/auth/kinde_callback` (production)
3. **Set allowed logout URLs**:
   - `http://localhost:3000` (development)
   - `https://yourdomain.com` (production)

### Step 3: Next.js Configuration

**File**: `packages/client/next.config.js`
- API routing configured to prevent conflicts
- Kinde auth routes: `/api/auth/*` → Kinde handlers
- Backend routes: `/api/v1/*` → Express server proxy

### Step 4: Layout Integration

**File**: `packages/client/src/app/layout.tsx`
```typescript
<AuthProvider>
  <TooltipProvider>
    <ClientLayout>{children}</ClientLayout>
  </TooltipProvider>
</AuthProvider>
```

**File**: `packages/client/src/app/client-layout.tsx`
```typescript
<AuthGate>
  <Navigation />
  <main>{children}</main>
</AuthGate>
```

> **For detailed integration patterns and advanced configuration, see [Authentication Integration Guide](authentication-integration.md#authentication-in-different-contexts)**

## Development Workflow

### Local Development Setup

1. **Start development server**: `pnpm dev`
2. **Visit application**: `http://localhost:3000`
3. **Test authentication flow**: Click "Enter Command Deck"
4. **Check auth health**: Visit `/api/auth/health`

### Basic Testing Flow

```bash
# 1. Test unauthenticated access
curl http://localhost:3000/command-deck
# Should redirect to login

# 2. Test authenticated API calls
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/v1/agents
# Should return user's agents

# 3. Test health endpoint
curl http://localhost:3000/api/auth/health
# Should return configuration status
```

### Development Environment

- **Debug Mode**: Set `KINDE_DEBUG_MODE=true` for detailed logs
- **Network Tab**: Check browser network tab for auth requests
- **Kinde Dashboard**: Use for user management and configuration

> **For advanced testing strategies and debugging tools, see [Testing and Troubleshooting](authentication-integration.md#testing-and-troubleshooting)**

## Troubleshooting

### Common Issues

#### "State not found" Error
- Ensure `KINDE_SITE_URL` matches your domain
- Check Kinde dashboard callback URLs
- Verify environment variables are set correctly

#### ⭐ "Missing or invalid Authorization header" - API Token Issues
**Problem**: Frontend makes API calls but backend returns `401 Unauthorized` with "Missing or invalid Authorization header"

**Root Cause**: The `getToken()` function in Kinde's browser client returns `null` if called before authentication is fully loaded.

**Solution**: 
1. **Check `isLoading` state** - Only set up token provider after `!kindeLoading`
2. **Use correct token function** - Try `getAccessTokenRaw()` first for raw JWT strings
3. **Add proper error handling** - Gracefully handle token retrieval failures

**Fixed Implementation**:
```typescript
// In useAuth.ts
useEffect(() => {
  // Critical: Only set up token provider after loading is complete
  if (!kindeLoading) {
    setTokenProvider(async () => {
      if (isAuthenticated) {
        try {
          // Try getAccessTokenRaw first (for raw JWT string), fallback to getToken
          let accessToken = null
          if (getAccessTokenRaw) {
            accessToken = getAccessTokenRaw()
          } else if (accessTokenRaw) {
            accessToken = accessTokenRaw
          } else {
            accessToken = await getToken()
          }
          return accessToken
        } catch (error) {
          console.error('[AUTH] Failed to get access token:', error)
          return null
        }
      }
      return null
    })
  }
}, [isAuthenticated, kindeLoading, getToken, getAccessTokenRaw, accessTokenRaw])
```

**Debugging Steps**:
1. Open browser dev tools → Console tab
2. Look for these logs when navigating to protected pages:
   ```
   [AUTH] Setting up token provider, isAuthenticated: true, kindeLoading: false
   [API] Token provider set
   [AUTH] Attempting to get access token...
   [AUTH] Access token retrieved for API: Token present
   [API] Request interceptor running for: /v1/agents
   [API] Authorization header added
   ```
3. Check Network tab - requests should include `Authorization: Bearer eyJhbGciOiJSUzI1...`

**Common Mistakes**:
- ❌ Setting token provider while `kindeLoading: true`
- ❌ Using only `getToken()` without checking for `getAccessTokenRaw()`
- ❌ Not handling async token retrieval properly
- ❌ Forgetting to include all dependencies in useEffect

#### API Calls Fail with 401 After Login
**Symptoms**: User can login but API calls return `401 Unauthorized`

**Checklist**:
1. ✅ Check if Authorization header is being sent:
   ```bash
   # Should see: Authorization: Bearer eyJhbGciOiJSUzI1...
   curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:4000/v1/agents
   ```

2. ✅ Verify token is valid:
   ```bash
   # Check JWT structure
   echo "YOUR_TOKEN" | base64 -d
   ```

3. ✅ Check server middleware is applied:
   ```typescript
   // In packages/server/src/index.ts
   app.use('/v1/agents', authMiddleware, agentRoutes)
   app.use('/v1/chat', authMiddleware, chatRoutes)
   app.use('/v1/memory', authMiddleware, memoryRoutes)
   ```

4. ✅ Verify Kinde environment variables on server:
   ```bash
   echo $KINDE_ISSUER_URL
   echo $KINDE_CLIENT_ID
   ```

#### Authentication Not Working
- Check environment variables are loaded
- Verify Kinde application configuration
- Ensure API route is accessible at `/api/auth/[kindeAuth]`

#### User Profile Not Showing
- Confirm user is authenticated
- Check network requests for user data
- Verify component is wrapped in `AuthProvider`

#### Backend Token Validation Failing
- Check server logs for JWT validation errors
- Ensure `KINDE_ISSUER_URL` matches your Kinde domain exactly
- Verify user exists in Neo4j database (auto-created on first login)

#### Common Token Issues
- ❌ Setting token provider while `kindeLoading: true`
- ❌ Using only `getToken()` without checking `getAccessTokenRaw()`
- ❌ Missing dependencies in useEffect
- ❌ Not handling async token retrieval properly

### Health Check
Visit `/api/auth/health` to verify configuration:
```json
{
  "apiPath": "/api/auth",
  "redirectURL": "http://localhost:3000/api/auth/kinde_callback",
  "postLoginRedirectURL": "http://localhost:3000",
  "issuerURL": "https://your-subdomain.kinde.com",
  "clientID": "your_client_id",
  "clientSecret": "Set correctly",
  "postLogoutRedirectURL": "http://localhost:3000"
}
```

## Dependencies

### Added Packages
- `@kinde-oss/kinde-auth-nextjs`: ^2.8.1

### Existing Dependencies (Leveraged)
- Next.js 15.3.4 with App Router
- Tailwind CSS for styling
- Radix UI components
- Motion for animations
- Lucide React for icons

## File Structure

```
packages/client/src/
├── app/
│   ├── api/auth/[kindeAuth]/route.ts     # Kinde auth API route
│   ├── layout.tsx                        # Updated with AuthProvider
│   └── client-layout.tsx                 # Updated with AuthGate
├── components/auth/
│   ├── AuthGate.tsx                      # Authentication gate
│   ├── LoginButton.tsx                   # Login button component
│   ├── LogoutButton.tsx                  # Logout button component
│   └── UserProfile.tsx                   # User profile dropdown
├── hooks/
│   └── useAuth.ts                        # Authentication hook
├── providers/
│   └── auth-provider.tsx                 # Authentication provider
└── .env.example                          # Environment variables template
```

## Recent Improvements

### UI/UX Enhancements
- **Memoized Components**: UserProfile wrapped in React.memo to prevent unnecessary re-renders
- **Event Isolation**: Proper event handling to prevent navigation interference
- **Theme Integration**: Proper CSS variables for consistent theming
- **Professional Tooltips**: Enterprise-grade tooltip design with proper positioning

### Navigation Fixes
- **Hover State Management**: Uses refs for reliable state tracking
- **Debounced Collapse**: Prevents flickering when moving between elements
- **State Verification**: Double-checks conditions before state changes
- **Mobile Considerations**: All hover logic properly disabled on mobile

### Profile System Overhaul
- **Bottom Navigation Placement**: More intuitive and stable positioning
- **Dual-Mode Design**: Collapsed and expanded states for different contexts
- **Tooltip Interface**: Professional card-style with actions and status
- **Theme Compatibility**: Perfect integration with light/dark modes

## Technical Details

### Code Quality
- **TypeScript**: Full type safety throughout auth components
- **Component Architecture**: Clean separation of concerns
- **Performance**: Optimized re-renders and state management
- **Accessibility**: Proper ARIA labels and keyboard navigation

### Route Architecture
- **Kinde Routes**: `/api/auth/*` for authentication
- **Backend Routes**: `/api/v1/*` for application API
- **Clean Separation**: No conflicts between auth and application logic

## Conclusion

The Kinde authentication implementation provides a production-ready, secure authentication system that seamlessly integrates with the Starships AI application. The implementation includes:

- **Complete Authentication Flow**: Secure login/logout with Kinde
- **Enhanced User Interface**: Professional user profile with tooltips
- **Improved Navigation**: Fixed hover behavior and state management
- **Theme Integration**: Perfect light/dark mode support
- **Mobile Optimization**: Responsive design across all devices
- **Performance Optimizations**: Efficient rendering and state management
- **Accessibility**: Proper ARIA labels and keyboard navigation

All existing functionality has been preserved while adding robust authentication capabilities and improving the overall user experience. The implementation is ready for production deployment and provides a solid foundation for future enhancements.

## User Synchronization System ✅ IMPLEMENTED

### Overview
The authentication system now includes **automatic user synchronization** between Kinde and the Neo4j database. This provides the best of both worlds: Kinde's robust authentication with your own user data for business logic.

### Architecture Flow
```
User Login → Kinde Auth → Auto-Sync → Neo4j Database → App Logic
     ↓           ↓           ↓            ↓              ↓
  OAuth flow  session mgmt  user sync   relationships  real data
```

### Implementation Details

#### Server-Side Components
- **UserService** (`packages/server/src/services/UserService.ts`)
  - `syncUser()` - Creates/updates users from Kinde data
  - Smart sync logic: finds by Kinde ID, falls back to email
  - Handles new user creation and existing user updates

- **User API Routes** (`packages/server/src/routes/users.ts`)
  - `POST /v1/users/sync` - Sync Kinde user to database
  - `GET /v1/users/:id` - Get user by internal ID
  - `GET /v1/users/kinde/:kindeId` - Get user by Kinde ID

#### Client-Side Integration
- **Enhanced Auth Hook** (`packages/client/src/hooks/useAuth.ts`)
  - Auto-syncs users on login
  - Provides both Kinde and synced user data
  - Handles loading states and errors
  - Returns real user IDs for app usage

#### Database Schema
```cypher
// Enhanced User node with Kinde integration
CREATE (u:User {
  id: "uuid-v4",                    // Your internal ID
  kindeId: "kinde_user_id",         // Kinde user ID for sync
  username: "john_doe",             // Username/handle
  email: "john@example.com",        // Email from Kinde
  displayName: "John Doe",          // Full name from Kinde
  avatar: "https://avatar-url",     // Profile picture from Kinde
  createdAt: "2024-01-01T00:00:00Z" // Creation timestamp
})
```

### Key Benefits Achieved

1. ✅ **Kinde handles authentication** - No changes to auth flow
2. ✅ **Real user data everywhere** - No more hardcoded `'user-1'` values
3. ✅ **Automatic synchronization** - Users synced transparently on login
4. ✅ **Database relationships** - User interactions stored with real IDs
5. ✅ **Backwards compatibility** - Existing functionality preserved
6. ✅ **Error resilience** - Sync failures don't break authentication

### Usage Examples

#### Component Usage
```typescript
import { useAuth } from '@/hooks/useAuth'

function ChatInterface() {
  const { userId, syncedUser, isLoading } = useAuth()
  
  // userId is from YOUR database, not Kinde
  // Use this for all API calls and relationships
  
  const sendMessage = async (content: string) => {
    await chatAPI.sendMessage({
      agentId: 'agent-123',
      userId: userId, // Real user ID from Neo4j
      message: content
    })
  }
}
```

#### API Usage
```typescript
// Chat request now uses real user IDs
const chatRequest = {
  agent_id: 'agent-123',
  user_id: 'd96d27a1-e34d-4d39-b0c7-f5baa1e31cd9', // Real Neo4j user ID
  message: 'Hello, world!'
}
```

### Monitoring & Logs
The system provides detailed logging for sync operations:
```
[USER-SYNC] Syncing Kinde user to backend: kinde_user_id
[USER-SYNC] Created new user: d96d27a1-e34d-4d39-b0c7-f5baa1e31cd9
[USER-SYNC] Updated existing user: d96d27a1-e34d-4d39-b0c7-f5baa1e31cd9
```

### Production Status
**Status**: ✅ **LIVE AND WORKING**
- User sync functioning as designed
- Zero hardcoded user values remaining
- All chat sessions use real user data
- Database relationships properly established

## Advanced Features

With the foundation complete, you can now implement:
1. ✅ ~~Replace hardcoded user IDs~~ **COMPLETED**
2. ✅ ~~User-scoped chat history~~ **COMPLETED**
3. Add user role management
4. Implement user preferences system
5. Add user profile editing
6. Implement team/organization features 