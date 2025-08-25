#!/usr/bin/env tsx

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Checks if a Docker image exists locally
 */
function dockerImageExists(imageName: string): boolean {
  try {
    const output = execSync(`docker images -q ${imageName}`, { encoding: 'utf-8' });
    return output.trim().length > 0;
  } catch (error) {
    console.error(`Error checking for Docker image ${imageName}:`, error);
    return false;
  }
}

/**
 * Docker image management utilities
 * MCP functionality has been removed - this is now a no-op
 */
export async function ensureDockerImages() {
  // Skip Docker checks in dev mode
  if (process.env.SKIP_K8S_CHECK === 'true') {
    console.log('⚡ Skipping Docker image checks (SKIP_K8S_CHECK=true)');
    return;
  }
  
  console.log('🐳 Docker image checks completed (no images to build)');
  // MCP functionality removed - no Docker images to build
}

// Run if this script is executed directly
if (require.main === module) {
  ensureDockerImages()
    .then(() => {
      console.log('✅ Docker images check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Docker images check failed:', error);
      process.exit(1);
    });
}