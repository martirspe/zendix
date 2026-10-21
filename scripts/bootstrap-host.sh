#!/usr/bin/env bash
# Configure only this application virtual host; shared Nginx remains in place.
set -euo pipefail
[[ $# -eq 3 ]] || { echo 'Usage: bootstrap-host.sh HOST PORT ACME_EMAIL' >&2; exit 1; }
app_host="$1"; upstream_port="$2"; certificate_email="$3"
[[ "$app_host" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$app_host" == *.* ]] || exit 1
[[ "$upstream_port" =~ ^[0-9]+$ && "$upstream_port" -ge 1024 && "$upstream_port" -le 65535 ]] || exit 1
[[ "$certificate_email" =~ ^[a-zA-Z0-9._+%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || exit 1
[[ "${EUID}" -eq 0 ]] || { echo 'Run host setup with sudo.' >&2; exit 1; }
if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
  command -v apt-get >/dev/null || { echo 'Install nginx, certbot and the Nginx Certbot plugin using your OS package manager.' >&2; exit 1; }
  apt-get update
  apt-get install -y nginx certbot python3-certbot-nginx
fi
nginx -t
config_path="/etc/nginx/sites-available/mailcraft-${app_host}.conf"
enabled_path="/etc/nginx/sites-enabled/mailcraft-${app_host}.conf"
# Preserve successful Certbot-managed configuration on repeat deployments.
if [[ ! -f "$config_path" ]]; then
  if nginx -T 2>&1 | grep -F "server_name ${app_host}" >/dev/null; then echo 'This hostname already has an Nginx configuration. Review it manually before proceeding.' >&2; exit 1; fi
  temp_config="$(mktemp)"
  trap 'rm -f "$temp_config"' EXIT
  cat > "$temp_config" <<CONFIG
# Managed initial configuration for MailCraft. Certbot maintains TLS directives.
server {
    listen 80;
    server_name ${app_host};
    client_max_body_size 1m;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'" always;
    location / {
        proxy_pass http://127.0.0.1:${upstream_port};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
CONFIG
  install -m 644 "$temp_config" "$config_path"
  ln -s "$config_path" "$enabled_path"
  if ! nginx -t; then rm -f "$enabled_path" "$config_path"; echo 'New vhost failed validation; removed only the new files.' >&2; exit 1; fi
  systemctl reload nginx
fi
grep -F "proxy_pass http://127.0.0.1:${upstream_port};" "$config_path" >/dev/null || { echo "Existing app vhost uses a different upstream port. Update and validate it before continuing." >&2; exit 1; }
certbot --nginx --non-interactive --agree-tos --redirect --email "$certificate_email" -d "$app_host" --keep-until-expiring
nginx -t
systemctl reload nginx
echo 'Application host configuration validated. Check the VPS firewall allows TCP 80 and 443.'
