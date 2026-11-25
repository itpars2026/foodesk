#!/usr/bin/env python3
"""Verify that GitHub Actions published both images for a release."""

import json
import re
import subprocess
import sys

REPO = "itpars2026/foodesk"

REQUIRED_JOBS = {
    "Backend CI / Backend | Django Tests",
    "Backend CI / Backend | Ruff",
    "Frontend CI / Frontend | Vitest",
    "Frontend CI / Frontend | ESLint & TypeScript",
    "Publish | backend",
    "Publish | frontend",
}


def github_api(endpoint):
    result = subprocess.run(
        ["gh", "api", endpoint],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"GITHUB_API_FAILED: exit={result.returncode}"
        )

    return json.loads(result.stdout)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-ci.py COMMIT_SHA")

    sha = sys.argv[1]

    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise SystemExit("INVALID_RELEASE_SHA")

    print("=== VERIFY GITHUB RELEASE ===", flush=True)

    data = github_api(
        f"repos/{REPO}/actions/workflows/deploy.yml/runs"
        f"?branch=main&event=push&head_sha={sha}&per_page=100"
    )

    runs = [
        run for run in data.get("workflow_runs", [])
        if run.get("head_sha") == sha
        and run.get("head_branch") == "main"
        and run.get("event") == "push"
        and run.get("status") == "completed"
        and run.get("conclusion") == "success"
    ]

    if not runs:
        raise SystemExit("NO_SUCCESSFUL_RELEASE_WORKFLOW")

    for run in runs:
        jobs_data = github_api(
            f"repos/{REPO}/actions/runs/{run['id']}"
            "/jobs?per_page=100"
        )

        if jobs_data.get("total_count", 0) > 100:
            raise SystemExit("JOB_PAGINATION_REQUIRED")

        successful_jobs = {
            job["name"]
            for job in jobs_data.get("jobs", [])
            if job.get("status") == "completed"
            and job.get("conclusion") == "success"
        }

        missing = REQUIRED_JOBS - successful_jobs

        if not missing:
            print(f"RELEASE_SHA={sha}")
            print(f"WORKFLOW_RUN_ID={run['id']}")
            print("BACKEND_CI=SUCCESS")
            print("FRONTEND_CI=SUCCESS")
            print("BACKEND_PUBLISH=SUCCESS")
            print("FRONTEND_PUBLISH=SUCCESS")
            print("CI_RELEASE_AUTHORIZED=YES")
            return

    raise SystemExit("REQUIRED_CI_OR_PUBLISH_JOBS_MISSING")


if __name__ == "__main__":
    main()
