#!/usr/bin/env node

/**
 * Ensures MCP HTTP Bridge image is available in local registry
 * This prevents ImagePullBackOff errors in Kubernetes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

function execCommand(command, silent = false) {
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit'
    });
    return output;
  } catch (error) {
    if (!silent) {
      log(`❌ Command failed: ${command}`, colors.red);
    }
    throw error;
  }
}

function findDockerCommand() {
  const possiblePaths = [
    'docker',
    '/usr/local/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/opt/homebrew/bin/docker',
    process.env.DOCKER_PATH,
  ].filter(Boolean);

  for (const dockerPath of possiblePaths) {
    try {
      execCommand(`${dockerPath} --version`, true);
      return dockerPath;
    } catch (e) {
      // Continue to next path
    }
  }
  
  throw new Error('Docker not found. Please ensure Docker Desktop is installed and running.');
}

function isRegistryRunning() {
  try {
    execCommand('curl -s http://localhost:5001/v2/', true);
    return true;
  } catch (e) {
    return false;
  }
}

function isImageInRegistry(imageName) {
  try {
    const catalog = execCommand('curl -s http://localhost:5001/v2/_catalog', true);
    return catalog.includes('mcp-http-bridge');
  } catch (e) {
    return false;
  }
}

async function ensureMCPImage() {
  log('\n🔍 Checking MCP HTTP Bridge image status...', colors.bright);
  
  let hasErrors = false;
  
  // Step 1: Find Docker
  let docker;
  try {
    docker = findDockerCommand();
    log(`✅ Docker found at: ${docker}`, colors.green);
  } catch (error) {
    log(error.message, colors.red);
    throw error; // Critical error - can't continue without Docker
  }

  // Step 2: Check if registry is running
  if (!isRegistryRunning()) {
    log('⚠️  Local registry not running at localhost:5001', colors.yellow);
    log('   Starting registry container...', colors.blue);
    
    try {
      execCommand(`${docker} run -d --name starships-registry -p 5001:5000 --restart=always registry:2`, true);
      log('✅ Registry started', colors.green);
    } catch (e) {
      // Registry might already exist but be stopped
      try {
        execCommand(`${docker} start starships-registry`, true);
        log('✅ Registry restarted', colors.green);
      } catch (e2) {
        log('❌ Could not start registry', colors.red);
        hasErrors = true;
      }
    }
  } else {
    log('✅ Local registry is running', colors.green);
  }

  // Step 3: Check if MCP image exists locally
  log('\n📦 Checking for MCP HTTP Bridge image...', colors.bright);
  
  let imageExists = false;
  let imageName = 'starships/mcp-http-bridge:latest';
  
  try {
    const images = execCommand(`${docker} images --format "{{.Repository}}:{{.Tag}}" | grep mcp-http-bridge || true`, true);
    if (images.includes('mcp-http-bridge')) {
      imageExists = true;
      // Get the exact image name
      const lines = images.split('\n').filter(line => line.includes('mcp-http-bridge'));
      if (lines.length > 0) {
        imageName = lines[0].trim();
      }
      log(`✅ Found local image: ${imageName}`, colors.green);
    }
  } catch (e) {
    // Image doesn't exist
  }

  if (!imageExists) {
    log('⚠️  MCP HTTP Bridge image not found locally', colors.yellow);
    log('   Building image...', colors.blue);
    
    // Check if Dockerfile exists
    const dockerfilePath = path.join(__dirname, '..', 'packages', 'core', 'docker', 'mcp-http-bridge', 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      const buildContext = path.dirname(dockerfilePath);
      try {
        execCommand(`${docker} build -t ${imageName} ${buildContext}`);
        log('✅ Image built successfully', colors.green);
      } catch (error) {
        log(`❌ Failed to build image from Dockerfile: ${error.message}`, colors.red);
        hasErrors = true;
      }
    } else {
      log('⚠️  No Dockerfile found for MCP HTTP Bridge', colors.yellow);
      log('   Using a default Node.js image as placeholder...', colors.blue);
      
      // Create a minimal MCP HTTP Bridge image
      const tempDir = path.join(__dirname, '..', '.tmp-mcp-build');
      fs.mkdirSync(tempDir, { recursive: true });
      
      try {
        // Create server.js file first
        const serverJs = `
const express = require('express');
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-http-bridge' });
});

// MCP Bridge endpoints
app.all('*', (req, res) => {
  console.log('MCP Bridge Request:', req.method, req.path);
  res.json({ 
    status: 'ok', 
    message: 'MCP HTTP Bridge placeholder',
    method: req.method,
    path: req.path,
    body: req.body
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(\`MCP HTTP Bridge running on port \${port}\`);
  console.log('This is a placeholder image - replace with actual MCP bridge implementation');
});
`;
        
        fs.writeFileSync(path.join(tempDir, 'server.js'), serverJs);
        
        // Create package.json
        const packageJson = {
          name: 'mcp-http-bridge',
          version: '1.0.0',
          description: 'MCP HTTP Bridge placeholder',
          main: 'server.js',
          scripts: {
            start: 'node server.js'
          },
          dependencies: {
            express: '^4.18.0'
          }
        };
        
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
        
        // Create Dockerfile
        const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY server.js .
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
CMD ["node", "server.js"]`;
        
        fs.writeFileSync(path.join(tempDir, 'Dockerfile'), dockerfile);
        
        // Build the image
        execCommand(`${docker} build -t ${imageName} ${tempDir}`);
        log('✅ Placeholder image created', colors.green);
        
      } catch (error) {
        log(`❌ Failed to build placeholder image: ${error.message}`, colors.red);
        hasErrors = true;
      } finally {
        // Always cleanup temp directory
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  // Only proceed if we have an image
  if (!hasErrors || imageExists) {
    // Step 4: Tag image for registry
    log('\n🏷️  Tagging image for local registry...', colors.bright);
    const registryImage = `localhost:5001/${imageName}`;
    
    try {
      execCommand(`${docker} tag ${imageName} ${registryImage}`, true);
      log(`✅ Tagged as: ${registryImage}`, colors.green);
    } catch (e) {
      log(`❌ Failed to tag image: ${e.message}`, colors.red);
      hasErrors = true;
    }

    // Step 5: Push to registry
    if (!hasErrors) {
      log('\n📤 Pushing image to local registry...', colors.bright);
      
      try {
        execCommand(`${docker} push ${registryImage}`);
        log('✅ Image pushed to registry successfully', colors.green);
      } catch (e) {
        log(`❌ Failed to push image: ${e.message}`, colors.red);
        hasErrors = true;
      }
    }

    // Step 6: Verify image is in registry
    if (!hasErrors && isImageInRegistry('mcp-http-bridge')) {
      log('\n✅ MCP HTTP Bridge image is ready in registry!', colors.green);
      log(`   Image: ${registryImage}`, colors.blue);
      
      // Check if any pods need restarting
      try {
        const pods = execCommand('kubectl get pods -A -o json 2>/dev/null | grep mcp-http-bridge || true', true);
        if (pods.includes('ImagePullBackOff') || pods.includes('ErrImagePull')) {
          log('\n🔄 Found pods with image pull errors, restarting...', colors.yellow);
          execCommand('kubectl delete pods -A -l app=mcp-notionapi --force --grace-period=0 2>/dev/null || true', true);
          log('✅ Pods will be recreated with the correct image', colors.green);
        }
      } catch (e) {
        // Kubectl might not be available, that's ok
      }
    }
  }

  // Final status
  if (hasErrors) {
    log('\n❌ MCP image setup failed!', colors.red);
    log('   Please check the errors above and fix them manually.', colors.yellow);
    log('   You can retry by running: node scripts/ensure-mcp-image.js', colors.yellow);
    throw new Error('MCP image setup failed - build should not continue');
  } else {
    log('\n✅ MCP image setup completed successfully!', colors.green);
  }
}

// Run if called directly
if (require.main === module) {
  ensureMCPImage().catch(error => {
    log(`\n❌ Error: ${error.message}`, colors.red);
    process.exit(1);
  });
}

module.exports = { ensureMCPImage };