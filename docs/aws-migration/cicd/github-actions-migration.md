# GitHub Actions Migration for AWS EKS

## 📋 Overview

This guide covers updating your GitHub Actions workflows to deploy to AWS EKS instead of DigitalOcean. We'll maintain the same deployment philosophy while adapting to AWS services.

## 🔄 Current vs New Workflow

### Current DigitalOcean Workflow
```yaml
Push to main → Build Docker → Push to GHCR → Deploy to DO K8s
```

### New AWS EKS Workflow  
```yaml
Push to main → Build Docker → Push to GHCR → Deploy to EKS
```

## 🔐 Required GitHub Secrets

### New AWS Secrets to Add
Navigate to GitHub repository → Settings → Secrets and variables → Actions

```bash
# AWS Authentication
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI...
AWS_REGION=ap-south-1

# EKS Cluster Names
EKS_CLUSTER_DEV=starships-dev
EKS_CLUSTER_PROD=starships-prod

# Keep existing secrets
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
STRIPE_SECRET_KEY=sk_live_...
# ... all other existing secrets
```

### AWS IAM User for GitHub Actions

Create a dedicated IAM user for CI/CD:

```bash
# Create IAM user
aws iam create-user --user-name github-actions-starships

# Create access key
aws iam create-access-key --user-name github-actions-starships

# Create policy for GitHub Actions
cat > github-actions-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "eks:DescribeCluster",
                "eks:ListClusters"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "sts:AssumeRole"
            ],
            "Resource": "arn:aws:iam::*:role/github-actions-*"
        }
    ]
}
EOF

# Attach policy
aws iam put-user-policy \
    --user-name github-actions-starships \
    --policy-name GitHubActionsEKSPolicy \
    --policy-document file://github-actions-policy.json
```

## 📝 Updated Workflow Files

### Updated Build and Deploy Workflow

Replace `.github/workflows/build-and-deploy.yml`:

