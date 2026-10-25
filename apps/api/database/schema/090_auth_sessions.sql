-- Rotating refresh-token sessions. Revocation and expiry are lifecycle controls.
CREATE TABLE app.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  refresh_token_hash text NOT NULL UNIQUE,
  token_family_id uuid NOT NULL,
  replaced_by_session_id uuid REFERENCES app.auth_sessions(id),
  user_agent text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user_active_idx
  ON app.auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
