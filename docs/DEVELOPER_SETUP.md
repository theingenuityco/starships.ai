# Developer Setup Guide

## Quick Start

For new developers, follow these steps:

```bash
# 1. Clone the repository
git clone <repository-url>
cd starships.ai

# 2. Install dependencies (automatically configures Docker paths)
pnpm install

# 3. Run the complete setup (only needed once)
pnpm run setup

# 4. Verify your setup
pnpm run setup:verify

# 5. Build the project
pnpm run build
```

## What Gets Set Up Automatically

The setup process handles:
- **Docker Path Detection**: Finds Docker in various installation locations
- **Docker Wrapper Creation**: Creates project-local wrapper if Docker isn't in PATH
- **Kubernetes Tools**: Installs kind and kubectl if missing
- **Kind Cluster**: Creates local Kubernetes cluster for MCP containers
- **Environment Configuration**: Sets up .env file from template
- **Cross-Platform Support**: Works on macOS, Linux, and Windows

## Manual Setup

If you prefer to set things up manually or need to troubleshoot:

### 1. Prerequisites

- **Node.js** (v18 or higher)
- **pnpm** package manager
- **Docker Desktop** (required for Kubernetes)

### 2. Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# This will automatically run postinstall script to setup Docker paths
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Update `.env` with your configuration values, especially:
- `STRIPE_PUBLISHABLE_KEY` - Required for build
- Authentication keys (Kinde, OAuth, etc.)
- Database connections

### 4. Kubernetes Setup

The build process automatically sets up Kubernetes, but you can also run:

```bash
pnpm run k8s:setup
```

## Build and Run

Once setup is complete:

```bash
# Build all packages
pnpm run build

# Start development servers
pnpm run dev
```

## Supported Docker Installation Locations

The build system automatically detects Docker in these locations:

### macOS
- `/Applications/Docker.app/Contents/Resources/bin/docker` (Docker Desktop)
- `/usr/local/bin/docker` (Homebrew or manual install)
- `/opt/homebrew/bin/docker` (Homebrew on Apple Silicon)
- `~/Applications/Docker.app/Contents/Resources/bin/docker` (User-specific install)

### Linux
- `/usr/bin/docker` (Package manager install)
- `/usr/local/bin/docker` (Manual install)
- `/snap/bin/docker` (Snap package)
- `~/.local/bin/docker` (User install)

### Windows
- `C:\Program Files\Docker\Docker\resources\bin\docker.exe`
- `%LOCALAPPDATA%\Docker\resources\bin\docker.exe`
- Docker Desktop with WSL2

## Troubleshooting

### Docker Not Found

If you see "Docker not found" errors:

1. **On macOS**: Make sure Docker Desktop is installed and running
   ```bash
   # Install via Homebrew
   brew install --cask docker
   ```

2. **On Linux**: Install Docker
   ```bash
   # Ubuntu/Debian
   sudo apt-get install docker.io
   
   # CentOS/RHEL
   sudo yum install docker
   ```

3. **Run Docker path setup**:
   ```bash
   pnpm run setup:docker
   ```

### Kubernetes Cluster Issues

If the Kind cluster fails to create:

1. **Check Docker is running**:
   ```bash
   docker info
   ```

2. **Clean up existing cluster**:
   ```bash
   pnpm run k8s:cleanup
   ```

3. **Recreate cluster**:
   ```bash
   pnpm run k8s:setup
   ```

### Build Failures

If `pnpm run build` fails:

1. **Check environment variables**:
   - Ensure `.env` file exists
   - Verify `STRIPE_PUBLISHABLE_KEY` is set

2. **Check Docker and Kubernetes**:
   ```bash
   # Check cluster status
   kubectl get nodes
   
   # Check all pods
   kubectl get pods -A
   ```

3. **Clear cache and rebuild**:
   ```bash
   # Clear turbo cache
   rm -rf .turbo
   
   # Rebuild
   pnpm run build
   ```

## Useful Commands

### Development
- `pnpm run dev` - Start all development servers
- `pnpm run build` - Build all packages
- `pnpm run test` - Run tests
- `pnpm run lint` - Run linting

### Kubernetes Management
- `pnpm run k8s:setup` - Create Kind cluster
- `pnpm run k8s:cleanup` - Delete Kind cluster
- `pnpm run k8s:status` - View cluster status
- `kubectl get pods -A` - List all pods
- `kind get clusters` - List Kind clusters

### Docker
- `docker ps` - List running containers
- `docker info` - Check Docker daemon status

## Architecture Notes

The project uses:
- **Kind** (Kubernetes in Docker) for local K8s development
- **Automatic Docker path detection** for cross-platform compatibility
- **Turbo** for monorepo build orchestration
- **pnpm workspaces** for package management

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Run `pnpm run setup` to ensure everything is configured
3. Contact the team in the development Slack channel