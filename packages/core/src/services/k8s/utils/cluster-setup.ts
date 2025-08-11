/**
 * Kubernetes cluster setup utilities
 * Ensures local development environment is ready
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as k8s from '@kubernetes/client-node';

const CLUSTER_NAME = 'starships';
const REGISTRY_NAME = 'starships-registry';
const REGISTRY_PORT = '5001';

export interface ClusterStatus {
  exists: boolean;
  ready: boolean;
  context: string;
  ingressReady: boolean;
  registryReady: boolean;
}

/**
 * Check if a command exists
 */
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is running
 */
export function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Kind cluster exists
 */
export function kindClusterExists(): boolean {
  try {
    const clusters = execSync('kind get clusters', { encoding: 'utf8' });
    return clusters.includes(CLUSTER_NAME);
  } catch {
    return false;
  }
}

/**
 * Get cluster status
 */
export async function getClusterStatus(): Promise<ClusterStatus> {
  const status: ClusterStatus = {
    exists: false,
    ready: false,
    context: '',
    ingressReady: false,
    registryReady: false
  };

  // Check if cluster exists
  status.exists = kindClusterExists();
  if (!status.exists) {
    return status;
  }

  // Check Kubernetes connectivity
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    status.context = kc.getCurrentContext();
    
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    await k8sApi.listNode();
    status.ready = true;
  } catch {
    return status;
  }

  // Check ingress controller
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    
    const pods = await k8sApi.listNamespacedPod('ingress-nginx');
    status.ingressReady = pods.body.items.some(pod => 
      pod.status?.phase === 'Running' && 
      pod.metadata?.name?.includes('controller')
    );
  } catch {
    status.ingressReady = false;
  }

  // Check registry
  try {
    execSync(`docker ps | grep ${REGISTRY_NAME}`, { stdio: 'ignore' });
    status.registryReady = true;
  } catch {
    status.registryReady = false;
  }

  return status;
}

/**
 * Ensure Kind cluster is ready for development
 */
export async function ensureKindCluster(): Promise<boolean> {
  console.log('🔍 Checking Kubernetes development environment...');

  // Check Docker
  if (!isDockerRunning()) {
    console.error('❌ Docker is not running. Please start Docker Desktop.');
    return false;
  }

  // Check required tools
  const requiredTools = ['kind', 'kubectl'];
  for (const tool of requiredTools) {
    if (!commandExists(tool)) {
      console.error(`❌ ${tool} is not installed. Please install it first.`);
      console.log(`   For macOS: brew install ${tool}`);
      console.log(`   For others: See https://kubernetes.io/docs/tasks/tools/`);
      return false;
    }
  }

  // Check cluster status
  const status = await getClusterStatus();
  
  if (!status.exists) {
    console.log(`⚠️  Kind cluster '${CLUSTER_NAME}' not found.`);
    console.log('   Creating cluster (this may take a few minutes)...');
    
    const setupScript = path.join(__dirname, '../../../../scripts/setup-kind-cluster.sh');
    if (!fs.existsSync(setupScript)) {
      console.error('❌ Setup script not found');
      return false;
    }

    try {
      execSync(`bash ${setupScript}`, { stdio: 'inherit' });
      console.log('✅ Kind cluster created successfully');
    } catch (error) {
      console.error('❌ Failed to create Kind cluster');
      return false;
    }
  } else {
    console.log(`✅ Kind cluster '${CLUSTER_NAME}' exists`);
  }

  // Verify final status
  const finalStatus = await getClusterStatus();
  if (!finalStatus.ready) {
    console.error('❌ Cluster is not ready');
    return false;
  }

  if (!finalStatus.ingressReady) {
    console.log('⚠️  Installing NGINX Ingress Controller...');
    try {
      execSync('kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml', 
        { stdio: 'ignore' });
      
      // Wait for ingress to be ready
      console.log('   Waiting for ingress controller...');
      execSync('kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=90s',
        { stdio: 'ignore' });
      console.log('✅ NGINX Ingress Controller installed');
    } catch {
      console.warn('⚠️  Ingress controller installation may have issues');
    }
  }

  console.log('✅ Kubernetes development environment is ready!');
  console.log(`   Context: ${finalStatus.context}`);
  console.log(`   Registry: localhost:${REGISTRY_PORT}`);
  
  return true;
}

/**
 * Setup local registry for Kind
 */
export async function setupLocalRegistry(): Promise<boolean> {
  try {
    // Check if registry exists
    const registryExists = execSync(`docker ps -a | grep ${REGISTRY_NAME}`, { encoding: 'utf8' });
    
    if (!registryExists) {
      console.log('📦 Creating local Docker registry...');
      execSync(
        `docker run -d --restart=always -p "127.0.0.1:${REGISTRY_PORT}:5000" --network bridge --name "${REGISTRY_NAME}" registry:2`,
        { stdio: 'ignore' }
      );
    }

    // Connect to kind network
    try {
      execSync(`docker network connect kind "${REGISTRY_NAME}"`, { stdio: 'ignore' });
    } catch {
      // Already connected
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to setup local registry');
    return false;
  }
}

/**
 * Get Kubernetes client configuration
 */
export function getKubeConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  
  // Ensure we're using the right context
  const contexts = kc.getContexts();
  const kindContext = contexts.find(c => c.name === `kind-${CLUSTER_NAME}`);
  
  if (kindContext) {
    kc.setCurrentContext(kindContext.name);
  }
  
  return kc;
}

/**
 * Check if running in Kubernetes cluster
 */
export function isInCluster(): boolean {
  return fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token');
}

/**
 * Get appropriate Kubernetes configuration
 */
export function getK8sConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  
  if (isInCluster()) {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
    
    // In development, ensure we're using Kind cluster
    if (process.env.NODE_ENV !== 'production') {
      const contexts = kc.getContexts();
      const kindContext = contexts.find(c => c.name === `kind-${CLUSTER_NAME}`);
      if (kindContext) {
        kc.setCurrentContext(kindContext.name);
      }
    }
  }
  
  return kc;
}