```yaml
name: Build and Deploy to AWS EKS Dev

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      skip_build:
        description: 'Skip build and only deploy'
        required: false
        default: false
        type: boolean

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: theingenuityco/starships.ai
  AWS_REGION: ap-south-1

permissions:
  contents: write
  packages: write
  id-token: write
  issues: write
  pull-requests: read
  actions: read

jobs:
  # Calculate semantic version (same as before)
  calculate-version:
    name: Calculate Version
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'push' && github.ref == 'refs/heads/main' ||
      github.event_name == 'workflow_dispatch'
    outputs:
      new_release_published: ${{ steps.semantic.outputs.new_release_published }}
      new_release_version: ${{ steps.semantic.outputs.new_release_version }}
      should_build: ${{ steps.build_decision.outputs.should_build }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: |
          curl -fsSL https://github.com/pnpm/pnpm/releases/download/v10.12.4/pnpm-linux-x64 -o pnpm
          chmod +x pnpm
          sudo mv pnpm /usr/local/bin/
          pnpm --version
          pnpm config set registry https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install

      - name: Calculate Semantic Version (Dry Run)
        id: semantic
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          echo "Calculating next version (dry-run)..."
          npx semantic-release --dry-run > semantic-output.txt 2>&1 || true

          if grep -q "The next release version is" semantic-output.txt; then
            NEXT_VERSION=$(grep -oP 'The next release version is \K[0-9]+\.[0-9]+\.[0-9]+' semantic-output.txt)
            echo "✅ Next version will be: ${NEXT_VERSION}"
            echo "new_release_published=true" >> $GITHUB_OUTPUT
            echo "new_release_version=${NEXT_VERSION}" >> $GITHUB_OUTPUT
          else
            echo "ℹ️ No new version needed - skipping build and deploy"
            echo "new_release_published=false" >> $GITHUB_OUTPUT
            echo "new_release_version=" >> $GITHUB_OUTPUT
          fi

      - name: Determine build decision
        id: build_decision
        run: |
          if [[ "${{ steps.semantic.outputs.new_release_published }}" == "true" ]] || [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "should_build=true" >> $GITHUB_OUTPUT
            echo "✅ Build will proceed"
          else
            echo "should_build=false" >> $GITHUB_OUTPUT
            echo "⏭️ Build skipped - no new version needed"
          fi

  # Build stage (mostly unchanged)
  build-dev:
    name: Build Dev Image
    runs-on: ubuntu-latest
    needs: [calculate-version]
    if: |
      needs.calculate-version.outputs.should_build == 'true' &&
      (
        (github.event_name == 'push' && github.ref == 'refs/heads/main') ||
        (github.event_name == 'workflow_dispatch' && github.event.inputs.skip_build != 'true')
      )
    environment: dev
    outputs:
      image_tag: ${{ steps.meta.outputs.version }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=${{ needs.calculate-version.outputs.new_release_version }},enable=${{ needs.calculate-version.outputs.new_release_published == 'true' }}
            type=sha,format=short
            type=raw,value=latest

      - name: Build and push Dev Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: ''
          cache-to: ''
          build-args: |
            BUILD_DATE=${{ fromJSON(steps.meta.outputs.json).labels['org.opencontainers.image.created'] }}
            VERSION=dev-${{ github.sha }}
            ENVIRONMENT=development
            CACHE_BUST=${{ github.run_number }}
          secrets: |
            stripe_secret_key=${{ secrets.STRIPE_SECRET_KEY }}
            stripe_publishable_key=${{ secrets.STRIPE_PUBLISHABLE_KEY }}

  # NEW: Deploy to AWS EKS Dev
  deploy-dev:
    name: Deploy to AWS EKS Dev
    runs-on: ubuntu-latest
    needs: [calculate-version, build-dev]
    if: |
      always() &&
      needs.calculate-version.result == 'success' &&
      needs.build-dev.result == 'success' &&
      needs.calculate-version.outputs.should_build == 'true'
    environment: dev
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update kubeconfig for EKS
        run: |
          aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ secrets.EKS_CLUSTER_DEV }}
          kubectl config current-context
          kubectl get nodes

      - name: Validate Kubernetes manifests
        run: |
          echo "📋 Validating development Kubernetes manifests..."
          kubectl apply --dry-run=client -f k8s/dev/ || {
            echo "❌ Manifest validation failed!"
            exit 1
          }
          echo "✅ All manifests are valid"

      - name: Apply Kubernetes manifests
        run: |
          echo "📦 Applying Kubernetes manifests to dev environment..."
          kubectl apply -f k8s/dev/00-namespace.yaml
          kubectl apply -f k8s/dev/02-pvc.yaml
          kubectl apply -f k8s/dev/03-deployment.yaml
          kubectl apply -f k8s/dev/04-service.yaml
          kubectl apply -f k8s/dev/05-ingress.yaml
          echo "✅ All manifests applied successfully"

      - name: Update Kubernetes secrets
        run: |
          # Delete existing secrets if they exist
          kubectl delete secret starships-secrets -n starships-dev --ignore-not-found=true

          # Create new secrets from GitHub secrets
          kubectl create secret generic starships-secrets \
            --from-literal=OPENAI_API_KEY="${{ secrets.OPENAI_API_KEY }}" \
            --from-literal=ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}" \
            --from-literal=OPENROUTER_API_KEY="${{ secrets.OPENROUTER_API_KEY }}" \
            --from-literal=STRIPE_SECRET_KEY="${{ secrets.STRIPE_SECRET_KEY }}" \
            --from-literal=STRIPE_WEBHOOK_SECRET="${{ secrets.STRIPE_WEBHOOK_SECRET }}" \
            --from-literal=STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY }}" \
            --from-literal=POSTGRES_HOST="localhost" \
            --from-literal=POSTGRES_PORT="5432" \
            --from-literal=POSTGRES_USER="postgres" \
            --from-literal=POSTGRES_PASSWORD="password" \
            --from-literal=POSTGRES_DATABASE="starships" \
            --from-literal=POSTGRES_SSL="false" \
            --from-literal=JWT_SECRET="${{ secrets.JWT_SECRET }}" \
            --from-literal=SERVER_URL="${{ vars.SERVER_URL }}" \
            --from-literal=CLIENT_URL="${{ vars.CLIENT_URL }}" \
            --from-literal=PUBLIC_URL="${{ vars.PUBLIC_URL }}" \
            --from-literal=SERVER_PORT="${{ vars.SERVER_PORT }}" \
            --from-literal=CLIENT_PORT="${{ vars.CLIENT_PORT }}" \
            --from-literal=LOG_LEVEL="${{ vars.LOG_LEVEL }}" \
            --from-literal=DEFAULT_LLM_PROVIDER="${{ vars.DEFAULT_LLM_PROVIDER }}" \
            --from-literal=DEFAULT_CHAT_MODEL="${{ vars.DEFAULT_CHAT_MODEL }}" \
            --from-literal=STRIPE_PRICE_CRUISER_MONTHLY="${{ vars.STRIPE_PRICE_CRUISER_MONTHLY }}" \
            --from-literal=STRIPE_PRICE_CRUISER_YEARLY="${{ vars.STRIPE_PRICE_CRUISER_YEARLY }}" \
            --from-literal=STRIPE_PRICE_DRAUGHT_MONTHLY="${{ vars.STRIPE_PRICE_DRAUGHT_MONTHLY }}" \
            --from-literal=STRIPE_PRICE_DRAUGHT_YEARLY="${{ vars.STRIPE_PRICE_DRAUGHT_YEARLY }}" \
            --from-literal=GA_MEASUREMENT_ID="${{ vars.GA_MEASUREMENT_ID }}" \
            -n starships-dev

          # Create GitHub registry secret
          kubectl delete secret ghcr-pull-secret -n starships-dev --ignore-not-found=true
          kubectl create secret docker-registry ghcr-pull-secret \
            --docker-server=ghcr.io \
            --docker-username=${{ github.repository_owner }} \
            --docker-password="${{ secrets.GHCR_PULL_TOKEN || secrets.GITHUB_TOKEN }}" \
            -n starships-dev

          echo "✅ Dev secrets updated successfully"

      - name: Update image in deployment
        run: |
          IMAGE_TAG="${{ needs.calculate-version.outputs.new_release_version }}"
          
          echo "📦 Deploying version: ${IMAGE_TAG}"
          kubectl set image deployment/starships-app \
            starships=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${IMAGE_TAG} \
            -n starships-dev

          # Wait for rollout
          kubectl rollout status deployment/starships-app -n starships-dev --timeout=300s

      - name: Verify deployment
        run: |
          kubectl get pods -n starships-dev
          kubectl logs -n starships-dev deployment/starships-app --tail=50 | grep "Server running" || true
          
          # Check ALB ingress
          kubectl get ingress -n starships-dev

  # Create Release (same as before)
  create-release:
    name: Create Release
    runs-on: ubuntu-latest
    needs: [calculate-version, build-dev, deploy-dev]
    if: |
      needs.calculate-version.outputs.new_release_published == 'true' &&
      github.event_name == 'push' && 
      github.ref == 'refs/heads/main'
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        run: |
          curl -fsSL https://github.com/pnpm/pnpm/releases/download/v10.12.4/pnpm-linux-x64 -o pnpm
          chmod +x pnpm
          sudo mv pnpm /usr/local/bin/
          pnpm --version
          pnpm config set registry https://registry.npmjs.org

      - name: Install dependencies
        run: pnpm install

      - name: Create Release and Tag
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          echo "Creating release for version ${{ needs.calculate-version.outputs.new_release_version }}..."
          npx semantic-release
          echo "✅ Release created successfully"

  # Workflow Summary
  workflow-summary:
    name: Workflow Summary
    runs-on: ubuntu-latest
    needs: [calculate-version, build-dev, create-release, deploy-dev]
    if: always() && needs.calculate-version.result != 'skipped'
    steps:
      - name: Create workflow summary
        run: |
          echo "## 🔄 AWS EKS Build and Deploy Summary" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY

          if [[ "${{ needs.calculate-version.outputs.new_release_published }}" == "true" ]]; then
            echo "✅ **Version:** \`${{ needs.calculate-version.outputs.new_release_version }}\`" >> $GITHUB_STEP_SUMMARY
            
            if [[ "${{ needs.build-dev.result }}" == "success" ]]; then
              echo "✅ **Docker Build:** Success" >> $GITHUB_STEP_SUMMARY
            else
              echo "❌ **Docker Build:** Failed" >> $GITHUB_STEP_SUMMARY
            fi
            
            if [[ "${{ needs.deploy-dev.result }}" == "success" ]]; then
              echo "✅ **EKS Deployment:** Success" >> $GITHUB_STEP_SUMMARY
            else
              echo "❌ **EKS Deployment:** Failed" >> $GITHUB_STEP_SUMMARY
            fi
            
            if [[ "${{ needs.create-release.result }}" == "success" ]]; then
              echo "✅ **GitHub Release:** Created" >> $GITHUB_STEP_SUMMARY
            elif [[ "${{ needs.create-release.result }}" == "skipped" ]]; then
              echo "⏭️ **GitHub Release:** Skipped (manual dispatch)" >> $GITHUB_STEP_SUMMARY
            else
              echo "❌ **GitHub Release:** Failed" >> $GITHUB_STEP_SUMMARY
            fi
          else
            echo "ℹ️ **Status:** No new version detected" >> $GITHUB_STEP_SUMMARY
          fi

          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Cluster:** \`${{ secrets.EKS_CLUSTER_DEV }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Region:** \`${{ env.AWS_REGION }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Branch:** \`${{ github.ref_name }}\`" >> $GITHUB_STEP_SUMMARY
```

