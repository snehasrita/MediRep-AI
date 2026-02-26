"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Clock, ArrowLeft, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { marketplaceApi, PharmacistPreview, ScheduleSlot } from "@/lib/marketplace-api";
import { format, addDays, startOfToday, isSameDay, parse, set } from "date-fns";

declare global {
    interface Window {
        Razorpay: any;
    }
}

export default function BookingPage() {
    const params = useParams();
    const router = useRouter();
    const pharmacistId = params.id as string;

    const [pharmacist, setPharmacist] = useState<PharmacistPreview | null>(null);
    const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);

    // Selection State
    const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [concern, setConcern] = useState("");

    useEffect(() => {
        async function loadData() {
            try {
                const [pharma, _schedule] = await Promise.all([
                    marketplaceApi.getPharmacist(pharmacistId),
                    marketplaceApi.getSchedule(pharmacistId)
                ]);
                setPharmacist(pharma);
                setSchedule(_schedule);
            } catch (error) {
                toast.error("Failed to load pharmacist details");
                router.push("/marketplace");
            } finally {
                setLoading(false);
            }
        }
        if (pharmacistId) loadData();
    }, [pharmacistId, router]);

    // Generate selectable days (next 7 days)
    const availableDays = Array.from({ length: 7 }, (_, i) => addDays(startOfToday(), i));

    // Get slots for selected date
    const getSlotsForDate = (date: Date) => {
        const dayOfWeek = date.getDay(); // 0-6
        return schedule.filter(s => s.day_of_week === dayOfWeek && s.is_active);
    };

    const handleBook = async () => {
        if (!selectedSlot || !pharmacist) return;

        try {
            setBooking(true);

            // Construct scheduled_at ISO string
            const [hours, minutes] = selectedSlot.split(':').map(Number);
            const scheduledAt = set(selectedDate, { hours, minutes }).toISOString();

            const data = await marketplaceApi.bookConsultation(pharmacistId, scheduledAt, concern);
            console.log("Booking created:", data);

            const razorpayKeyId = await marketplaceApi.getRazorpayKeyId();

            // Initialize Razorpay
            const options = {
                key: razorpayKeyId,
                amount: data.amount * 100,
                currency: data.currency,
                name: "MediRep AI",
                description: `Consultation with ${data.pharmacist_name}`,
                order_id: data.razorpay_order_id,
                handler: async function (response: any) {
                    console.log("Razorpay success callback:", response);
                    try {
                        await marketplaceApi.verifyPayment(data.consultation_id, {
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_signature: response.razorpay_signature,
                        });

                        console.log("Payment verified. Redirecting to:", `/consultations/${data.consultation_id}`);
                        setBookingSuccess(data.consultation_id);
                        toast.success("Booking Confirmed! Redirecting...");

                        // Force hard navigation
                        setTimeout(() => {
                            window.location.href = `/consultations/${data.consultation_id}`;
                        }, 500);

                    } catch (e: any) {
                        console.error("Verification failed:", e);
                        // Even if verification API throws (e.g. timeout), if we have payment_id, we should probably guide user to list
                        toast.error(e?.message || "Payment verification failed. Check your bookings.");
                    }
                },
                prefill: {
                    name: "Patient",
                    email: "patient@example.com",
                    contact: "9999999999"
                },
                theme: {
                    color: "#6366f1"
                },
                modal: {
                    ondismiss: function () {
                        setBooking(false);
                        console.log("Razorpay modal closed");
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                console.error("Payment Failed:", response.error);
                toast.error(response.error.description || "Payment failed");
                setBooking(false);
            });
            rzp.open();

        } catch (error: any) {
            console.error("Booking init failed:", error);
            toast.error(error.message || "Booking failed");
            setBooking(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading details...</div>;
    if (!pharmacist) return null;

    const activeSlots = getSlotsForDate(selectedDate);

    return (
        <div className="min-h-screen bg-slate-950 p-6 flex justify-center items-start">
            <Script src="https://checkout.razorpay.com/v1/checkout.js" />

            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left: Pharmacist Info */}
                <div className="md:col-span-1 space-y-6">
                    <Button variant="ghost" onClick={() => router.back()} className="pl-0 hover:bg-transparent text-slate-400 hover:text-white">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Search
                    </Button>

                    <Card className="bg-slate-900 border-slate-800">
                        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                            <Avatar className="h-24 w-24 border-4 border-slate-800">
                                <AvatarImage src={pharmacist.profile_image_url} />
                                <AvatarFallback>{pharmacist.full_name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <h2 className="text-xl font-bold text-slate-200">{pharmacist.full_name}</h2>
                                <p className="text-sm text-indigo-400 font-medium">{pharmacist.specializations?.join(", ")}</p>
                            </div>
                            <div className="text-sm text-slate-400 w-full pt-4 border-t border-slate-800 text-left">
                                <p className="line-clamp-4">{pharmacist.bio}</p>
                            </div>
                            <div className="w-full bg-slate-950 p-3 rounded-lg flex justify-between items-center text-sm">
                                <span className="text-slate-500">Rate</span>
                                <span className="font-bold text-slate-200">₹{pharmacist.rate} <span className="text-xs font-normal">/ session</span></span>
                            </div>
                            <div className={`w-full p-2 rounded-lg text-center text-sm font-medium ${pharmacist.is_available ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                                {pharmacist.is_available ? "● Online & Available" : "● Currently Offline"}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Booking Form */}
                <div className="md:col-span-2 space-y-6">
                    {bookingSuccess ? (
                        <Card className="bg-slate-900 border-green-500/50">
                            <CardHeader>
                                <CardTitle className="text-green-400">Booking Confirmed!</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20 text-green-300 mb-4">
                                    Payment successful! If redirection doesn't happen automatically, please click below.
                                </div>
                                <Button
                                    onClick={() => window.location.href = `/consultations/${bookingSuccess}`}
                                    className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg"
                                >
                                    Proceed to Consultation
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle>Select Appointment Time</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {/* Date Selector */}
                                {!pharmacist.is_available && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                        This pharmacist is currently offline. You cannot book a session right now.
                                    </div>
                                )}

                                <div className={`flex gap-2 overflow-x-auto pb-2 scrollbar-hide ${!pharmacist.is_available ? "opacity-50 pointer-events-none" : ""}`}>
                                    {availableDays.map((date) => {
                                        const isSelected = isSameDay(date, selectedDate);
                                        return (
                                            <div
                                                key={date.toISOString()}
                                                onClick={() => { setSelectedDate(date); setSelectedSlot(null); }}
                                                className={`
                              flex flex-col items-center justify-center min-w-[70px] h-[80px] rounded-lg cursor-pointer border transition-all
                              ${isSelected
                                                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/50"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600"}
                            `}
                                            >
                                                <span className="text-xs font-medium uppercase">{format(date, "EEE")}</span>
                                                <span className="text-xl font-bold">{format(date, "d")}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Slot Selector */}
                                <div className={`space-y-3 ${!pharmacist.is_available ? "opacity-50 pointer-events-none" : ""}`}>
                                    <h3 className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                        <Clock className="h-4 w-4" /> Available Slots
                                    </h3>

                                    {activeSlots.length > 0 ? (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                            {activeSlots.map((slot) => {
                                                // Naive slots: just show start time
                                                // In reality, we'd split start-end into 15/30 min chunks or just use start time as the slot
                                                // Assuming start_time is the slot start.

                                                const isSelected = selectedSlot === slot.start_time;
                                                return (
                                                    <button
                                                        key={`${slot.day_of_week}-${slot.start_time}`}
                                                        onClick={() => setSelectedSlot(slot.start_time)}
                                                        className={`
                                   py-2 px-3 text-sm rounded border transition-colors
                                   ${isSelected
                                                                ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                                                                : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600"}
                                 `}
                                                    >
                                                        {slot.start_time.slice(0, 5)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-slate-500 bg-slate-950 rounded-lg border border-slate-800">
                                            No slots available specifically for this day.
                                        </div>
                                    )}
                                </div>

                                {/* Concern Input */}
                                <div className={`space-y-3 ${!pharmacist.is_available ? "opacity-50 pointer-events-none" : ""}`}>
                                    <h3 className="text-sm font-medium text-slate-400">What is your concern?</h3>
                                    <Textarea
                                        value={concern}
                                        onChange={(e) => setConcern(e.target.value)}
                                        placeholder="Briefly describe your symptoms or questions..."
                                        className="bg-slate-950 border-slate-800 min-h-[100px]"
                                    />
                                </div>
                            </CardContent>

                            <CardFooter className="pt-2">
                                <Button
                                    onClick={handleBook}
                                    disabled={!selectedSlot || !concern || booking || !pharmacist.is_available}
                                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white h-12 text-lg shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {booking ? (
                                        "Processing Payment..."
                                    ) : !pharmacist.is_available ? (
                                        "Pharmacist Offline"
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            Prepare to Pay ₹{pharmacist.rate} <CreditCard className="h-4 w-4" />
                                        </span>
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    )}

                    <p className="text-xs text-center text-slate-500">
                        <ShieldCheck className="inline h-3 w-3 mr-1" />
                        Payment is held securely and only released to the pharmacist after the consultation.
                    </p>
                </div>
            </div>
        </div>
    );
}
