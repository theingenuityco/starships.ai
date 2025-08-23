# Local Development Setup

## Prerequisites
- Docker Desktop installed and running
- Node.js 20+ and pnpm installed
- Git

## Quick Start

### 1. Start Neo4j Database
```bash
# Using the provided script
./start-neo4j-local.sh

# Or manually with Docker
docker run -d \
  --name starships-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/[NEO4J-PASSWORD] \
  neo4j:5.9.0
```

### 2. Set Environment Variables
Create a `.env` file in the root directory with:
```env
# Neo4j
NEO4J_URI=[NEO4J-LOCAL-URL]
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=[NEO4J-PASSWORD]

# Kinde Auth
KINDE_CLIENT_ID=[KINDE-CLIENT-ID]
KINDE_CLIENT_SECRET=[API-KEY]
KINDE_ISSUER_URL=[KINDE-ISSUER-URL]
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000/dashboard
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:4000

# Skip production features in development
SKIP_K8S_CHECK=true
SKIP_VECTOR_STORE=true
```

### 3. Install Dependencies
```bash
pnpm install
```

### 4. Start Development Servers
```bash
pnpm run dev
```

This will start:
- Frontend on http://localhost:3000
- Backend on http://localhost:4000
- Neo4j on http://localhost:7474

## Troubleshooting

### Neo4j Issues
If Neo4j won't start:
1. Check if port 7474 or 7687 is already in use
2. Stop any existing Neo4j containers: `docker stop starships-neo4j`
3. Check Docker logs: `docker logs starships-neo4j`

### Authentication Issues
If you get JWT verification errors:
1. Ensure all Kinde environment variables are set correctly
2. Check that KINDE_ISSUER_URL matches the actual Kinde domain
3. Clear browser cookies and try logging in again

### Docker Desktop Issues
If Docker commands fail with "read-only file system":
1. Restart Docker Desktop
2. Reset Docker to factory defaults if needed
3. Ensure Docker has sufficient disk space

## Production Deployment
See `DEPLOYMENT.md` for production deployment instructions.