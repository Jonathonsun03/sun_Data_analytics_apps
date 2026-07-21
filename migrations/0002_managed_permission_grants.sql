PRAGMA foreign_keys = ON;

CREATE TABLE permission_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_client_id TEXT,
  user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  talent_id TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  access_start_date TEXT,
  access_end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, source_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (talent_id) REFERENCES talents(id) ON DELETE CASCADE
);

CREATE INDEX idx_permission_grants_user_active_product
  ON permission_grants(user_id, active, product_id);
CREATE INDEX idx_permission_grants_source
  ON permission_grants(source);

CREATE TABLE permission_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  user_count INTEGER NOT NULL CHECK (user_count >= 0),
  grant_count INTEGER NOT NULL CHECK (grant_count >= 0)
);

CREATE INDEX idx_permission_sync_runs_source_synced
  ON permission_sync_runs(source, synced_at);
