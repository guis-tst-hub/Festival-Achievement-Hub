#!/bin/sh
set -eu

compose_file=${COMPOSE_FILE:-compose.production.yaml}
env_file=${ENV_FILE:-.env}

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file. Copy an example file, then set unique secrets." >&2
  exit 1
fi

app_port=$(sed -n 's/^APP_PORT=//p' "$env_file" | tail -n 1)
app_port=${app_port:-3000}
server_bind=$(sed -n 's/^SERVER_BIND=//p' "$env_file" | tail -n 1)
server_bind=${server_bind:-127.0.0.1}
trust_proxy=$(sed -n 's/^TRUST_PROXY_HEADERS=//p' "$env_file" | tail -n 1)
trust_proxy=${trust_proxy:-false}
postgres_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$env_file" | tail -n 1)
admin_password=$(sed -n 's/^ADMIN_PASSWORD=//p' "$env_file" | tail -n 1)
device_secret=$(sed -n 's/^CLAIM_DEVICE_SECRET=//p' "$env_file" | tail -n 1)

case "$app_port" in
  *[!0-9]*|'')
    echo "APP_PORT must be a number." >&2
    exit 1
    ;;
esac
case "$server_bind" in
  127.0.0.1|0.0.0.0) ;;
  *)
    echo "SERVER_BIND must be 127.0.0.1 or 0.0.0.0." >&2
    exit 1
    ;;
esac
if [ "$server_bind" != "127.0.0.1" ] && [ "$trust_proxy" = "true" ]; then
  echo "TRUST_PROXY_HEADERS=true is unsafe when the app is directly exposed." >&2
  exit 1
fi
if [ ${#postgres_password} -lt 24 ] || [ ${#admin_password} -lt 16 ] || [ ${#device_secret} -lt 32 ]; then
  echo "Set a 24+ character database password, 16+ character admin password, and 32+ character device secret." >&2
  exit 1
fi
case "$postgres_password" in
  *[!A-Za-z0-9._~-]*)
    echo "POSTGRES_PASSWORD must be URL-safe; hexadecimal is recommended." >&2
    exit 1
    ;;
esac
if grep -q 'replace-with-' "$env_file"; then
  echo "Replace every example secret before deployment." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
docker compose --env-file "$env_file" -f "$compose_file" pull app
docker compose --env-file "$env_file" -f "$compose_file" up -d --wait --wait-timeout 120
docker compose --env-file "$env_file" -f "$compose_file" ps

curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 2 \
  "http://127.0.0.1:${app_port}/api/health"
printf '\nDeployment health check passed.\n'
