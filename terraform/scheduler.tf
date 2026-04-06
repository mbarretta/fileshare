# ── Cloud Scheduler — hourly file cleanup ─────────────────────────────────────
# Calls GET /api/cleanup on the Cloud Run service once per hour.
# The cleanup route validates the Authorization: Bearer header against the
# CLEANUP_SECRET env var. We reference random_password.cleanup_secret.result
# directly (it's already in Terraform state) rather than reading it back from
# Secret Manager, which avoids a circular dependency.

resource "google_cloud_scheduler_job" "cleanup" {
  project  = var.project_id
  region   = var.region
  name     = "fileshare-cleanup"
  schedule = "0 * * * *"

  http_target {
    http_method = "GET"
    uri         = "${google_cloud_run_v2_service.fileshare.uri}/api/cleanup"

    headers = {
      Authorization = "Bearer ${random_password.cleanup_secret.result}"
    }
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_service.fileshare,
  ]
}
