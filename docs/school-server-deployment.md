# School server deployment

Target: one `linux/amd64` Ubuntu server on the school network. The application and PostgreSQL are managed by the same Compose file but remain separate containers. This keeps database files persistent and lets either service restart independently. PostgreSQL is never published to the host or school network.

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

For the currently tested release, the expected image is:

```text
ghcr.io/guis-tst-hub/festival-achievement-hub:v0.6.1
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
APP_IMAGE=ghcr.io/guis-tst-hub/festival-achievement-hub:v0.6.1
POSTGRES_DB=festival_hub
POSTGRES_USER=festival_hub
POSTGRES_PASSWORD=replace-with-a-production-random-value
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-different-production-random-value
CLAIM_DEVICE_SECRET=replace-with-at-least-32-random-characters
SERVER_BIND=127.0.0.1
APP_PORT=3000
DATABASE_POOL_MAX=20
TRUST_PROXY_HEADERS=true
```

Generate separate hexadecimal values with `openssl rand -hex 24`, `openssl rand -hex 24`, and `openssl rand -hex 32`. Hex values avoid URL-encoding ambiguity in `DATABASE_URL`. Never copy development secrets to production.

For a private GHCR package, create a GitHub token with only `read:packages`, then sign in without putting the token on the command line:

```bash
read -rsp "GHCR token: " FESTIVAL_GHCR_TOKEN
printf '%s' "$FESTIVAL_GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset FESTIVAL_GHCR_TOKEN
```

## 4. School LAN test start

For the existing school test server, keep its current secret values and set only these non-secret mode values in `.env`:

```dotenv
APP_IMAGE=ghcr.io/guis-tst-hub/festival-achievement-hub:v0.6.1
SERVER_BIND=0.0.0.0
APP_PORT=3001
DATABASE_POOL_MAX=20
TRUST_PROXY_HEADERS=false
```

For a new test installation, `deploy/school-test.env.example` is the complete template. Do not overwrite an existing `.env`, because it contains the live database and administrator secrets.

Start or update both the application and database with the checked deployment helper:

```bash
cd /opt/festival-hub
./deploy/update-compose.sh
```

The helper validates the Compose file, pulls the configured application image once, starts both containers, waits for their health checks, and verifies `/api/health`. It does not remove the database volume.

The test site is then available at `http://SERVER_LAN_IP:3001`. Direct HTTP mode deliberately ignores client-supplied proxy address headers. Per-device claim limiting remains active, while address-based limiting is enabled only in the trusted HTTPS reverse-proxy mode. This prevents hundreds of LAN users from accidentally sharing one `unknown` address bucket.

Run a read-only 500-request preflight after the containers are healthy:

```bash
node scripts/load-smoke.mjs http://127.0.0.1:3001 500 25
```

This checks the health and public festival APIs with 25 concurrent requests. It is a practical smoke test for the expected low-workload audience, not a guarantee for 500 simultaneous claim writes.

If the helper is unavailable, the equivalent manual commands are:

```bash
cd /opt/festival-hub
docker compose -f compose.production.yaml pull
docker compose -f compose.production.yaml up -d --wait --wait-timeout 120
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail=100 app
curl http://127.0.0.1:3001/api/health
```

The app container applies pending database migrations before starting. A migration failure stops the app instead of serving against a partially updated schema.

## 5. Formal HTTPS deployment

Keep the application port bound to loopback with `SERVER_BIND=127.0.0.1` and do not publish PostgreSQL port 5432. Set `TRUST_PROXY_HEADERS=true`, then configure a host-level Caddy or Nginx service to expose only HTTPS. `deploy/Caddyfile.example` is a starting point, not a ready-to-use school certificate configuration. The Compose stack attaches the app to a normal frontend bridge for the loopback port and to an internal backend network for PostgreSQL; the database remains isolated.

If the server is internal-only, public HTTP ACME validation may fail. Use a certificate supplied by school IT, DNS-based ACME validation, or another certificate chain trusted by every participating phone. `tls internal` and self-signed certificates are unsuitable for unmanaged student phones unless their trust stores are provisioned.

The reverse proxy must set the original `Host`/`X-Forwarded-Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` values. `TRUST_PROXY_HEADERS=true` makes HTTPS admin requests compare against the browser-facing origin instead of the container's internal HTTP address. This is safe only while the application port remains bound to `127.0.0.1` and the proxy overwrites those headers; never expose the application directly with this setting enabled.

Caddy sets these standard forwarded headers for `reverse_proxy` automatically. If Nginx is used instead, configure it to overwrite them rather than accepting client-supplied values. Test the client IP before setting claim rate limits because many users appearing under one address can cause false 429 responses.

If the default host port is already occupied, choose another one in `.env`, for example `APP_PORT=3100`, and update the Caddy/Nginx upstream to `127.0.0.1:3100`.

### Temporary direct LAN HTTP mode

For short tests without a reverse proxy, use:

```dotenv
SERVER_BIND=0.0.0.0
APP_PORT=3100
DATABASE_POOL_MAX=20
TRUST_PROXY_HEADERS=false
```

Then open `http://SERVER_LAN_IP:3100`. Restrict this port to the intended school network. This mode does not provide transport encryption, browser camera access, or safe administrator credential transport, so it is not suitable for the formal event deployment.

## 6. Backup before every update

```bash
cd /opt/festival-hub
mkdir -p backups
docker compose -f compose.production.yaml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/festival-hub-$(date +%F-%H%M).dump"
```

Copy encrypted backups off the server. A Docker volume on the same disk is persistent storage, not a backup.

## 7. Deploy an update

After publishing and verifying the next release, change `APP_IMAGE` in `.env`, then run:

```bash
cd /opt/festival-hub
git pull --ff-only
./deploy/update-compose.sh
```

Verify the public page, admin authentication, one valid claim, one duplicate claim, one closed-event QR, and the expected rate-limit behavior.

## 8. Rollback

Change `APP_IMAGE` back to the previous known-good tag and recreate the app container. Database migrations may not be backward compatible, so prefer a forward fix and never restore over the production database without testing the backup in isolation.

Do not run `docker compose down -v`; it deletes the PostgreSQL volume.
