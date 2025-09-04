# TanStack Query-Powered Authentication

## Quick Start

### 1. Environment Setup

The authentication system uses TanStack Query for optimal caching and state management, with JWT token-based authentication and localStorage for session management.

No environment variables are needed for JWT authentication on the client side - tokens are managed dynamically through API calls.

### 2. Backend Configuration

Ensure your backend server supports JWT authentication:

- JWT token validation endpoints
- Login/register endpoints that return JWT tokens
- Token refresh capabilities (optional)

### 3. Test Authentication

```bash
pnpm dev
```

Visit `http://localhost:3000` and test the login flow with your credentials.

### 4. Health Check

The authentication system will automatically validate tokens on page load and redirect to login if needed.

## Features Implemented

✅ **Complete Authentication Flow**

- TanStack Query-powered state management
- JWT-based token authentication
- Local storage session management
- Secure logout functionality
- Automatic token validation with intelligent caching

✅ **Performance & Caching**

- Optimized query caching (5 min stale time, 10 min garbage collection)
- Smart retry logic (no retry on 401 errors)
- Background token validation
- Optimistic updates for login/logout

✅ **UI Integration**

- User profile in navigation
- Login/logout buttons with existing theme
- Loading states and error handling
- Responsive design

✅ **Security**

- JWT token validation
- Automatic token expiry handling
- Secure API communication
- Local session management

✅ **Developer Experience**

- TypeScript support
- Comprehensive error handling
- Easy-to-use hooks with consistent API
- TanStack Query integration for better state management

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Visits   │───▶│    useAuth      │───▶│  Application    │
│   Application   │    │ (TanStack Query)│    │  (Authenticated) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Login Page      │
                       │   (Custom UI)   │
                       └─────────────────┘
```

## Components

- **AuthProvider**: Provides auth context to the app
- **LoginButton**: Redirects to custom login page
- **LogoutButton**: Handles secure logout and token cleanup
- **UserProfile**: Shows user info with dropdown menu
- **useAuth**: Main hook powered by TanStack Query for accessing authentication state
- **useAuthUser**: Query hook for user data fetching
- **useLogin**: Mutation hook for login operations
- **useRegister**: Mutation hook for registration operations
- **useLogout**: Mutation hook for logout operations

## TanStack Query Authentication System ✅

**Query-Powered Authentication**: Users authenticate via JWT tokens with intelligent caching and state management:

### How It Works

1. **User logs in** → Mutation sent to `/api/v1/auth/login`
2. **JWT token received** → Token stored in localStorage + query cache updated
3. **Token validation** → Cached user query with smart invalidation
4. **API calls authenticated** → Token sent with requests
5. **Optimistic updates** → UI updates immediately for better UX

### Real User Data with Caching

- ✅ **JWT tokens**: Secure authentication tokens
- ✅ **User sessions**: Persistent login state with query caching
- ✅ **Real user IDs**: User data from your backend
- ✅ **Smart caching**: 5-minute stale time, 10-minute garbage collection
- ✅ **Background validation**: Automatic token validation with retry logic

### Data Flow

```
Login Mutation → JWT Token → localStorage + Query Cache → API Requests
      ↓              ↓              ↓                        ↓
  credentials    auth token    cached user data      authenticated calls
```

### Usage in Components

```typescript
import { useAuth } from '@/hooks/useAuth'

function MyComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()

  if (isLoading) return <div>Loading...</div>

  if (!isAuthenticated) {
    return <button onClick={async () => {
      const result = await login('email', 'password')
      if (!result.success) {
        console.error(result.error)
      }
    }}>Login</button>
  }

  return (
    <div>
      Welcome, {user?.name}!
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

### Advanced Usage with Individual Hooks

```typescript
import { useAuthUser, useLogin, useLogout } from '@/hooks/useAuth'

function AdvancedComponent() {
  const { data: user, isLoading, error, refetch } = useAuthUser()
  const loginMutation = useLogin()
  const logoutMutation = useLogout()

  const handleLogin = async (email: string, password: string) => {
    try {
      await loginMutation.mutateAsync({ email, password })
      // Login successful, queries will auto-invalidate
    } catch (error) {
      // Error handled by mutation's onError callback
    }
  }

  return (
    <div>
      {user && <p>Welcome, {user.name}!</p>}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
      </button>
    </div>
  )
}
```

## API Endpoints

Your backend should provide these endpoints:

- `POST /api/v1/auth/login` - Login with credentials
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/logout` - Logout (optional)
- `GET /api/v1/auth/me` - Get current user info

## Next Steps

Advanced features to implement:

1. Add user registration UI
2. Implement password reset functionality
3. Add user preferences and settings
4. Implement role-based access control
5. Add user profile management UI
6. Token refresh mechanism

## Troubleshooting

**Authentication not working?**

- Check if backend endpoints are available
- Verify API responses include proper JWT tokens
- Check browser console for errors
- Verify localStorage contains auth token

**User profile not showing?**

- Confirm user is authenticated
- Check browser network tab for API errors
- Verify token validation endpoint works
- Ensure components use useAuth hook

**Token expiry issues?**

- Implement token refresh mechanism
- Check token expiry times
- Add proper error handling for expired tokens
