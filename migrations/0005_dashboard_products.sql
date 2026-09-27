PRAGMA foreign_keys = ON;

INSERT INTO products (id, title, url, active)
VALUES
  (
    'video-analytics',
    'Video Analytics',
    'https://video-dashboard.sun-dataanalytics.com',
    1
  ),
  (
    'community-analytics',
    'Community Analytics',
    'https://comm-dashboard.sun-dataanalytics.com',
    1
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  url = excluded.url,
  active = excluded.active,
  updated_at = CURRENT_TIMESTAMP;
