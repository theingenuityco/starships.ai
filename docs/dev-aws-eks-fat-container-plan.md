# Starships.ai AWS EKS Fat-Container Deployment Plan

## 1. Current State Assessment

- Docker image bundles Next.js + Express under Supervisor orchestration. No image changes required, see [Dockerfile](Dockerfile:1).
- Kubernetes manifests under `k8s/dev/` model the database services separately:
  - [k8s/dev/02-pvc.yaml](k8s/dev/02-pvc.yaml:1) defines an AWS EBS `gp3` StorageClass.
  - [k8s/dev/03-deployment.yaml](k8s/dev/03-deployment.yaml:1) deploys the application as a `Deployment`.
  - [k8s/dev/12-redis-statefulset.yaml](k8s/dev/12-redis-statefulset.yaml:1) deploys Redis as a `StatefulSet` + `Service`.
  - [k8s/dev/13-postgres-statefulset.yaml](k8s/dev/13-postgres-statefulset.yaml:1) deploys PostgreSQL as a `StatefulSet` + `Service`.
  - [k8s/dev/04-service.yaml](k8s/dev/04-service.yaml:1) exposes app ports as a `ClusterIP` `Service`.
- Infra Bootstrap for dev EKS already exists via [infra/dev/eks/eks-dev.yaml](infra/dev/eks/eks-dev.yaml:1).

## 2. Target AWS Architecture Summary

```
Route53 --> AWS ALB --> EKS
                      |
                      --> Deployment: starships-app (Pod: Next.js + Express)
                      |
                      --> StatefulSet: postgres (Service: postgres, PVC: postgres-data -> EBS gp3)
                      |
                      --> StatefulSet: redis (Service: redis, PVC: redis-data -> EBS gp3)
                      |
                   AWS Backup (daily snapshots, 30 day retention) [Postgres volume; Redis optional]
```

Key choices:

- App runs as a **Deployment** (replica 1 for dev), with database services deployed separately.
- PostgreSQL runs as a dedicated **StatefulSet** with its own ReadWriteOnce EBS-backed PVC.
- Redis runs as a dedicated **StatefulSet** with its own ReadWriteOnce EBS-backed PVC.
- AWS Load Balancer Controller for ingress (ALB) behind ACM certificate and Route 53.
- AWS Backup to snapshot the EBS volume(s) (tag-based inclusion).
- Manual scaling for dev with future option to move PostgreSQL to a managed service as load grows.

## 3. Kubernetes Manifests – Required Changes

| Area                  | Current                                 | Required Action                                                                                                                         |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Workload type         | Mixed                                  | Keep the app as a `Deployment` (`k8s/dev/03-deployment.yaml`). Deploy PostgreSQL and Redis as separate `StatefulSet`s (`k8s/dev/13-postgres-statefulset.yaml`, `k8s/dev/12-redis-statefulset.yaml`). |
| StorageClass          | `gp3` (EBS CSI)                         | Ensure AWS `gp3` StorageClass is present (and the EBS CSI driver is installed). Consider setting it as cluster default for dev.         |
| Persistent Volumes    | Per-workload PVCs                        | PostgreSQL and Redis each get their own PVC via `volumeClaimTemplates` on their StatefulSets. Size/IOPS separately (e.g., Postgres 50Gi, Redis 5Gi). |
| Environment Variables | Derived from `starships-secrets`        | Ensure secrets exist in AWS (Kubernetes Secret, or AWS Secrets Manager with External Secrets). Set `POSTGRES_HOST=postgres` (Service) and `REDIS_HOST=redis` (Service) rather than using localhost. |
| PVC annotations       | None                                    | Add tags/annotations to the Postgres (and optionally Redis) PVCs so AWS Backup can discover volumes via tag filters.                   |
| Pod Termination       | App-focused grace period                 | PostgreSQL and Redis are separate pods; handle termination/grace periods on their respective StatefulSets (SIGTERM), not via the app container. |
| Ingress               | Not defined                             | Create an Ingress manifest referencing Kubernetes AWS Load Balancer Controller with annotations for ACM, target type, and SSL redirect. |
| Namespace             | `starships-dev`                         | Ensure namespace exists via [k8s/dev/00-namespace.yaml](k8s/dev/00-namespace.yaml:1).                                                   |

