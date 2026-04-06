# ── Cloud Run Service ─────────────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "fileshare" {
  project  = var.project_id
  name     = var.cloud_run_service_name
  location = var.region

  template {
    service_account = google_service_account.fileshare_app.email

    scaling {
      # min=1: keep the instance warm; GCS FUSE re-initializes on cold start
      # max=1: hard requirement — SQLite WAL locking is not safe across concurrent FUSE writers
      min_instance_count = 1
      max_instance_count = 1
    }

    # GCS FUSE volume — mounts the SQLite DB bucket at /data
    volumes {
      name = "db"
      gcs {
        bucket    = google_storage_bucket.fileshare_db.name
        read_only = false
      }
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "db"
        mount_path = "/data"
      }

      # ── Static environment variables ────────────────────────────────────────
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DATABASE_PATH"
        value = "/data/fileshare.db"
      }
      env {
        name  = "AUTH_TRUST_HOST"
        value = "true"
      }
      env {
        name  = "GCS_BUCKET"
        value = var.file_bucket_name
      }

      # AUTH_URL: omitted on the first apply (var.auth_url = ""); added on the
      # second apply after the service URL is known from terraform output.
      dynamic "env" {
        for_each = var.auth_url != "" ? [var.auth_url] : []
        content {
          name  = "AUTH_URL"
          value = env.value
        }
      }

      # OIDC issuer is not sensitive — set as a plain env var
      dynamic "env" {
        for_each = local.oidc_enabled ? [var.oidc_issuer] : []
        content {
          name  = "AUTH_OIDC_ISSUER"
          value = env.value
        }
      }

      # ── Secret-sourced environment variables ────────────────────────────────
      env {
        name = "AUTH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.auth_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "CLEANUP_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.cleanup_secret.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = local.oidc_enabled ? [1] : []
        content {
          name = "AUTH_OIDC_CLIENT_ID"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.oidc_client_id[0].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = local.oidc_enabled ? [1] : []
        content {
          name = "AUTH_OIDC_CLIENT_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.oidc_client_secret[0].secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.auth_secret,
    google_secret_manager_secret_version.cleanup_secret,
    google_project_iam_member.fileshare_app_secret_accessor,
  ]
}

# ── Allow unauthenticated invocations ─────────────────────────────────────────
# Cloud Run IAM is left open; the app handles its own authentication via Auth.js.

resource "google_cloud_run_v2_service_iam_member" "allow_unauthenticated" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.fileshare.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Bootstrap Cloud Run Job ───────────────────────────────────────────────────
# Always present in state; executed manually once after the first apply.
# Uses the same image, FUSE volume, and service account as the main service.
#
# Execute with:
#   gcloud run jobs execute fileshare-bootstrap \
#     --region=REGION --project=PROJECT_ID --wait
#
# After verifying login, delete the admin secrets per the instructions in
# secrets.tf and remove the ADMIN_USER/ADMIN_PASS env blocks below.

resource "google_cloud_run_v2_job" "bootstrap" {
  project  = var.project_id
  name     = var.cloud_run_job_name
  location = var.region

  template {
    template {
      service_account = google_service_account.fileshare_app.email

      volumes {
        name = "db"
        gcs {
          bucket    = google_storage_bucket.fileshare_db.name
          read_only = false
        }
      }

      containers {
        image   = var.container_image
        command = ["node"]
        args    = ["scripts/bootstrap-admin.js"]

        volume_mounts {
          name       = "db"
          mount_path = "/data"
        }

        env {
          name  = "DATABASE_PATH"
          value = "/data/fileshare.db"
        }

        env {
          name = "ADMIN_USER"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.admin_user.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "ADMIN_PASS"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.admin_pass.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_version.admin_user,
    google_secret_manager_secret_version.admin_pass,
    google_project_iam_member.fileshare_app_secret_accessor,
  ]
}
