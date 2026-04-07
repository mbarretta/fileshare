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
