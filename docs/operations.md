# Production operations

## Release checklist

1. Require green lint, build, tests, and production dependency audit results.
2. Review generated migrations and take a database backup.
3. Run `docker compose up -d --build`; the app container applies pending migrations before startup.
4. Check `docker compose ps` and `docker compose logs app`.
5. Verify `/api/health`, admin authentication, event state, one valid claim, one duplicate claim, and rate-limit responses.

## Reverse proxy and monitoring

- Keep the default `SERVER_BIND=127.0.0.1` and proxy the app through Nginx or Caddy with a valid TLS certificate.
- Forward the original `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers.
- Poll `GET /api/health` every minute and alert after two failures. Also monitor the public `/` route.
- Alert on HTTP 5xx errors, 429 spikes, container restarts, disk space, memory, and PostgreSQL connection saturation.
- Application logs are available with `docker compose logs`; retain them according to school policy.

## Backup and restore

Create regular encrypted backups outside the server. Example logical backup:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > festival-hub-$(date +%F-%H%M).dump
```

Restore into a new empty database first and test it; never test a restore against production:

```bash
cat backup.dump | docker compose exec -T db pg_restore -U festival_hub -d restored_database --clean --if-exists
```

Also back up the Compose configuration and secrets securely. Test restoration quarterly.

## Rollback

1. Close active events from the admin console if claims must stop immediately.
2. Check out the previous known-good commit and run `docker compose up -d --build`.
3. Prefer forward-fix database migrations. Database schema changes may not be compatible with old application images.
4. If restoration is necessary, stop the app, restore into an isolated database, verify row counts, then update `DATABASE_URL` and restart.
5. Record the incident and reconcile claims created during the affected window.

## Secret rotation

- Rotate `ADMIN_PASSWORD` immediately after suspected disclosure.
- Rotating `CLAIM_DEVICE_SECRET` invalidates anonymous device cookies and changes IP rate-limit keys. Schedule it outside active events unless responding to compromise.
- To rotate the PostgreSQL password, update it inside PostgreSQL and in `.env`, then recreate the app container. Changing only `POSTGRES_PASSWORD` after the database volume exists does not alter the existing database role password.

## Capacity and retention

- Load-test expected peak claim traffic against staging before large events.
- Tune `DATABASE_POOL_MAX` so all app instances together stay below PostgreSQL's connection limit.
- Watch the disk used by the `postgres_data` volume.
- Periodically remove expired rate-limit rows:

```sql
DELETE FROM claim_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '1 day';
```

- Define a retention period for claim records with school administration before collecting production data.
