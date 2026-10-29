-- 000005_auth_helpers (down)
DROP FUNCTION IF EXISTS auth_purge_expired_tokens();
DROP FUNCTION IF EXISTS auth_revoke_user_refresh_tokens(uuid, text);
DROP FUNCTION IF EXISTS auth_lookup_refresh(text);
DROP FUNCTION IF EXISTS auth_lookup_membership(uuid);
DROP FUNCTION IF EXISTS auth_lookup_user_by_id(uuid);
DROP FUNCTION IF EXISTS auth_lookup_user(text);
