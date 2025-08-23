#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Infisical Setup Script${NC}"
echo "================================="

# Check if Infisical CLI is installed
if ! command -v infisical &> /dev/null; then
    echo -e "${YELLOW}Infisical CLI not found. Installing via npm...${NC}"
    
    # Install using npm globally
    npm install -g @infisical/cli
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Infisical CLI installed successfully${NC}"
    else
        echo -e "${RED}Failed to install Infisical CLI${NC}"
        echo -e "${YELLOW}Trying with sudo...${NC}"
        sudo npm install -g @infisical/cli
        
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install Infisical CLI even with sudo${NC}"
            echo "Please install manually: npm install -g @infisical/cli"
            exit 1
        fi
    fi
else
    echo -e "${GREEN}✅ Infisical CLI already installed${NC}"
fi

# Check if already logged in
if ! infisical vault 2>/dev/null | grep -q "Project"; then
    echo -e "${YELLOW}Not logged in to Infisical. Starting login...${NC}"
    infisical login
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Login failed. Please try again.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Already logged in to Infisical${NC}"
fi

# Initialize project if not already done
if [ ! -f ".infisical.json" ]; then
    echo -e "${YELLOW}Initializing Infisical project...${NC}"
    infisical init
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to initialize project${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Project already initialized${NC}"
fi

# Pull development secrets
echo -e "${YELLOW}Pulling development secrets...${NC}"
infisical export --env=dev --format=dotenv > .env

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Secrets synced successfully!${NC}"
    echo -e "${GREEN}📁 Created .env file with $(grep -c "=" .env) secrets${NC}"
    
    # Verify .env is in .gitignore
    if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Warning: .env not in .gitignore. Adding it now...${NC}"
        echo ".env" >> .gitignore
    fi
else
    echo -e "${RED}Failed to pull secrets from Infisical${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Setup complete! You can now run your application.${NC}"
echo -e "${YELLOW}Tip: Run 'pnpm dev' to start the development server${NC}"