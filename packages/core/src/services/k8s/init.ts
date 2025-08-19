/**
 * Kubernetes initialization module
 * Ensures K8s environment is ready before app starts
 */

import { ensureKindCluster, getClusterStatus, isDockerRunning } from './utils/cluster-setup';

export interface K8sInitOptions {
  skipSetup?: boolean;        // Skip automatic setup
  requireCluster?: boolean;   // Fail if cluster not ready
  environment?: 'development' | 'staging' | 'production';
}

/**
 * Initialize Kubernetes environment
 * This should be called during application startup
 */
export async function initializeK8sEnvironment(options: K8sInitOptions = {}): Promise<boolean> {
  const {
    skipSetup = false,
    requireCluster = true,
    environment = process.env.NODE_ENV || 'development'
  } = options;

  // In production, assume K8s is already configured
  if (environment === 'production') {
    console.log('📦 Running in production mode, validating K8s connection...');
    // Still check K8s connectivity in production
    const status = await getClusterStatus();
    if (!status.ready) {
      console.error('❌ Kubernetes cluster not accessible in production');
      return false;
    }
    return true;
  }

  // Check if we should skip setup (for CI/CD)
  if (skipSetup || process.env.SKIP_K8S_SETUP === 'true') {
    console.log('⏭️  Skipping Kubernetes setup (SKIP_K8S_SETUP=true)');
    console.warn('⚠️  K8s is required for MCP deployment - ensure cluster is ready');
    return true;
  }

  console.log('🚀 Initializing Kubernetes environment...');

  // Check Docker first
  if (!isDockerRunning()) {
    console.error('❌ Docker is not running. Please start Docker Desktop.');
    console.error('   Docker is required for Kubernetes to run locally.');
    console.error('   If running in CI/CD, set SKIP_K8S_SETUP=true');
    return false;
  }

  // Try to ensure cluster is ready
  try {
    const clusterReady = await ensureKindCluster();
    
    if (!clusterReady) {
      console.error('❌ Failed to setup Kubernetes cluster');
      console.error('   Kubernetes is required for MCP deployment');
      console.error('   Try running: pnpm run k8s:setup');
      console.error('   Or check the logs above for specific issues');
      return false;
    }

    const status = await getClusterStatus();
    console.log('✅ Kubernetes environment ready');
    console.log(`   Cluster: ${status.exists ? 'Yes' : 'No'}`);
    console.log(`   Ready: ${status.ready ? 'Yes' : 'No'}`);
    console.log(`   Ingress: ${status.ingressReady ? 'Yes' : 'No'}`);
    console.log(`   Registry: ${status.registryReady ? 'Yes' : 'No'}`);

    return true;
  } catch (error) {
    console.error('❌ Error during K8s initialization:', error);
    console.error('   Kubernetes is required for MCP deployment');
    return false;
  }
}

/**
 * Get the appropriate deployer type based on environment
 * Always returns 'kubernetes' now - no Docker fallback
 */
export function getDeployerType(): 'kubernetes' {
  // Always use Kubernetes - no fallback to Docker
  return 'kubernetes';
}

/**
 * Health check for K8s connectivity
 */
export async function checkK8sHealth(): Promise<{
  healthy: boolean;
  details: any;
}> {
  try {
    const status = await getClusterStatus();
    return {
      healthy: status.ready,
      details: {
        cluster: status.exists,
        context: status.context,
        ingress: status.ingressReady,
        registry: status.registryReady
      }
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}