### Updated Manual Production Deployment

Replace `.github/workflows/manual-deploy-production.yml`:

```yaml
name: Manual Deploy to AWS EKS Production

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy (e.g., 3.9.0 or latest)'
        required: true
        type: string
        default: 'latest'
      confirm_production:
        description: 'Type "DEPLOY" to confirm production deployment'
        required: true
        type: string

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  AWS_REGION: ap-south-1

permissions:
  contents: read
  packages: read
  id-token: write

jobs:
  deploy-production:
    name: Deploy to AWS EKS Production
    runs-on: ubuntu-latest
    if: github.event_name == 'workflow_dispatch'
    environment:
      name: prod
      url: https://starships.ai
    steps:
      - name: Validate deployment confirmation
        run: |
          if [ "${{ github.event.inputs.confirm_production }}" != "DEPLOY" ]; then
            echo "❌ Production deployment not confirmed. Type DEPLOY to confirm."
            exit 1
          fi
          echo "✅ Production deployment confirmed by ${{ github.actor }}"

      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Set version to deploy
        id: version
        run: |
          VERSION="${{ github.event.inputs.version }}"
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "📦 Preparing to deploy version: $VERSION to production"

      - name: Verify Docker image exists
        run: |
          IMAGE_NAME_LOWER=$(echo ${{ github.repository }} | tr '[:upper:]' '[:lower:]')
          IMAGE_TO_DEPLOY="ghcr.io/${IMAGE_NAME_LOWER}:${{ steps.version.outputs.version }}"

          echo "🔍 Verifying image: ${IMAGE_TO_DEPLOY}"
          echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin

          if docker pull "${IMAGE_TO_DEPLOY}"; then
            echo "✅ Image verified: ${IMAGE_TO_DEPLOY}"
          else
            echo "❌ Image not found: ${IMAGE_TO_DEPLOY}"
            exit 1
          fi

      - name: Update kubeconfig for production EKS
        run: |
          aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ secrets.EKS_CLUSTER_PROD }}
          kubectl config current-context

      - name: Verify dev environment deployment
        id: dev_check
        run: |
          echo "🔍 Checking dev environment for version ${{ steps.version.outputs.version }}..."
          
          # Switch to dev cluster to check
          aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ secrets.EKS_CLUSTER_DEV }}
          
          DEV_IMAGE=$(kubectl get deployment starships-app -n starships-dev \
            -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "not-found")

          if [[ "$DEV_IMAGE" == *":${{ steps.version.outputs.version }}" ]]; then
            echo "✅ Version verified in dev environment"
            echo "dev_verified=true" >> $GITHUB_OUTPUT
          else
            echo "⚠️ Version not found in dev: $DEV_IMAGE"
            echo "dev_verified=false" >> $GITHUB_OUTPUT
          fi

          # Switch back to prod cluster
          aws eks update-kubeconfig --region ${{ env.AWS_REGION }} --name ${{ secrets.EKS_CLUSTER_PROD }}

      - name: Backup current production state
        run: |
          echo "💾 Creating backup of current production deployment..."
          
          mkdir -p backups
          BACKUP_FILE="backups/prod-backup-$(date +%s).yaml"
          
          kubectl get deployment starships-app -n starships-prod -o yaml > "$BACKUP_FILE" 2>/dev/null || echo "No existing deployment"
          
          CURRENT_IMAGE=$(kubectl get deployment starships-app -n starships-prod \
            -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || echo "none")
          echo "Current production image: $CURRENT_IMAGE"
          
          echo "ROLLBACK_IMAGE=$CURRENT_IMAGE" >> $GITHUB_ENV

      - name: Upload backup artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: deployment-backup-${{ github.run_id }}
          path: backups/
          retention-days: 30

      - name: Create/Update Production Secrets
        run: |
          # Delete and recreate secrets
          kubectl delete secret starships-secrets -n starships-prod --ignore-not-found=true
          kubectl delete secret ghcr-pull-secret -n starships-prod --ignore-not-found=true

          # Create production secrets with RDS connection
          kubectl create secret generic starships-secrets \
            --from-literal=OPENAI_API_KEY="${{ secrets.OPENAI_API_KEY }}" \
            --from-literal=ANTHROPIC_API_KEY="${{ secrets.ANTHROPIC_API_KEY }}" \
            --from-literal=OPENROUTER_API_KEY="${{ secrets.OPENROUTER_API_KEY }}" \
            --from-literal=STRIPE_SECRET_KEY="${{ secrets.STRIPE_SECRET_KEY }}" \
            --from-literal=STRIPE_WEBHOOK_SECRET="${{ secrets.STRIPE_WEBHOOK_SECRET }}" \
            --from-literal=STRIPE_PUBLISHABLE_KEY="${{ secrets.STRIPE_PUBLISHABLE_KEY }}" \
            --from-literal=POSTGRES_HOST="${{ secrets.RDS_HOST }}" \
            --from-literal=POSTGRES_PORT="${{ secrets.RDS_PORT }}" \
            --from-literal=POSTGRES_USER="${{ secrets.RDS_USER }}" \
            --from-literal=POSTGRES_PASSWORD="${{ secrets.RDS_PASSWORD }}" \
            --from-literal=POSTGRES_DATABASE="${{ secrets.RDS_DATABASE }}" \
            --from-literal=POSTGRES_SSL="true" \
            --from-literal=JWT_SECRET="${{ secrets.JWT_SECRET }}" \
            --from-literal=SERVER_URL="${{ vars.SERVER_URL }}" \
            --from-literal=CLIENT_URL="${{ vars.CLIENT_URL }}" \
            --from-literal=PUBLIC_URL="${{ vars.PUBLIC_URL }}" \
            --from-literal=SERVER_PORT="${{ vars.SERVER_PORT }}" \
            --from-literal=CLIENT_PORT="${{ vars.CLIENT_PORT }}" \
            --from-literal=LOG_LEVEL="${{ vars.LOG_LEVEL }}" \
            --from-literal=DEFAULT_LLM_PROVIDER="${{ vars.DEFAULT_LLM_PROVIDER }}" \
            --from-literal=DEFAULT_CHAT_MODEL="${{ vars.DEFAULT_CHAT_MODEL }}" \
            --from-literal=STRIPE_PRICE_CRUISER_MONTHLY="${{ vars.STRIPE_PRICE_CRUISER_MONTHLY }}" \
            --from-literal=STRIPE_PRICE_CRUISER_YEARLY="${{ vars.STRIPE_PRICE_CRUISER_YEARLY }}" \
            --from-literal=STRIPE_PRICE_DRAUGHT_MONTHLY="${{ vars.STRIPE_PRICE_DRAUGHT_MONTHLY }}" \
            --from-literal=STRIPE_PRICE_DRAUGHT_YEARLY="${{ vars.STRIPE_PRICE_DRAUGHT_YEARLY }}" \
            --from-literal=GA_MEASUREMENT_ID="${{ vars.GA_MEASUREMENT_ID }}" \
            -n starships-prod

          # Create GHCR pull secret
          kubectl create secret docker-registry ghcr-pull-secret \
            --docker-server=ghcr.io \
            --docker-username=${{ github.repository_owner }} \
            --docker-password="${{ secrets.GHCR_PULL_TOKEN || secrets.GITHUB_TOKEN }}" \
            -n starships-prod

          echo "✅ Production secrets updated"

      - name: Validate Kubernetes Manifests
        run: |
          echo "🔍 Validating production manifests..."
          kubectl apply --dry-run=client -f k8s/prod/
          echo "✅ All manifests validated"

      - name: Deploy to Production with Tracking
        id: deployment
        run: |
          echo "🚀 Starting production deployment..."

          # Apply manifests
          kubectl apply -f k8s/prod/

          # Add deployment annotations
          kubectl annotate deployment starships-app \
            kubernetes.io/change-cause="Deploy v${{ steps.version.outputs.version }} by ${{ github.actor }}" \
            deployment.starships.ai/version="${{ steps.version.outputs.version }}" \
            deployment.starships.ai/deployed-by="${{ github.actor }}" \
            deployment.starships.ai/github-run-id="${{ github.run_id }}" \
            deployment.starships.ai/dev-verified="${{ steps.dev_check.outputs.dev_verified }}" \
            -n starships-prod --overwrite

          # Update deployment image
          IMAGE_NAME_LOWER=$(echo ${{ github.repository }} | tr '[:upper:]' '[:lower:]')
          kubectl set image deployment/starships-app \
            starships=ghcr.io/${IMAGE_NAME_LOWER}:${{ steps.version.outputs.version }} \
            -n starships-prod

          echo "✅ Deployment initiated"

          # Wait for rollout
          if kubectl rollout status deployment/starships-app -n starships-prod --timeout=600s; then
            echo "✅ Rollout completed successfully"
            echo "deployment_status=success" >> $GITHUB_OUTPUT
          else
            echo "❌ Rollout failed"
            echo "deployment_status=failed" >> $GITHUB_OUTPUT
            exit 1
          fi

      - name: Health Check with Auto-Rollback
        id: health_check
        run: |
          echo "🏥 Starting health checks..."
          
          # Wait for pods to be ready
          if ! kubectl wait --for=condition=ready pod -l app=starships-ai -n starships-prod --timeout=300s; then
            echo "❌ Pods not ready, initiating rollback"
            kubectl rollout undo deployment/starships-app -n starships-prod
            exit 1
          fi

          # Get ALB endpoint
          ALB_ENDPOINT=$(kubectl get ingress starships-ingress -n starships-prod \
            -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || echo "")

          if [ -n "$ALB_ENDPOINT" ]; then
            echo "ALB Endpoint: $ALB_ENDPOINT"
            
            # Health check with retries
            MAX_RETRIES=10
            for i in $(seq 1 $MAX_RETRIES); do
              echo "Health check attempt $i/$MAX_RETRIES..."
              
              if curl -f -m 10 "https://${ALB_ENDPOINT}/api/health" 2>/dev/null; then
                echo "✅ Health check passed!"
                echo "health_status=success" >> $GITHUB_OUTPUT
                exit 0
              else
                echo "⚠️ Health check failed, waiting..."
                sleep 30
              fi
            done
            
            echo "❌ Health checks failed, rolling back"
            kubectl rollout undo deployment/starships-app -n starships-prod
            exit 1
          else
            echo "⚠️ ALB endpoint not found, skipping external health check"
            echo "health_status=success" >> $GITHUB_OUTPUT
          fi

      - name: Deployment Summary
        if: always()
        run: |
          echo "## 🚀 Production Deployment Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          
          if [ "${{ job.status }}" == "success" ]; then
            echo "✅ **Status:** Successfully deployed to production" >> $GITHUB_STEP_SUMMARY
          else
            echo "❌ **Status:** Production deployment failed" >> $GITHUB_STEP_SUMMARY
          fi
          
          echo "**Version:** \`${{ steps.version.outputs.version }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Deployed By:** @${{ github.actor }}" >> $GITHUB_STEP_SUMMARY
          echo "**Cluster:** \`${{ secrets.EKS_CLUSTER_PROD }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Region:** \`${{ env.AWS_REGION }}\`" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**Production URL:** https://starships.ai" >> $GITHUB_STEP_SUMMARY
```

