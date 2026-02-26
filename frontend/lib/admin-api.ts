"use client";

import { createClient } from "@/lib/supabase/client";

// We need to use the backend API URL
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app").replace(/\/+$/, "");

// Interface for Pharmacist Application
export interface PharmacistApplication {
    id: string;
    user_id: string;
    full_name: string;
    email?: string;
    phone: string;
    license_number: string;
    license_image_url: string;
    license_state?: string;
    license_expiry?: string;
    ai_confidence_score: number;
    ai_extracted_data?: any;
    verification_status: "pending" | "under_review" | "approved" | "rejected";
    created_at: string;
}

export interface AdminStats {
    total_users: number;
    total_pharmacists: number;
    pending_verifications: number;
    total_consultations: number;
    total_revenue: number;
}

// Payout interfaces
export interface Payout {
    id: string;
    pharmacist_id: string;
    pharmacist?: {
        id: string;
        full_name: string;
        user_id: string;
    };
    period_start: string;
    period_end: string;
    gross_amount: number;
    tds_deducted: number;
    net_amount: number;
    consultation_count: number;
    status: "pending" | "processing" | "completed" | "failed";
    payout_method?: string;
    transfer_reference?: string;
    notes?: string;
    processed_at?: string;
    created_at: string;
}

export interface PendingEarning {
    pharmacist_id: string;
    pharmacist_name: string;
    pending_amount: number;
    consultation_count: number;
}

export interface PayoutCreateRequest {
    pharmacist_id: string;
    period_start: string;
    period_end: string;
    payout_method: "razorpay_payout" | "manual_upi" | "manual_bank";
    notes?: string;
}

export interface PayoutUpdateRequest {
    status: "processing" | "completed" | "failed";
    transfer_reference?: string;
    notes?: string;
}

// User interfaces
export interface AdminUser {
    id: string;
    display_name?: string;
    email?: string;
    avatar_url?: string;
    role?: string;
    is_suspended?: boolean;
    is_pharmacist?: boolean;
    pharmacist_status?: string;
    consultation_count?: number;
    created_at: string;
    last_sign_in?: string;
}

/**
 * Admin API Client
 * Uses the user's session token to authenticate with the backend
 */
export const adminApi = {

    /**
     * Get authentication headers
     */
    async getHeaders() {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            // Try to refresh the session
            const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
            if (!refreshedSession) {
                throw new Error("Not authenticated");
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
    },

    /**
     * Get system stats
     */
    async getStats(): Promise<AdminStats> {
        const headers = await this.getHeaders();
        console.log("Fetching admin stats from:", `${API_URL}/api/admin/stats`);
        const res = await fetch(`${API_URL}/api/admin/stats`, { headers });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error("Admin stats error:", res.status, errData);
            throw new Error(errData.detail || "Failed to fetch stats");
        }
        return res.json();
    },

    /**
     * Get pending pharmacist applications
     */
    async getPendingPharmacists(): Promise<PharmacistApplication[]> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/pharmacists/pending`, { headers });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error("Admin API error:", res.status, errData);
            throw new Error(errData.detail || "Failed to fetch pending applications");
        }
        return res.json();
    },

    /**
     * Verify a pharmacist application (Approve/Reject)
     */
    async verifyPharmacist(
        pharmacistId: string,
        status: "approved" | "rejected",
        notes?: string
    ): Promise<any> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/pharmacists/${pharmacistId}/verify`, {
            method: "POST",
            headers,
            body: JSON.stringify({ status, notes }),
        });

        if (!res.ok) throw new Error("Failed to verify pharmacist");
        return res.json();
    },

    // ========================================================================
    // PAYOUT MANAGEMENT
    // ========================================================================

    /**
     * List all payouts with optional filters
     */
    async listPayouts(params?: {
        status?: string;
        pharmacist_id?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ payouts: Payout[]; count: number }> {
        const headers = await this.getHeaders();
        const searchParams = new URLSearchParams();
        if (params?.status) searchParams.set("status", params.status);
        if (params?.pharmacist_id) searchParams.set("pharmacist_id", params.pharmacist_id);
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());

        const res = await fetch(`${API_URL}/api/admin/payouts?${searchParams}`, { headers });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to fetch payouts");
        }
        return res.json();
    },

    /**
     * Get pharmacists with pending earnings
     */
    async getPendingEarnings(): Promise<{ pending_earnings: PendingEarning[] }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/payouts/pending-earnings`, { headers });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to fetch pending earnings");
        }
        return res.json();
    },

    /**
     * Create a new payout
     */
    async createPayout(data: PayoutCreateRequest): Promise<{ success: boolean; payout: Payout }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/payouts`, {
            method: "POST",
            headers,
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to create payout");
        }
        return res.json();
    },

    /**
     * Update payout status
     */
    async updatePayout(payoutId: string, data: PayoutUpdateRequest): Promise<{ success: boolean; payout: Payout }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/payouts/${payoutId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to update payout");
        }
        return res.json();
    },

    /**
     * Get payout details
     */
    async getPayoutDetails(payoutId: string): Promise<{ payout: Payout; consultations: any[] }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/payouts/${payoutId}`, { headers });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to fetch payout details");
        }
        return res.json();
    },

    // ========================================================================
    // USER MANAGEMENT
    // ========================================================================

    /**
     * List all users
     */
    async listUsers(params?: {
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ users: AdminUser[]; total: number }> {
        const headers = await this.getHeaders();
        const searchParams = new URLSearchParams();
        if (params?.search) searchParams.set("search", params.search);
        if (params?.limit) searchParams.set("limit", params.limit.toString());
        if (params?.offset) searchParams.set("offset", params.offset.toString());

        const res = await fetch(`${API_URL}/api/admin/users?${searchParams}`, { headers });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to fetch users");
        }
        return res.json();
    },

    /**
     * Get user details
     */
    async getUserDetails(userId: string): Promise<{ user: AdminUser }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/users/${userId}`, { headers });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to fetch user details");
        }
        return res.json();
    },

    /**
     * Update user (suspend/unsuspend)
     */
    async updateUser(userId: string, data: { is_suspended?: boolean; notes?: string }): Promise<{ success: boolean; is_suspended: boolean }> {
        const headers = await this.getHeaders();
        const res = await fetch(`${API_URL}/api/admin/users/${userId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to update user");
        }
        return res.json();
    }
};
