#!/bin/bash

# Developer Setup Script for Starships.ai
# This script sets up the complete development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BOLD}${CYAN}🚀 Starships.ai Developer Setup${NC}"
echo -e "${CYAN}================================${NC}\n"

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo -e "${BLUE}📋 System Information:${NC}"
echo -e "   OS: $OS"
echo -e "   Architecture: $ARCH\n"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install Docker
install_docker() {
    echo -e "${YELLOW}📦 Installing Docker...${NC}"
    
    case "$OS" in
        Darwin)
            if command_exists brew; then
                echo -e "${CYAN}Installing Docker Desktop via Homebrew...${NC}"
                brew install --cask docker
                echo -e "${GREEN}✅ Docker Desktop installed${NC}"
                echo -e "${YELLOW}⚠️  Please start Docker Desktop from Applications${NC}"
            else
                echo -e "${RED}❌ Homebrew not found${NC}"
                echo -e "${YELLOW}Please install Docker Desktop manually from:${NC}"
                echo -e "${BLUE}https://www.docker.com/products/docker-desktop${NC}"
                exit 1
            fi
            ;;
        Linux)
            echo -e "${CYAN}Installing Docker via package manager...${NC}"
            if command_exists apt-get; then
                sudo apt-get update
                sudo apt-get install -y docker.io docker-compose
                sudo systemctl start docker
                sudo systemctl enable docker
                sudo usermod -aG docker $USER
                echo -e "${GREEN}✅ Docker installed${NC}"
                echo -e "${YELLOW}⚠️  Please log out and back in for group changes to take effect${NC}"
            elif command_exists yum; then
                sudo yum install -y docker
                sudo systemctl start docker
                sudo systemctl enable docker
                sudo usermod -aG docker $USER
                echo -e "${GREEN}✅ Docker installed${NC}"
                echo -e "${YELLOW}⚠️  Please log out and back in for group changes to take effect${NC}"
            else
                echo -e "${RED}❌ Unsupported Linux distribution${NC}"
                echo -e "${YELLOW}Please install Docker manually${NC}"
                exit 1
            fi
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo -e "${RED}❌ Windows detected${NC}"
            echo -e "${YELLOW}Please install Docker Desktop for Windows from:${NC}"
            echo -e "${BLUE}https://www.docker.com/products/docker-desktop${NC}"
            exit 1
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS: $OS${NC}"
            exit 1
            ;;
    esac
}

# Function to install kind
install_kind() {
    echo -e "${YELLOW}📦 Installing kind...${NC}"
    
    case "$OS" in
        Darwin)
            if command_exists brew; then
                brew install kind
            else
                # Install via curl
                curl -Lo ./kind "https://kind.sigs.k8s.io/dl/v0.20.0/kind-darwin-$ARCH"
                chmod +x ./kind
                sudo mv ./kind /usr/local/bin/kind
            fi
            ;;
        Linux)
            curl -Lo ./kind "https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64"
            chmod +x ./kind
            sudo mv ./kind /usr/local/bin/kind
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS for kind installation${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ kind installed${NC}"
}

# Function to install kubectl
install_kubectl() {
    echo -e "${YELLOW}📦 Installing kubectl...${NC}"
    
    case "$OS" in
        Darwin)
            if command_exists brew; then
                brew install kubectl
            else
                curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/$ARCH/kubectl"
                chmod +x kubectl
                sudo mv kubectl /usr/local/bin/
            fi
            ;;
        Linux)
            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
            chmod +x kubectl
            sudo mv kubectl /usr/local/bin/
            ;;
        *)
            echo -e "${RED}❌ Unsupported OS for kubectl installation${NC}"
            exit 1
            ;;
    esac
    
    echo -e "${GREEN}✅ kubectl installed${NC}"
}

# Check Node.js and pnpm
echo -e "${BLUE}🔍 Checking Node.js and pnpm...${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo -e "${YELLOW}Please install Node.js (v18 or higher) from: https://nodejs.org${NC}"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js $NODE_VERSION found${NC}"
fi

if ! command_exists pnpm; then
    echo -e "${YELLOW}📦 Installing pnpm...${NC}"
    npm install -g pnpm
    echo -e "${GREEN}✅ pnpm installed${NC}"
else
    PNPM_VERSION=$(pnpm -v)
    echo -e "${GREEN}✅ pnpm $PNPM_VERSION found${NC}"
fi

# Check and install Docker
echo -e "\n${BLUE}🐳 Checking Docker...${NC}"

if ! command_exists docker; then
    install_docker
else
    DOCKER_VERSION=$(docker --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}✅ Docker found: $DOCKER_VERSION${NC}"
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Docker is installed but not running${NC}"
        echo -e "${YELLOW}   Please start Docker Desktop and re-run this script${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Docker daemon is running${NC}"
    fi
fi

# Check and install kind
echo -e "\n${BLUE}☸️  Checking Kubernetes tools...${NC}"

if ! command_exists kind; then
    install_kind
else
    KIND_VERSION=$(kind --version)
    echo -e "${GREEN}✅ kind found: $KIND_VERSION${NC}"
fi

# Check and install kubectl
if ! command_exists kubectl; then
    install_kubectl
else
    KUBECTL_VERSION=$(kubectl version --client --short 2>/dev/null || kubectl version --client)
    echo -e "${GREEN}✅ kubectl found${NC}"
fi

# Install Node dependencies
echo -e "\n${BLUE}📦 Installing Node.js dependencies...${NC}"
pnpm install

# Setup environment file
echo -e "\n${BLUE}🔧 Setting up environment...${NC}"

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file from .env.example${NC}"
        echo -e "${YELLOW}⚠️  Please update .env with your configuration${NC}"
    else
        echo -e "${YELLOW}⚠️  No .env.example file found${NC}"
    fi
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# Create Kind cluster
echo -e "\n${BLUE}🚀 Setting up Kubernetes cluster...${NC}"

# Run the Docker path setup first
node scripts/setup-docker-path.js

# Now setup the Kind cluster
bash scripts/setup-kind-cluster.sh

echo -e "\n${BOLD}${GREEN}✅ Developer setup complete!${NC}"
echo -e "\n${CYAN}Next steps:${NC}"
echo -e "1. ${YELLOW}Update your .env file with required configurations${NC}"
echo -e "2. ${YELLOW}Run: pnpm run build${NC}"
echo -e "3. ${YELLOW}Run: pnpm run dev${NC}"
echo -e "\n${CYAN}Useful commands:${NC}"
echo -e "  ${BLUE}pnpm run build${NC} - Build all packages"
echo -e "  ${BLUE}pnpm run dev${NC} - Start development servers"
echo -e "  ${BLUE}kubectl get pods -A${NC} - View all Kubernetes pods"
echo -e "  ${BLUE}kind get clusters${NC} - List Kind clusters"
echo -e "\n${GREEN}Happy coding! 🚀${NC}"