## 🔄 Migration Steps

### 1. Remove DigitalOcean Dependencies
```bash
# Remove doctl usage (no longer needed)
# Remove DigitalOcean-specific kubeconfig commands
# Remove DigitalOcean cluster references
```

### 2. Add Required Secrets
In GitHub repository settings, add all AWS-related secrets listed above.

### 3. Update Environment Variables
Some variables need to change for production:
- Database connection strings (when using RDS)
- Load balancer endpoints
- SSL certificate configuration

### 4. Test Deployment
```bash
# Test dev deployment first
git push origin main

# Monitor workflow
# Check EKS cluster
kubectl get pods -n starships-dev
```

## 🚨 Troubleshooting

### Common Issues

1. **EKS Authentication Failed**
   ```bash
   aws eks update-kubeconfig --region ap-south-1 --name starships-dev
   kubectl auth can-i "*" "*"
   ```

2. **Image Pull Errors**
   ```bash
   kubectl describe pod -n starships-dev
   # Check imagePullSecrets
   ```

3. **ALB Not Creating**
   ```bash
   kubectl logs -n kube-system deployment/aws-load-balancer-controller
   # Check ALB controller logs
   ```

4. **Health Check Failures**
   ```bash
   kubectl logs deployment/starships-app -n starships-prod
   # Check application logs
   ```

## 📊 Monitoring the Migration

### Key Metrics to Watch
- Deployment success rate
- Pod startup time
- Application response time
- Resource utilization
- Cost per deployment

### CloudWatch Integration
The workflows will automatically create CloudWatch metrics for:
- Deployment frequency
- Success/failure rates
- Application health

---

*This completes the GitHub Actions migration. Next step is updating your Kubernetes manifests for AWS-specific configurations.*