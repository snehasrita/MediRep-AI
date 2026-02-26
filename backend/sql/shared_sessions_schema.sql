-- ============================================================================
-- SHARED SESSIONS SCHEMA
-- ============================================================================
-- Public, token-scoped read-only sharing for chat sessions.
--
-- Behavior:
-- - Owner creates share link for a session
-- - Anyone with token can view read-only transcript
-- - Authenticated viewers can fork into their own session
-- ============================================================================

CREATE TABLE IF NOT EXISTS shared_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    share_token text NOT NULL UNIQUE,
    is_active boolean NOT NULL DEFAULT TRUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_accessed_at timestamptz
);

-- A user should have only one active share link per session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_sessions_session_active_unique
    ON shared_sessions(session_id, owner_user_id)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_shared_sessions_owner_active
    ON shared_sessions(owner_user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_token
    ON shared_sessions(share_token);

ALTER TABLE shared_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own shared sessions" ON shared_sessions;
CREATE POLICY "Users can view own shared sessions"
    ON shared_sessions FOR SELECT
    USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can create own shared sessions" ON shared_sessions;
CREATE POLICY "Users can create own shared sessions"
    ON shared_sessions FOR INSERT
    WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can update own shared sessions" ON shared_sessions;
CREATE POLICY "Users can update own shared sessions"
    ON shared_sessions FOR UPDATE
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can delete own shared sessions" ON shared_sessions;
CREATE POLICY "Users can delete own shared sessions"
    ON shared_sessions FOR DELETE
    USING (auth.uid() = owner_user_id);

CREATE OR REPLACE FUNCTION set_shared_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_shared_sessions_updated_at ON shared_sessions;
CREATE TRIGGER trigger_set_shared_sessions_updated_at
    BEFORE UPDATE ON shared_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_shared_sessions_updated_at();
