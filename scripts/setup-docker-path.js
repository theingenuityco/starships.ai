#!/usr/bin/env node

/**
 * Docker PATH Setup Script
 * Automatically detects and configures Docker path for different installation methods
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

function findDocker() {
  const platform = os.platform();
  const possiblePaths = [];
  
  // Common Docker paths based on platform
  if (platform === 'darwin') {
    // macOS paths
    possiblePaths.push(
      '/Applications/Docker.app/Contents/Resources/bin/docker',
      '/usr/local/bin/docker',
      '/opt/homebrew/bin/docker',
      '/usr/bin/docker',
      `${os.homedir()}/.docker/bin/docker`,
      `${os.homedir()}/Applications/Docker.app/Contents/Resources/bin/docker`
    );
  } else if (platform === 'win32') {
    // Windows paths
    possiblePaths.push(
      'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
      'C:\\Program Files\\Docker\\Docker\\resources\\docker.exe',
      `${process.env.PROGRAMFILES}\\Docker\\Docker\\resources\\bin\\docker.exe`,
      `${process.env.LOCALAPPDATA}\\Docker\\resources\\bin\\docker.exe`,
      `${os.homedir()}\\AppData\\Local\\Docker\\resources\\bin\\docker.exe`
    );
  } else {
    // Linux paths
    possiblePaths.push(
      '/usr/bin/docker',
      '/usr/local/bin/docker',
      '/snap/bin/docker',
      `${os.homedir()}/.local/bin/docker`,
      '/usr/share/docker/docker',
      '/opt/docker/docker'
    );
  }
  
  // Check if docker is already in PATH
  try {
    const dockerPath = execSync('which docker', { encoding: 'utf8' }).trim();
    if (dockerPath && fs.existsSync(dockerPath)) {
      return { path: dockerPath, inPath: true };
    }
  } catch (e) {
    // docker not in PATH, continue checking
  }
  
  // Check common installation paths
  for (const dockerPath of possiblePaths) {
    if (fs.existsSync(dockerPath)) {
      return { path: dockerPath, inPath: false };
    }
  }
  
  return null;
}

function setupDockerPath() {
  log('🔍 Detecting Docker installation...', 'cyan');
  
  const docker = findDocker();
  
  if (!docker) {
    log('❌ Docker not found!', 'red');
    log('Please install Docker Desktop from: https://www.docker.com/products/docker-desktop', 'yellow');
    
    const platform = os.platform();
    if (platform === 'darwin') {
      log('\nFor macOS, you can also install via Homebrew:', 'cyan');
      log('  brew install --cask docker', 'cyan');
    } else if (platform === 'linux') {
      log('\nFor Linux, you can install via:', 'cyan');
      log('  sudo apt-get install docker.io  # Ubuntu/Debian', 'cyan');
      log('  sudo yum install docker          # CentOS/RHEL', 'cyan');
    }
    
    process.exit(1);
  }
  
  if (docker.inPath) {
    log(`✅ Docker found in PATH: ${docker.path}`, 'green');
    
    // Check if Docker daemon is running
    try {
      execSync('docker info', { stdio: 'ignore' });
      log('✅ Docker daemon is running', 'green');
      return docker.path;
    } catch (e) {
      log('⚠️  Docker is installed but not running', 'yellow');
      log('Please start Docker Desktop and try again', 'yellow');
      process.exit(1);
    }
  } else {
    log(`⚠️  Docker found at: ${docker.path}`, 'yellow');
    log('   But not in PATH. Setting up...', 'cyan');
    
    // Create a wrapper script in the project
    const wrapperDir = path.join(process.cwd(), '.docker-bin');
    const wrapperPath = path.join(wrapperDir, 'docker');
    
    if (!fs.existsSync(wrapperDir)) {
      fs.mkdirSync(wrapperDir, { recursive: true });
    }
    
    // Create wrapper script based on platform
    const platform = os.platform();
    let wrapperContent;
    if (platform === 'win32') {
      // Windows batch file
      const batPath = path.join(wrapperDir, 'docker.bat');
      wrapperContent = `@echo off
rem Auto-generated Docker wrapper
"${docker.path}" %*
`;
      fs.writeFileSync(batPath, wrapperContent);
      log(`✅ Created Docker wrapper at: ${batPath}`, 'green');
    } else {
      // Unix shell script
      wrapperContent = `#!/bin/bash
# Auto-generated Docker wrapper
exec "${docker.path}" "$@"
`;
      fs.writeFileSync(wrapperPath, wrapperContent);
      fs.chmodSync(wrapperPath, '755');
      log(`✅ Created Docker wrapper at: ${wrapperPath}`, 'green');
    }
    
    // Update process PATH for current session
    process.env.PATH = `${wrapperDir}:${process.env.PATH}`;
    
    // Check if Docker daemon is running using the found path
    try {
      execSync(`"${docker.path}" info`, { stdio: 'ignore' });
      log('✅ Docker daemon is running', 'green');
    } catch (e) {
      log('⚠️  Docker is installed but not running', 'yellow');
      log('Please start Docker Desktop and try again', 'yellow');
      process.exit(1);
    }
    
    return wrapperPath;
  }
}

// Export for use in other scripts
module.exports = { setupDockerPath, findDocker };

// Run if called directly
if (require.main === module) {
  setupDockerPath();
}