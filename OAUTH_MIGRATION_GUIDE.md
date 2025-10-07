# OAuth Security UI Setup Guide

This guide covers the implementation of the adaptive OAuth security UI feature - now with simplified database setup!

## Overview

This feature transforms the user security settings to be OAuth-aware, providing different UI experiences based on the user's authentication methods:

- **OAuth-only users**: See option to add backup password
- **Password-only users**: See option to connect OAuth accounts  
- **Hybrid users**: See both password management and OAuth accounts
- **All users**: Get session management capabilities

## Database Setup - Development Mode

🚀 **Super Simple!** Everything is now consolidated into the base schema for development!

### Drop and Recreate (Recommended for Dev)

Since you're in development, just purge and recreate:

```bash
# Navigate to the models package
cd packages/models

# Drop the existing database (⚠️ DATA LOSS!)
dropdb starships

# Create fresh database  
createdb starships

# Run the complete schema (includes ALL OAuth features)
psql -d starships -f migrations/000_postgresql_schema.sql
```

### What's Included in Base Schema

The `000_postgresql_schema.sql` now includes EVERYTHING:
- ✅ **Users table** with auth method tracking
- ✅ **OAuth accounts table** for provider links  
- ✅ **All indexes** for performance
- ✅ **Proper constraints** and validation

### Verify Complete Setup

```sql
-- Check users table has all auth columns
\d users;

-- Check oauth_accounts table exists  
\d oauth_accounts;

-- Should show these new columns in users:
-- email_verified | boolean | not null | default false
-- has_password | boolean | not null | default false  
-- auth_methods | text[] | not null | default '{}'::text[]
-- primary_auth_method | varchar(10) | not null | default 'password'::character varying
```

## API Endpoints Added

1. **POST /api/v1/auth/set-password** - Set password for OAuth-only users
2. **GET /api/v1/auth/methods** - Get user's authentication methods
3. **POST /api/v1/auth/init-methods** - Initialize auth methods for existing users
4. **GET /api/v1/auth/me** - Enhanced with auth method info

## Frontend Components

### New Components
- `SetPasswordDialog` - Modal for OAuth users to set backup password

### Updated Components
- `SecurityCard` - Now OAuth-aware with adaptive UI
- `AccountForm` - Integrates new dialog and auth state
- `useAuth` - Enhanced with auth method properties and setPassword function

## User Experience

### OAuth-Only Users
```
┌─────────────────────────────────────┐
│ 🛡️ Account Security                │
├─────────────────────────────────────┤
│ 🔑 Password (Optional)              │ 
│ Add password for backup access      │
│ [+ Set Up Password]                 │
├─────────────────────────────────────┤
│ 📱 Active Sessions                  │
│ [Manage Sessions]                   │
└─────────────────────────────────────┘
```

### Password-Only Users
```
┌─────────────────────────────────────┐
│ 🛡️ Account Security                │
├─────────────────────────────────────┤
│ 🔑 Password                         │
│ [Change Password]                   │
├─────────────────────────────────────┤
│ ➕ Connect Additional Accounts      │
│ [Connect Google] [Connect GitHub]   │
├─────────────────────────────────────┤
│ 📱 Active Sessions                  │
│ [Manage Sessions]                   │
└─────────────────────────────────────┘
```

## Testing Scenarios

1. **OAuth-only user** - Should see password setup option
2. **Password-only user** - Should see OAuth connection options
3. **Hybrid user** - Should see both sections
4. **Setting password** - OAuth user can add backup password
5. **Connecting OAuth** - Password user can add OAuth accounts

## Architecture Benefits

- ✅ **Backward compatible** - Existing users unaffected
- ✅ **Type-safe** - Full TypeScript integration
- ✅ **Consistent patterns** - Follows existing architecture
- ✅ **Enterprise-ready** - Matches industry standards
- ✅ **Scalable** - Easy to add more auth providers

## Troubleshooting

### Database Issues
- Ensure PostgreSQL is running and accessible
- Verify database was dropped/recreated cleanly
- Check that base schema ran without errors

### Frontend Issues  
- Clear browser cache and restart dev server
- Check that all new types are properly imported
- Verify API endpoints are responding correctly

### Backend Issues
- Restart server after database recreation
- Check server logs for any validation errors  
- Verify JWT tokens include new auth fields