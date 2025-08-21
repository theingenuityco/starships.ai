#!/bin/bash
set -e

# AWS EKS Deployment Script for Starships.AI
# Usage: ./deploy.sh [dev|staging|production]

ENVIRONMENT=${1:-production}
NAMESPACE="starships-ai"
CLUSTER_NAME="your-eks-cluster"  # Replace with your EKS cluster name
AWS_REGION="us-west-2"  # Replace with your AWS region
DOMAIN="starships.yourdomain.com"  # Replace with your domain

echo "🚀 Deploying Starships.AI to AWS EKS"
echo "====================================="
echo "Environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"
echo "Cluster: $CLUSTER_NAME"
echo "Region: $AWS_REGION"

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        echo "❌ kubectl not found. Please install kubectl."
        exit 1
    fi
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo "❌ AWS CLI not found. Please install AWS CLI."
        exit 1
    fi
    
    # Check eksctl (optional but recommended)
    if ! command -v eksctl &> /dev/null; then
        echo "⚠️  eksctl not found. Consider installing eksctl for easier EKS management."
    fi
    
    echo "✅ Prerequisites check passed"
}

# Configure kubectl for EKS
configure_kubectl() {
    echo "Configuring kubectl for EKS..."
    aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME
    
    # Verify connection
    if kubectl cluster-info &> /dev/null; then
        echo "✅ Connected to EKS cluster"
    else
        echo "❌ Failed to connect to EKS cluster"
        exit 1
    fi
}

# Install AWS Load Balancer Controller (required for ALB Ingress)
install_alb_controller() {
    echo "Checking AWS Load Balancer Controller..."
    
    if kubectl get deployment -n kube-system aws-load-balancer-controller &> /dev/null; then
        echo "✅ AWS Load Balancer Controller already installed"
    else
        echo "Installing AWS Load Balancer Controller..."
        
        # Install cert-manager
        kubectl apply --validate=false -f https://github.com/jetstack/cert-manager/releases/download/v1.5.4/cert-manager.yaml
        
        # Wait for cert-manager
        kubectl wait --for=condition=Available --timeout=300s deployment/cert-manager-webhook -n cert-manager
        
        # Download and install AWS Load Balancer Controller
        curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.4/docs/install/iam_policy.json
        
        # Create IAM policy (requires AWS CLI configured with appropriate permissions)
        aws iam create-policy \
            --policy-name AWSLoadBalancerControllerIAMPolicy \
            --policy-document file://iam_policy.json 2>/dev/null || true
        
        # Install the controller using Helm
        helm repo add eks https://aws.github.io/eks-charts
        helm repo update
        helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
            -n kube-system \
            --set clusterName=$CLUSTER_NAME \
            --set serviceAccount.create=false \
            --set serviceAccount.name=aws-load-balancer-controller
        
        echo "✅ AWS Load Balancer Controller installed"
    fi
}

# Create namespace
create_namespace() {
    echo "Creating namespace..."
    kubectl apply -f k8s/base/namespace.yaml
    echo "✅ Namespace created/updated"
}

# Create secrets
create_secrets() {
    echo "Creating secrets..."
    
    if [ ! -f "k8s/base/secrets.yaml" ]; then
        echo "❌ secrets.yaml not found!"
        echo "Please create k8s/base/secrets.yaml from secrets.yaml.template"
        exit 1
    fi
    
    kubectl apply -f k8s/base/secrets.yaml
    echo "✅ Secrets created/updated"
}

# Deploy application
deploy_application() {
    echo "Deploying application..."
    
    # Apply base configurations
    kubectl apply -f k8s/base/rbac.yaml
    kubectl apply -f k8s/base/configmap.yaml
    kubectl apply -f k8s/base/persistent-volumes.yaml
    kubectl apply -f k8s/base/deployment.yaml
    kubectl apply -f k8s/base/service.yaml
    kubectl apply -f k8s/base/hpa.yaml
    
    # Update ingress with actual domain and certificate
    sed "s/starships.yourdomain.com/$DOMAIN/g" k8s/base/ingress.yaml | \
    sed "s/\${ACM_CERTIFICATE_ARN}/$ACM_CERTIFICATE_ARN/g" | \
    kubectl apply -f -
    
    echo "✅ Application deployed"
}

# Wait for deployment
wait_for_deployment() {
    echo "Waiting for deployment to be ready..."
    kubectl rollout status deployment/starships-app -n $NAMESPACE --timeout=600s
    echo "✅ Deployment ready"
}

# Get load balancer URL
get_load_balancer_url() {
    echo "Getting load balancer URL..."
    
    # Wait for ingress to be ready
    sleep 30
    
    LB_URL=$(kubectl get ingress starships-ingress -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")
    
    if [ -z "$LB_URL" ]; then
        echo "⚠️  Load balancer URL not yet available. Check later with:"
        echo "kubectl get ingress starships-ingress -n $NAMESPACE"
    else
        echo "✅ Application available at:"
        echo "   http://$LB_URL"
        echo "   https://$DOMAIN (after DNS configuration)"
    fi
}

# Main deployment flow
main() {
    check_prerequisites
    configure_kubectl
    install_alb_controller
    create_namespace
    create_secrets
    deploy_application
    wait_for_deployment
    get_load_balancer_url
    
    echo ""
    echo "🎉 Deployment complete!"
    echo ""
    echo "Next steps:"
    echo "1. Configure your DNS to point $DOMAIN to the ALB"
    echo "2. Ensure ACM certificate is valid for $DOMAIN"
    echo "3. Monitor the application:"
    echo "   kubectl get pods -n $NAMESPACE"
    echo "   kubectl logs -f deployment/starships-app -n $NAMESPACE"
    echo "4. Scale if needed:"
    echo "   kubectl scale deployment/starships-app --replicas=3 -n $NAMESPACE"
}

# Run main function
main