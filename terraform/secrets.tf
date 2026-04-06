# ── Auto-generated secrets ────────────────────────────────────────────────────
# random_password generates values that are stored as sensitive in Terraform
# state. Ensure the state backend (GCS bucket) has appropriate access controls.

resource "random_password" "auth_secret" {
  length  = 32
  special = false
}

resource "random_password" "cleanup_secret" {
  length  = 32
  special = false
}

# AUTH_SECRET

resource "google_secret_manager_secret" "auth_secret" {
  project   = var.project_id
  secret_id = "fileshare-auth-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "auth_secret" {
  secret      = google_secret_manager_secret.auth_secret.id
  secret_data = random_password.auth_secret.result
}

# CLEANUP_SECRET

resource "google_secret_manager_secret" "cleanup_secret" {
  project   = var.project_id
  secret_id = "fileshare-cleanup-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "cleanup_secret" {
  secret      = google_secret_manager_secret.cleanup_secret.id
  secret_data = random_password.cleanup_secret.result
}

# ── Bootstrap admin credentials (temporary) ───────────────────────────────────
# These secrets exist so the bootstrap Cloud Run Job can receive ADMIN_USER and
# ADMIN_PASS via Secret Manager without plaintext env vars.
#
# After running the bootstrap job and verifying login, delete them:
#   gcloud secrets delete fileshare-admin-user --project=PROJECT_ID --quiet
#   gcloud secrets delete fileshare-admin-pass --project=PROJECT_ID --quiet
#   terraform state rm google_secret_manager_secret.admin_user
#   terraform state rm google_secret_manager_secret_version.admin_user
#   terraform state rm google_secret_manager_secret.admin_pass
#   terraform state rm google_secret_manager_secret_version.admin_pass
# Then remove these resource blocks and the corresponding env blocks in cloudrun.tf.
#
# lifecycle.ignore_changes on secret_data means Terraform won't try to restore
# the value if the secret version is deleted manually.

resource "google_secret_manager_secret" "admin_user" {
  project   = var.project_id
  secret_id = "fileshare-admin-user"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "admin_user" {
  secret      = google_secret_manager_secret.admin_user.id
  secret_data = var.bootstrap_admin_user

  lifecycle {
    ignore_changes = [secret_data]
  }
}

resource "google_secret_manager_secret" "admin_pass" {
  project   = var.project_id
  secret_id = "fileshare-admin-pass"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "admin_pass" {
  secret      = google_secret_manager_secret.admin_pass.id
  secret_data = var.bootstrap_admin_pass

  lifecycle {
    ignore_changes = [secret_data]
  }
}

# ── OIDC secrets (conditional) ────────────────────────────────────────────────
# Created only when all three OIDC variables are non-empty. Setting any one of
# them back to "" and re-applying will destroy the secrets and remove the OIDC
# env vars from the Cloud Run service.

locals {
  oidc_enabled = (
    var.oidc_issuer != "" &&
    var.oidc_client_id != "" &&
    var.oidc_client_secret != ""
  )
}

resource "google_secret_manager_secret" "oidc_client_id" {
  count     = local.oidc_enabled ? 1 : 0
  project   = var.project_id
  secret_id = "fileshare-oidc-client-id"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "oidc_client_id" {
  count       = local.oidc_enabled ? 1 : 0
  secret      = google_secret_manager_secret.oidc_client_id[0].id
  secret_data = var.oidc_client_id
}

resource "google_secret_manager_secret" "oidc_client_secret" {
  count     = local.oidc_enabled ? 1 : 0
  project   = var.project_id
  secret_id = "fileshare-oidc-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "oidc_client_secret" {
  count       = local.oidc_enabled ? 1 : 0
  secret      = google_secret_manager_secret.oidc_client_secret[0].id
  secret_data = var.oidc_client_secret
}
