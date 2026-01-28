# NavigationOnboardingProvider Error Diagnostic

## Error Details

- **Error**: `TypeError: Cannot read properties of undefined (reading 'call')`
- **Location**: `layout.tsx` line 104 - `<NavigationOnboardingProvider>`
- **Stack Trace**: Includes `sentry-wrapper-module` and `Object.apply`

## Root Cause Analysis

Since a clean install didn't fix the issue, this points to environment-specific problems rather than corrupted dependencies.

### Most Likely Causes

1. **Node.js Version Mismatch**
   - The project uses `NODE_OPTIONS=--no-node-snapshot` which requires specific Node.js versions
   - React 19.2.0 and Next.js 15.5.9 have specific Node.js requirements

2. **pnpm Version Mismatch**
   - Project requires `pnpm@10.12.4` (specified in `package.json`)
   - Different versions can cause module resolution issues in monorepos

3. **React Server Component Boundary Issue**
   - `SentryWrapper` is an async Server Component using `connection()` API
   - This might be interfering with Client Component initialization
   - The error stack includes `sentry-wrapper-module`, suggesting Sentry is involved

4. **Hook Initialization Order**
   - `NavigationOnboardingProvider` → `useNavigationOnboarding` → `useAuth` → `useQueryClient`
   - If `QueryClientProvider` hasn't fully initialized, `useQueryClient()` could fail

5. **Environment Variable Issues**
   - Missing or incorrect `SENTRY_DSN_CLIENT` might cause SentryWrapper to behave unexpectedly
   - Other env vars might affect module resolution

## Diagnostic Steps

### Step 1: Verify Versions

```bash
# Check Node.js version (should be 18+)
node --version

# Check pnpm version (must be 10.12.4)
pnpm --version

# If pnpm version is wrong, install correct version:
corepack enable
corepack prepare pnpm@10.12.4 --activate
```

### Step 2: Check Environment Variables

```bash
# Verify required env vars exist
cat .env | grep SENTRY_DSN_CLIENT
cat .env | grep NODE_ENV

# If missing, check .env.example
```

### Step 3: Verify Package Installation

```bash
# Check if @tanstack/react-query is properly installed
cd packages/client
pnpm list @tanstack/react-query

# Should show version 5.81.5
```

### Step 4: Check Build Output

```bash
# Clear everything and rebuild
rm -rf node_modules .next packages/*/node_modules packages/*/.next
pnpm install
cd packages/client
pnpm build 2>&1 | tee build.log

# Check for any errors in build.log
```

## Potential Fixes

### Fix 1: Ensure Correct pnpm Version

```bash
# Enable corepack (if not already enabled)
corepack enable

# Install exact pnpm version
corepack prepare pnpm@10.12.4 --activate

# Verify
pnpm --version  # Should output 10.12.4

# Clean install
rm -rf node_modules .next packages/*/node_modules packages/*/.next
pnpm install
```

### Fix 2: Update Node.js Version

```bash
# Check current version
node --version

# If < 18, update Node.js (use nvm if available)
nvm install 20
nvm use 20

# Or use latest LTS
nvm install --lts
nvm use --lts
```

## Most Likely Solution

Based on the error pattern and the fact that clean install didn't help, the most likely issue is:

**pnpm version mismatch** - The project requires `pnpm@10.12.4` exactly. Different versions can cause module resolution issues in monorepos.

**Action**: Have your colleague run:

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm --version  # Verify it shows 10.12.4
rm -rf node_modules .next packages/*/node_modules packages/*/.next
pnpm install
pnpm dev
```

## If Still Failing

1. Check browser console for additional errors
2. Check terminal output for build/runtime errors
3. Try disabling Sentry temporarily to isolate the issue
4. Compare `pnpm-lock.yaml` between working and non-working machines
5. Check if there are any local `.env` differences
