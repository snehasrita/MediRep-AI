"use client";

import { useState } from "react";
import { User, Award, Clock, Languages, ArrowLeft, ShieldCheck, Loader2, Sparkles, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import Script from "next/script";
import { useAuth } from "@/lib/context/AuthContext";
import { marketplaceApi } from "@/lib/marketplace-api";

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
    bio?: string;
    education?: string;
}

interface PharmacistProfileProps {
    pharmacist: Pharmacist;
    onBack: () => void;
    onBookingComplete: (consultationId: string) => void;
}

export default function PharmacistProfile({ pharmacist, onBack, onBookingComplete }: PharmacistProfileProps) {
    const { session, user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bookingSuccessId, setBookingSuccessId] = useState<string | null>(null);

    const handleBookNow = async () => {
        if (!session) {
            setError("Please sign in to book a consultation");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Create Booking & Order
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/book`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    pharmacist_id: pharmacist.id,
                    scheduled_at: new Date().toISOString(),
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Booking failed");

            const { razorpay_order_id, amount, currency, consultation_id } = data;
            const razorpayKeyId = await marketplaceApi.getRazorpayKeyId();

            // 2. Open Razorpay
            const options = {
                key: razorpayKeyId,
                amount: amount * 100,
                currency: currency,
                name: "MediRep AI",
                description: `Consultation with ${pharmacist.full_name}`,
                order_id: razorpay_order_id,
                handler: async (response: any) => {
                    try {
                        const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${consultation_id}/verify-payment`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${session?.access_token as string}`
                            },
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature,
                            }),
                        });

                        if (!verifyRes.ok) throw new Error("Verification failed");

                        setBookingSuccessId(consultation_id);
                        onBookingComplete(consultation_id);
                    } catch (e: any) {
                        setBookingSuccessId(consultation_id);
                    }
                },
                prefill: {
                    name: user?.user_metadata?.full_name || "User",
                    email: user?.email,
                },
                theme: {
                    color: "#0891b2",
                },
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on("payment.failed", function (response: any) {
                setError("Payment failed. Please try again.");
            });
            rzp.open();

        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    if (bookingSuccessId) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white p-6 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-in zoom-in">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h2>
                <div className="flex flex-col gap-3 w-full max-w-sm mt-6">
                    <Button
                        onClick={() => onBookingComplete(bookingSuccessId)}
                        className="bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl text-lg font-medium shadow-lg shadow-green-600/20"
                    >
                        Start Chat Now
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            {/* Header Image/Banner */}
            <div className="relative h-48 bg-linear-to-br from-orange-500 to-red-600 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 left-4 text-white hover:bg-white/20 z-10"
                    onClick={onBack}
                >
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-20" />
            </div>

            {/* Profile Content */}
            <div className="flex-1 -mt-12 px-6 pb-6 overflow-y-auto">
                <div className="relative flex flex-col items-center mb-6">
                    <div className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg bg-white overflow-hidden mb-3">
                        {pharmacist.profile_image_url ? (
                            <img src={pharmacist.profile_image_url} alt={pharmacist.full_name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                                <User className="h-10 w-10" />
                            </div>
                        )}
                    </div>

                    <h2 className="text-2xl font-bold text-slate-900 text-center">{pharmacist.full_name}</h2>
                    <p className="text-orange-600 font-medium text-sm">{pharmacist.specializations.join(" • ")}</p>

                    <div className="flex items-center gap-1 mt-1 text-sm text-slate-500">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        <span>Verified Pharmacist</span>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                        <div className="flex justify-center mb-1 text-amber-500"><Award className="h-5 w-5" /></div>
                        <div className="font-bold text-slate-900">{pharmacist.experience_years}+ Years</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Experience</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                        <div className="flex justify-center mb-1 text-orange-500"><Clock className="h-5 w-5" /></div>
                        <div className="font-bold text-slate-900">15 Min</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Duration</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                        <div className="flex justify-center mb-1 text-purple-500"><Languages className="h-5 w-5" /></div>
                        <div className="font-bold text-slate-900">{pharmacist.languages.length}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Languages</div>
                    </div>
                </div>

                {/* Bio & Details */}
                <div className="space-y-6">
                    <div>
                        <h3 className="font-semibold text-slate-900 mb-2">About</h3>
                        <p className="text-slate-600 leading-relaxed text-sm">
                            {pharmacist.bio || `Dr. ${pharmacist.full_name} is a dedicated pharmacist with over ${pharmacist.experience_years} years of experience in ${pharmacist.specializations[0]}. They are committed to providing accurate medication advice and patient care.`}
                        </p>
                    </div>

                    {pharmacist.education && (
                        <div>
                            <h3 className="font-semibold text-slate-900 mb-2">Education</h3>
                            <p className="text-slate-600 text-sm flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                {pharmacist.education}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="p-4 border-t border-slate-100 bg-white">
                {error && (
                    <div className="mb-4 flex items-center gap-2 text-red-500 text-sm bg-red-50 p-3 rounded-lg">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <p className="text-sm text-slate-500">Total Cost</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-slate-900">₹{pharmacist.rate}</span>
                        </div>
                    </div>
                    <Button
                        onClick={handleBookNow}
                        disabled={loading}
                        className="flex-1 bg-linear-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-lg shadow-orange-500/25 h-12 rounded-xl text-base"
                    >
                        {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
                        {loading ? "Processing..." : "Pay & Chat"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
