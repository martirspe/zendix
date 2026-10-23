#!/usr/bin/env bash
# VPS deployment: retained secrets, pre-migration backups, private health, shared host ingress.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
mode=deploy; do_pull=false; skip_host=false; skip_tls=false; bootstrap_owner=false
for argument in "$@"; do
 case "$argument" in
  --init|--first-run) mode=init ;;
  --check) mode=check ;;
  --pull) do_pull=true ;;
  --skip-host|--skip-nginx) skip_host=true ;;
  --skip-tls) skip_tls=true ;;
  --bootstrap-owner) bootstrap_owner=true ;;
  --help)
   echo 'Usage: sudo ./scripts/deploy.sh [--first-run | --check] [--pull] [--skip-nginx] [--skip-tls] [--bootstrap-owner]'
   echo '  --first-run        create .env.production and persistent secrets'
   echo '  --init             alias for --first-run'
   echo '  --check            validate Docker, environment and Compose without changes'
   echo '  --pull             fast-forward pull before deployment'
   echo '  --skip-nginx       deploy Docker services without host Nginx/TLS changes'
   echo '  --skip-tls         configure host Nginx but defer certificate issuance'
   echo '  --bootstrap-owner  create the first owner after services are healthy'
   exit 0 ;;
  *) echo "Unknown argument: $argument" >&2; exit 1 ;;
 esac
done
if [[ "$mode" == init ]]; then bash scripts/init-production.sh; exit 0; fi
for dependency in docker curl; do command -v "$dependency" >/dev/null || { echo "Missing dependency: $dependency" >&2; exit 1; }; done
docker compose version >/dev/null
if ! docker info >/dev/null 2>&1; then
 if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
  echo "Docker is available only through sudo. Add ${USER:-the deploy user} to the docker group and start a new login session, or rerun with sudo." >&2
 else
  echo "Cannot access Docker at /var/run/docker.sock. Ensure Docker is running and add ${USER:-the deploy user} to the docker group, then log out and in again." >&2
  echo "Temporary alternative: sudo bash scripts/deploy.sh --check" >&2
 fi
 exit 1
