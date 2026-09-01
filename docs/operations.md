# Production operations

## Release checklist

1. Require a green CI run, including lint, build, tests, and production dependency audit.
2. Review the generated Drizzle migration and take a database backup.
3. Apply migrations to staging, run the database integration test, and perform a QR claim test.
4. Apply migrations to production before deploying application code.
5. Verify `/api/health`, admin authentication, event state, one valid claim, one duplicate claim, and rate-limit responses.

## Monitoring and alerts

- Configure the hosting provider to poll `GET /api/health` every minute and alert after two failures.
- Alert on elevated HTTP 5xx, 429 spikes, function latency, and database connection/compute saturation.
- Application failures are emitted as single-line structured JSON to platform logs. Retain logs according to school policy and avoid exporting raw request headers or cookies.
- Configure a separate external availability check for `/` because health checks alone do not validate rendered pages.

## Backup and restore

- Enable Neon point-in-time restore with retention that matches the organization’s policy.
- Before each migration, create a named restore point or branch.
- Test restoration quarterly: restore into an isolated branch, set `TEST_DATABASE_URL`, run migrations, and execute `npm run test:unit`.
- Never test restores against production.

## Rollback

1. Disable active events from the admin console if claims must stop immediately.
2. Roll back the Vercel deployment to the previous known-good release.
3. Prefer forward-fix database migrations. If data restoration is necessary, block writes, restore to a new Neon branch, verify counts, then switch `DATABASE_URL` and redeploy.
4. Record the incident and reconcile claims created during the affected window.

## Secret rotation

- Rotate `ADMIN_PASSWORD` immediately after suspected disclosure.
- Rotating `CLAIM_DEVICE_SECRET` invalidates anonymous device cookies and changes IP rate-limit keys. Schedule it outside active events unless responding to compromise.
- Rotate database credentials through Neon, update Vercel, redeploy, and verify `/api/health`.

## Capacity and retention

- Load-test expected peak claim traffic against staging before large events.
- Periodically remove expired rows from `claim_rate_limits`; they contain only keyed hashes and counters. A suitable maintenance query is:

```sql
DELETE FROM claim_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '1 day';
```

- Define a retention period for claim records with school administration before collecting production data.
