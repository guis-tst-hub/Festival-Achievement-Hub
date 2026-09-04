# School server deployment

Target: one `linux/amd64` Ubuntu server on the school network. The application and PostgreSQL run on the same server. The database is not exposed outside Docker.

## 1. Server prerequisites

Run these checks on the server:

```bash
uname -m
docker --version
docker compose version
curl -I https://ghcr.io/v2/
```

Expected architecture is `x86_64`. A `401 Unauthorized` response from GHCR is acceptable before registry login; a DNS or connection timeout is not.

School IT must also provide:

- a fixed server address;
- student-network access to TCP 443;
- a stable DNS name;
- a certificate trusted by student devices, or a DNS/ACME path that allows Caddy to obtain one;
- confirmation that Wi-Fi client isolation does not block access to the server.

## 2. Publish an application image

The `Publish container image` workflow runs for tags beginning with `v` and can also be started manually. It verifies the source and publishes a `linux/amd64` image to GHCR.

Create the first release tag from a reviewed commit:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The expected image is:

```text
ghcr.io/guis-tst-hub/festival-achievement-hub:v0.1.0
```

Do not deploy a release until both the normal CI workflow and the image-publishing workflow succeed.

## 3. Prepare the server

Clone the repository only to obtain deployment configuration; the server does not build the application image.

```bash
sudo mkdir -p /opt/festival-hub
sudo chown "$USER" /opt/festival-hub
git clone https://github.com/guis-tst-hub/Festival-Achievement-Hub.git /opt/festival-hub
cd /opt/festival-hub
cp .env.example .env
chmod 600 .env
```

Edit `.env` and set fresh production-only values:

```dotenv
APP_IMAGE=ghcr.io/guis-tst-hub/festival-achievement-hub:v0.1.0
POSTGRES_DB=festival_hub
POSTGRES_USER=festival_hub
POSTGRES_PASSWORD=replace-with-a-production-random-value
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-different-production-random-value
CLAIM_DEVICE_SECRET=replace-with-at-least-32-random-characters
APP_PORT=3000
DATABASE_POOL_MAX=10
```

Generate separate hexadecimal values with `openssl rand -hex 24`, `openssl rand -hex 24`, and `openssl rand -hex 32`. Hex values avoid URL-encoding ambiguity in `DATABASE_URL`. Never copy development secrets to production.

For a private GHCR package, create a GitHub token with only `read:packages`, then sign in without putting the token on the command line:

```bash
read -rsp "GHCR token: " FESTIVAL_GHCR_TOKEN
printf '%s' "$FESTIVAL_GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset FESTIVAL_GHCR_TOKEN
```

## 4. First start

```bash
cd /opt/festival-hub
docker compose -f compose.production.yaml pull
docker compose -f compose.production.yaml up -d
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail=100 app
curl http://127.0.0.1:3000/api/health
```

The app container applies pending database migrations before starting. A migration failure stops the app instead of serving against a partially updated schema.

## 5. HTTPS

Keep application port 3000 bound to loopback and do not publish PostgreSQL port 5432. Configure a host-level Caddy or Nginx service to expose only HTTPS. `deploy/Caddyfile.example` is a starting point, not a ready-to-use school certificate configuration.

If the server is internal-only, public HTTP ACME validation may fail. Use a certificate supplied by school IT, DNS-based ACME validation, or another certificate chain trusted by every participating phone. `tls internal` and self-signed certificates are unsuitable for unmanaged student phones unless their trust stores are provisioned.

The reverse proxy must set the original `Host`/`X-Forwarded-Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` values. The production Compose file explicitly enables trusted proxy headers so that HTTPS admin requests are compared against the browser-facing origin instead of the container's internal HTTP address. This is safe only while port 3000 remains bound to `127.0.0.1` and the proxy overwrites those headers; never expose port 3000 directly with this setting enabled.

Caddy sets these standard forwarded headers for `reverse_proxy` automatically. If Nginx is used instead, configure it to overwrite them rather than accepting client-supplied values. Test the client IP before setting claim rate limits because many users appearing under one address can cause false 429 responses.

## 6. Backup before every update

```bash
cd /opt/festival-hub
mkdir -p backups
docker compose -f compose.production.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/festival-hub-$(date +%F-%H%M).dump"
```

Copy encrypted backups off the server. A Docker volume on the same disk is persistent storage, not a backup.

## 7. Deploy an update

After publishing and verifying `v0.1.1`, change `APP_IMAGE` in `.env`, then run:

```bash
cd /opt/festival-hub
git pull --ff-only
docker compose -f compose.production.yaml pull app
docker compose -f compose.production.yaml up -d app
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail=100 app
curl http://127.0.0.1:3000/api/health
```

Verify the public page, admin authentication, one valid claim, one duplicate claim, one closed-event QR, and the expected rate-limit behavior.

## 8. Rollback

Change `APP_IMAGE` back to the previous known-good tag and recreate the app container. Database migrations may not be backward compatible, so prefer a forward fix and never restore over the production database without testing the backup in isolation.

Do not run `docker compose down -v`; it deletes the PostgreSQL volume.
