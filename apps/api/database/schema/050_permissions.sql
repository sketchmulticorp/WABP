-- Stable permission catalog seeded by the application.
CREATE TABLE app.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE,
  description text NOT NULL
);
