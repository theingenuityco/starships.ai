# Auth Testing Backdoor

This document describes the controlled testing backdoor implemented to replace the problematic automatic auth bypass logic.

## Overview

The auth testing backdoor provides a way to test the application's functionality without setting up OAuth authentication. Unlike the previous automatic bypass, this backdoor:

- Only activates when explicitly enabled via environment variables
- Doesn't interfere with normal development flow
- Provides clean auth state management
- Uses controlled test credentials

## When to Use

The testing backdoor should be used when:

- Testing starship CRUD operations without OAuth setup
- Running integration tests that require authenticated users
- Developing new features that depend on authentication
- Debugging auth-related issues

## Configuration

### Environment Variables

Add these variables to your `.env` file to enable the testing backdoor:

```bash
# Server-side backdoor activation
ENABLE_AUTH_TESTING_BACKDOOR=true

# Client-side backdoor activation
NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR=true
```

### Important Notes

- **Never enable in production** - This backdoor bypasses all security measures
- Both server and client variables must be set to `true` for full functionality
- The backdoor only activates when Kinde OAuth is not configured
- Remove or set to `false` when OAuth is properly configured

## How It Works

### Server Side (`packages/server/src/middleware/auth.ts`)

When enabled, the server middleware:

1. Checks if `ENABLE_AUTH_TESTING_BACKDOOR=true`
2. Verifies that Kinde OAuth is not configured
3. Accepts requests without authentication headers
4. Accepts requests with the test token `test-auth-token`
5. Attaches a mock user object to the request

### Client Side (`packages/client/src/hooks/useAuth.ts`)

When enabled, the client hook:

1. Checks if `NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR=true`
2. Verifies that Kinde authentication is not active
3. Returns mock authenticated state
4. Provides test token for API requests

## Test Credentials

### Mock User Object

```typescript
{
  id: 'test-user-1',
  email: 'test@starships.ai',
  displayName: 'Test User',
  username: 'test-user',
  avatar: null,
  kindeId: 'test-user-1',
  createdAt: '2025-01-16T01:00:00.000Z',
  updatedAt: '2025-01-16T01:00:00.000Z'
}
```

### Test Token

The client provides the token `test-auth-token` which the server recognizes and validates.

## Usage Example

1. **Enable the backdoor:**
   ```bash
   # In your .env file
   ENABLE_AUTH_TESTING_BACKDOOR=true
   NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR=true
   ```

2. **Start the development server:**
   ```bash
   pnpm run dev
   ```

3. **The application will now:**
   - Skip authentication requirements
   - Show you as logged in with test credentials
   - Allow full access to protected routes
   - Enable starship CRUD operations

4. **To disable:**
   ```bash
   # In your .env file
   ENABLE_AUTH_TESTING_BACKDOOR=false
   NEXT_PUBLIC_ENABLE_AUTH_TESTING_BACKDOOR=false
   ```

## Security Considerations

- **Development Only**: This backdoor is intended for development and testing only
- **Environment Isolation**: Never deploy with these environment variables set to `true`
- **Token Security**: The test token is not secure and should never be used in production
- **Data Isolation**: Test data created with this backdoor should be clearly marked as test data

## Migration from Previous Bypass

The previous automatic bypass logic has been removed to prevent:

- Excessive logging that cluttered the console
- Automatic activation that interfered with routing
- Lack of control over when bypass was active
- Confusion about authentication state

The new backdoor provides:

- Explicit control via environment variables
- Clean startup without excessive logging
- Clear separation between normal and test modes
- Proper documentation and usage guidelines

## Troubleshooting

### Backdoor Not Activating

1. Verify both environment variables are set to `true`
2. Check that Kinde OAuth is not configured
3. Restart the development server after changing environment variables
4. Check console logs for backdoor activation messages

### Still Seeing Auth Errors

1. Ensure the client-side environment variable uses the `NEXT_PUBLIC_` prefix
2. Clear browser cache and cookies
3. Verify the server is using the updated middleware

### Routing Issues

1. The backdoor should not interfere with routing anymore
2. Test all routes: `/`, `/fleet`, `/ship/[slug]/command-deck`, `/command-deck`
3. Check that the authentication gate is properly bypassed

## Future Improvements

- Add support for multiple test users
- Implement test role-based access control
- Add automated test suite integration
- Create CLI commands for easy backdoor management