-- 000005_auth_helpers — lookup pra-autentikasi yang aman terhadap RLS.
--
-- Masalah: RLS membuat semua query fail-closed bila `app.workspace_id` kosong.
-- Padahal saat login/refresh kita belum tahu workspace mana. Solusi: fungsi
-- SECURITY DEFINER dengan `row_security = off` yang hanya mengembalikan kolom
-- minimal. Fungsi ini adalah satu-satunya jalur yang boleh membaca tanpa konteks.

CREATE OR REPLACE FUNCTION auth_lookup_user(p_email text)
RETURNS TABLE (
  id uuid, email text, password_hash text, name text, locale text, is_demo boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT u.id, u.email, COALESCE(u.password_hash, ''), u.name, u.locale, u.is_demo
  FROM users u
  WHERE lower(u.email) = lower(p_email) AND u.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_lookup_user_by_id(p_user_id uuid)
RETURNS TABLE (
  id uuid, email text, password_hash text, name text, locale text, is_demo boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT u.id, u.email, COALESCE(u.password_hash, ''), u.name, u.locale, u.is_demo
  FROM users u
  WHERE u.id = p_user_id AND u.deleted_at IS NULL
  LIMIT 1;
$$;

-- Workspace + role aktif untuk seorang user (dipakai saat login & refresh).
CREATE OR REPLACE FUNCTION auth_lookup_membership(p_user_id uuid)
RETURNS TABLE (workspace_id uuid, workspace_name text, role text, is_demo boolean, locale text, demo_expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT w.id, w.name, m.role, w.is_demo, w.locale, w.demo_expires_at
  FROM memberships m
  JOIN workspaces w ON w.id = m.workspace_id
  WHERE m.user_id = p_user_id
  ORDER BY m.created_at ASC
  LIMIT 1;
$$;

-- Refresh token pra-auth: validasi hash + ambil konteksnya.
CREATE OR REPLACE FUNCTION auth_lookup_refresh(p_token_hash text)
RETURNS TABLE (id uuid, user_id uuid, workspace_id uuid, expires_at timestamptz, revoked_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT r.id, r.user_id, r.workspace_id, r.expires_at, r.revoked_at
  FROM refresh_tokens r
  WHERE r.token_hash = p_token_hash
  LIMIT 1;
$$;

-- Cabut seluruh refresh token milik user (dipakai saat terdeteksi token reuse).
CREATE OR REPLACE FUNCTION auth_revoke_user_refresh_tokens(p_user_id uuid, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE n integer;
BEGIN
  UPDATE refresh_tokens
  SET revoked_at = now()
  WHERE user_id = p_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_logs (workspace_id, actor_id, action, entity, entity_id, detail)
  SELECT workspace_id, p_user_id, 'auth.refresh.revoke_all', 'users', p_user_id,
         jsonb_build_object('reason', p_reason)
  FROM refresh_tokens WHERE user_id = p_user_id LIMIT 1;
  RETURN n;
END $$;

-- Bersihkan token kedaluwarsa (job terjadwal).
CREATE OR REPLACE FUNCTION auth_purge_expired_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
