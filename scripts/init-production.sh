#!/usr/bin/env bash
# Initialize only a new VPS deployment; never replace existing secrets.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v openssl >/dev/null || { echo 'Install OpenSSL before initializing.' >&2; exit 1; }
if [[ ! -f .env.production ]]; then
  read -r -p 'Email for TLS certificate notices: ' certificate_email </dev/tty
  [[ "$certificate_email" =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'Invalid email.' >&2; exit 1; }
  sed "s/operations@example.com/${certificate_email}/" .env.production.example > .env.production
  chmod 600 .env.production
fi
secret_names=(jwt_secret vault_key database_password redis_password)
existing=0
for name in "${secret_names[@]}"; do [[ ! -e "deploy/secrets/$name" ]] || existing=$((existing+1)); done
if [[ "$existing" -eq 4 ]]; then
  mkdir -p deploy/secrets
  chmod 700 deploy/secrets
  if [[ ! -e deploy/secrets/auth_email_api_key ]]; then : > deploy/secrets/auth_email_api_key; chmod 444 deploy/secrets/auth_email_api_key; fi
  if ! grep -q '^AUTH_EMAIL_API_KEY_PATH=' .env.production; then printf '\nAUTH_EMAIL_API_KEY_PATH=./deploy/secrets/auth_email_api_key\nAUTH_EMAIL_FROM_EMAIL=access@example.com\nAUTH_EMAIL_FROM_NAME=MailCraft\nAUTH_REQUIRE_EMAIL_VERIFICATION=true\n' >> .env.production; fi
  echo 'Existing production secrets retained; optional authentication email remains disabled until its MailChannels key is configured.'
  exit 0
fi
[[ "$existing" -eq 0 ]] || { echo 'Incomplete existing secret set. Restore the matching original secrets; no replacement was made.' >&2; exit 1; }
mkdir -p deploy/secrets
chmod 700 deploy/secrets
for name in "${secret_names[@]}"; do
  if [[ "$name" == vault_key ]]; then openssl rand -base64 32 > "deploy/secrets/$name"; else openssl rand -hex 48 > "deploy/secrets/$name"; fi
  chmod 444 "deploy/secrets/$name"
done
if [[ ! -e deploy/secrets/auth_email_api_key ]]; then : > deploy/secrets/auth_email_api_key; chmod 444 deploy/secrets/auth_email_api_key; fi
echo 'Production configuration initialized without displaying secrets.'
