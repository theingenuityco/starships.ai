# Per-starship EC2 deployment

One EC2 box runs the entire stack for a single starship (single-tenant deploy;
the app stays multi-tenant-capable in code). Native code execution runs in
hardened sibling Docker containers on the same box.

## Layout

- `docker-compose.yml` — Postgres, Redis, the autopilot runner, the app
  (client + docs + server), the workers, and Caddy (auto-TLS).
- `Caddyfile` — reverse proxy: `/api` -> server, `/docs` -> docs, `/` -> client.
- `cloud-init.yaml` — bootstraps Docker, the shared work dir, IMDS blocking, and
  a `starships.service` unit.
- `main.tf` — Terraform for the EC2 box, security group, IMDSv2, and daily EBS
  snapshots. One `apply` per starship.
- `backup.sh` — periodic `pg_dump` to S3.
- `.env.example` — required configuration.

## Provision (operator)

1. Build and push the three images to your registry: app (root `Dockerfile`),
   runner (`packages/autopilot-runner/Dockerfile`), sandbox
   (`packages/autopilot-runner/Dockerfile.sandbox`).
2. `terraform apply` with `starship_slug`, `ami_id` (Ubuntu arm64), `vpc_id`,
   `subnet_id`, `key_name`, `dlm_role_arn`.
3. Copy `docker-compose.yml`, `Caddyfile`, and a filled `.env` into
   `/opt/starships/` on the box, then `systemctl start starships`.
4. Point `<slug>.starships.ai` DNS at the box's public IP.
5. Add `backup.sh` to cron.

## Security notes

- The app/workers mount the host Docker socket to launch sandbox containers. This
  is acceptable under single-tenancy (the box belongs to one tenant) but is a
  privileged mount; keep the box single-tenant.
- `RUNNER_JOB_BASE_DIR=/var/starships/work` is bind-mounted at the identical path
  in the containers so `docker run -v` paths resolve on the host.
- IMDS (169.254.169.254) is blocked from the docker bridge so sandboxed code
  cannot steal the instance role; IMDSv2 is enforced.
- The sandbox runs unprivileged, cap-dropped, read-only-root, resource-capped,
  with a scrubbed env and no Docker socket.

## Legacy

The retired EKS/Kubernetes manifests are under `legacy/` at the repo root, for
reference only.
