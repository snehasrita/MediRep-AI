
-- FIX: Allow multiple inactive sessions in history
-- The current constraint (user_id, is_active) prevents a user from having more than one
-- inactive session, causing errors when trying to switch rep modes.

-- 1. Drop the restrictive constraint causing the 409 Conflict
ALTER TABLE user_rep_sessions DROP CONSTRAINT IF EXISTS user_rep_sessions_user_id_is_active_key;

-- 2. Ensure we still enforce only ONE active session per user
-- Use a partial unique index instead of a table constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_session 
ON user_rep_sessions (user_id) 
WHERE is_active = true;
