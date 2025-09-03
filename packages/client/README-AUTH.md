# JWT Authentication Setup

## Quick Start

### 1. Environment Setup
The JWT authentication system uses secure token-based authentication with localStorage for session management.

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
- JWT-based token authentication
- Local storage session management
- Secure logout functionality
- Automatic token validation

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
- Easy-to-use hooks
- Backward compatibility

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Visits   │───▶│   useJwtAuth    │───▶│  Application    │
│   Application   │    │   (JWT Check)   │    │  (Authenticated) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Login Page      │
                       │   (Custom UI)   │
                       └─────────────────┘
```

## Components

- **AuthProvider**: Provides JWT auth context to the app
- **LoginButton**: Redirects to custom login page
- **LogoutButton**: Handles secure logout and token cleanup
- **UserProfile**: Shows user info with dropdown menu
- **useAuth**: Hook for accessing authentication state

## JWT Authentication System ✅

**Token-Based Authentication**: Users authenticate via JWT tokens stored in localStorage:

### How It Works
1. **User logs in** → Credentials sent to `/api/v1/auth/login`
2. **JWT token received** → Token stored in localStorage
3. **Token validation** → Automatic validation on page load
4. **API calls authenticated** → Token sent with requests

### Real User Data
- ✅ **JWT tokens**: Secure authentication tokens
- ✅ **User sessions**: Persistent login state
- ✅ **Real user IDs**: User data from your backend
- ✅ **Automatic validation**: Token validation on app load

### Data Flow
```
Login API → JWT Token → localStorage → API Requests
     ↓          ↓           ↓              ↓
  credentials  auth token  session    authenticated calls
```

### Usage in Components
```typescript
import { useAuth } from '@/hooks/useAuth'

function MyComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth()
  
  if (isLoading) return <div>Loading...</div>
  
  if (!isAuthenticated) {
    return <button onClick={() => login('email', 'password')}>Login</button>
  }
  
  return (
    <div>
      Welcome, {user?.name}!
      <button onClick={logout}>Logout</button>
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