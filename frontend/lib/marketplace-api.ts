import { createClient } from "@supabase/supabase-js";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app").replace(/\/+$/, "");

export interface PharmacistPreview {
    id: string;
    full_name: string;
    bio: string;
    profile_image_url: string;
    specializations: string[];
    experience_years: number;
    languages: string[];
    rate: number;
    duration_minutes: number;
    rating_avg: number;
    rating_count: number;
    is_available: boolean;
}

export interface SearchFilters {
    specialization?: string;
    language?: string;
    min_rating?: number;
    max_rate?: number;
    available_only?: boolean;
}

export interface ScheduleSlot {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_active: boolean;
}

export const marketplaceApi = {
    async getPaymentConfig(): Promise<{ enabled: boolean; razorpay_key_id: string | null }> {
        const res = await fetch(`${API_URL}/api/consultations/payment/config`);
        if (!res.ok) return { enabled: false, razorpay_key_id: null };
        return res.json();
    },

    async getRazorpayKeyId(): Promise<string> {
        const fromEnv = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (fromEnv) return fromEnv;

        const cfg = await this.getPaymentConfig();
        if (cfg.enabled && cfg.razorpay_key_id) return cfg.razorpay_key_id;
        throw new Error("Razorpay is not configured (missing key id)");
    },

    async searchPharmacists(filters: SearchFilters = {}): Promise<PharmacistPreview[]> {
        const params = new URLSearchParams();
        if (filters.specialization) params.append("specialization", filters.specialization);
        if (filters.language) params.append("language", filters.language);
        if (filters.min_rating) params.append("min_rating", String(filters.min_rating));
        if (filters.max_rate) params.append("max_rate", String(filters.max_rate));
        if (filters.available_only !== undefined) params.append("available_only", String(filters.available_only));

        // Auth not strictly required for search but good practice if rate limiting uses user context
        // Skipping auth for public search for now

        const res = await fetch(`${API_URL}/api/marketplace/pharmacists?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to search pharmacists");
        return res.json();
    },

    async getPharmacist(id: string): Promise<PharmacistPreview> {
        const res = await fetch(`${API_URL}/api/marketplace/pharmacists/${id}`);
        if (!res.ok) throw new Error("Failed to load pharmacist profile");
        return res.json();
    },

    async getSchedule(id: string) {
        const res = await fetch(`${API_URL}/api/marketplace/pharmacists/${id}/schedule`);
        if (!res.ok) throw new Error("Failed to load schedule");
        return res.json();
    },

    async bookConsultation(pharmacistId: string, scheduledAt: string, concern: string) {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) throw new Error("You must be logged in to book");

        const res = await fetch(`${API_URL}/api/consultations/book`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                pharmacist_id: pharmacistId,
                scheduled_at: scheduledAt,
                patient_concern: concern,
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Booking failed");
        }
        return res.json();
    },

    async verifyPayment(
        consultationId: string,
        payload: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
    ) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${consultationId}/verify-payment`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Payment verification failed");
        }
        return res.json();
    },

    async getSpecializations() {
        const res = await fetch(`${API_URL}/api/marketplace/specializations`);
        if (!res.ok) return { specializations: [] };
        return res.json();
    },

    async getLanguages() {
        const res = await fetch(`${API_URL}/api/marketplace/languages`);
        if (!res.ok) return { languages: [] };
        return res.json();
    },

    async getAuthHeaders() {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");
        return {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json"
        };
    },

    async getMyConsultations(status?: string): Promise<Consultation[]> {
        const headers = await this.getAuthHeaders();
        const url = status
            ? `${API_URL}/api/user/consultations?status=${status}`
            : `${API_URL}/api/user/consultations`;

        const res = await fetch(url, { headers });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Failed to fetch consultations (${res.status})`);
        }
        return res.json();
    },

    async getConsultation(id: string): Promise<Consultation> {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}`, { headers });
        if (!res.ok) throw new Error("Failed to load consultation");
        return res.json();
    },

    async joinCall(id: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}/join`, {
            method: "POST",
            headers
        });
        if (!res.ok) throw new Error("Failed to join call");
        return res.json();
    },

    async getMessages(id: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}/messages`, { headers });
        if (!res.ok) throw new Error("Failed to load messages");
        return res.json();
    },

    async sendMessage(id: string, content: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}/message`, {
            method: "POST",
            headers,
            body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error("Failed to send message");
        return res.json();
    },

    async cancelConsultation(id: string, reason?: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}/cancel`, {
            method: "POST",
            headers,
            body: JSON.stringify({ reason: reason || "Cancelled by user" })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to cancel consultation");
        }
        return res.json();
    },

    async completeConsultation(id: string, notes?: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${id}/complete`, {
            method: "POST",
            headers,
            body: JSON.stringify({ notes })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to complete consultation");
        }
        return res.json();
    },

    async submitReview(consultationId: string, rating: number, review?: string) {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_URL}/api/consultations/${consultationId}/review`, {
            method: "POST",
            headers,
            body: JSON.stringify({ consultation_id: consultationId, rating, review })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to submit review");
        }
        return res.json();
    }
};

export interface Consultation {
    id: string;
    pharmacist_name: string;
    pharmacist_id: string;
    scheduled_at: string;
    status: "pending_payment" | "confirmed" | "in_progress" | "completed" | "cancelled" | "refunded" | "no_show";
    amount: number;
    duration_minutes: number;
    agora_channel?: string;
    payment_status: string;
}

export interface Message {
    id: string;
    content: string;
    sender_type: "patient" | "pharmacist";
    created_at: string;
}
