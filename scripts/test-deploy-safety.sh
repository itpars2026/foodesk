#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

SHA="cfb09177c24583be82ac8914e691e5115e10e326"

check_rejected() {
  local name="$1"
  local expected="$2"
  shift 2

  local output rc

  if output="$("$@" 2>&1)"; then
    echo "FAIL: $name unexpectedly succeeded"
    exit 1
  else
    rc=$?
  fi

  if ! grep -Fq "$expected" <<< "$output"; then
    echo "FAIL: $name returned unexpected error"
    printf '%s\n' "$output"
    exit 1
  fi

  echo "$name=PASS (exit=$rc)"
}

check_rejected \
  "PRODUCTION_WITHOUT_PERMISSION" \
  "Production deployment is disabled" \
  env \
    ALLOW_PRODUCTION_DEPLOY=false \
    IMAGE_SOURCE=registry \
    DEPLOY_DRY_RUN=0 \
    bash scripts/deploy-ghcr.sh "$SHA"

check_rejected \
  "LOCAL_PRODUCTION_FORBIDDEN" \
  "Production requires IMAGE_SOURCE=registry" \
  env \
    ALLOW_PRODUCTION_DEPLOY=true \
    IMAGE_SOURCE=local \
    DEPLOY_DRY_RUN=0 \
    bash scripts/deploy-ghcr.sh "$SHA"

check_rejected \
  "INVALID_RELEASE_SHA" \
  "Invalid release SHA" \
  env \
    ALLOW_PRODUCTION_DEPLOY=false \
    IMAGE_SOURCE=registry \
    DEPLOY_DRY_RUN=1 \
    bash scripts/deploy-ghcr.sh invalid-sha

echo "DEPLOY_SAFETY_TESTS=SUCCESS"
