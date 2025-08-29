# Enterprise GHCR Authentication Setup

## Current Setup (Temporary)
Using personal PAT - suitable for MVP/early stage

## Recommended Migration Path

### Phase 1: Service Account (Immediate)
1. Create a service account on GitHub (e.g., `starships-deploy-bot`)
2. Add as collaborator with read-only access to repo
3. Generate fine-grained PAT with minimal permissions:
   - `packages:read` (pull container images)
   - Expiration: 90 days
   - Repository access: Only `theingenuityco/starships.ai`

### Phase 2: GitHub App (3-6 months)
1. Create GitHub App for your organization
2. Benefits:
   - Auto-rotating tokens (1 hour expiry)
   - Audit logs
   - No user seat required
   - Fine-grained permissions

### Phase 3: Registry Proxy (Scale phase)
1. Deploy Harbor or Docker Registry in cluster
2. Configure as pull-through cache
3. Single point for auth and rate limiting
4. Reduces external dependencies

## Security Checklist
- [ ] Never use personal accounts for CI/CD
- [ ] Rotate tokens every 90 days minimum
- [ ] Use least privilege principle
- [ ] Enable audit logging
- [ ] Monitor for token usage anomalies
- [ ] Use environment-specific tokens

## Token Permission Matrix

| Method | Scope | Rotation | Audit | Cost |
|--------|-------|----------|-------|------|
| Personal PAT | User-wide | Manual | Basic | Free |
| Fine-grained PAT | Repo-specific | Manual | Good | Free |
| GitHub App | Org-wide | Automatic | Excellent | Free |
| Service Account | Repo-specific | Manual | Good | 1 seat |
| Registry Proxy | Cluster-wide | N/A | Excellent | Infrastructure |