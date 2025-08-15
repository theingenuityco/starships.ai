#!/bin/bash

# Quick Kind cluster setup without prompts

set -e

export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"

CLUSTER_NAME="starships"
REGISTRY_NAME="starships-registry"
REGISTRY_PORT="5001"

echo "🚀 Quick Kind cluster setup..."

# Check if cluster exists
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    echo "✅ Cluster '${CLUSTER_NAME}' already exists"
    kubectl config use-context kind-${CLUSTER_NAME}
else
    echo "📦 Creating Kind cluster '${CLUSTER_NAME}'..."
    
    # Create config
    cat <<EOF > /tmp/kind-config-quick.yaml
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
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry]
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors]
      [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:5001"]
        endpoint = ["http://starships-registry:5000"]
EOF

    # Create cluster
    kind create cluster --config=/tmp/kind-config-quick.yaml
    rm -f /tmp/kind-config-quick.yaml
    
    echo "✅ Cluster created"
fi

# Setup registry
if ! docker ps | grep -q ${REGISTRY_NAME}; then
    echo "🐳 Starting registry..."
    docker run -d --restart=always -p "127.0.0.1:${REGISTRY_PORT}:5000" --name "${REGISTRY_NAME}" registry:2
fi

# Connect to kind network
docker network connect "kind" "${REGISTRY_NAME}" 2>/dev/null || true

# Install ingress
echo "🔧 Setting up ingress..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml 2>/dev/null || true

echo "✅ Setup complete!"
echo "   Cluster: ${CLUSTER_NAME}"
echo "   Registry: localhost:${REGISTRY_PORT}"