fi
[[ -f .env.production ]] || { echo 'Run bash scripts/deploy.sh --init first.' >&2; exit 1; }
# Read only non-secret scalar settings; never execute the environment file as shell code.
setting() { awk -v key="$1" 'index($0,key"=")==1 {sub("^[^=]*=","");sub("\r$","");print;exit}' .env.production; }
export APP_HOST="$(setting APP_HOST)" ACME_EMAIL="$(setting ACME_EMAIL)" WEB_PORT="$(setting WEB_PORT)"
WEB_PORT="${WEB_PORT:-8092}"
[[ "$APP_HOST" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$APP_HOST" == *.* ]] || { echo 'Invalid APP_HOST.' >&2; exit 1; }
[[ "$ACME_EMAIL" =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ && "$ACME_EMAIL" != operations@example.com ]] || { echo 'Set a monitored ACME_EMAIL in .env.production.' >&2; exit 1; }
[[ "$WEB_PORT" =~ ^[0-9]+$ && "$WEB_PORT" -ge 1024 && "$WEB_PORT" -le 65535 ]] || { echo 'Invalid WEB_PORT.' >&2; exit 1; }
for name in jwt_secret vault_key database_password redis_password; do
 key="$(echo "$name" | tr '[:lower:]' '[:upper:]')_PATH"
 expected="./deploy/secrets/$name"
 [[ "$(setting "$key")" == "$expected" && -s "$expected" ]] || { echo "Automated deployment requires the configured default secret file: $expected. Existing custom installations must use the manual runbook." >&2; exit 1; }
 export "$key=$expected"
done
auth_key_path="$(setting AUTH_EMAIL_API_KEY_PATH)"
[[ "$auth_key_path" == ./deploy/secrets/auth_email_api_key && -f ./deploy/secrets/auth_email_api_key ]] || { echo 'Set up the optional authentication MailChannels key file at ./deploy/secrets/auth_email_api_key; it may be empty until authentication email is configured.' >&2; exit 1; }
export AUTH_EMAIL_API_KEY_PATH="$auth_key_path" AUTH_EMAIL_FROM_EMAIL="$(setting AUTH_EMAIL_FROM_EMAIL)" AUTH_EMAIL_FROM_NAME="$(setting AUTH_EMAIL_FROM_NAME)" AUTH_REQUIRE_EMAIL_VERIFICATION="$(setting AUTH_REQUIRE_EMAIL_VERIFICATION)" GOOGLE_OAUTH_ENABLED="$(setting GOOGLE_OAUTH_ENABLED)" GOOGLE_CLIENT_ID="$(setting GOOGLE_CLIENT_ID)"
compose=(docker compose --env-file .env.production -p mailcraft-production -f compose.production.yaml -f compose.host-proxy.yaml)
"${compose[@]}" config --quiet
if [[ "$mode" == check ]]; then echo 'Configuration and Docker preflight passed. No deployment or host changes performed.'; exit 0; fi
if [[ "$do_pull" == true ]]; then
 [[ -d .git ]] || { echo '--pull requires a Git checkout.' >&2; exit 1; }
 [[ -z "$(git status --porcelain)" ]] || { echo 'Commit or preserve local changes before --pull.' >&2; exit 1; }
 git pull --ff-only
 # Restart the script so newly pulled deployment code is consistently used.
 next_arguments=(); [[ "$skip_host" != true ]] || next_arguments+=(--skip-nginx); [[ "$skip_tls" != true ]] || next_arguments+=(--skip-tls); [[ "$bootstrap_owner" != true ]] || next_arguments+=(--bootstrap-owner)
 exec bash scripts/deploy.sh "${next_arguments[@]}"
fi
trap 'echo "Deployment stopped. Existing data and secrets were retained; inspect Docker status and the failed step before retrying." >&2' ERR
for service in migrate api web; do COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build "$service"; done
"${compose[@]}" run --rm -T --no-deps migrate sh -c 'npm test && npm run test:deploy'
"${compose[@]}" run --rm -T --no-deps --entrypoint node api -e "for(const name of ['JWT_SECRET_FILE','MAILCRAFT_MASTER_KEY_FILE','DATABASE_PASSWORD_FILE','REDIS_PASSWORD_FILE'])require('node:fs').accessSync(process.env[name],require('node:fs').constants.R_OK);console.log('Application secret mounts are readable.');"
"${compose[@]}" up -d --wait --wait-timeout 120 postgres redis
backup_directory="backups/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 -p "$backup_directory"
"${compose[@]}" exec -T postgres pg_dump -U mailcraft -Fc mailcraft > "$backup_directory/database.dump"
cp .env.production "$backup_directory/configuration.env"
tar -czf "$backup_directory/secrets.tar.gz" deploy/secrets/jwt_secret deploy/secrets/vault_key deploy/secrets/database_password deploy/secrets/redis_password deploy/secrets/auth_email_api_key
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api -C /var/lib/mailcraft/keys -czf - . > "$backup_directory/dkim.tar.gz"
[[ -s "$backup_directory/database.dump" && -s "$backup_directory/dkim.tar.gz" ]] || exit 1
echo "Private pre-migration backup: $backup_directory. Move an encrypted copy off-host."
"${compose[@]}" run --rm -T --no-deps migrate
"${compose[@]}" up -d --no-build --wait --wait-timeout 180 api web
if [[ "$bootstrap_owner" == true ]]; then
 read -r -p 'Organization name: ' owner_workspace </dev/tty
 read -r -p 'Owner email: ' owner_email </dev/tty
 read -r -s -p 'Owner password (16+ characters): ' owner_password </dev/tty; echo
 read -r -s -p 'Repeat password: ' owner_repeat </dev/tty; echo
 [[ "$owner_password" == "$owner_repeat" && "${#owner_password}" -ge 16 ]] || { echo 'Passwords do not match or are too short.' >&2; exit 1; }
 printf '%s\0%s\0%s\0' "$owner_workspace" "$owner_email" "$owner_password" | "${compose[@]}" run --rm -T --no-deps migrate node scripts/production-entry.mjs scripts/create-owner.mjs
 unset owner_password owner_repeat
fi
curl --fail --silent --show-error "http://127.0.0.1:$WEB_PORT/api/health" >/dev/null
if [[ "$skip_host" == true ]]; then echo 'Private stack is healthy. Host Nginx/TLS setup was skipped; public readiness is not asserted.'; exit 0; fi
host_arguments=(); [[ "$skip_tls" != true ]] || host_arguments+=(--skip-tls)
host_arguments+=("$APP_HOST" "$WEB_PORT" "$ACME_EMAIL")
if [[ "$EUID" -eq 0 ]]; then bash scripts/bootstrap-host.sh "${host_arguments[@]}"; else sudo bash scripts/bootstrap-host.sh "${host_arguments[@]}"; fi
if [[ "$skip_tls" == true ]]; then
 curl --fail --silent --show-error --retry 5 --retry-delay 2 "http://$APP_HOST/api/health" >/dev/null
 "${compose[@]}" ps
 echo "HTTP console upstream is configured at http://$APP_HOST. TLS issuance was skipped; point DNS to this VPS and rerun without --skip-tls. Commercial sending remains gated."
 exit 0
fi
curl --fail --silent --show-error --retry 5 --retry-delay 2 "https://$APP_HOST/api/health" >/dev/null
"${compose[@]}" ps
echo "HTTPS console is available at https://$APP_HOST. SMTP/DNS setup and a real received preview still need console verification. Commercial sending remains gated."
