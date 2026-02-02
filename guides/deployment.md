# Production Deployment Guide

This document operationalizes the deployment checklist from `Spec.md` and explains how to execute each step locally before pushing to the target server.

## 1. Pre-Deployment

### 1.1 Generate `.env.prod`

Use the helper script to copy `.env.prod.example`, generate secrets, and set CORS origins:

```bash
python3 setup/prepare_prod_env.py \
  --cors-origin dashboard.brandname.at \
  --include-www
```

Flags:

- `--secret-key` and `--db-password` let you supply externally generated values (otherwise secure defaults are generated).
- `--output` controls the name of the generated file (defaults to `.env.prod`).
- `--force` overwrites an existing output file.

The script also ensures `ssl/` exists and contains usage instructions.

### 1.2 Copy `.env.prod` to the server

Transfer the generated `.env.prod` to the deployment host (e.g., `/opt/onboarding-dashboard/.env.prod`) and keep it out of version control.

### 1.3 Verify `.env.prod` content

Ensure the following keys are set:

- `SECRET_KEY`
- `DB_PASSWORD`
- `DATABASE_URL`
- `CORS_ORIGINS`

## 2. SSL Certificates

- Das Verzeichnis `ssl/` enthält eine README mit den Pfaden für `fullchain.pem` und `privkey.pem`. Kopiere hier die Zertifikate von Let's Encrypt / deiner CA hinein.
- Für lokale Tests kannst du ein selbstsigniertes Zertifikat erzeugen:

```bash
./setup/generate_self_signed_cert.sh \
  --domain dashboard.brandname.at \
  --san www.dashboard.brandname.at \
  --days 30 --force
```

Dies ersetzt die bestehenden `ssl/*.pem`. Nutze echte Zertifikate, bevor du produktiven Traffic zulässt.

## 3. DNS

Create an `A` record for `{subdomain}` pointing to the production server. Anschließend kannst du die Auflösung und (optional) HTTPS-Erreichbarkeit testen:

```bash
python3 setup/validate_dns.py \
  --domain dashboard.brandname.at \
  --https-url https://dashboard.brandname.at/api/health \
  --insecure  # nur wenn Self-Signed-Zertifikat verwendet wird
```

Optionen:

- Mehrere `--expected-ip` Flags, um gegen konkrete IPs zu prüfen.
- `--insecure` überspringt TLS-Validierung (hilfreich für Test-Zertifikate – in Prod weglassen).

## 4. Deployment Commands

From the project root on the server (with `.env.prod` present):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
docker exec onboarding-backend alembic upgrade head
docker exec -it onboarding-backend python scripts/seed_data.py
```

## 5. Post-Deployment Verification

1. Health check: `curl https://{subdomain}/api/health`
2. SSL: `curl -I https://{subdomain}` and confirm TLS + security headers.
3. Application flows:
   - Admin login
   - Registration (pending approval)
   - Approval workflow

Automatisiere Health- und Header-Checks mit:

```bash
python3 setup/post_deploy_checks.py \
  --health-url https://{subdomain}/api/health \
  --headers-url https://{subdomain} \
  --expect-field status=ok
```

Optional: `--insecure`, falls noch ein selbstsigniertes Zertifikat aktiv ist.

Document each run to close the Build → Validate → Test loop described in the spec.
