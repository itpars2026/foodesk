#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import subprocess
import tarfile
from pathlib import Path

REPO = "ghcr.io/itpars2026"
PROXY = "http://127.0.0.1:10809"


def digest_bytes(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def registry_manifest(reference):
    env = os.environ.copy()
    env.update({
        "HTTP_PROXY": PROXY,
        "HTTPS_PROXY": PROXY,
        "ALL_PROXY": PROXY,
        "NO_PROXY": "localhost,127.0.0.1",
    })

    result = subprocess.run(
        ["skopeo", "inspect", "--raw",
         f"docker://{reference}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        timeout=120,
    )

    if result.returncode:
        raise RuntimeError(
            "Registry inspection failed "
            f"(exit={result.returncode})"
        )

    return result.stdout, json.loads(result.stdout)


def verify(service, sha, index_digest, archive):
    print(f"\n=== VERIFY {service.upper()} ===", flush=True)

    repo = f"{REPO}/foodesk-{service}"

    # Verify registry index.
    raw_index, index = registry_manifest(
        f"{repo}@{index_digest}"
    )

    if digest_bytes(raw_index) != index_digest:
        raise ValueError("INDEX_DIGEST_MISMATCH")

    platforms = [
        item for item in index.get("manifests", [])
        if item.get("platform", {}).get("os") == "linux"
        and item.get("platform", {}).get(
            "architecture"
        ) == "amd64"
    ]

    if len(platforms) != 1:
        raise ValueError("INVALID_AMD64_PLATFORM_COUNT")

    platform_digest = platforms[0]["digest"]

    raw_platform, platform = registry_manifest(
        f"{repo}@{platform_digest}"
    )

    if digest_bytes(raw_platform) != platform_digest:
        raise ValueError("PLATFORM_DIGEST_MISMATCH")

    expected_config = platform["config"]["digest"]
    expected_layers = len(platform["layers"])

    # Verify local archive.
    with tarfile.open(archive, "r") as tar:
        manifest_member = tar.extractfile("manifest.json")
        if manifest_member is None:
            raise ValueError("MISSING_MANIFEST")

        archive_manifest = json.load(manifest_member)

        if len(archive_manifest) != 1:
            raise ValueError("INVALID_ARCHIVE_MANIFEST")

        entry = archive_manifest[0]

        expected_tag = f"{repo}:{sha}"
        if entry.get("RepoTags") != [expected_tag]:
            raise ValueError("IMAGE_TAG_MISMATCH")

        config_file = tar.extractfile(entry["Config"])
        if config_file is None:
            raise ValueError("MISSING_CONFIG")

        config_raw = config_file.read()

        if digest_bytes(config_raw) != expected_config:
            raise ValueError("CONFIG_DIGEST_MISMATCH")

        config = json.loads(config_raw)

        if (
            config.get("architecture") != "amd64"
            or config.get("os") != "linux"
        ):
            raise ValueError("ARCHITECTURE_MISMATCH")

        labels = config.get("config", {}).get(
            "Labels"
        ) or {}

        if labels.get(
            "org.opencontainers.image.revision"
        ) != sha:
            raise ValueError("REVISION_MISMATCH")

        layers = entry["Layers"]
        diff_ids = config["rootfs"]["diff_ids"]

        if not (
            len(layers)
            == len(diff_ids)
            == expected_layers
        ):
            raise ValueError("LAYER_COUNT_MISMATCH")

        for index, (layer, expected) in enumerate(
            zip(layers, diff_ids), start=1
        ):
            member = tar.getmember(layer)

            if not member.isfile():
                raise ValueError("INVALID_LAYER_MEMBER")

            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError("MISSING_LAYER")

            hasher = hashlib.sha256()

            with stream:
                for chunk in iter(
                    lambda: stream.read(1024 * 1024),
                    b"",
                ):
                    hasher.update(chunk)

            actual = "sha256:" + hasher.hexdigest()

            if actual != expected:
                raise ValueError(
                    f"LAYER_{index}_DIGEST_MISMATCH"
                )

    print("INDEX_DIGEST: MATCH")
    print("PLATFORM_DIGEST: MATCH")
    print("CONFIG_DIGEST: MATCH")
    print("REVISION: MATCH")
    print("IMAGE_TAG: MATCH")
    print(f"LAYERS: {expected_layers}/{expected_layers}")
    print(f"{service.upper()}_VERIFIED=YES")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sha")
    parser.add_argument("frontend_digest")
    parser.add_argument("backend_digest")
    parser.add_argument(
        "--archive-dir",
        default="/tmp/foodesk-oci-test",
    )

    args = parser.parse_args()

    if (
        len(args.sha) != 40
        or any(c not in "0123456789abcdef" for c in args.sha)
    ):
        raise ValueError("INVALID_RELEASE_SHA")

    for digest in (
        args.frontend_digest,
        args.backend_digest,
    ):
        if (
            not digest.startswith("sha256:")
            or len(digest) != 71
            or any(
                c not in "0123456789abcdef"
                for c in digest[7:]
            )
        ):
            raise ValueError("INVALID_INDEX_DIGEST")

    base = Path(args.archive_dir)

    verify(
        "frontend",
        args.sha,
        args.frontend_digest,
        base / "frontend.tar",
    )

    verify(
        "backend",
        args.sha,
        args.backend_digest,
        base / "backend.tar",
    )

    print("\nRELEASE_VERIFIED=YES")
    print("DOCKER_LOAD_EXECUTED=NO")
    print("PRODUCTION_MODIFIED=NO")


if __name__ == "__main__":
    main()
