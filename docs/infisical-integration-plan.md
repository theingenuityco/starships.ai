# Infisical Integration Implementation Plan

## Implementation Status

### ✅ Completed
- Phase 1: Infisical Setup (All prerequisites done)
- Phase 2: GitHub Actions Integration (CI workflow updated)
- Phase 3: Local Development Support (Script created: `scripts/setup-infisical.sh`)
- Phase 4: Documentation Updates (README and .env.example updated)

### ⏳ Pending (Optional for MVP)
- Phase 5: Security Considerations (Rotation, backups, audit logging)

## Overview
Integrate Infisical for centralized secret management starting with the development environment CI pipeline, establishing a scalable pattern that will be reused for staging and production deployments in future workflows.

## Current State Analysis

### Existing Setup
- **CI Workflow**: `.github/workflows/ci-tests.yml` runs on PRs and pushes to main
- **Environment Variables**: Currently stored in `.env` file at root
- **Build Process**: Uses pnpm monorepo with multiple packages
- **Secret Management**: GitHub Secrets for Stripe keys only
- **Config Loading**: `packages/env-config` module handles environment loading

### Key Requirements
1. Pull development secrets from Infisical during CI builds
2. Maintain existing .env file structure for local development
3. No changes to staging/production workflows (separate actions TBD)
4. Minimal changes to application codebase
5. MVP approach - no unnecessary features

## Implementation Plan

### Phase 1: Infisical Setup (Prerequisites)

#### 1.1 Infisical Organization Setup
- [x] Create Infisical account and organization ✅
- [x] Set up project named `starships-ai` ✅
- [x] Create `development` environment in Infisical ✅

#### 1.2 Secret Migration
- [x] Migrate all non-sensitive development secrets from `.env` to Infisical ✅
- [x] Organize secrets by category: ✅
  - **Core**: PORT, CLIENT_URL, LOG_LEVEL
  - **AI/LLM**: OpenAI, Anthropic keys and configs
  - **Database**: Neo4j connection details
  - **Auth**: Kinde configuration
  - **Integrations**: Stripe, N8N, SSE configs
  - **Feature Flags**: Testing backdoors, debug modes

#### 1.3 Machine Identity Setup
- [x] Create Machine Identity named `github-actions-dev` in Infisical ✅
- [x] Configure Universal Auth method (Client ID/Secret pair) ✅
- [x] Grant read-only access to `development` environment (Viewer role) ✅
- [x] Store Client ID in GitHub Secrets as `INFISICAL_CLIENT_ID` ✅
- [x] Store Client Secret in GitHub Secrets as `INFISICAL_CLIENT_SECRET` ✅
- [x] Store Project Slug in GitHub Secrets as `INFISICAL_PROJECT_SLUG` ✅ (Added extra)

### Phase 2: GitHub Actions Integration ✅

#### 2.1 Infisical Machine Identity Setup ✅
Before updating the workflow, set up authentication:

1. **Create Machine Identity in Infisical**: ✅
   - Navigate to your Infisical project settings
   - Go to "Machine Identities" section
   - Create new identity named `github-actions-dev`
   - Choose "Universal Auth" method (simplest for MVP)
   - Save the Client ID and Client Secret

2. **Configure GitHub Secrets**: ✅
   - Add `INFISICAL_CLIENT_ID` to GitHub repository secrets
   - Add `INFISICAL_CLIENT_SECRET` to GitHub repository secrets
   - Add `INFISICAL_PROJECT_SLUG` to GitHub repository secrets (Added for maintainability)
   - Note your project slug (e.g., `starships-ai`)

#### 2.2 Update CI Workflow (Recommended Approach) ✅
Modified `.github/workflows/ci-tests.yml` to use the Infisical GitHub Action:

```yaml
name: CI Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    name: Test and Lint
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      # NEW: Pull secrets from Infisical as environment variables
      - name: Load secrets from Infisical
        uses: Infisical/secrets-action@v1.0.9
        with:
          method: universal
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          env-slug: dev
          project-slug: ${{ secrets.INFISICAL_PROJECT_SLUG }}
          # Note: Removed export-type and file-output-path to load as env vars instead

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linting
        run: pnpm run lint

      - name: Run type checking
        run: pnpm run build

      - name: Run tests
        run: pnpm run test

      # ... rest of the workflow remains the same
```

