"use client";

import { createClient } from "@/lib/supabase/client";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app").replace(/\/+$/, "");

export interface PharmacistStats {
    total_earnings: number;
    pending_payout: number;
    completed_consultations: number;
    upcoming_consultations: number;
    rating_avg: number;
    rating_count: number;
}

export interface ScheduleSlot {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

export interface PharmacistConsultation {
    id: string;
    patient_id: string;
    patient_name?: string;
    patient_concern?: string;
    scheduled_at: string;
    status: "pending_payment" | "confirmed" | "in_progress" | "completed" | "cancelled" | "refunded" | "no_show";
    amount: number;
    pharmacist_earning: number;
    duration_minutes: number;
    agora_channel?: string;
    payment_status?: string;
    razorpay_order_id?: string;
}

export interface PharmacistProfile {
    id: string;
    user_id: string;
    full_name: string;
    bio?: string;
    profile_image_url?: string;
    specializations: string[];
    experience_years: number;
    languages: string[];
    education?: string;
    rate: number;
    duration_minutes: number;
    rating_avg: number;
    rating_count: number;
    completed_consultations: number;
    is_available: boolean;
    verification_status: string;
}

export interface PayoutSummary {
    id: string;
    period_start: string;
    period_end: string;
    gross_amount: number;
    tds_deducted: number;
    net_amount: number;
    consultation_count: number;
    status: "pending" | "processing" | "completed" | "failed";
    payout_method?: string;
    transfer_reference?: string;
    processed_at?: string;
    created_at: string;
}

export interface PayoutStats {
    total_paid: number;
    pending_payout: number;
    unpaid_earnings: number;
    total_earnings?: number; // Added from dashboard stats
    last_payout: {
        amount: number;
        date?: string;
    };
}

/**
 * Get authentication headers with the current user's access token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
        // Try to refresh the session
        const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
        if (!refreshedSession?.access_token) {
            throw new Error("Not authenticated. Please log in again.");
        }
        return {
            "Authorization": `Bearer ${refreshedSession.access_token}`,
            "Content-Type": "application/json",
        };
    }

    return {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
    };
}

/**
 * Handle API response errors consistently
 */
async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        if (response.status === 401) {
            // Token expired or invalid - trigger re-auth
            const supabase = createClient();
            await supabase.auth.refreshSession();
            throw new Error("Session expired. Please refresh the page.");
        }

        if (response.status === 403) {
            throw new Error("Access denied. You may not have pharmacist privileges.");
        }

        if (response.status === 429) {
            throw new Error("Too many requests. Please wait a moment.");
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Request failed: ${response.statusText}`);
    }

    if (response.status === 204) {
        return {} as T;
    }

    return response.json();
}

/**
 * Authenticated fetch wrapper for pharmacist API
 */
async function authFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
    const headers = await getAuthHeaders();

    const response = await fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...options.headers,
        },
    });

    return handleResponse<T>(response);
}

export const pharmacistApi = {
    async getDashboardStats(): Promise<PharmacistStats> {
        return authFetch<PharmacistStats>(`${API_URL}/api/pharmacist/dashboard`);
    },

    async toggleAvailability(isAvailable: boolean): Promise<{ is_available: boolean }> {
        return authFetch<{ is_available: boolean }>(
            `${API_URL}/api/pharmacist/availability?is_available=${isAvailable}`,
            { method: "PUT" }
        );
    },

    async getProfile(): Promise<PharmacistProfile> {
        return authFetch<PharmacistProfile>(`${API_URL}/api/pharmacist/profile`);
    },

    async updateProfile(data: Partial<PharmacistProfile>): Promise<PharmacistProfile> {
        return authFetch<PharmacistProfile>(`${API_URL}/api/pharmacist/profile`, {
            method: "PUT",
            body: JSON.stringify(data)
        });
    },

    async getSchedule(): Promise<ScheduleSlot[]> {
        return authFetch<ScheduleSlot[]>(`${API_URL}/api/pharmacist/schedule`);
    },

    async setSchedule(slots: ScheduleSlot[]): Promise<ScheduleSlot[]> {
        return authFetch<ScheduleSlot[]>(`${API_URL}/api/pharmacist/schedule`, {
            method: "POST",
            body: JSON.stringify(slots)
        });
    },

    async getMyConsultations(statusFilter?: string): Promise<PharmacistConsultation[]> {
        const url = statusFilter
            ? `${API_URL}/api/pharmacist/consultations?status_filter=${statusFilter}`
            : `${API_URL}/api/pharmacist/consultations`;
        return authFetch<PharmacistConsultation[]>(url);
    },

    async getConsultation(id: string): Promise<PharmacistConsultation> {
        return authFetch<PharmacistConsultation>(`${API_URL}/api/consultations/${id}`);
    },

    async confirmConsultation(id: string): Promise<{ status: string }> {
        return authFetch<{ status: string }>(`${API_URL}/api/consultations/${id}/confirm`, {
            method: "POST"
        });
    },

    async joinCall(id: string) {
        return authFetch(`${API_URL}/api/consultations/${id}/join`, {
            method: "POST"
        });
    },

    async getMessages(id: string) {
        return authFetch(`${API_URL}/api/consultations/${id}/messages`);
    },

    async sendMessage(id: string, content: string) {
        return authFetch(`${API_URL}/api/consultations/${id}/message`, {
            method: "POST",
            body: JSON.stringify({ content })
        });
    },

    async completeConsultation(id: string, notes?: string) {
        return authFetch(`${API_URL}/api/consultations/${id}/complete`, {
            method: "POST",
            body: JSON.stringify({ notes })
        });
    },

    async cancelConsultation(id: string, reason?: string) {
        return authFetch(`${API_URL}/api/consultations/${id}/cancel`, {
            method: "POST",
            body: JSON.stringify({ reason: reason || "Cancelled by pharmacist" })
        });
    },

    // =====================================================
    // PAYOUT ENDPOINTS
    // =====================================================

    async getPayoutHistory(statusFilter?: string): Promise<PayoutSummary[]> {
        const url = statusFilter
            ? `${API_URL}/api/pharmacist/payouts?status_filter=${statusFilter}`
            : `${API_URL}/api/pharmacist/payouts`;
        return authFetch<PayoutSummary[]>(url);
    },

    async getPayoutStats(): Promise<PayoutStats> {
        return authFetch<PayoutStats>(`${API_URL}/api/pharmacist/payouts/stats`);
    }
};
