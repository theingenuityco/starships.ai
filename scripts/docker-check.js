#!/usr/bin/env node

/**
 * Docker Check for Post-Install
 * 
 * This script performs a Docker availability check after installation.
 * It will NOT fail the installation process if Docker is unavailable - it's purely informational.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

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

/**
 * Checks if Docker is available in the system
 * @returns {Object|null} Docker information or null if not found
 */
function checkDockerAvailability() {
  // Skip Docker check when running inside Docker container
  if (process.env.DOCKER_BUILD === 'true' || fs.existsSync('/.dockerenv')) {
    return { status: 'container', message: 'Running inside Docker container' };
  }

  try {
    // Check if docker command is available
    const dockerVersion = execSync('docker --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
    
    try {
      // Check if Docker daemon is running
      execSync('docker info', { stdio: 'ignore' });
      return {
        status: 'available',
        version: dockerVersion,
        daemon: 'running'
      };
    } catch (e) {
      return {
        status: 'available',
        version: dockerVersion,
        daemon: 'not_running'
      };
    }
  } catch (e) {
    return null;
  }
}

/**
 * Provides installation guidance for Docker based on the current platform
 */
function provideDockerInstallationGuidance() {
  const platform = os.platform();
  
  log('\n📦 Docker Installation Options:', 'cyan');
  
  if (platform === 'darwin') {
    log('  macOS:', 'bright');
    log('  • Docker Desktop: https://www.docker.com/products/docker-desktop', 'reset');
    log('  • Homebrew: brew install --cask docker', 'reset');
  } else if (platform === 'win32') {
    log('  Windows:', 'bright');
    log('  • Docker Desktop: https://www.docker.com/products/docker-desktop', 'reset');
    log('  • Requires WSL2 for optimal performance', 'reset');
  } else {
    log('  Linux:', 'bright');
    log('  • Ubuntu/Debian: sudo apt-get install docker.io', 'reset');
    log('  • CentOS/RHEL: sudo yum install docker', 'reset');
    log('  • Docker Desktop: https://www.docker.com/products/docker-desktop', 'reset');
  }
}

/**
 * Main function to perform Docker check during post-install
 */
function performDockerCheck() {
  log('\n🐳 Optional Docker Availability Check', 'bright');
  log('   (This check is optional and will not affect installation)', 'cyan');
  
  const dockerInfo = checkDockerAvailability();
  
  if (!dockerInfo) {
    log('\n📋 Docker Status: Not Found (Optional)', 'yellow');
    log('   Docker is not currently installed or available in PATH', 'reset');
    log('   This is completely optional - the application works without Docker', 'reset');
    
    provideDockerInstallationGuidance();
    
    log('\n💡 Benefits of having Docker:', 'blue');
    log('  • Easy containerized deployment', 'reset');
    log('  • Consistent development environment', 'reset');
    log('  • Simplified production deployments', 'reset');
    
  } else if (dockerInfo.status === 'container') {
    log('\n📋 Docker Status: Running in Container', 'green');
    log('   Detected running inside Docker container', 'reset');
    
  } else if (dockerInfo.status === 'available') {
    if (dockerInfo.daemon === 'running') {
      log('\n📋 Docker Status: ✅ Available and Running', 'green');
      log(`   ${dockerInfo.version}`, 'reset');
      log('   Docker daemon is active and ready to use', 'reset');
      
      log('\n🚀 Docker deployment options available:', 'blue');
      log('  • docker-compose up (for local development)', 'reset');
      log('  • Production deployment with Docker', 'reset');
      
    } else {
      log('\n📋 Docker Status: ⚠️ Available but Not Running', 'yellow');
      log(`   ${dockerInfo.version}`, 'reset');
      log('   Docker is installed but the daemon is not running', 'reset');
      log('   Start Docker Desktop to enable containerized features', 'reset');
    }
  }
  
  log('\n✨ Installation complete! Docker check finished.\n', 'green');
}

/**
 * Performs a quick Docker availability check without detailed output
 * @returns {boolean} True if Docker is available and running
 */
function isDockerAvailable() {
  const dockerInfo = checkDockerAvailability();
  return dockerInfo && dockerInfo.status === 'available' && dockerInfo.daemon === 'running';
}

// Export functions for use in other scripts
module.exports = {
  performDockerCheck,
  checkDockerAvailability,
  isDockerAvailable
};

// Run if called directly
if (require.main === module) {
  performDockerCheck();
}