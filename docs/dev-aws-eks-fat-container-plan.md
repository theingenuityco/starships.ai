# Starships.ai AWS EKS Fat-Container Deployment Plan

## 1. Current State Assessment

- Docker image already bundles Next.js, Express, and PostgreSQL with Supervisor orchestration. No image changes required, see [Dockerfile](Dockerfile:1).
- Kubernetes manifests under `k8s/dev/` target DigitalOcean:
  - [k8s/dev/02-pvc.yaml](k8s/dev/02-pvc.yaml:1) uses `do-block-storage`.
  - [k8s/dev/03-deployment.yaml](k8s/dev/03-deployment.yaml:1) defines a `Deployment` with multiple PVCs.
  - [k8s/dev/04-service.yaml](k8s/dev/04-service.yaml:1) exposes ports 3000 and 4000 as a `ClusterIP`.
- Infra Bootstrap for dev EKS already exists via [infra/dev/eks/eks-dev.yaml](infra/dev/eks/eks-dev.yaml:1).

## 2. Target AWS Architecture Summary

```
Route53 --> AWS ALB --> EKS (StatefulSet: starships-fat)
                                |
                                --> Pod: Node (Next.js + Express + PostgreSQL)
                                |
                                --> EBS (PersistentVolumeClaim: gp3)
                                |
                             AWS Backup (daily snapshots, 30 day retention)
```

Key choices:

- Single **StatefulSet** (replica 1 for dev) with ReadWriteOnce EBS volume.
- AWS Load Balancer Controller for ingress (ALB) behind ACM certificate and Route 53.
- AWS Backup to snapshot the EBS volume (tag-based inclusion).
- Manual scaling for dev with future option to externalize PostgreSQL as load grows.

## 3. Kubernetes Manifests – Required Changes

| Area                  | Current                                 | Required Action                                                                                                                         |
| --------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Workload type         | `Deployment`                            | Replace with `StatefulSet` to ensure stable volume attachment and graceful pod termination.                                             |
| StorageClass          | `do-block-storage`                      | Use AWS `gp3` StorageClass (or cluster default) for EBS volumes.                                                                        |
| Persistent Volumes    | Separate PVCs for Postgres and sessions | Consolidate into a single PVC sized appropriately (40–60Gi) tagged for AWS Backup; mount subdirectories for sessions if needed.         |
| Environment Variables | Derived from `starships-secrets`        | Ensure secrets exist in AWS (Kubernetes Secret, or AWS Secrets Manager with External Secrets). Confirm `POSTGRES_HOST=localhost`.       |
| PVC annotations       | None                                    | Add `metadata.annotations.backup: "starships-db"` or AWS tag to include volume in Backup plan.                                          |
| Pod Termination       | None                                    | Add preStop hook or use Supervisor to stop PostgreSQL cleanly before termination if necessary.                                          |
| Ingress               | Not defined                             | Create an Ingress manifest referencing Kubernetes AWS Load Balancer Controller with annotations for ACM, target type, and SSL redirect. |
| Namespace             | `starships-dev`                         | Ensure namespace exists via [k8s/dev/00-namespace.yaml](k8s/dev/00-namespace.yaml:1).                                                   |

### Example StatefulSet (high level)

- `apiVersion: apps/v1`
- `kind: StatefulSet`
- `serviceName: starships-app-internal`
- `spec.volumeClaimTemplates` for the gp3-backed PVC.
- `containers[].volumeMounts` mapping `/var/lib/postgresql/data` and `/app/data` as subpaths.
- `terminationGracePeriodSeconds` tuned to allow PostgreSQL shutdown.

#### PVC Annotations (AWS Backup)

Add explicit annotations on the PVC so AWS Backup can discover the volume. Either assign a custom tag key/value or reference an existing backup plan:

```yaml
spec:
  volumeClaimTemplates:
    - metadata:
        name: data
        annotations:
          backup: 'starships-db' # simple tag picked up by the backup plan
          backup.aws.amazon.com/plan: 'daily-dev' # optional: bind to a named AWS Backup plan
      spec:
        accessModes: ['ReadWriteOnce']
        storageClassName: gp3
        resources:
          requests:
            storage: 60Gi
```

