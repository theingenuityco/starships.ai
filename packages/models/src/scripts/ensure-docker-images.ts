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
 * Builds the MCP HTTP Bridge Docker image if it doesn't exist
 */
export async function ensureDockerImages() {
  // Skip Docker checks in dev mode
  if (process.env.SKIP_K8S_CHECK === 'true') {
    console.log('⚡ Skipping Docker image checks (SKIP_K8S_CHECK=true)');
    return;
  }
  
  console.log('🐳 Checking required Docker images...');

  const requiredImages = [
    {
      name: 'starships/mcp-http-bridge:latest',
      buildScript: path.resolve(__dirname, '../../../core/docker/mcp-http-bridge/build.sh'),
      description: 'MCP HTTP Bridge'
    }
  ];

  for (const image of requiredImages) {
    if (dockerImageExists(image.name)) {
      console.log(`✅ ${image.description} image exists: ${image.name}`);
    } else {
      console.log(`⚠️  ${image.description} image not found: ${image.name}`);
      console.log(`🔨 Building ${image.description} image...`);

      if (!fs.existsSync(image.buildScript)) {
        console.error(`❌ Build script not found: ${image.buildScript}`);
        continue;
      }

      try {
        // Make build script executable
        execSync(`chmod +x "${image.buildScript}"`, { stdio: 'inherit' });
        
        // Run build script
        execSync(`"${image.buildScript}"`, { 
          stdio: 'inherit',
          cwd: path.dirname(image.buildScript)
        });
        
        console.log(`✅ Successfully built ${image.description} image`);
      } catch (error) {
        console.error(`❌ Failed to build ${image.description} image:`, error);
        console.error('   Please run the build script manually:');
        console.error(`   ${image.buildScript}`);
        // Don't throw - server can still start
      }
    }
  }

  console.log('🐳 Docker image check complete');
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