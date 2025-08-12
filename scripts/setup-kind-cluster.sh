#!/bin/bash

# Setup script for local Kind cluster for Starships MCP development

set -e

# Add project's Docker wrapper to PATH if it exists
if [ -d "./.docker-bin" ]; then
    export PATH="$(pwd)/.docker-bin:$PATH"
fi

# Also add Docker to PATH if it's in common locations
if [[ "$OSTYPE" == "darwin"* ]] && [ -f "/Applications/Docker.app/Contents/Resources/bin/docker" ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
elif [ -f "/usr/local/bin/docker" ]; then
    export PATH="/usr/local/bin:$PATH"
elif [ -f "/usr/bin/docker" ]; then
    export PATH="/usr/bin:$PATH"
fi

CLUSTER_NAME="starships"
REGISTRY_NAME="starships-registry"
REGISTRY_PORT="5001"

echo "🚀 Setting up Kind cluster for Starships development..."

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo "❌ kind is not installed. Please install it first:"
    echo "   brew install kind"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed. Please install it first:"
    echo "   brew install kubectl"
    exit 1
fi

# Check if cluster already exists
if kind get clusters | grep -q "^${CLUSTER_NAME}$"; then
    echo "⚠️  Cluster '${CLUSTER_NAME}' already exists."
    read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Deleting existing cluster..."
        kind delete cluster --name ${CLUSTER_NAME}
    else
        echo "✅ Using existing cluster"
        kubectl config use-context kind-${CLUSTER_NAME}
        exit 0
    fi
fi

# Create kind cluster configuration
cat <<EOF > /tmp/kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ${CLUSTER_NAME}
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
- role: worker
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry]
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors]
      [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:${REGISTRY_PORT}"]
        endpoint = ["http://${REGISTRY_NAME}:5000"]
EOF

# Create the cluster
echo "📦 Creating Kind cluster '${CLUSTER_NAME}'..."
kind create cluster --config=/tmp/kind-config.yaml

# Setup local Docker registry
echo "🐳 Setting up local Docker registry..."
if ! docker ps | grep -q ${REGISTRY_NAME}; then
    docker run -d --restart=always \
        -p "127.0.0.1:${REGISTRY_PORT}:5000" \
        --network bridge \
        --name "${REGISTRY_NAME}" \
        registry:2
fi

# Connect registry to kind network
if [ "$(docker inspect -f='{{json .NetworkSettings.Networks.kind}}' "${REGISTRY_NAME}")" = 'null' ]; then
    docker network connect "kind" "${REGISTRY_NAME}" || true
fi

# Document the registry
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:${REGISTRY_PORT}"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

# Install NGINX Ingress Controller
echo "🔧 Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress to be ready
echo "⏳ Waiting for ingress controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# Create default storage class for local development
echo "💾 Creating local storage class..."
cat <<EOF | kubectl apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: standard
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: rancher.io/local-path
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
EOF

# Create data directory if it doesn't exist
if [ ! -d "./data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p ./data/starships
fi

# Set context
kubectl config use-context kind-${CLUSTER_NAME}

# Verify setup
echo ""
echo "✅ Kind cluster setup complete!"
echo ""
echo "Cluster Information:"
echo "  - Name: ${CLUSTER_NAME}"
echo "  - Context: kind-${CLUSTER_NAME}"
echo "  - Registry: localhost:${REGISTRY_PORT}"
echo "  - Ingress: http://localhost (port 80)"
echo ""
echo "Useful commands:"
echo "  - View cluster: kubectl cluster-info"
echo "  - View nodes: kubectl get nodes"
echo "  - View all resources: kubectl get all -A"
echo "  - Delete cluster: kind delete cluster --name ${CLUSTER_NAME}"
echo ""
echo "To use local registry for images:"
echo "  - Tag: localhost:${REGISTRY_PORT}/image-name:tag"
echo "  - Push: docker push localhost:${REGISTRY_PORT}/image-name:tag"
echo "  - Use in K8s: localhost:${REGISTRY_PORT}/image-name:tag"
echo ""

# Cleanup temp file
rm -f /tmp/kind-config.yaml