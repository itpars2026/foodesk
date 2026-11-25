#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SHA="${1:?Missing release SHA}"
FRONTEND_DIGEST="${2:?Missing frontend digest}"
BACKEND_DIGEST="${3:?Missing backend digest}"

BASE="/opt/foodesk-releases"
DEST="$BASE/$SHA"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FETCH="$SCRIPT_DIR/fetch-images.sh"
VERIFY="$SCRIPT_DIR/verify-release.py"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || {
    echo "ERROR: Invalid SHA"
    exit 1
}

for digest in "$FRONTEND_DIGEST" "$BACKEND_DIGEST"; do
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
        echo "ERROR: Invalid digest"
        exit 1
    }
done

test -f "$FETCH"
test -f "$VERIFY"

mkdir -p "$BASE"
chmod 700 "$BASE"

exec 9>>"$BASE/.release.lock"

flock -n 9 || {
    echo "ERROR: Another preparation is running"
    exit 1
}

if [[ -e "$DEST" ]]; then
    echo "ERROR: Release directory already exists"
    exit 1
fi

echo "=== FETCH ==="

bash "$FETCH" \
    "$SHA" \
    "$FRONTEND_DIGEST" \
    "$BACKEND_DIGEST"

echo "=== VERIFY REGISTRY AND ARCHIVES ==="

python3 "$VERIFY" \
    "$SHA" \
    "$FRONTEND_DIGEST" \
    "$BACKEND_DIGEST" \
    --archive-dir "$DEST"

echo "=== RECORD ARCHIVE HASHES ==="

(
    cd "$DEST"

    sha256sum frontend.tar backend.tar \
        > archive.sha256.tmp

    sha256sum -c archive.sha256.tmp

    mv archive.sha256.tmp archive.sha256
)

echo "=== MARK RELEASE VERIFIED ==="

printf \
  'sha=%s\nfrontend=%s\nbackend=%s\n' \
  "$SHA" \
  "$FRONTEND_DIGEST" \
  "$BACKEND_DIGEST" \
  > "$DEST/.verified.tmp"

chmod 600 "$DEST/.verified.tmp"

mv "$DEST/.verified.tmp" "$DEST/.verified"

echo "PREPARE_RELEASE=SUCCESS"
echo "DOCKER_LOAD_EXECUTED=NO"
echo "PRODUCTION_MODIFIED=NO"
