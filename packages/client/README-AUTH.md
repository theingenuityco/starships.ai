# Kinde Authentication Setup

## Quick Start

### 1. Environment Setup
Copy the environment template and fill in your Kinde details:
```bash
cp .env.example .env.local
```

Update `.env.local` with your Kinde credentials:
```env
KINDE_CLIENT_ID=your_kinde_client_id
KINDE_CLIENT_SECRET=your_kinde_client_secret
KINDE_ISSUER_URL=https://your_subdomain.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
KINDE_DEBUG_MODE=true
```

### 2. Kinde Dashboard Configuration
1. Go to [Kinde Dashboard](https://app.kinde.com)
2. Create a new application
3. Set callback URLs:
   - `http://localhost:3000/api/auth/kinde_callback`
4. Set logout URLs:
   - `http://localhost:3000`
5. Copy your Client ID and Client Secret to `.env.local`

### 3. Test Authentication
```bash
pnpm dev
```
Visit `http://localhost:3000` and test the login flow.

### 4. Health Check
Visit `http://localhost:3000/api/auth/health` to verify configuration.

## Features Implemented

✅ **Complete Authentication Flow**
- Beautiful space-themed login screen
- Kinde hosted authentication
- Secure logout functionality
- Session management

✅ **UI Integration**
- User profile in Command Deck header
- Login/logout buttons with existing theme
- Loading states and animations
- Responsive design

✅ **Security**
- Protected routes via AuthGate
- OAuth 2.0 / OpenID Connect
- Secure token management
- CSRF protection

✅ **Developer Experience**
- TypeScript support
- Comprehensive error handling
- Debug mode for development
- Health check endpoint

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Visits   │───▶│   AuthGate      │───▶│  Command Deck   │
│   Application   │    │   (Protected)   │    │  (Authenticated) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Kinde Login UI  │
                       │   (Hosted)      │
                       └─────────────────┘
```

## Components

- **AuthGate**: Handles authentication state and shows login UI
- **LoginButton**: Redirects to Kinde's hosted login
- **LogoutButton**: Handles secure logout
- **UserProfile**: Shows user info with dropdown menu
- **AuthProvider**: Provides auth context to the app

## Next Steps

After authentication is working:
1. Replace hardcoded `'user-1'` with real user IDs
2. Implement user-scoped chat history
3. Add user preferences and settings
4. Implement role-based access control

## Troubleshooting

**Authentication not working?**
- Check environment variables are loaded
- Verify Kinde dashboard callback URLs
- Check `/api/auth/health` endpoint

**User profile not showing?**
- Confirm user is authenticated
- Check browser network tab for errors
- Verify all components are wrapped in AuthProvider

For detailed documentation, see: `docs/kinde-auth-implementation.md` 