PRAGMA foreign_keys = ON;

CREATE TABLE permission_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL COLLATE NOCASE,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permission_audit_log_created_at
  ON permission_audit_log(created_at DESC);
CREATE INDEX idx_permission_audit_log_target
  ON permission_audit_log(target_type, target_key);