#### 2.3 Alternative: Direct Environment Variables
If you prefer to load secrets directly as environment variables instead of a file:

```yaml
      # Alternative: Load as environment variables
      - name: Load secrets from Infisical
        uses: Infisical/secrets-action@v1.0.9
        with:
          method: universal
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          env-slug: dev
          project-slug: starships-ai
          # Secrets will be available as environment variables for all subsequent steps
```

#### 2.4 Benefits of Using the GitHub Action
- **No CLI installation needed**: Reduces CI runtime by ~15-20 seconds
- **Better error handling**: Action provides clear error messages
- **Automatic retries**: Built-in retry logic for transient failures
- **Version pinning**: Can lock to specific action version for stability
- **Native GitHub integration**: Shows up nicely in workflow logs

### Phase 3: Local Development Support ✅

#### 3.1 Developer Onboarding Script ✅
Created `scripts/setup-infisical.sh`:

```bash
#!/bin/bash

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo "Installing Infisical CLI..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install infisical/tap/infisical
    else
        curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
        sudo apt-get update && sudo apt-get install -y infisical
    fi
fi

# Login to Infisical
echo "Logging into Infisical..."
infisical login

# Pull development secrets
echo "Pulling development secrets..."
infisical export --env=development --format=dotenv > .env

echo "✅ Secrets synced successfully!"
```

#### 3.2 Add npm Script ✅
Updated root `package.json`:

```json
{
  "scripts": {
    "sync:secrets": "bash scripts/setup-infisical.sh",
    "dev:sync": "bash scripts/setup-infisical.sh && pnpm dev"
  }
}
```

### Phase 4: Documentation Updates ✅

#### 4.1 Update README.md ✅
Added section for secret management:

```markdown
## Environment Setup

### Using Infisical (Recommended)
1. Install Infisical CLI: `npm install -g @infisical/cli`
2. Login: `infisical login`
3. Pull secrets: `pnpm sync:secrets`

### Manual Setup
Copy `.env.example` to `.env` and fill in the required values.
```

#### 4.2 Update .env.example ✅
Updated template with Infisical instructions:

```env
# This file shows required environment variables
# Use 'pnpm sync:secrets' to pull actual values from Infisical

DISCORD_BOT_TOKEN=your-discord-token
OPEN_WEBUI_BASE_URL=your-webui-url
PORT=4000
# ... (include all variables with placeholder values)
```

### Phase 5: Security Considerations

#### 5.1 Access Control
- [ ] Use Infisical's RBAC to limit developer access
- [ ] Create read-only service tokens for CI/CD
- [ ] Enable audit logging in Infisical

#### 5.2 Secret Rotation
- [ ] Set up rotation reminders for sensitive keys
- [ ] Document rotation procedures
- [ ] Create rotation scripts where applicable

#### 5.3 Backup Strategy
- [ ] Keep encrypted backup of critical secrets
- [ ] Document recovery procedures
- [ ] Test restore process

## Implementation Timeline

| Phase | Task | Duration | Priority |
|-------|------|----------|----------|
| 1 | Infisical Setup | 1 day | High |
| 2 | GitHub Actions Integration | 1 day | High |
| 3 | Local Development Support | 0.5 day | Medium |
| 4 | Documentation | 0.5 day | Medium |
| 5 | Security Setup | 1 day | Low |

**Total Estimated Time**: 4 days

## Testing Plan

1. **CI Pipeline Test**
   - Create test PR to verify secret loading
   - Confirm all build steps pass with Infisical secrets
   - Validate no secrets are exposed in logs

2. **Local Development Test**
   - Test setup script on fresh environment
   - Verify all services start correctly
   - Confirm hot-reload and development features work

3. **Secret Rotation Test**
   - Rotate a test secret in Infisical
   - Verify CI picks up new value
   - Confirm local sync updates correctly

## Rollback Plan

If issues arise:
1. Remove Infisical integration from CI workflow
2. Restore GitHub Secrets for critical values
3. Developers use local .env files
4. Document issues and retry after fixes

## Success Metrics

- ✅ Zero hardcoded secrets in repository
- ✅ CI/CD pipeline runs without manual secret management
- ✅ Developer onboarding time reduced by 50%
- ✅ Audit trail for all secret access
- ✅ No increase in build time (< 30s added)

