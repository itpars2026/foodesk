#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BASE="/opt/foodesk-releases"
VERIFY="$SCRIPT_DIR/verify-release.py"

SHA="${1:?Usage: load-release.sh SHA check|load}"
MODE="${2:?Missing mode: check or load}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "ERROR: Invalid release SHA"
  exit 1
}

[[ "$MODE" == check || "$MODE" == load ]] || {
  echo "ERROR: Mode must be check or load"
  exit 1
}

mkdir -p "$BASE"

exec 9>>"$BASE/.release.lock"

flock -n 9 || {
  echo "ERROR: Another release operation is running"
  exit 1
}

DIR="$BASE/$SHA"

test -d "$DIR"
test -f "$DIR/.verified"
test -f "$DIR/archive.sha256"
test -f "$DIR/frontend.tar"
test -f "$DIR/backend.tar"
test -f "$VERIFY"

echo "=== VALIDATE RELEASE METADATA ==="

DIGEST_TEXT="$(
  python3 - "$DIR/.verified" "$SHA" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
expected_sha = sys.argv[2]

lines = path.read_text().splitlines()

if len(lines) != 3:
    raise SystemExit("INVALID_RELEASE_METADATA")

values = {}

for line in lines:
    if "=" not in line:
        raise SystemExit("INVALID_METADATA_LINE")

    key, value = line.split("=", 1)

    if key in values:
        raise SystemExit("DUPLICATE_METADATA_KEY")

    values[key] = value

if set(values) != {"sha", "frontend", "backend"}:
    raise SystemExit("INVALID_METADATA_FIELDS")

if values["sha"] != expected_sha:
    raise SystemExit("RELEASE_SHA_MISMATCH")

for service in ("frontend", "backend"):
    digest = values[service]

    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise SystemExit("INVALID_IMAGE_DIGEST")

    print(digest)
PY
)"

mapfile -t DIGESTS <<< "$DIGEST_TEXT"

test "${#DIGESTS[@]}" -eq 2

echo "RELEASE_METADATA=OK"

echo
echo "=== VALIDATE ARCHIVE HASHES ==="

(
  cd "$DIR"
  sha256sum -c archive.sha256
)

echo
echo "=== VERIFY AGAINST GHCR ==="

python3 "$VERIFY" \
  "$SHA" \
  "${DIGESTS[0]}" \
  "${DIGESTS[1]}" \
  --archive-dir "$DIR"

if [[ "$MODE" == check ]]; then
  echo
  echo "RELEASE_CHECK=SUCCESS"
  echo "DOCKER_LOAD_EXECUTED=NO"
  exit 0
fi

echo
echo "=== LOAD IMAGES ==="

for SERVICE in frontend backend; do
  docker image load \
    --platform linux/amd64 \
    --input "$DIR/$SERVICE.tar"

  IMAGE="ghcr.io/itpars2026/foodesk-$SERVICE:$SHA"

  REVISION="$(
    docker image inspect "$IMAGE" \
      --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
  )"

  test "$REVISION" = "$SHA" || {
    echo "ERROR: Loaded image revision mismatch"
    exit 1
  }

  echo "$SERVICE: LOADED_AND_VERIFIED"
done

echo
echo "RELEASE_LOAD=SUCCESS"
