-- ============================================================================
-- CHAT SESSIONS SCHEMA
-- ============================================================================
-- Implements Claude-like conversation sessions with full history persistence
--
-- Security: RLS policies ensure users can only access their own data
-- ============================================================================

-- 1. CHAT SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Session metadata
    title text NOT NULL DEFAULT 'New Chat',

    -- CONTEXT COMPRESSION: LLM-generated summary of conversation so far
    -- Updated after each exchange, contains: topics discussed, drugs mentioned,
    -- patient concerns, recommendations given, key decisions
    context_summary text,

    -- Message counts (denormalized for performance)
    message_count integer DEFAULT 0,

    -- Soft delete support
    is_archived boolean DEFAULT false,
    archived_at timestamptz,

    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    last_message_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
    ON chat_sessions(user_id, last_message_at DESC)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_sessions_user_archived
    ON chat_sessions(user_id, archived_at DESC)
    WHERE is_archived = true;


-- 2. MODIFY CHAT_HISTORY TABLE
-- ============================================================================
-- Add session_id to link messages to sessions

-- Add column if not exists (safe migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_history' AND column_name = 'session_id'
    ) THEN
        ALTER TABLE chat_history ADD COLUMN session_id uuid REFERENCES chat_sessions(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add message ordering within session
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chat_history' AND column_name = 'sequence_num'
    ) THEN
        ALTER TABLE chat_history ADD COLUMN sequence_num integer DEFAULT 0;
    END IF;
END $$;

-- Index for fetching session messages in order
CREATE INDEX IF NOT EXISTS idx_chat_history_session
    ON chat_history(session_id, sequence_num ASC);


-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions"
    ON chat_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own sessions
CREATE POLICY "Users can create own sessions"
    ON chat_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (title, archive)
CREATE POLICY "Users can update own sessions"
    ON chat_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own sessions
CREATE POLICY "Users can delete own sessions"
    ON chat_sessions FOR DELETE
    USING (auth.uid() = user_id);


-- 4. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update session stats when message is added
CREATE OR REPLACE FUNCTION update_session_on_message()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        UPDATE chat_sessions
        SET
            message_count = message_count + 1,
            last_message_at = NEW.created_at,
            updated_at = now(),
            -- Auto-generate title from first user message if still default
            title = CASE
                WHEN title = 'New Chat' AND NEW.message IS NOT NULL
                THEN LEFT(NEW.message, 50) || CASE WHEN LENGTH(NEW.message) > 50 THEN '...' ELSE '' END
                ELSE title
            END
        WHERE id = NEW.session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for message insert
DROP TRIGGER IF EXISTS trigger_update_session_on_message ON chat_history;
CREATE TRIGGER trigger_update_session_on_message
    AFTER INSERT ON chat_history
    FOR EACH ROW
    EXECUTE FUNCTION update_session_on_message();


-- 5. HELPER FUNCTION FOR CHAT HISTORY INSERT (with session support)
-- ============================================================================
-- Uses advisory lock to prevent race conditions on sequence numbering

CREATE OR REPLACE FUNCTION insert_chat_message(
    p_user_id uuid,
    p_session_id uuid,
    p_message text,
    p_response text,
    p_patient_context jsonb DEFAULT NULL,
    p_citations jsonb DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    new_id uuid;
    seq_num integer;
    lock_id bigint;
BEGIN
    -- Convert session UUID to bigint for advisory lock
    -- This ensures only one insert per session at a time
    -- NOTE: UUID text contains hyphens; remove them before treating as hex.
    lock_id := ('x' || substr(replace(p_session_id::text, '-', ''), 1, 16))::bit(64)::bigint;

    -- Acquire advisory lock for this session (released at end of transaction)
    PERFORM pg_advisory_xact_lock(lock_id);

    -- Get next sequence number (now safe from race conditions)
    SELECT COALESCE(MAX(sequence_num), 0) + 1 INTO seq_num
    FROM chat_history
    WHERE session_id = p_session_id;

    -- Insert the message
    INSERT INTO chat_history (
        user_id,
        session_id,
        message,
        response,
        patient_context,
        citations,
        sequence_num
    )
    VALUES (
        p_user_id,
        p_session_id,
        p_message,
        p_response,
        p_patient_context,
        p_citations,
        seq_num
    )
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. MIGRATION: Link orphan messages to sessions (optional)
-- ============================================================================
-- This creates sessions for existing messages that have no session_id
-- Run this ONCE after migration

-- CREATE OR REPLACE FUNCTION migrate_orphan_messages()
-- RETURNS void AS $$
-- DECLARE
--     r RECORD;
--     new_session_id uuid;
-- BEGIN
--     FOR r IN
--         SELECT DISTINCT user_id
--         FROM chat_history
--         WHERE session_id IS NULL
--     LOOP
--         -- Create a "Legacy" session for each user's orphan messages
--         INSERT INTO chat_sessions (user_id, title)
--         VALUES (r.user_id, 'Legacy Chat History')
--         RETURNING id INTO new_session_id;
--
--         -- Link orphan messages to this session
--         UPDATE chat_history
--         SET session_id = new_session_id
--         WHERE user_id = r.user_id AND session_id IS NULL;
--     END LOOP;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- SELECT migrate_orphan_messages();


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
