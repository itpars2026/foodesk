#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SHA="${1:?Usage: fetch-images.sh SHA FRONTEND_DIGEST BACKEND_DIGEST}"
FRONTEND_DIGEST="${2:?Missing frontend digest}"
BACKEND_DIGEST="${3:?Missing backend digest}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || {
    echo "ERROR: Invalid release SHA"
    exit 1
}

for digest in "$FRONTEND_DIGEST" "$BACKEND_DIGEST"; do
    [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
        echo "ERROR: Invalid digest"
        exit 1
    }
done

PROXY="http://127.0.0.1:10809"
BASE="/opt/foodesk-releases"
DEST="$BASE/$SHA"

mkdir -p "$BASE"
chmod 700 "$BASE"

if [[ -e "$DEST" ]]; then
    echo "ERROR: Release directory already exists"
    exit 1
fi

mkdir -m 700 "$DEST"

export HTTP_PROXY="$PROXY"
export HTTPS_PROXY="$PROXY"
export ALL_PROXY="$PROXY"
export NO_PROXY="localhost,127.0.0.1"

download_image() {
    local service="$1"
    local digest="$2"
    local repo="ghcr.io/itpars2026/foodesk-$service"
    local archive="$DEST/$service.tar"
    local temporary="$archive.partial"

    echo "=== DOWNLOAD $service ==="

    skopeo --override-os linux --override-arch amd64 \
        copy \
        --retry-times 3 \
        "docker://$repo@$digest" \
        "docker-archive:$temporary:$repo:$SHA" \
        >/dev/null

    test -s "$temporary"
    mv "$temporary" "$archive"

    echo "$service: DOWNLOAD_OK"
}

download_image frontend "$FRONTEND_DIGEST"
download_image backend "$BACKEND_DIGEST"

echo "=== DOWNLOADED ARCHIVES ==="
ls -lh "$DEST"/*.tar

echo "FETCH_COMPLETED"
echo "Docker Load was NOT executed."
echo "Production was NOT modified."
