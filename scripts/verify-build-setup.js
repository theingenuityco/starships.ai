#!/usr/bin/env node

/**
 * Verification script to test Docker setup across different scenarios
 * This helps ensure the build will work for all co-developers
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

function testScenario(name, testFn) {
  log(`\n📋 Testing: ${name}`, 'cyan');
  try {
    const result = testFn();
    if (result) {
      log(`   ✅ PASS`, 'green');
      return true;
    } else {
      log(`   ❌ FAIL`, 'red');
      return false;
    }
  } catch (error) {
    log(`   ❌ ERROR: ${error.message}`, 'red');
    return false;
  }
}

function main() {
  log('\n🔍 Starships Build Setup Verification\n', 'bright');
  log(`Platform: ${os.platform()}`, 'blue');
  log(`Architecture: ${os.arch()}`, 'blue');
  log(`Node Version: ${process.version}`, 'blue');
  
  const results = [];
  
  // Test 1: Check if setup-docker-path.js exists
  results.push(testScenario('setup-docker-path.js exists', () => {
    return fs.existsSync(path.join(__dirname, 'setup-docker-path.js'));
  }));
  
  // Test 2: Check if Docker can be found
  results.push(testScenario('Docker detection works', () => {
    const { findDocker } = require('./setup-docker-path');
    const docker = findDocker();
    if (docker) {
      log(`      Found at: ${docker.path}`, 'cyan');
      log(`      In PATH: ${docker.inPath}`, 'cyan');
      return true;
    }
    return false;
  }));
  
  // Test 3: Check wrapper creation
  results.push(testScenario('Docker wrapper can be created', () => {
    const wrapperDir = path.join(process.cwd(), '.docker-bin');
    const wrapperPath = path.join(wrapperDir, 'docker');
    const batPath = path.join(wrapperDir, 'docker.bat');
    
    // Check if wrapper exists or can be created
    if (fs.existsSync(wrapperPath) || fs.existsSync(batPath)) {
      log(`      Wrapper exists`, 'cyan');
      return true;
    }
    
    // Try to create it
    try {
      execSync('node scripts/setup-docker-path.js', { stdio: 'ignore' });
      return fs.existsSync(wrapperPath) || fs.existsSync(batPath);
    } catch {
      return false;
    }
  }));
  
  // Test 4: Check if Docker is running
  results.push(testScenario('Docker daemon is accessible', () => {
    const possibleCommands = [
      'docker info',
      '.docker-bin/docker info',
      '/Applications/Docker.app/Contents/Resources/bin/docker info'
    ];
    
    for (const cmd of possibleCommands) {
      try {
        execSync(cmd, { stdio: 'ignore', cwd: process.cwd() });
        log(`      Working command: ${cmd}`, 'cyan');
        return true;
      } catch {
        // Continue trying
      }
    }
    return false;
  }));
  
  // Test 5: Check Kubernetes tools
  results.push(testScenario('kind is installed', () => {
    try {
      execSync('kind --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }));
  
  results.push(testScenario('kubectl is installed', () => {
    try {
      execSync('kubectl version --client', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }));
  
  // Test 6: Check if .gitignore includes .docker-bin
  results.push(testScenario('.docker-bin is in .gitignore', () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      return content.includes('.docker-bin');
    }
    return false;
  }));
  
  // Test 7: Check package.json scripts
  results.push(testScenario('package.json has required scripts', () => {
    const packageJson = require('../package.json');
    const requiredScripts = ['setup', 'setup:docker', 'prebuild', 'build'];
    const hasAll = requiredScripts.every(script => packageJson.scripts[script]);
    if (hasAll) {
      log(`      Scripts found: ${requiredScripts.join(', ')}`, 'cyan');
    }
    return hasAll;
  }));
  
  // Summary
  log('\n📊 Verification Summary', 'bright');
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    log(`\n✅ All ${total} tests passed!`, 'green');
    log('Your build setup is ready for all co-developers.', 'green');
  } else {
    log(`\n⚠️  ${passed}/${total} tests passed`, 'yellow');
    log('\nTo fix issues, run:', 'cyan');
    log('  pnpm run setup', 'cyan');
  }
  
  // Platform-specific recommendations
  log('\n💡 Platform-Specific Notes:', 'bright');
  
  if (os.platform() === 'darwin') {
    log('  macOS:', 'cyan');
    log('  - Docker Desktop should be installed in /Applications', 'reset');
    log('  - Or installed via Homebrew: brew install --cask docker', 'reset');
  } else if (os.platform() === 'win32') {
    log('  Windows:', 'cyan');
    log('  - Docker Desktop for Windows required', 'reset');
    log('  - WSL2 backend recommended', 'reset');
    log('  - Run from Git Bash or PowerShell', 'reset');
  } else {
    log('  Linux:', 'cyan');
    log('  - Docker can be installed via package manager', 'reset');
    log('  - User should be in docker group: sudo usermod -aG docker $USER', 'reset');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Run verification
main();