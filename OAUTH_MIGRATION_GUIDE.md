# OAuth Security UI Migration Guide

This guide covers the implementation of the adaptive OAuth security UI feature.

## Overview

This feature transforms the user security settings to be OAuth-aware, providing different UI experiences based on the user's authentication methods:

- **OAuth-only users**: See option to add backup password
- **Password-only users**: See option to connect OAuth accounts  
- **Hybrid users**: See both password management and OAuth accounts
- **All users**: Get session management capabilities

## Database Migration

### Run the Migration

```bash
# Navigate to the models package
cd packages/models

# Run the migration SQL
psql -d starships -f migrations/002_add_user_auth_methods.sql
```

### Verify Migration

```sql
-- Check that new columns exist
\d users;

-- Should show:
-- has_password | boolean | not null | default false
-- auth_methods | text[]  | not null | default '{}'::text[]
-- primary_auth_method | varchar(10) | not null | default 'password'::character varying
```

### Rollback (if needed)

```bash
# If you need to rollback the migration
psql -d starships -f migrations/002_rollback_user_auth_methods.sql
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

### Migration Issues
- Ensure database connection is working
- Check that all existing users have proper auth methods set
- Verify constraints are properly applied

### Frontend Issues  
- Clear browser cache and restart dev server
- Check that all new types are properly imported
- Verify API endpoints are responding correctly

### Backend Issues
- Restart server after migration
- Check server logs for any validation errors
- Verify JWT tokens include new auth fields