#!/bin/sh
set -eu
umask 077
password="$(cat /run/secrets/redis_password)"
case "$password" in ''|*[!a-zA-Z0-9]*) echo 'Invalid Redis secret format' >&2; exit 1;; esac
printf 'appendonly yes\nmaxmemory-policy noeviction\nrequirepass %s\n' "$password" > /tmp/zendix-redis.conf
exec redis-server /tmp/zendix-redis.conf
