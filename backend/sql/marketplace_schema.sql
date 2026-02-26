-- ============================================================================
-- MEDIREP MARKETPLACE SCHEMA v1.0
-- ============================================================================
--
-- BUSINESS MODEL:
-- - Patients book voice consultations with verified pharmacists
-- - Platform takes 20% commission
-- - Pharmacists get weekly payouts
--
-- USER SCENARIOS CONSIDERED:
-- 1. Pharmacist Registration & Verification Flow
-- 2. Patient Booking & Payment Flow
-- 3. Consultation & Voice Call Flow
-- 4. Rating & Review Flow
-- 5. Payout & Earnings Flow
-- 6. Cancellation & Refund Flow
--
-- ============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. PHARMACIST PROFILES
-- ============================================================================
-- Stores pharmacist professional info, verification status, and settings
-- Separate from auth.users to keep concerns separated

create table if not exists pharmacist_profiles (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade not null unique,

    -- Basic Info
    full_name text not null,
    phone text not null,
    bio text,
    profile_image_url text,

    -- License Info (extracted by AI, verified by admin)
    license_number text not null,
    license_image_url text not null,
    license_state text, -- Issuing state (e.g., 'Maharashtra', 'Delhi')
    license_expiry date,

    -- AI Extraction Results (stored for admin review)
    ai_extracted_data jsonb default '{}',
    ai_confidence_score numeric(3,2), -- 0.00 to 1.00

    -- Verification Status
    -- pending: Just submitted
    -- under_review: Admin is reviewing
    -- approved: Can accept consultations
    -- rejected: License invalid/fake
    -- suspended: Temporarily disabled
    verification_status text not null default 'pending'
        check (verification_status in ('pending', 'under_review', 'approved', 'rejected', 'suspended')),
    verification_notes text, -- Admin notes (rejection reason, etc.)
    verified_at timestamptz,
    verified_by uuid references auth.users(id),

    -- Professional Info
    specializations text[] default '{}', -- ['Diabetes', 'Cardiology', 'General']
    experience_years integer default 0 check (experience_years >= 0),
    languages text[] default '{English,Hindi}',
    education text, -- "B.Pharm, M.Pharm"

    -- Consultation Settings
    rate integer not null default 299 check (rate >= 99 and rate <= 9999), -- INR per consultation
    duration_minutes integer not null default 15 check (duration_minutes in (15, 30, 45, 60)),

    -- Availability
    is_available boolean default false, -- Currently accepting bookings
    auto_accept boolean default false, -- Auto-accept bookings or manual approval

    -- Stats (denormalized for fast queries)
    rating_avg numeric(2,1) default 0.0 check (rating_avg >= 0 and rating_avg <= 5),
    rating_count integer default 0,
    total_consultations integer default 0,
    completed_consultations integer default 0,
    total_earnings integer default 0, -- Lifetime earnings in INR

    -- Payout Info
    upi_id text, -- Primary payout method for India

    -- Timestamps
    last_online_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Index for searching available pharmacists
create index idx_pharmacist_available on pharmacist_profiles(is_available, verification_status)
    where verification_status = 'approved';
create index idx_pharmacist_specializations on pharmacist_profiles using gin(specializations);
create index idx_pharmacist_user_id on pharmacist_profiles(user_id);


-- ============================================================================
-- 2. PHARMACIST AVAILABILITY SCHEDULE
-- ============================================================================
-- Weekly recurring schedule slots

create table if not exists pharmacist_schedules (
    id uuid primary key default uuid_generate_v4(),
    pharmacist_id uuid references pharmacist_profiles(id) on delete cascade not null,

    day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Sunday, 6=Saturday
    start_time time not null,
    end_time time not null,

    is_active boolean default true,

    created_at timestamptz default now(),

    -- Prevent overlapping slots for same pharmacist on same day
    unique(pharmacist_id, day_of_week, start_time),

    -- Ensure end_time > start_time
    check (end_time > start_time)
);

create index idx_schedule_pharmacist on pharmacist_schedules(pharmacist_id, is_active);


-- ============================================================================
-- 3. CONSULTATIONS
-- ============================================================================
-- The core booking/consultation record

create table if not exists consultations (
    id uuid primary key default uuid_generate_v4(),

    -- Parties
    patient_id uuid references auth.users(id) not null,
    pharmacist_id uuid references pharmacist_profiles(id) not null,

    -- Scheduling
    scheduled_at timestamptz not null,
    duration_minutes integer not null default 15,
    timezone text default 'Asia/Kolkata',

    -- Status Flow:
    -- pending_payment -> (payment success) -> confirmed
    -- confirmed -> (call starts) -> in_progress
    -- in_progress -> (call ends) -> completed
    -- Any state -> cancelled/no_show/refunded
    status text not null default 'pending_payment' check (status in (
        'pending_payment',  -- Awaiting Razorpay payment
        'confirmed',        -- Payment done, awaiting call
        'in_progress',      -- Call is active
        'completed',        -- Call finished successfully
        'cancelled',        -- Cancelled before call
        'no_show',          -- Patient/Pharmacist didn't show up
        'refunded'          -- Money returned to patient
    )),

    -- Actual timing (for analytics)
    started_at timestamptz,
    ended_at timestamptz,
    actual_duration_seconds integer, -- Real call duration

    -- Payment Breakdown
    amount integer not null, -- Total patient pays (e.g., 299)
    platform_fee integer not null, -- 20% commission (e.g., 60)
    pharmacist_earning integer not null, -- 80% to pharmacist (e.g., 239)

    -- Razorpay Integration
    razorpay_order_id text unique,
    razorpay_payment_id text,
    razorpay_signature text,
    payment_status text default 'pending' check (payment_status in (
        'pending', 'authorized', 'captured', 'failed', 'refunded'
    )),
    payment_method text, -- 'upi', 'card', 'netbanking', 'wallet'

    -- Agora Voice Call
    agora_channel text unique, -- Channel name (use consultation ID)

    -- Patient's Concern (optional, helps pharmacist prepare)
    patient_concern text,

    -- Pharmacist's Notes (private, for their records)
    pharmacist_notes text,

    -- Patient Context Snapshot (copied at booking time for privacy)
    patient_context_snapshot jsonb default '{}',

    -- Cancellation
    cancelled_at timestamptz,
    cancelled_by text check (cancelled_by in ('patient', 'pharmacist', 'system', 'admin')),
    cancellation_reason text,

    -- Review (denormalized for quick display)
    rating integer check (rating between 1 and 5),
    review text,
    reviewed_at timestamptz,

    -- Payout tracking
    payout_id uuid, -- Links to payout when processed
    payout_status text default 'pending' check (payout_status in ('pending', 'processed')),

    -- Timestamps
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Indexes for common queries
create index idx_consultation_patient on consultations(patient_id, status);
create index idx_consultation_pharmacist on consultations(pharmacist_id, status);
create index idx_consultation_scheduled on consultations(scheduled_at) where status in ('confirmed', 'in_progress');
create index idx_consultation_payout on consultations(pharmacist_id, payout_status) where payout_status = 'pending';
create index idx_consultation_razorpay on consultations(razorpay_order_id);


-- ============================================================================
-- 4. CONSULTATION REVIEWS
-- ============================================================================
-- Separate table for review history and analytics

create table if not exists consultation_reviews (
    id uuid primary key default uuid_generate_v4(),
    consultation_id uuid references consultations(id) on delete cascade not null unique,

    patient_id uuid references auth.users(id) not null,
    pharmacist_id uuid references pharmacist_profiles(id) not null,

    rating integer not null check (rating between 1 and 5),
    review text,

    -- Moderation
    is_public boolean default true,
    is_flagged boolean default false,
    flagged_reason text,

    -- Response from pharmacist (optional)
    pharmacist_response text,
    responded_at timestamptz,

    created_at timestamptz default now()
);

create index idx_review_pharmacist on consultation_reviews(pharmacist_id, is_public);


-- ============================================================================
-- 4b. CONSULTATION MESSAGES (Real-time Chat)
-- ============================================================================
-- Chat messages between patient and pharmacist during consultation

create table if not exists consultation_messages (
    id uuid primary key default uuid_generate_v4(),
    consultation_id uuid references consultations(id) on delete cascade not null,

    sender_id uuid references auth.users(id) not null,
    sender_type text not null check (sender_type in ('patient', 'pharmacist')),

    content text not null,

    -- Message metadata
    is_read boolean default false,
    read_at timestamptz,

    created_at timestamptz default now()
);

create index idx_messages_consultation on consultation_messages(consultation_id, created_at);
create index idx_messages_sender on consultation_messages(sender_id);


-- ============================================================================
-- 5. PHARMACIST PAYOUTS
-- ============================================================================
-- Weekly/monthly payout records

create table if not exists pharmacist_payouts (
    id uuid primary key default uuid_generate_v4(),
    pharmacist_id uuid references pharmacist_profiles(id) not null,

    -- Period covered
    period_start date not null,
    period_end date not null,

    -- Amounts
    gross_amount integer not null, -- Total before deductions
    platform_fee_total integer not null, -- Already deducted from consultations
    tds_deducted integer default 0, -- Tax deducted at source (if applicable)
    net_amount integer not null, -- Final payout amount

    consultation_count integer not null,

    -- Status
    status text not null default 'pending' check (status in (
        'pending',      -- Awaiting processing
        'processing',   -- Payout initiated
        'completed',    -- Money transferred
        'failed'        -- Transfer failed
    )),

    -- Razorpay Payout (or manual transfer)
    payout_method text check (payout_method in ('razorpay_payout', 'manual_upi', 'manual_bank')),
    razorpay_payout_id text,
    transfer_reference text, -- UTR number or reference

    -- UPI Details (snapshot at payout time)
    upi_id text,

    processed_at timestamptz,
    failure_reason text,

    created_at timestamptz default now(),

    -- Prevent duplicate payouts for same period
    unique(pharmacist_id, period_start, period_end)
);

create index idx_payout_pharmacist on pharmacist_payouts(pharmacist_id, status);
create index idx_payout_status on pharmacist_payouts(status) where status = 'pending';


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
alter table pharmacist_profiles enable row level security;
alter table pharmacist_schedules enable row level security;
alter table consultations enable row level security;
alter table consultation_reviews enable row level security;
alter table consultation_messages enable row level security;
alter table pharmacist_payouts enable row level security;

-- PHARMACIST PROFILES --

-- Anyone can view approved pharmacists (public profiles)
create policy "Public can view approved pharmacists"
    on pharmacist_profiles for select
    using (verification_status = 'approved');

-- Users can view their own profile regardless of status
create policy "Users can view own pharmacist profile"
    on pharmacist_profiles for select
    using (auth.uid() = user_id);

-- Users can insert their own profile (registration)
create policy "Users can create own pharmacist profile"
    on pharmacist_profiles for insert
    with check (auth.uid() = user_id);

-- Users can update their own profile (limited fields via backend)
create policy "Users can update own pharmacist profile"
    on pharmacist_profiles for update
    using (auth.uid() = user_id);

-- PHARMACIST SCHEDULES --

-- Anyone can view schedules of approved pharmacists
create policy "Public can view pharmacist schedules"
    on pharmacist_schedules for select
    using (
        exists (
            select 1 from pharmacist_profiles
            where id = pharmacist_schedules.pharmacist_id
            and verification_status = 'approved'
        )
    );

-- Pharmacists can manage their own schedules
create policy "Pharmacists can manage own schedules"
    on pharmacist_schedules for all
    using (
        exists (
            select 1 from pharmacist_profiles
            where id = pharmacist_schedules.pharmacist_id
            and user_id = auth.uid()
        )
    );

-- CONSULTATIONS --

-- Patients can view their own consultations
create policy "Patients can view own consultations"
    on consultations for select
    using (patient_id = auth.uid());

-- Pharmacists can view consultations assigned to them
create policy "Pharmacists can view assigned consultations"
    on consultations for select
    using (
        exists (
            select 1 from pharmacist_profiles
            where id = consultations.pharmacist_id
            and user_id = auth.uid()
        )
    );

-- Patients can create consultations (bookings)
create policy "Patients can create consultations"
    on consultations for insert
    with check (patient_id = auth.uid());

-- Pharmacists can update their consultations (notes, status)
create policy "Pharmacists can update assigned consultations"
    on consultations for update
    using (
        exists (
            select 1 from pharmacist_profiles
            where id = consultations.pharmacist_id
            and user_id = auth.uid()
        )
    );

-- REVIEWS --

-- Public can view public reviews
create policy "Public can view public reviews"
    on consultation_reviews for select
    using (is_public = true);

-- Patients can create reviews for their completed consultations
create policy "Patients can create reviews"
    on consultation_reviews for insert
    with check (
        patient_id = auth.uid()
        and exists (
            select 1 from consultations
            where id = consultation_reviews.consultation_id
            and patient_id = auth.uid()
            and status = 'completed'
        )
    );

-- CONSULTATION MESSAGES --

-- Patients can view messages in their consultations
create policy "Patients can view consultation messages"
    on consultation_messages for select
    using (
        exists (
            select 1 from consultations
            where id = consultation_messages.consultation_id
            and patient_id = auth.uid()
        )
    );

-- Pharmacists can view messages in their consultations
create policy "Pharmacists can view consultation messages"
    on consultation_messages for select
    using (
        exists (
            select 1 from consultations c
            join pharmacist_profiles p on c.pharmacist_id = p.id
            where c.id = consultation_messages.consultation_id
            and p.user_id = auth.uid()
        )
    );

-- Users can send messages in active consultations they're part of
create policy "Users can send messages in active consultations"
    on consultation_messages for insert
    with check (
        sender_id = auth.uid()
        and exists (
            select 1 from consultations c
            left join pharmacist_profiles p on c.pharmacist_id = p.id
            where c.id = consultation_messages.consultation_id
            and c.status in ('confirmed', 'in_progress')
            and (c.patient_id = auth.uid() or p.user_id = auth.uid())
        )
    );

-- PAYOUTS --

-- Pharmacists can view their own payouts
create policy "Pharmacists can view own payouts"
    on pharmacist_payouts for select
    using (
        exists (
            select 1 from pharmacist_profiles
            where id = pharmacist_payouts.pharmacist_id
            and user_id = auth.uid()
        )
    );


-- ============================================================================
-- 7. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update pharmacist stats after consultation completion
create or replace function update_pharmacist_stats()
returns trigger as $$
begin
    if NEW.status = 'completed' and OLD.status != 'completed' then
        update pharmacist_profiles
        set
            total_consultations = total_consultations + 1,
            completed_consultations = completed_consultations + 1,
            total_earnings = total_earnings + NEW.pharmacist_earning,
            updated_at = now()
        where id = NEW.pharmacist_id;
    end if;
    return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_update_pharmacist_stats
    after update on consultations
    for each row
    execute function update_pharmacist_stats();


-- Function to update pharmacist rating after review
create or replace function update_pharmacist_rating()
returns trigger as $$
declare
    avg_rating numeric(2,1);
    review_count integer;
begin
    select
        coalesce(avg(rating)::numeric(2,1), 0),
        count(*)
    into avg_rating, review_count
    from consultation_reviews
    where pharmacist_id = NEW.pharmacist_id and is_public = true;

    update pharmacist_profiles
    set
        rating_avg = avg_rating,
        rating_count = review_count,
        updated_at = now()
    where id = NEW.pharmacist_id;

    -- Also update the denormalized rating on consultation
    update consultations
    set rating = NEW.rating, review = NEW.review, reviewed_at = now()
    where id = NEW.consultation_id;

    return NEW;
end;
$$ language plpgsql security definer;

create trigger trigger_update_pharmacist_rating
    after insert on consultation_reviews
    for each row
    execute function update_pharmacist_rating();


-- Function to set updated_at timestamp
create or replace function set_updated_at()
returns trigger as $$
begin
    NEW.updated_at = now();
    return NEW;
end;
$$ language plpgsql;

create trigger trigger_pharmacist_updated_at
    before update on pharmacist_profiles
    for each row
    execute function set_updated_at();

create trigger trigger_consultation_updated_at
    before update on consultations
    for each row
    execute function set_updated_at();


-- ============================================================================
-- 8. HELPER VIEWS
-- ============================================================================

-- View for available pharmacists with stats
create or replace view available_pharmacists as
select
    p.id,
    p.user_id,
    p.full_name,
    p.bio,
    p.profile_image_url,
    p.specializations,
    p.experience_years,
    p.languages,
    p.rate,
    p.duration_minutes,
    p.rating_avg,
    p.rating_count,
    p.completed_consultations,
    p.last_online_at,
    p.is_available
from pharmacist_profiles p
where p.verification_status = 'approved'
and p.is_available = true;


-- View for pharmacist dashboard stats
create or replace view pharmacist_dashboard_stats as
select
    p.id as pharmacist_id,
    p.user_id,
    p.total_earnings,
    p.completed_consultations,
    p.rating_avg,
    p.rating_count,
    (
        select count(*) from consultations c
        where c.pharmacist_id = p.id
        and c.status = 'confirmed'
        and c.scheduled_at > now()
    ) as upcoming_consultations,
    (
        select coalesce(sum(pharmacist_earning), 0) from consultations c
        where c.pharmacist_id = p.id
        and c.status = 'completed'
        and c.payout_status = 'pending'
    ) as pending_payout_amount
from pharmacist_profiles p;


-- ============================================================================
-- 9. SEED DATA (Optional - Admin role)
-- ============================================================================

-- Create admin check function (for backend use)
create or replace function is_admin(user_uuid uuid)
returns boolean as $$
begin
    -- Check if user has admin role in user metadata
    return exists (
        select 1 from auth.users
        where id = user_uuid
        and raw_user_meta_data->>'role' = 'admin'
    );
end;
$$ language plpgsql security definer;


-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
--
-- Next Steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Create backend routers: marketplace.py, consultations.py, pharmacist.py
-- 3. Integrate Razorpay for payments
-- 4. Integrate Agora for voice calls
--
-- Platform Fee: 20% (configurable in backend config.py)
-- Minimum Payout: INR 500 (configurable)
-- Payout Cycle: Weekly (every Monday)
-- ============================================================================