## Best Practices Reference

Following Infisical's recommended patterns:
- Use service tokens for machine access (CI/CD)
- Use personal tokens for developer access
- Implement least-privilege access
- Regular secret rotation
- Environment separation (dev/staging/prod)

## Future Environment Scaling (Staging & Production)

### Environment Structure in Infisical
The current setup is designed to easily scale to multiple environments:

```
Infisical Project: starships-ai
├── dev (used by ci-tests.yml)
├── staging (future: deploy-staging.yml)
└── prod (future: deploy-production.yml)
```

### Adding Staging/Production Workflows

When ready to add staging and production deployments, simply:

1. **Create New Environments in Infisical**:
   - Create `staging` environment with staging-specific secrets
   - Create `production` environment with production secrets

2. **Create New Machine Identities**:
   - `github-actions-staging` with access to staging environment only
   - `github-actions-production` with access to production environment only

3. **Add GitHub Secrets**:
   ```
   INFISICAL_CLIENT_ID_STAGING
   INFISICAL_CLIENT_SECRET_STAGING
   INFISICAL_CLIENT_ID_PRODUCTION
   INFISICAL_CLIENT_SECRET_PRODUCTION
   ```

4. **Create New Workflow Files**:

   **`.github/workflows/deploy-staging.yml`**:
   ```yaml
   - name: Load secrets from Infisical
     uses: Infisical/secrets-action@v1.0.9
     with:
       method: universal
       client-id: ${{ secrets.INFISICAL_CLIENT_ID_STAGING }}
       client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET_STAGING }}
       env-slug: staging  # Different environment
       project-slug: starships-ai
       export-type: file
       file-output-path: .env
   ```

   **`.github/workflows/deploy-production.yml`**:
   ```yaml
   - name: Load secrets from Infisical
     uses: Infisical/secrets-action@v1.0.9
     with:
       method: universal
       client-id: ${{ secrets.INFISICAL_CLIENT_ID_PRODUCTION }}
       client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET_PRODUCTION }}
       env-slug: production  # Different environment
       project-slug: starships-ai
       export-type: file
       file-output-path: .env
   ```

### Benefits of This Architecture

1. **Complete Isolation**: Each environment has separate credentials and access
2. **No Cross-Environment Access**: Staging CI can't access production secrets
3. **Easy Secret Promotion**: Copy secrets from dev → staging → production in Infisical UI
4. **Audit Trail**: Track which workflow accessed which environment
5. **Zero Code Changes**: Same Infisical action, just different `env-slug` parameter

### Environment-Specific Variables Example

```
Dev (.env from ci-tests.yml):
  CLIENT_URL=http://localhost:3000
  STRIPE_SECRET_KEY=sk_test_...
  NEO4J_URI=bolt://localhost:7687

Staging (.env from deploy-staging.yml):
  CLIENT_URL=https://staging.starships.ai
  STRIPE_SECRET_KEY=sk_test_...  # Still test keys
  NEO4J_URI=bolt://staging-neo4j.internal:7687

Prod (.env from deploy-production.yml):
  CLIENT_URL=https://starships.ai
  STRIPE_SECRET_KEY=sk_live_...  # Live keys
  NEO4J_URI=bolt://prod-neo4j.internal:7687
```

## Notes

- Keep `.env` in `.gitignore` to prevent accidental commits
- Consider using Infisical's SDK in future for runtime secret fetching
- The current development setup naturally extends to staging/production
- Monitor Infisical's uptime and have fallback plan for outages

## Quick Implementation Example

Here's the exact change needed for your `ci-tests.yml` file. Add this step right after the Node.js setup:

```yaml
      # Add this after the "Setup Node.js" step
      - name: Load secrets from Infisical
        uses: Infisical/secrets-action@v1.0.9
        with:
          method: universal
          client-id: ${{ secrets.INFISICAL_CLIENT_ID }}
          client-secret: ${{ secrets.INFISICAL_CLIENT_SECRET }}
          env-slug: dev
          project-slug: starships-ai  # Update with your actual project slug
          export-type: file
          file-output-path: .env
```

This single addition will:
1. Pull all development secrets from Infisical
2. Write them to a `.env` file in the root directory
3. Your existing build process will automatically use these secrets
4. No other code changes required!