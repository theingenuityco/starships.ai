# @starships/reverse-proxy

A lean development reverse proxy for the starships.ai monorepo. This proxy routes requests between the Next.js frontend and Express backend during development, providing a single entry point for all traffic.

## Purpose

In development, this reverse proxy:

- Provides a single entry point at `http://localhost:8080`
- Routes `/api/*` requests to the backend server (port 4000)
- Routes all other requests to the Next.js frontend (port 3000)
- Enables WebSocket support for Next.js HMR (Hot Module Replacement)
- Provides consistent routing behavior between development and production

## Usage

### Start with Proxy (Recommended for Development)

```bash
# Start all services including the reverse proxy
pnpm dev
```

This will:

1. Start the reverse proxy at `http://localhost:8080`
2. Start the Next.js frontend at `http://localhost:3000`
3. Start the Express backend at `http://localhost:4000`

Then access your application at: **`http://localhost:8080`**

### Start Proxy Independently

```bash
# Start only the reverse proxy
pnpm --filter @starships/reverse-proxy dev
```

### Manual Setup

```bash
# Install dependencies
cd packages/reverse-proxy
pnpm install

# Start in development mode (with auto-reload)
pnpm run dev

# Or build and run in production mode
pnpm run build
pnpm run start
```

## Using a Local Domain

You can use a custom local domain like `local.starships.ai` instead of `localhost:8080`:

### Step 1: Update Your Hosts File

Add the following line to your hosts file:

**macOS/Linux:** Edit `/etc/hosts`

```bash
sudo nano /etc/hosts
```

**Windows:** Edit `C:\Windows\System32\drivers\etc\hosts` (as Administrator)

Add this line:

```
127.0.0.1   local.starships.ai
```

### Step 2: Configure the Proxy Port

Make sure your proxy is running on port 80 (standard HTTP) or 8080:

```env
# .env
PROXY_PORT=80  # Use port 80 for http://local.starships.ai
# or
PROXY_PORT=8080  # Use port 8080 for http://local.starships.ai:8080
```

**Note:** Port 80 may require elevated privileges:

```bash
# macOS/Linux (if using port 80)
sudo pnpm --filter @starships/reverse-proxy dev

# Or use port 8080 without sudo
pnpm --filter @starships/reverse-proxy dev
# Then access via http://local.starships.ai:8080
```

### Step 3: Access Your Application

- If using port 80: `http://local.starships.ai`
- If using port 8080: `http://local.starships.ai:8080`

### Benefits of Using a Local Domain

- **Production-like URLs**: Better mimics production environment
- **Cookie handling**: Some authentication flows work better with proper domains
- **Service workers**: Can test PWA features that require specific origins
- **SSL testing**: Can set up local SSL certificates with domains

## Configuration

The proxy reads configuration from the root `.env` file:

| Variable     | Default                 | Description               |
| ------------ | ----------------------- | ------------------------- |
| `PROXY_PORT` | `8080`                  | Port the proxy listens on |
| `CLIENT_URL` | `http://localhost:3000` | Next.js frontend URL      |
| `SERVER_URL` | `http://localhost:4000` | Express backend URL       |

Configuration is managed centrally:

- `PROXY_PORT` - The port the proxy listens on
- `CLIENT_URL` - Frontend routing destination
- `SERVER_URL` - Backend API routing destination

### Example Configuration

The default configuration uses port 8080. To customize, update your `.env` file:

```env
# .env
PROXY_PORT=8080
CLIENT_URL=http://localhost:3000
SERVER_URL=http://localhost:4000
```

Then start the proxy:

```bash
pnpm --filter @starships/reverse-proxy dev
```

## Routing Rules

| Path Pattern     | Target          | Description                            |
| ---------------- | --------------- | -------------------------------------- |
| `/api/*`         | Backend (4000)  | API endpoints (preserves full path)    |
| `/_proxy/health` | Proxy           | Health check endpoint                  |
| `/*`             | Frontend (3000) | All other routes (pages, assets, etc.) |

### Example Request Flow

- Browser requests: `http://localhost:8080/api/v1/starships`
- Proxy forwards to backend as: `http://localhost:4000/api/v1/starships`
- Backend receives: `/api/v1/starships`

## Health Check

The proxy provides a health check endpoint:

```bash
curl http://localhost:8080/_proxy/health
```

Response:

```json
{
  "status": "healthy",
  "uptime": 123.456,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "routes": {
    "frontend": "http://localhost:3000",
    "backend": "http://localhost:4000"
  }
}
```

## Development Workflow

1. **Without Proxy** (traditional setup):
   - Access frontend: `http://localhost:3000`
   - Frontend uses Next.js rewrites to proxy `/api/*` to backend
   - Two separate URLs for frontend and backend

2. **With Proxy** (recommended):
   - Access everything via: `http://localhost:8080`
   - Consistent routing with production
   - Single entry point for all traffic
   - Better mimics production environment

## Architecture

```
Browser
   ↓
[Reverse Proxy :8080]
   ├── /api/* → [Backend :4000]
   └── /*     → [Frontend :3000]
```

## Logging

The proxy logs all requests (except Next.js HMR requests to reduce noise):

```
[API] GET /api/v1/starships -> http://localhost:4000/api/v1/starships
[Frontend] GET /dashboard -> http://localhost:3000/dashboard
```

## Error Handling

If a backend service is unavailable, the proxy returns:

- Status: `502 Bad Gateway`
- Message: `Bad Gateway: [Backend|Frontend] server is unavailable`

## Production Note

This reverse proxy is **intended for development use only**. In production:

- Nginx handles routing at the ingress level
- Next.js rewrites handle API routing
- The proxy is not deployed or used

## Troubleshooting

### Port Already in Use

If port 8080 is already in use, update your `.env` file to use a different port:

```env
# .env
PROXY_PORT=8081
```

Then restart the proxy:

```bash
pnpm --filter @starships/reverse-proxy dev
```

### Backend/Frontend Not Accessible

Ensure both services are running:

```bash
# In separate terminals
pnpm --filter @starships/client dev
pnpm --filter @starships/server dev
```

### WebSocket Issues

The proxy supports WebSocket connections for Next.js HMR. If you experience issues:

1. Ensure you're accessing the app via the proxy URL (`http://localhost:8080`)
2. Check that no firewall is blocking WebSocket connections

## License

Part of the starships.ai monorepo. See root LICENSE file.
