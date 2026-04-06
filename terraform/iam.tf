# ── Service account ───────────────────────────────────────────────────────────

resource "google_service_account" "fileshare_app" {
  project      = var.project_id
  account_id   = "fileshare-app"
  display_name = "Fileshare App"
  description  = "Service account used by the fileshare Cloud Run service and jobs."
}

# ── File-storage bucket IAM ───────────────────────────────────────────────────
# Exactly one of these two resources is created depending on create_file_bucket.

resource "google_storage_bucket_iam_member" "fileshare_app_files_created" {
  count  = var.create_file_bucket ? 1 : 0
  bucket = google_storage_bucket.fileshare_files[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.fileshare_app.email}"
}

resource "google_storage_bucket_iam_member" "fileshare_app_files_existing" {
  count  = var.create_file_bucket ? 0 : 1
  bucket = data.google_storage_bucket.fileshare_files_existing[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.fileshare_app.email}"
}

# ── SQLite volume bucket IAM ──────────────────────────────────────────────────

resource "google_storage_bucket_iam_member" "fileshare_app_db" {
  bucket = google_storage_bucket.fileshare_db.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.fileshare_app.email}"
}

# ── Secret Manager project-level IAM ─────────────────────────────────────────

resource "google_project_iam_member" "fileshare_app_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.fileshare_app.email}"
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
# If this repo already exists (auto-created by a prior gcloud run deploy --source),
# import it before applying:
#   terraform import \
#     google_artifact_registry_repository.cloud_run_source_deploy \
#     "projects/PROJECT/locations/REGION/repositories/cloud-run-source-deploy"

resource "google_artifact_registry_repository" "cloud_run_source_deploy" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_registry_repo
  description   = "Docker images for Cloud Run deployments"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]

  lifecycle {
    prevent_destroy = true
  }
}
