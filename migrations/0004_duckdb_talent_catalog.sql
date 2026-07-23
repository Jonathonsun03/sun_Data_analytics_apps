PRAGMA foreign_keys = ON;

ALTER TABLE talents ADD COLUMN talent_code TEXT;
ALTER TABLE talents ADD COLUMN catalog_active INTEGER NOT NULL DEFAULT 1
  CHECK (catalog_active IN (0, 1));
ALTER TABLE talents ADD COLUMN catalog_synced_at TEXT;

CREATE UNIQUE INDEX idx_talents_talent_code
  ON talents(talent_code)
  WHERE talent_code IS NOT NULL;

CREATE TABLE talent_catalog_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  discovered_count INTEGER NOT NULL CHECK (discovered_count >= 0),
  inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
  updated_count INTEGER NOT NULL CHECK (updated_count >= 0)
);

CREATE INDEX idx_talent_catalog_sync_runs_synced_at
  ON talent_catalog_sync_runs(synced_at DESC);
