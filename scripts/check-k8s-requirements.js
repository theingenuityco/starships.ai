#!/usr/bin/env node

/**
 * Check and install Kubernetes development requirements
 * This script ensures all K8s dependencies are available for local development
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Setup Docker PATH automatically
const { setupDockerPath } = require('./setup-docker-path');
try {
  setupDockerPath();
} catch (e) {
  // Docker setup will handle its own error messages
  process.exit(1);
}

const CLUSTER_NAME = 'starships';
const REQUIRED_TOOLS = {
  docker: {
    check: 'docker --version',
    install: {
      darwin: 'Please install Docker Desktop from https://www.docker.com/products/docker-desktop',
      linux: 'sudo apt-get install docker.io || sudo yum install docker',
      win32: 'Please install Docker Desktop from https://www.docker.com/products/docker-desktop'
    }
  },
  kind: {
    check: 'kind --version',
    install: {
      darwin: 'brew install kind || curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-darwin-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind',
      linux: 'curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64 && chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind',
      win32: 'Please install kind from https://kind.sigs.k8s.io/docs/user/quick-start/#installation'
    }
  },
  kubectl: {
    check: 'kubectl version --client',
    install: {
      darwin: 'brew install kubectl || curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/amd64/kubectl" && chmod +x kubectl && sudo mv kubectl /usr/local/bin/',
      linux: 'curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && chmod +x kubectl && sudo mv kubectl /usr/local/bin/',
      win32: 'Please install kubectl from https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/'
    }
  }
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkCommand(command) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    // For Docker on macOS, also check the Docker Desktop app path
    if (command.includes('docker') && os.platform() === 'darwin') {
      try {
        const dockerPath = '/Applications/Docker.app/Contents/Resources/bin/docker';
        const modifiedCommand = command.replace('docker', dockerPath);
        execSync(modifiedCommand, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function getPlatform() {
  return os.platform();
}

function checkDocker() {
  if (!checkCommand('docker --version')) {
    return false;
  }
  
  // Check if Docker daemon is running
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    // Try with full Docker Desktop path on macOS
    if (os.platform() === 'darwin') {
      try {
        execSync('/Applications/Docker.app/Contents/Resources/bin/docker info', { stdio: 'ignore' });
        return true;
      } catch {
        log('⚠️  Docker is installed but not running. Please start Docker Desktop.', 'yellow');
        return false;
      }
    }
    log('⚠️  Docker is installed but not running. Please start Docker Desktop.', 'yellow');
    return false;
  }
}

async function installTool(toolName, tool) {
  const platform = getPlatform();
  const installCmd = tool.install[platform];
  
  if (!installCmd) {
    log(`❌ No automatic installation available for ${toolName} on ${platform}`, 'red');
    log(`   Please install manually and rerun the build.`, 'yellow');
    return false;
  }
  
  if (installCmd.startsWith('Please')) {
    log(`ℹ️  ${installCmd}`, 'cyan');
    return false;
  }
  
  log(`📦 Installing ${toolName}...`, 'cyan');
  
  // For brew installations on macOS, check if brew exists
  if (platform === 'darwin' && installCmd.includes('brew')) {
    if (!checkCommand('brew --version')) {
      log('⚠️  Homebrew not found. Installing via curl method...', 'yellow');
      const altCommand = installCmd.split('||')[1]?.trim();
      if (altCommand) {
        try {
          execSync(altCommand, { stdio: 'inherit' });
        } catch (error) {
          log(`❌ Failed to install ${toolName}`, 'red');
          return false;
        }
      }
    } else {
      try {
        execSync(installCmd.split('||')[0].trim(), { stdio: 'inherit' });
      } catch {
        // Try alternative method
        const altCommand = installCmd.split('||')[1]?.trim();
        if (altCommand) {
          execSync(altCommand, { stdio: 'inherit' });
        }
      }
    }
  } else {
    try {
      execSync(installCmd, { stdio: 'inherit' });
    } catch (error) {
      log(`❌ Failed to install ${toolName}`, 'red');
      return false;
    }
  }
  
  // Verify installation
  if (checkCommand(tool.check)) {
    log(`✅ ${toolName} installed successfully`, 'green');
    return true;
  } else {
    log(`❌ ${toolName} installation verification failed`, 'red');
    return false;
  }
}

function checkKindCluster() {
  try {
    const clusters = execSync('kind get clusters', { encoding: 'utf8' });
    return clusters.includes(CLUSTER_NAME);
  } catch {
    return false;
  }
}

function createKindCluster() {
  log(`\n🚀 Creating Kind cluster '${CLUSTER_NAME}'...`, 'cyan');
  
  const setupScript = path.join(__dirname, 'setup-kind-cluster.sh');
  
  if (!fs.existsSync(setupScript)) {
    log('❌ setup-kind-cluster.sh not found', 'red');
    return false;
  }
  
  try {
    execSync(`bash ${setupScript}`, { stdio: 'inherit' });
    log(`✅ Kind cluster '${CLUSTER_NAME}' created successfully`, 'green');
    return true;
  } catch (error) {
    log(`❌ Failed to create Kind cluster: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🔍 Checking Kubernetes development requirements (REQUIRED)...', 'bright');
  log('ℹ️  Kubernetes is now the only deployment option for MCP containers', 'cyan');
  
  let allReady = true;
  const missingTools = [];
  
  // Check Docker separately as it needs daemon running
  log('\n📋 Checking Docker...', 'cyan');
  if (!checkDocker()) {
    const dockerTool = REQUIRED_TOOLS.docker;
    // On macOS, check the Docker Desktop app path directly
    const isDockerInstalled = os.platform() === 'darwin' 
      ? checkCommand('/Applications/Docker.app/Contents/Resources/bin/docker --version')
      : checkCommand('docker --version');
    
    if (isDockerInstalled) {
      log('❌ Docker Desktop is not running', 'red');
      log('   Docker is required for Kubernetes to run locally', 'yellow');
      log('   Please start Docker Desktop and rerun the build', 'yellow');
      process.exit(1);
    } else {
      const installed = await installTool('docker', dockerTool);
      if (!installed) {
        log('❌ Docker is required for Kubernetes', 'red');
        log('   Please install Docker Desktop and rerun the build', 'yellow');
        process.exit(1);
      } else {
        log('⏸️  Please start Docker Desktop and rerun the build', 'yellow');
        process.exit(1);
      }
    }
  } else {
    log('✅ Docker is running', 'green');
  }
  
  // Check other tools
  for (const [toolName, tool] of Object.entries(REQUIRED_TOOLS)) {
    if (toolName === 'docker') continue; // Already checked
    
    log(`\n📋 Checking ${toolName}...`, 'cyan');
    
    if (!checkCommand(tool.check)) {
      log(`⚠️  ${toolName} not found`, 'yellow');
      const installed = await installTool(toolName, tool);
      if (!installed) {
        missingTools.push(toolName);
        allReady = false;
      }
    } else {
      log(`✅ ${toolName} is available`, 'green');
    }
  }
  
  if (!allReady) {
    log('\n❌ Required Kubernetes tools could not be installed automatically', 'red');
    log('Kubernetes is required for MCP deployment. Please install the following manually:', 'yellow');
    missingTools.forEach(tool => {
      const platform = getPlatform();
      log(`  - ${tool}: ${REQUIRED_TOOLS[tool].install[platform]}`, 'yellow');
    });
    log('\nAfter installation, run: pnpm run build', 'cyan');
    process.exit(1);
  }
  
  // Check if Kind cluster exists
  log('\n🔍 Checking Kind cluster (REQUIRED)...', 'cyan');
  if (!checkKindCluster()) {
    log(`⚠️  Kind cluster '${CLUSTER_NAME}' not found`, 'yellow');
    log('   Creating cluster now (this is required for MCP deployment)...', 'cyan');
    if (!createKindCluster()) {
      log('❌ Failed to create Kind cluster - this is required for MCP deployment', 'red');
      log('   Please check the error messages above and fix any issues', 'yellow');
      log('   Then run: pnpm run k8s:setup', 'yellow');
      process.exit(1);
    }
  } else {
    log(`✅ Kind cluster '${CLUSTER_NAME}' exists`, 'green');
    
    // Ensure we're using the right context
    try {
      execSync(`kubectl config use-context kind-${CLUSTER_NAME}`, { stdio: 'ignore' });
      log(`✅ Kubernetes context set to kind-${CLUSTER_NAME}`, 'green');
    } catch {
      log(`❌ Failed to set Kubernetes context`, 'red');
      log('   This may cause issues with MCP deployment', 'yellow');
      process.exit(1);
    }
  }
  
  // Check if ingress is installed
  log('\n🔍 Checking NGINX Ingress Controller...', 'cyan');
  try {
    const ingress = execSync('kubectl get pods -n ingress-nginx', { encoding: 'utf8' });
    if (ingress.includes('Running')) {
      log('✅ NGINX Ingress Controller is running', 'green');
    } else {
      log('⚠️  NGINX Ingress Controller not running, reinstalling...', 'yellow');
      execSync('kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml', { stdio: 'ignore' });
      log('✅ NGINX Ingress Controller installed', 'green');
    }
  } catch {
    log('⚠️  Installing NGINX Ingress Controller...', 'yellow');
    try {
      execSync('kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml', { stdio: 'ignore' });
      log('✅ NGINX Ingress Controller installed', 'green');
    } catch {
      log('⚠️  Failed to install NGINX Ingress Controller', 'yellow');
    }
  }
  
  log('\n✅ All Kubernetes development requirements are ready!', 'green');
  log('\n📌 Cluster Information:', 'bright');
  log(`   Name: ${CLUSTER_NAME}`, 'cyan');
  log(`   Context: kind-${CLUSTER_NAME}`, 'cyan');
  log(`   Dashboard: kubectl proxy & open http://localhost:8001`, 'cyan');
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(process.cwd(), 'data', 'starships');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log(`\n📁 Created data directory: ${dataDir}`, 'green');
  }
  
  process.exit(0);
}

// Run the checks
main().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});