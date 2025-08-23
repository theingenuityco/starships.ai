#!/bin/bash

echo "Setting up SSL for starships.ai"

# Install cert-manager in the cluster
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Wait for cert-manager to be ready
echo "Waiting for cert-manager to be ready..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=cert-manager -n cert-manager --timeout=60s

# Create Let's Encrypt issuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com  # CHANGE THIS
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Create ingress with SSL
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-ingress
  namespace: starships-prod
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - starships.ai
    - www.starships.ai
    - api.starships.ai
    secretName: starships-tls
  rules:
  - host: starships.ai
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-lb
            port:
              number: 80
  - host: www.starships.ai
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-lb
            port:
              number: 80
  - host: api.starships.ai
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: starships-lb
            port:
              number: 4000
EOF

echo "SSL setup complete!"