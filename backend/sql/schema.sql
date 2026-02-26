-- Enable extensions
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ============================================================================
-- USER DATA TABLES (Supabase - RLS Protected)
-- ============================================================================

-- User profiles (extends auth.users)
create table if not exists user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    avatar_url text,
    patient_context jsonb,  -- Age, weight, conditions, allergies
    preferences jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table user_profiles enable row level security;

create policy "Users can view own profile"
    on user_profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
    on user_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
    on user_profiles for insert with check (auth.uid() = id);

-- Chat history (PRIVATE per user)
create table if not exists chat_history (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    message text not null,
    response text not null,
    patient_context jsonb,
    citations jsonb,
    created_at timestamptz default now()
);

alter table chat_history enable row level security;
create policy "Users can CRUD own chats"
    on chat_history for all using (auth.uid() = user_id);

-- Saved drugs (PRIVATE per user)
create table if not exists saved_drugs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    drug_name text not null,
    notes text,
    reminder_time time,
    created_at timestamptz default now(),
    unique(user_id, drug_name)
);

alter table saved_drugs enable row level security;
create policy "Users can CRUD own saved drugs"
    on saved_drugs for all using (auth.uid() = user_id);

-- ============================================================================
-- SHARED DATA TABLES (Public Read)
-- ============================================================================

-- Shared RAG documents
create table if not exists document_chunks (
    id uuid default gen_random_uuid() primary key,
    content text not null,
    source text,
    metadata jsonb,
    embedding vector(768),
    created_at timestamptz default now()
);

alter table document_chunks enable row level security;
create policy "Public read access"
    on document_chunks for select using (true);

-- Indexes
create index if not exists idx_chat_history_user on chat_history(user_id);
create index if not exists idx_saved_drugs_user on saved_drugs(user_id);
create index if not exists idx_document_chunks_embedding on document_chunks 
    using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- RAG match function
create or replace function match_documents(
    query_embedding vector(768),
    match_count int default 5
)
returns table (
    id uuid,
    content text,
    metadata jsonb,
    similarity float
)
language plpgsql as $$
begin
    return query
    select
        document_chunks.id,
        document_chunks.content,
        document_chunks.metadata,
        1 - (document_chunks.embedding <=> query_embedding) as similarity
    from document_chunks
    order by document_chunks.embedding <=> query_embedding
    limit match_count;
end;
$$;

-- ============================================================================
-- NOTE: Drug data is stored in Turso, not Supabase.
-- Vector embeddings for drugs are stored in Qdrant.
-- ============================================================================
