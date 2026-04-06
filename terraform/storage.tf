# ── File-storage bucket ───────────────────────────────────────────────────────
# Either create it (create_file_bucket = true) or read the pre-existing bucket
# as a data source (create_file_bucket = false, the default for pubsec-se where
# gs://pubsec-fileshare already exists).

resource "google_storage_bucket" "fileshare_files" {
  count = var.create_file_bucket ? 1 : 0

  name                        = var.file_bucket_name
  project                     = var.project_id
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }
}

data "google_storage_bucket" "fileshare_files_existing" {
  count = var.create_file_bucket ? 0 : 1
  name  = var.file_bucket_name
}

# ── SQLite volume bucket ──────────────────────────────────────────────────────
# Always created by Terraform. Must be STANDARD — NEARLINE and COLDLINE carry a
# 30-day minimum storage duration that creates unexpected costs if the DB object
# is ever deleted and recreated within that window.

resource "google_storage_bucket" "fileshare_db" {
  name                        = var.db_bucket_name
  project                     = var.project_id
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  lifecycle {
    prevent_destroy = true
  }
}
