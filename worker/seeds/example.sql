-- Local example only. Replace these addresses and talents with real assignments
-- through a reviewed production SQL migration or administrative workflow.

INSERT OR IGNORE INTO users (email)
VALUES
  ('usera@example.com'),
  ('userb@example.com');

INSERT OR IGNORE INTO talents (id, display_name)
VALUES
  ('talent-a', 'Talent A'),
  ('talent-b', 'Talent B'),
  ('talent-c', 'Talent C'),
  ('talent-d', 'Talent D');

INSERT OR IGNORE INTO product_access (user_id, product_id, role)
SELECT id, 'youtube-analytics', 'viewer'
FROM users
WHERE email IN ('usera@example.com', 'userb@example.com');

INSERT OR IGNORE INTO talent_access (user_id, product_id, talent_id)
SELECT users.id, 'youtube-analytics', 'talent-a'
FROM users
WHERE users.email = 'usera@example.com';

INSERT OR IGNORE INTO talent_access (user_id, product_id, talent_id)
SELECT users.id, 'youtube-analytics', talents.id
FROM users
CROSS JOIN talents
WHERE users.email = 'userb@example.com'
  AND talents.id IN ('talent-a', 'talent-b', 'talent-c', 'talent-d');