### Separate PostgreSQL + Redis StatefulSet architecture (high level)

- **App**
  - `kind: Deployment` (`starships-app`)
  - Exposes ports via `Service` (`starships-app`)
  - Connects to Postgres/Redis over cluster DNS (`postgres`, `redis` Services in the same namespace)
- **PostgreSQL**
  - `kind: StatefulSet` (`postgres`) + `Service` (`postgres`) on port 5432
  - `spec.volumeClaimTemplates` creates a `postgres-data` PVC (EBS `gp3`)
  - Data stored on the PVC (mounted at `/var/lib/postgresql/data`)
- **Redis**
  - `kind: StatefulSet` (`redis`) + `Service` (`redis`) on port 6379
  - `spec.volumeClaimTemplates` creates a `redis-data` PVC (EBS `gp3`)
  - Data stored on the PVC (mounted at `/data`)

This same split-workload pattern is mirrored for production under `k8s/prod/12-redis-statefulset.yaml` and `k8s/prod/13-postgres-statefulset.yaml`.

#### PVC Annotations (AWS Backup)

Add explicit annotations on the Postgres PVC (and optionally Redis PVC) so AWS Backup can discover the EBS volumes. Either assign a custom tag key/value or reference an existing backup plan:

```yaml
spec:
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
        annotations:
          backup: 'starships-db' # simple tag picked up by the backup plan
          backup.aws.amazon.com/plan: 'daily-dev' # optional: bind to a named AWS Backup plan
      spec:
        accessModes: ['ReadWriteOnce']
        storageClassName: gp3
        resources:
          requests:
            storage: 50Gi
```

Use this pattern in the Postgres StatefulSet’s `volumeClaimTemplates` (e.g., `postgres-data`). If backing up Redis persistence as well, apply the same pattern to the Redis `volumeClaimTemplates` (e.g., `redis-data`). The annotation `backup: "starships-db"` should match the resource tag filter configured in the AWS Backup plan.

#### Pod Termination Handling

Because PostgreSQL and Redis run as separate pods, termination handling belongs to those StatefulSets. Prefer relying on the container’s normal SIGTERM handling and ensuring adequate `terminationGracePeriodSeconds` for clean shutdown and data flushes if you observe forced kills under load.

#### Ingress Definition (AWS Load Balancer Controller)

Define an Ingress resource that instructs the AWS Load Balancer Controller to create an internet-facing ALB with HTTPS termination:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: starships-dev
  namespace: starships-dev
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP":80,"HTTPS":443}]'
    alb.ingress.kubernetes.io/actions.ssl-redirect: >
      {"Type":"redirect","RedirectConfig":{"Protocol":"HTTPS","Port":"443","StatusCode":"HTTP_301"}}
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:ap-south-1:123456789012:certificate/uuid
spec:
  rules:
    - host: dev.starships.ai
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ssl-redirect
                port:
                  name: use-annotation
          - path: /
            pathType: Prefix
            backend:
              service:
                name: starships-app
                port:
                  number: 3000
