#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

cd /opt/food

SHA="${1:?Usage: deploy-ghcr.sh COMMIT_SHA}"
REPO="ghcr.io/itpars2026"
BACKUP_DIR="/opt/food/backups"
LOCK_FILE="/tmp/foodesk-deploy.lock"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: Invalid commit SHA"
  exit 1
fi

exec 9>"$LOCK_FILE"
flock -n 9 || {
  echo "ERROR: Another deployment is running"
  exit 1
}

echo "=== DEPLOY FOODESK ==="
echo "Commit: $SHA"

# Preconditions
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain)"

# Confirm the published commit is still remote main.
git \
  -c credential.helper='!gh auth git-credential' \
  -c credential.interactive=never \
  fetch origin main

REMOTE_SHA="$(git rev-parse origin/main)"

if [[ "$REMOTE_SHA" != "$SHA" ]]; then
  echo "ERROR: Remote main does not match deployment SHA"
  exit 1
fi

git merge-base --is-ancestor HEAD "$SHA" || {
  echo "ERROR: Deployment is not a fast-forward"
  exit 1
}

# Record the actual currently running images.
OLD_BACKEND="$(docker inspect -f '{{.Config.Image}}' backend)"
OLD_FRONTEND="$(docker inspect -f '{{.Config.Image}}' frontend)"

docker image inspect "$OLD_BACKEND" >/dev/null
docker image inspect "$OLD_FRONTEND" >/dev/null

echo "Previous backend: $OLD_BACKEND"
echo "Previous frontend: $OLD_FRONTEND"

export BACKEND_IMAGE_REPOSITORY="$REPO/foodesk-backend"
export FRONTEND_IMAGE_REPOSITORY="$REPO/foodesk-frontend"
export BACKEND_IMAGE_TAG="$SHA"
export FRONTEND_IMAGE_TAG="$SHA"

NEW_BACKEND="$BACKEND_IMAGE_REPOSITORY:$SHA"
NEW_FRONTEND="$FRONTEND_IMAGE_REPOSITORY:$SHA"

echo "=== PULL RELEASE IMAGES ==="
docker pull "$NEW_BACKEND"
docker pull "$NEW_FRONTEND"

docker image inspect "$NEW_BACKEND" >/dev/null
docker image inspect "$NEW_FRONTEND" >/dev/null

echo "=== PREPARE SOURCE ==="
git merge --ff-only "$SHA"

docker compose config --quiet

echo "=== VERIFY DATABASE HEALTH ==="
test "$(docker inspect -f '{{.State.Health.Status}}' db)" = healthy

echo "=== BACKUP POSTGRESQL ==="
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP="$BACKUP_DIR/foodesk_predeploy_${STAMP}_${SHA:0:12}.dump"

docker compose exec -T db sh -ec \
  'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$BACKUP"

test -s "$BACKUP"

docker compose exec -T db pg_restore -l \
  < "$BACKUP" > /dev/null

chmod 600 "$BACKUP"

echo "Backup validated: $BACKUP"

DEPLOY_STARTED=0
MIGRATIONS_ATTEMPTED=0

rollback() {
  local exit_code=$?

  trap - ERR EXIT

  if [[ "$exit_code" -ne 0 ]]; then
    echo "ERROR: Deployment failed with exit code $exit_code"

    if [[ "$DEPLOY_STARTED" -eq 1 ]]; then
      echo "=== RESTORE PREVIOUS APPLICATION IMAGES ==="

      export BACKEND_IMAGE_REPOSITORY="${OLD_BACKEND%:*}"
      export FRONTEND_IMAGE_REPOSITORY="${OLD_FRONTEND%:*}"
      export BACKEND_IMAGE_TAG="${OLD_BACKEND##*:}"
      export FRONTEND_IMAGE_TAG="${OLD_FRONTEND##*:}"

      docker compose up -d \
        --no-deps \
        --no-build \
        --wait \
        --wait-timeout 120 \
        backend frontend || {
          echo "CRITICAL: Application rollback failed"
        }
    fi

    if [[ "$MIGRATIONS_ATTEMPTED" -eq 1 ]]; then
      echo "WARNING: Database migrations were attempted."
      echo "Database was NOT restored automatically."
      echo "Backup: $BACKUP"
      echo "Review schema compatibility before further action."
    fi
  fi

  exit "$exit_code"
}

trap rollback EXIT

echo "=== RUN DATABASE MIGRATIONS ==="
MIGRATIONS_ATTEMPTED=1

docker compose run --rm --no-deps \
  backend python manage.py migrate --noinput

echo "=== DEPLOY APPLICATION ==="
DEPLOY_STARTED=1

docker compose up -d \
  --no-deps \
  --no-build \
  --wait \
  --wait-timeout 120 \
  backend frontend

echo "=== FINAL HEALTH CHECK ==="

for service in db backend frontend; do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$service")"

  echo "$service: $status"

  test "$status" = healthy
done

test "$(docker inspect -f '{{.Config.Image}}' backend)" = "$NEW_BACKEND"
test "$(docker inspect -f '{{.Config.Image}}' frontend)" = "$NEW_FRONTEND"

echo "=== DEPLOYMENT COMPLETED ==="
docker compose ps

echo "Release: $SHA"
echo "Backup: $BACKUP"
