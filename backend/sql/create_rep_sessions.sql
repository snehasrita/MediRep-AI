
-- SCHEMA: User Rep Sessions
-- Tracks which users are currently in "Rep Mode" for a specific company.

CREATE TABLE IF NOT EXISTS user_rep_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES pharma_companies(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Improve performance for active session lookups
CREATE INDEX IF NOT EXISTS idx_rep_sessions_active ON user_rep_sessions(user_id) WHERE is_active = TRUE;

-- Enable Row Level Security
ALTER TABLE user_rep_sessions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS POLICIES
-- -----------------------------------------------------------------------------

-- 1. Users can view only their own sessions
DROP POLICY IF EXISTS "Users can view own rep sessions" ON user_rep_sessions;
CREATE POLICY "Users can view own rep sessions"
    ON user_rep_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- 2. Users can create sessions for themselves
DROP POLICY IF EXISTS "Users can insert own rep sessions" ON user_rep_sessions;
CREATE POLICY "Users can insert own rep sessions"
    ON user_rep_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 3. Users can update (end) their own sessions
DROP POLICY IF EXISTS "Users can update own rep sessions" ON user_rep_sessions;
CREATE POLICY "Users can update own rep sessions"
    ON user_rep_sessions FOR UPDATE
    USING (auth.uid() = user_id);
