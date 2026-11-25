#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Resolve the repository root from this script's location.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

SHA="${1:?Usage: deploy-ghcr.sh COMMIT_SHA}"
IMAGE_SOURCE="${IMAGE_SOURCE:-registry}"
REPO="ghcr.io/itpars2026"
BACKUP_DIR="/opt/food/backups"

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: Invalid release SHA"
  exit 1
fi

if [[ "$IMAGE_SOURCE" != local && "$IMAGE_SOURCE" != registry ]]; then
  echo "ERROR: IMAGE_SOURCE must be local or registry"
  exit 1
fi

DEPLOY_DRY_RUN="${DEPLOY_DRY_RUN:-0}"

if [[ "$DEPLOY_DRY_RUN" != 0 && "$DEPLOY_DRY_RUN" != 1 ]]; then
  echo "ERROR: DEPLOY_DRY_RUN must be 0 or 1"
  exit 1
fi

# Production must use the CI-authorized registry release path.
if [[ "$DEPLOY_DRY_RUN" == 0 && "$IMAGE_SOURCE" != registry ]]; then
  echo "ERROR: Production requires IMAGE_SOURCE=registry"
  exit 1
fi

# Production deployment is disabled by default.
# Dry-runs do not replace running containers.
ALLOW_PRODUCTION_DEPLOY="${ALLOW_PRODUCTION_DEPLOY:-false}"

if [[ "$ALLOW_PRODUCTION_DEPLOY" != true &&
      "$ALLOW_PRODUCTION_DEPLOY" != false ]]; then
  echo "ERROR: ALLOW_PRODUCTION_DEPLOY must be true or false"
  exit 1
fi

if [[ "$DEPLOY_DRY_RUN" != 1 &&
      "$ALLOW_PRODUCTION_DEPLOY" != true ]]; then
  echo "ERROR: Production deployment is disabled"
  echo "Set ALLOW_PRODUCTION_DEPLOY=true explicitly to authorize it"
  exit 1
fi

exec 9>/tmp/foodesk-deploy.lock
flock -n 9 || {
  echo "ERROR: Another deployment is running"
  exit 1
}

echo "=== FOODESK DEPLOYMENT ==="
echo "Release: $SHA"
echo "Image source: $IMAGE_SOURCE"

test "$(git branch --show-current)" = main

# Local deployments must use the checked-out release.
# The deployment script may have uncommitted changes,
# but the application source is not switched or merged.
if [[ "$IMAGE_SOURCE" == local ]]; then
  # The release commit must exist in the local repository.
  git cat-file -e "${SHA}^{commit}" || {
    echo "ERROR: Release commit not found locally"
    exit 1
  }

  # Local images must match the application and Compose source.
  # CI/CD script and workflow changes are allowed during dry-runs.
  APP_PATHS=(
    backend
    frontend
    docker-compose.yml
    docker-compose.yaml
    compose.yml
    compose.yaml
  )

  if ! git diff --quiet "$SHA" HEAD -- "${APP_PATHS[@]}"; then
    echo "ERROR: Application source differs from release"
    exit 1
  fi

  if ! git diff --quiet -- "${APP_PATHS[@]}" ||
     ! git diff --cached --quiet -- "${APP_PATHS[@]}"; then
    echo "ERROR: Uncommitted application changes"
    exit 1
  fi

  if [[ -n "$(git ls-files --others --exclude-standard -- "${APP_PATHS[@]}")" ]]; then
    echo "ERROR: Untracked application files found"
    exit 1
  fi

else
  # Release must exist in the locally fetched Git history.
  # Deployment must never switch the active checkout.
  git cat-file -e "${SHA}^{commit}" || {
    echo "ERROR: Release commit not found locally"
    exit 1
  }

  git merge-base --is-ancestor "$SHA" HEAD || {
    echo "ERROR: Release is not an ancestor of local HEAD"
    exit 1
  }

fi

# Fail closed if runtime deployment configuration differs
# between the image release and the current checkout.
echo "=== VERIFY RELEASE CONFIG COMPATIBILITY ==="

RUNTIME_PATHS=(
  docker-compose.yml
  docker-compose.yaml
  compose.yml
  compose.yaml
  backend/config/settings
  frontend/nginx.conf
)

if ! git diff --quiet "$SHA" HEAD -- "${RUNTIME_PATHS[@]}"; then
  echo "ERROR: Runtime configuration differs from release"
  echo "Review the following files before deployment:"
  git diff --name-only "$SHA" HEAD -- "${RUNTIME_PATHS[@]}"
  exit 1
fi

if ! git diff --quiet -- "${RUNTIME_PATHS[@]}" ||
   ! git diff --cached --quiet -- "${RUNTIME_PATHS[@]}"; then
  echo "ERROR: Uncommitted runtime configuration changes"
  exit 1
fi

echo "RELEASE_CONFIG_COMPATIBLE=YES"

# Save the actual running image references.
OLD_BACKEND="$(docker inspect -f '{{.Config.Image}}' backend)"
OLD_FRONTEND="$(docker inspect -f '{{.Config.Image}}' frontend)"

OLD_BACKEND_ID="$(docker image inspect -f '{{.Id}}' "$OLD_BACKEND")"
OLD_FRONTEND_ID="$(docker image inspect -f '{{.Id}}' "$OLD_FRONTEND")"

echo "Old backend: $OLD_BACKEND"
echo "Old frontend: $OLD_FRONTEND"

