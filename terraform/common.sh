#!/usr/bin/env bash
# Shared config helpers for deploy.sh and redeploy.sh.
# Source this file after cd-ing to the terraform directory.

tfvar() {
  awk -F'"' "/^${1}[[:space:]]*=/{print \$2; exit}" terraform.tfvars
}

load_config() {
  PROJECT_ID=$(tfvar project_id)
  REGION=$(tfvar region)
  AR_REPO=$(tfvar artifact_registry_repo)
  AR_REPO=${AR_REPO:-cloud-run-source-deploy}
  CR_SERVICE=$(tfvar cloud_run_service_name)
  CR_SERVICE=${CR_SERVICE:-fileshare}
  IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/fileshare:latest"
}

# Verify gcloud credentials are present and not stale.
# If the active account is missing or its token can't be refreshed, runs
# 'gcloud auth login' so the user can reauthenticate before the script proceeds.
check_gcloud_auth() {
  local account
  account=$(gcloud auth list --filter="status=ACTIVE" --format="value(account)" 2>/dev/null | head -1)

  if [[ -z "$account" ]]; then
    echo "==> No active gcloud account found. Starting login..."
    gcloud auth login
    return
  fi

  if ! gcloud auth print-access-token --quiet >/dev/null 2>&1; then
    echo "==> gcloud credentials for $account are stale. Starting login..."
    gcloud auth login
  else
    echo "==> Auth OK ($account)"
  fi
}
