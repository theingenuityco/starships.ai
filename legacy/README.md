# Legacy infrastructure (reference only)

These assets are **no longer used**. They are kept for historical reference.

- `k8s/` — the old Kubernetes manifests (dev and prod) for the EKS-based deployment.
- `infra/` — the old EKS cluster definitions (eksctl) and IAM policy templates.

Production now runs one EC2 per starship with the full stack via docker-compose
plus a hardened local Docker sandbox for code execution. See `infra/starship-ec2/`
at the repo root.