export BACKEND_IMAGE_REPOSITORY="$REPO/foodesk-backend"
export FRONTEND_IMAGE_REPOSITORY="$REPO/foodesk-frontend"
export BACKEND_IMAGE_TAG="$SHA"
export FRONTEND_IMAGE_TAG="$SHA"

NEW_BACKEND="$BACKEND_IMAGE_REPOSITORY:$SHA"
NEW_FRONTEND="$FRONTEND_IMAGE_REPOSITORY:$SHA"

if [[ "$IMAGE_SOURCE" == registry ]]; then
  echo "=== VERIFY GITHUB CI RELEASE ==="

  python3 scripts/release/verify-ci.py "$SHA"

  if [[ "$DEPLOY_DRY_RUN" == 1 ]]; then
    echo "=== CHECK VERIFIED RELEASE (NO LOAD) ==="
    bash scripts/release/load-release.sh "$SHA" check
  else
    echo "=== LOAD VERIFIED RELEASE IMAGES ==="
    bash scripts/release/load-release.sh "$SHA" load
  fi
else
  echo "=== USE LOCAL IMAGES ==="
fi

NEW_BACKEND_ID="$(docker image inspect -f '{{.Id}}' "$NEW_BACKEND")"
NEW_FRONTEND_ID="$(docker image inspect -f '{{.Id}}' "$NEW_FRONTEND")"

echo "Backend image ID: $NEW_BACKEND_ID"
echo "Frontend image ID: $NEW_FRONTEND_ID"

docker compose config --quiet

echo "=== DATABASE HEALTH ==="
test "$(docker inspect -f '{{.State.Health.Status}}' db)" = healthy

echo "=== MIGRATION CHECK ==="

docker compose run --rm \
  --no-deps \
  --pull never \
  backend python manage.py migrate --plan

# Django exits nonzero if unapplied migrations exist.
docker compose run --rm \
  --no-deps \
  --pull never \
  backend python manage.py migrate --check || {
    echo "ERROR: Pending migrations require separate approval"
    exit 1
  }

if [[ "$DEPLOY_DRY_RUN" == 1 ]]; then
  echo "=== DRY-RUN COMPLETED ==="
  echo "Release: $SHA"
  echo "Backend image: $NEW_BACKEND"
  echo "Frontend image: $NEW_FRONTEND"
  echo "No application containers were replaced."
  echo "No database migration was applied."
  exit 0
fi

echo "=== BACKUP DATABASE ==="
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

echo "Backup archive checked: $BACKUP"

DEPLOY_STARTED=0

on_exit() {
  local result=$?
  trap - EXIT
  set +e

  if [[ "$result" -ne 0 && "$DEPLOY_STARTED" -eq 1 ]]; then
    echo "=== DEPLOYMENT FAILED: ATTEMPTING ROLLBACK ==="

    export BACKEND_IMAGE_REPOSITORY="${OLD_BACKEND%:*}"
    export FRONTEND_IMAGE_REPOSITORY="${OLD_FRONTEND%:*}"
    export BACKEND_IMAGE_TAG="${OLD_BACKEND##*:}"
    export FRONTEND_IMAGE_TAG="${OLD_FRONTEND##*:}"

    docker compose up -d \
      --no-deps \
      --no-build \
      --pull never \
      --wait \
      --wait-timeout 120 \
      backend frontend

    rollback_result=$?

    CURRENT_BACKEND_ID="$(docker inspect -f '{{.Image}}' backend 2>/dev/null)"
    CURRENT_FRONTEND_ID="$(docker inspect -f '{{.Image}}' frontend 2>/dev/null)"

    BACKEND_HEALTH="$(docker inspect -f '{{.State.Health.Status}}' backend 2>/dev/null)"
    FRONTEND_HEALTH="$(docker inspect -f '{{.State.Health.Status}}' frontend 2>/dev/null)"

    if [[ "$rollback_result" -eq 0 &&
          "$CURRENT_BACKEND_ID" == "$OLD_BACKEND_ID" &&
          "$CURRENT_FRONTEND_ID" == "$OLD_FRONTEND_ID" &&
          "$BACKEND_HEALTH" == healthy &&
          "$FRONTEND_HEALTH" == healthy ]]; then
      echo "ROLLBACK_VERIFIED=YES"
    else
      echo "CRITICAL: Application rollback was not verified"
      echo "Backend health: $BACKEND_HEALTH"
      echo "Frontend health: $FRONTEND_HEALTH"
      echo "Manual intervention required"
    fi
  fi

  if [[ "$result" -ne 0 ]]; then
    echo "Deployment failed."
    echo "Database was NOT restored automatically."
    echo "Backup: $BACKUP"
  fi

  exit "$result"
}

trap on_exit EXIT

echo "=== DEPLOY APPLICATION ==="
DEPLOY_STARTED=1

docker compose up -d \
  --no-deps \
  --no-build \
  --pull never \
  --wait \
  --wait-timeout 120 \
  backend frontend

echo "=== VERIFY CONTAINERS ==="

for service in db backend frontend; do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$service")"
  echo "$service: $health"

  test "$health" = healthy
done

test "$(docker inspect -f '{{.Image}}' backend)" = "$NEW_BACKEND_ID"
test "$(docker inspect -f '{{.Image}}' frontend)" = "$NEW_FRONTEND_ID"

echo "=== DEPLOYMENT SUCCESSFUL ==="

docker compose ps

echo "Release: $SHA"
echo "Backup: $BACKUP"
