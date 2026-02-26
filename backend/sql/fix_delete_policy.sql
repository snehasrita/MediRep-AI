
-- FIX: Allow users to delete their own chat history
-- This is required because when a session is deleted, the 'ON DELETE CASCADE'
-- attempts to delete the associated messages. If RLS is enabled on chat_history
-- but no DELETE policy exists, the cascade fails, blocking the session deletion.

-- 1. Ensure RLS is enabled
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- 2. Add policy to allow users to delete their own messages
-- Check if policy exists first to avoid errors (manual check recommended, or just run this)
DROP POLICY IF EXISTS "Users can delete own chat history" ON chat_history;

CREATE POLICY "Users can delete own chat history"
ON chat_history
FOR DELETE
USING (auth.uid() = user_id);

-- Optional: Verify policies on chat_sessions too
DROP POLICY IF EXISTS "Users can delete own sessions" ON chat_sessions;

CREATE POLICY "Users can delete own sessions"
ON chat_sessions
FOR DELETE
USING (auth.uid() = user_id);
