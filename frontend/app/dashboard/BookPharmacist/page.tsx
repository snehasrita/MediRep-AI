"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { marketplaceApi } from "@/lib/marketplace-api";
import { useAuth } from "@/lib/context/AuthContext";
import PharmacistList from "@/components/Pharmacist/PharmacistList";
import PharmacistProfile from "@/components/Pharmacist/PharmacistProfile";
import ChatInterface from "@/components/Pharmacist/ChatInterface";
import { AnimatePresence, motion } from "framer-motion";

type ViewState = "LIST" | "PROFILE" | "CHAT";

interface Pharmacist {
    id: string;
    full_name: string;
    specializations: string[];
    experience_years: number;
    languages: string[];
    rate: number;
    rating_avg: number;
    rating_count: number;
    is_available: boolean;
    profile_image_url?: string;
    duration_minutes?: number;
}

export default function BookPharmacistPage() {
    const { session } = useAuth();
    const [view, setView] = useState<ViewState>("LIST");
    const [selectedPharmacist, setSelectedPharmacist] = useState<Pharmacist | null>(null);
    const [consultationId, setConsultationId] = useState<string | null>(null);
    const [targetEndTime, setTargetEndTime] = useState<string | null>(null);

    const searchParams = useSearchParams();
    const router = useRouter();
    const urlConsultationId = searchParams.get("consultationId");

    useEffect(() => {
        async function restoreSession() {
            if (!urlConsultationId || !session) return;
            try {
                // 1. Get Consultation Status with explicit auth
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${urlConsultationId}`, {
                    headers: {
                        "Authorization": `Bearer ${session.access_token}`
                    }
                });

                if (!res.ok) throw new Error("Failed to fetch consultation");

                const consultation = await res.json();

                // 2. Get Pharmacist Details (Needed for Profile/Chat UI)
                const pharmacistData = await marketplaceApi.getPharmacist(consultation.pharmacist_id);
                // Cast API response to local interface if needed, usually compatible
                setSelectedPharmacist(pharmacistData as any);

                // 3. Determine View based on Status
                if (['confirmed', 'in_progress'].includes(consultation.status)) {
                    setConsultationId(urlConsultationId);

                    const scheduledAt = new Date(consultation.scheduled_at);
                    const duration = consultation.duration_minutes || 15;
                    const endTime = new Date(scheduledAt.getTime() + duration * 60000).toISOString();
                    setTargetEndTime(endTime);

                    setView("CHAT");
                } else {
                    // If completed/expired/pending, show Profile logic
                    // If pending, user might have just paid but verification not synced.
                    // But usually we assume confirmed.
                    // If strictly pending, we might want to check if they want to retry payment?
                    // For now, adhere to previous logic: only confirm/in_progress gets chat.
                    // But DO NOT clear param if it's just a temporary fetch error.
                    // Here we assume fetch success.
                    setConsultationId(null);
                    setView("PROFILE");
                }
            } catch (e) {
                console.error("Failed to restore session", e);
                // Only clear param if it's a permanent error (e.g. 404) NOT 401/loading
                // But here we rely on success.
                // We'll leave the param for now to avoid 'vanishing' on transient errors.
            }
        }

        restoreSession();
    }, [urlConsultationId, router, session]);
    const handleSelectPharmacist = (pharmacist: Pharmacist) => {
        setSelectedPharmacist(pharmacist);
        setView("PROFILE");
        // Clear params when explicitly selecting from list?
        // Actually list is hidden in PROFILE view.
    };

    const handleBookingComplete = (id: string) => {
        setConsultationId(id);
        setTargetEndTime(new Date(Date.now() + 15 * 60000).toISOString());
        setView("CHAT");
        router.push(`/dashboard/BookPharmacist?consultationId=${id}`);
    };

    const handleSessionExpired = () => {
        setConsultationId(null);
        setTargetEndTime(null);
        setView("PROFILE");
        router.push("/dashboard/BookPharmacist");
    };

    const handleBack = () => {
        if (view === "PROFILE") {
            setSelectedPharmacist(null);
            setView("LIST");
            router.push("/dashboard/BookPharmacist");
        } else if (view === "CHAT") {
            // Confirm before leaving chat? For now just go back to list
            setConsultationId(null);
            setSelectedPharmacist(null);
            setView("LIST");
            router.push("/dashboard/BookPharmacist");
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col p-6 gap-4 overflow-hidden bg-background">
            <div className="flex-none">
                <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors font-medium"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                </Link>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Left Panel: List (Always visible on large screens, or main view) */}
                <div className={`w-full lg:w-1/3 min-w-[320px] bg-card rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col transition-all duration-300 ${view !== "LIST" ? "hidden lg:flex" : "flex"
                    }`}>
                    <PharmacistList onSelect={handleSelectPharmacist} />
                </div>

                {/* Right Panel: Content (Profile or Chat) */}
                <div className={`flex-1 bg-card rounded-3xl border border-border shadow-sm overflow-hidden relative transition-all duration-300 ${view === "LIST" ? "hidden lg:flex lg:items-center lg:justify-center" : "flex"
                    }`}>
                    <AnimatePresence mode="wait">
                        {view === "LIST" && (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-center p-8 max-w-md"
                            >
                                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <span className="text-4xl">👨‍⚕️</span>
                                </div>
                                <h3 className="text-xl font-bold text-foreground mb-2">Select a Pharmacist</h3>
                                <p className="text-muted-foreground">
                                    Browse the list on the left to view profiles, check availability, and book a consultation instantly.
                                </p>
                            </motion.div>
                        )}

                        {view === "PROFILE" && selectedPharmacist && (
                            <motion.div
                                key="profile"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="w-full h-full"
                            >
                                <PharmacistProfile
                                    pharmacist={selectedPharmacist}
                                    onBack={handleBack}
                                    onBookingComplete={handleBookingComplete}
                                />
                            </motion.div>
                        )}

                        {view === "CHAT" && consultationId && selectedPharmacist && (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full h-full"
                            >
                                <ChatInterface
                                    consultationId={consultationId}
                                    pharmacistName={selectedPharmacist.full_name}
                                    endTime={targetEndTime || new Date(Date.now() + 15 * 60000).toISOString()}
                                    onExpired={handleSessionExpired}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}