The annotation `backup: "starships-db"` should match the resource tag filter configured in the AWS Backup plan. If the backup team prefers AWS-native tagging, add labels `backup: starships-db` and mirror them through `kubectl annotate pvc ... backup=starships-db`.

#### Pod Termination Handling

Ensure PostgreSQL shuts down cleanly before Kubernetes deletes the pod. Use a `preStop` lifecycle hook and extend `terminationGracePeriodSeconds` (e.g., 90–120s):

```yaml
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 120
      containers:
        - name: starships
          lifecycle:
            preStop:
              exec:
                command:
                  - /bin/sh
                  - -c
                  - >
                    /usr/bin/supervisorctl stop postgres || true;
                    sleep 5
```

`supervisor-entrypoint.sh` already manages PostgreSQL; the hook informs Supervisor to stop the database and waits briefly before the container exits. Adjust the grace period if physical shutdown routinely exceeds 120 seconds.

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
                name: starships-app-internal
                port:
                  number: 3000
```

Create a corresponding Route 53 alias record pointing `dev.starships.ai` to the ALB once the controller provisions it. For API/WebSocket traffic on port 4000, expose a second path or update the service to handle both ports through the same ALB listener.

## 4. AWS Integrations

### Storage and Backup

1. Define `StorageClass` (if not using default) pointing to `gp3`.
2. Annotate PVC with backup tag; create AWS Backup plan to snapshot volumes tagged `backup=starships-db` with daily cadence and 30-day retention.
3. Document restore workflow (attach new PVC from snapshot and redeploy StatefulSet).

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

- Mirror secrets from `docker-compose.yml` into K8s Secrets or use AWS Secrets Manager with External Secrets operator.
- Ensure Stripe/OpenAI keys and JWT secret exist before rollout.
- For dev, manual `kubectl create secret` is acceptable; note plan to externalize later.

## 6. CI/CD Pipeline Adjustments

Current pipeline ([.github/workflows/build-and-push-image.yml](.github/workflows/build-and-push-image.yml:1)) builds and pushes to GHCR. Required additions:

1. Add job stage `deploy-dev` triggered on main branch after image push.
2. Configure AWS credentials via IAM OIDC (`aws-actions/configure-aws-credentials`).
3. Retrieve kubeconfig: `aws eks update-kubeconfig --region ap-south-1 --name starships-dev`.
4. Apply manifests (`kubectl apply -k k8s/dev` or `kubectl apply -f ...` if using templating).
5. Update image in StatefulSet if tag changed (use `kubectl set image` or patch).
6. Optionally parameterize environment via workflow inputs for future prod deployment.

### GitHub Workflow Improvements (`deploy-dev.yml`)

- **Manifest set**: Replace DigitalOcean resources (`03-deployment.yaml`, etc.) with the new AWS-ready manifests (StatefulSet, Service, Ingress, StorageClass). Apply the StorageClass before the StatefulSet so PVCs bind to the gp3 driver.
- **Image tag source**: Instead of `gh release view`, derive the tag published by the build workflow (e.g., `${{ github.event.workflow_run.head_sha }}` → `sha-<short>` tag, or consume an artifact that records the final tag).
- **AWS authentication**: Switch `aws-actions/configure-aws-credentials` to use OIDC role assumption (`role-to-assume`, `role-session-name`) rather than static access keys.
- **Resource names**: Update rollout commands to target the forthcoming StatefulSet (`kubectl set image statefulset/starships-fat ...` and `kubectl rollout status statefulset/starships-fat ...`).
- **Secrets management**: Ensure all required env vars (Stripe price IDs, GA key, etc.) are stored in GitHub secrets and rendered into the `starships-secrets` Secret. Consider templating to reduce manual list drift.
- **Validation & diagnostics**: Keep the dry-run validation, but point it at the updated manifest directory. On failure, capture pod descriptions/logs to aid debugging (`kubectl describe pods`, `kubectl get events`).

These changes keep the deployment workflow aligned with the AWS architecture described above. For validation in CI, the workflow now runs `kubectl apply --dry-run=server` against each manifest. Local validation (e.g., `kubectl kustomize`, `yamllint`, or `kubeconform`) should be added later once we decide how to bundle the manifests (plain YAML vs. kustomize/helm).

## 7. Recommended Action Plan

1. **Manifests**: AWS-aligned dev manifests (StorageClass `gp3`, headless Service + StatefulSet, external Service, ALB Ingress) now live under `k8s/dev/`.
2. **Backups**: Configure AWS Backup plan targeting PVC tags; document restoration runbook.
3. **CI/CD**: GitHub deploy workflow now assumes AWS via OIDC, applies the new manifests, and rolls the StatefulSet using the SHA-based tag. Confirm the IAM role (`AWS_ROLE_ARN`) exists before enabling the job.
4. **Secrets**: Populate GitHub secrets/variables for every env var consumed in `k8s/dev/03-deployment.yaml`; rerun the workflow whenever values change.
5. **Validation Enhancements (follow-up)**: Consider adding automated linting (`yamllint`) and schema validation (`kubeconform`) plus optional smoke tests once the dev pipeline stabilizes.
6. **Runbooks**: Update documentation for deploying, scaling, and restoring backups using the new StatefulSet model.

## 8. Risks and Caveats

- **StatefulSet AZ Binding**: Pods must run in the same Availability Zone as the EBS volume; ensure node group supports pod AZ scheduling constraints.
- **Single Container**: Coupling frontend, backend, and DB simplifies dev but limits independent scaling; plan to move to managed DB before high concurrency.
- **Supervisor Run-As-Root**: Current Docker image runs Supervisor as root due to permission issues noted in [k8s/dev/03-deployment.yaml](k8s/dev/03-deployment.yaml:30). Address before enforcing non-root security context.
- **Secrets Handling**: Manual secrets management is acceptable short-term but should move to AWS Secrets Manager or SSM Parameter Store for production-readiness.
- **Backups**: Test restore procedure to ensure EBS snapshots integrate correctly with StatefulSet redeployments.
- **Ingress Costs**: ALB incurs hourly and data transfer costs even for dev.

## 9. Updated Alignment Findings (Dev-Only Scope)

A focused review (dev environment only) highlights the following adjustments:

1. **Leave legacy production assets untouched**
   - Keep the existing `k8s/prod` directory and production workflow in place, but scope the AWS migration work to the dev manifests and `deploy-dev.yml` pipeline for now.

2. **Author AWS-ready dev manifests**
   - Replace the DigitalOcean Deployment/PVC/Ingress files in `k8s/dev/` with an EKS-compatible set: StatefulSet, Service, Ingress (ALB annotations), and PVC definitions that rely on a gp3 StorageClass. Apply the StorageClass YAML (see next point) before the StatefulSet.

3. **Introduce a gp3 StorageClass**
   - Add a manifest (for example `k8s/dev/01-storageclass-gp3.yaml`) defining an EBS-backed gp3 StorageClass unless the cluster default already points to gp3. This ensures the StatefulSet PVC binds to the correct AWS volume type.

4. **Container image tag selection**
   - For this release we can continue deploying the `latest` tag (or the semantic version) emitted by the build workflow, noting that a SHA-based tag is a future improvement rather than a launch blocker.

5. **Secrets coverage**
   - Ensure every environment variable referenced in the fat container (Stripe price IDs, analytics keys, etc.) has a value in GitHub secrets or repository variables so the workflow’s `kubectl create secret` step can hydrate the application.

6. **Self-hosted runners**
   - The Terraform stack under `github-runners/` is not required for the dev EKS deployment. Document that CI/CD will rely on GitHub-hosted runners (with OIDC to AWS) until a dedicated runner strategy is defined later.

## 10. Next Steps (Dev Focus)

- Leave production assets untouched while focusing implementation and testing on `k8s/dev` and the dev workflow.
- Commit the gp3 StorageClass and AWS-aligned dev manifests (headless service + StatefulSet, external service, ALB ingress).
- Confirm the GitHub deploy workflow (OIDC auth, SHA tag, secret sync, StatefulSet rollout) runs successfully end-to-end.
- Populate GitHub secrets/variables for all required runtime values and keep a mapping in the docs.
- Execute a full dev pipeline test: image build → workflow deploy → ALB validation → PVC/backup verification, then capture results in the runbook.
