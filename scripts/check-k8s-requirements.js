#!/usr/bin/env node

/**
 * DEPRECATED: Kubernetes Requirements Check Script
 * 
 * This script has been deprecated as part of MCP tooling removal.
 * The application now runs without K8s orchestration requirements.
 */

console.log('\n⚠️  DEPRECATION NOTICE: Kubernetes functionality has been removed\n');
console.log('📝 Background:');
console.log('   This script previously set up Kubernetes clusters for MCP tooling.');
console.log('   As part of the MCP tooling removal, K8s is no longer required.\n');
console.log('✅ Current deployment options:');
console.log('   • Local development: npm run dev');
console.log('   • Production: Direct Docker deployment');
console.log('   • Cloud: Use cloud-native container services\n');
console.log('🗂️  K8s configurations preserved in k8s/ for reference\n');

// Skip the rest of the K8s setup logic
process.exit(0);

/*
 * HISTORICAL REFERENCE - The following code has been preserved but is not executed
 * 
 * This was the original K8s setup and validation logic that was used when 
 * MCP tooling required Kubernetes orchestration.
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

// ... rest of the original implementation preserved for historical reference
// (not executed due to process.exit(0) above)