```

Create a corresponding Route 53 alias record pointing `dev.starships.ai` to the ALB once the controller provisions it. For API/WebSocket traffic on port 4000, expose a second path or update the service to handle both ports through the same ALB listener.

## 4. AWS Integrations

### Storage and Backup

1. Define `StorageClass` (if not using default) pointing to `gp3`.
2. Annotate PVC with backup tag; create AWS Backup plan to snapshot volumes tagged `backup=starships-db` with daily cadence and 30-day retention.
3. Document restore workflow (attach new PVC from snapshot and redeploy the relevant StatefulSet: `postgres` and/or `redis`).

### Networking and Ingress

The legacy DigitalOcean stack relied on the in-cluster Kubernetes NGINX Ingress Controller, fronted by a DigitalOcean-managed load balancer, to terminate TLS and route traffic. Migrating to AWS EKS replaces that layer with the AWS Load Balancer Controller, which provisions an Application Load Balancer (ALB) per ingress definition. The ALB now performs TLS termination (ACM certificates), HTTP-to-HTTPS redirects, routing, and health checks, so no dedicated NGINX deployment is required.

1. Install AWS Load Balancer Controller (if not present).
2. Create Ingress manifest with annotations:
   - `alb.ingress.kubernetes.io/scheme: internet-facing`
   - `alb.ingress.kubernetes.io/listen-ports: [{"HTTP":80,"HTTPS":443}]`
   - `alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...`
   - `alb.ingress.kubernetes.io/target-type: ip`
   - Optional: `alb.ingress.kubernetes.io/actions.ssl-redirect` for HTTP to HTTPS redirect.
3. Configure Route 53 `A` record as Alias to the ALB.
4. Ensure SGs allow inbound 80/443 and nodes access ALB security group.

### Observability

- Attach CloudWatch Container Insights or deploy Prometheus/Grafana later.
- Enable structured logging via existing code (Log Level env var).

## 5. Secrets and Configuration

- Mirror required environment variables into K8s Secrets or use AWS Secrets Manager with External Secrets operator.
- Ensure Stripe/OpenAI keys and JWT secret exist before rollout.
- For dev, manual `kubectl create secret` is acceptable; note plan to externalize later.

## 6. CI/CD Pipeline Adjustments

Current pipeline ([.github/workflows/build-and-push-image.yml](.github/workflows/build-and-push-image.yml:1)) builds and pushes to GHCR. Required additions:

1. Add job stage `deploy-dev` triggered on main branch after image push.
2. Configure AWS credentials via IAM OIDC (`aws-actions/configure-aws-credentials`).
3. Retrieve kubeconfig: `aws eks update-kubeconfig --region ap-south-1 --name starships-dev`.
4. Apply manifests (`kubectl apply -k k8s/dev` or `kubectl apply -f ...` if using templating).
5. Update app image in the `Deployment` if tag changed (use `kubectl set image deployment/starships-app ...` or patch).
6. Optionally parameterize environment via workflow inputs for future prod deployment.

### GitHub Workflow Improvements (`deploy-dev.yml`)

- **Manifest set**: Replace DigitalOcean resources with the AWS-ready manifests (Deployment for app, StatefulSets for Postgres/Redis, Services, Ingress, StorageClass). Apply the StorageClass before the StatefulSets so PVCs bind to the gp3 driver.
- **Image tag source**: Instead of `gh release view`, derive the tag published by the build workflow (e.g., `${{ github.event.workflow_run.head_sha }}` → `sha-<short>` tag, or consume an artifact that records the final tag).
- **AWS authentication**: Switch `aws-actions/configure-aws-credentials` to use OIDC role assumption (`role-to-assume`, `role-session-name`) rather than static access keys.
- **Resource names**: Update rollout commands to target the app `Deployment` (`kubectl set image deployment/starships-app ...` and `kubectl rollout status deployment/starships-app ...`).
- **Secrets management**: Ensure all required env vars (Stripe price IDs, GA key, etc.) are stored in GitHub secrets and rendered into the `starships-secrets` Secret. Consider templating to reduce manual list drift.
- **Validation & diagnostics**: Keep the dry-run validation, but point it at the updated manifest directory. On failure, capture pod descriptions/logs to aid debugging (`kubectl describe pods`, `kubectl get events`).

These changes keep the deployment workflow aligned with the AWS architecture described above. For validation in CI, the workflow now runs `kubectl apply --dry-run=server` against each manifest. Local validation (e.g., `kubectl kustomize`, `yamllint`, or `kubeconform`) should be added later once we decide how to bundle the manifests (plain YAML vs. kustomize/helm).

## 7. Recommended Action Plan

1. **Manifests**: AWS-aligned dev manifests (StorageClass `gp3`, app `Deployment`, Postgres/Redis `StatefulSet`s, Services, ALB Ingress) now live under `k8s/dev/`.
2. **Backups**: Configure AWS Backup plan targeting PVC tags; document restoration runbook.
3. **CI/CD**: GitHub deploy workflow now assumes AWS via OIDC, applies the new manifests, and rolls the app `Deployment` using the SHA-based tag. Confirm the IAM role (`AWS_ROLE_ARN`) exists before enabling the job.
4. **Secrets**: Populate GitHub secrets/variables for every env var consumed in `k8s/dev/03-deployment.yaml`; rerun the workflow whenever values change.
5. **Validation Enhancements (follow-up)**: Consider adding automated linting (`yamllint`) and schema validation (`kubeconform`) plus optional smoke tests once the dev pipeline stabilizes.
6. **Runbooks**: Update documentation for deploying, scaling, and restoring backups using the separate StatefulSets (`postgres`, `redis`) plus app `Deployment` model.

## 8. Risks and Caveats

- **StatefulSet AZ Binding**: Pods must run in the same Availability Zone as the EBS volume; ensure node group supports pod AZ scheduling constraints.
- **Single Container**: Coupling frontend + backend into one container simplifies dev but limits independent scaling; the database services remain independent.
- **Supervisor Run-As-Root**: Current Docker image runs Supervisor as root due to permission issues noted in [k8s/dev/03-deployment.yaml](k8s/dev/03-deployment.yaml:30). Address before enforcing non-root security context.
- **Secrets Handling**: Manual secrets management is acceptable short-term but should move to AWS Secrets Manager or SSM Parameter Store for production-readiness.
- **Backups**: Test restore procedure to ensure EBS snapshots integrate correctly with StatefulSet redeployments.
- **Ingress Costs**: ALB incurs hourly and data transfer costs even for dev.

## 9. Updated Alignment Findings (Dev-Only Scope)

A focused review (dev environment only) highlights the following adjustments:

1. **Leave legacy production assets untouched**
   - Keep the existing `k8s/prod` directory and production workflow in place, but scope the AWS migration work to the dev manifests and `deploy-dev.yml` pipeline for now.

2. **Author AWS-ready dev manifests**
   - Ensure the dev manifests remain EKS-compatible: app `Deployment`, Postgres/Redis `StatefulSet`s, Services, Ingress (ALB annotations), and PVC definitions that rely on a gp3 StorageClass. Apply the StorageClass YAML (see next point) before the StatefulSets.

3. **Introduce a gp3 StorageClass**
   - Add/confirm a manifest defining an EBS-backed gp3 StorageClass unless the cluster default already points to gp3. This ensures the Postgres/Redis StatefulSet PVCs bind to the correct AWS volume type.

4. **Container image tag selection**
   - For this release we can continue deploying the `latest` tag (or the semantic version) emitted by the build workflow, noting that a SHA-based tag is a future improvement rather than a launch blocker.

5. **Secrets coverage**
   - Ensure every environment variable referenced in the fat container (Stripe price IDs, analytics keys, etc.) has a value in GitHub secrets or repository variables so the workflow’s `kubectl create secret` step can hydrate the application.

6. **Self-hosted runners**
   - The Terraform stack under `github-runners/` is not required for the dev EKS deployment. Document that CI/CD will rely on GitHub-hosted runners (with OIDC to AWS) until a dedicated runner strategy is defined later.

## 10. Next Steps (Dev Focus)

- Leave production assets untouched while focusing implementation and testing on `k8s/dev` and the dev workflow.
- Commit the gp3 StorageClass and AWS-aligned dev manifests (app `Deployment`, Postgres/Redis `StatefulSet`s, Services, ALB ingress).
- Confirm the GitHub deploy workflow (OIDC auth, SHA tag, secret sync, `Deployment` rollout) runs successfully end-to-end.
- Populate GitHub secrets/variables for all required runtime values and keep a mapping in the docs.
- Execute a full dev pipeline test: image build → workflow deploy → ALB validation → PVC/backup verification, then capture results in the runbook.
