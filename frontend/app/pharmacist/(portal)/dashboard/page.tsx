"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import {
    Users,
    Wallet,
    Star,
    CalendarDays,
    Play,
    Phone,
    BadgeCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { pharmacistApi, PharmacistStats, PharmacistConsultation, PharmacistProfile } from "@/lib/pharmacist-api";

import { ModeToggle } from "@/components/mode-toggle";
import { Skeleton } from "@/components/ui/skeleton";

export default function PharmacistDashboard() {
    const [stats, setStats] = useState<PharmacistStats | null>(null);
    const [consultations, setConsultations] = useState<PharmacistConsultation[]>([]);
    const [profile, setProfile] = useState<PharmacistProfile | null>(null);
    const [isAvailable, setIsAvailable] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const [statsData, consultationsData, profileData] = await Promise.all([
                    pharmacistApi.getDashboardStats(),
                    pharmacistApi.getMyConsultations("upcoming"),
                    pharmacistApi.getProfile()
                ]);
                setStats(statsData);
                setConsultations(consultationsData);
                setProfile(profileData);
                // Set availability from database
                setIsAvailable(profileData.is_available);
            } catch (error) {
                console.error(error);
                // Silently fail - no popup
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const handleAvailabilityChange = async (checked: boolean) => {
        const previousValue = isAvailable;
        // Optimistic update
        setIsAvailable(checked);
        try {
            await pharmacistApi.toggleAvailability(checked);
        } catch (error: any) {
            console.error("Availability toggle error:", error);
            // Revert on error
            setIsAvailable(previousValue);
            toast.error(error.message || "Failed to update availability");
        }
    };

    if (loading) {
        return (
            <div className="space-y-8">
                {/* Header Skeleton */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-40 rounded-xl" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </div>

                {/* Stats Grid Skeleton */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="p-6 rounded-xl border bg-card shadow-sm space-y-4">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-24" />
                                <Skeleton className="h-8 w-8 rounded-lg" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-20" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Consultations Grid Skeleton */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                    <div className="col-span-4 rounded-xl border bg-card shadow-sm p-6 space-y-6">
                        <div className="flex justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-6 w-48" />
                                <Skeleton className="h-4 w-64" />
                            </div>
                            <Skeleton className="h-9 w-24 rounded-md" />
                        </div>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-20 w-full rounded-xl" />
                            ))}
                        </div>
                    </div>
                    <div className="col-span-3 rounded-xl border bg-card shadow-sm p-6 space-y-6">
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-4 w-48" />
                        </div>
                        <div className="space-y-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex gap-4">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Get pharmacist initials for avatar
    const getInitials = (name: string) => {
        const parts = name.split(" ");
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Avatar className="h-14 w-14 border-2 border-[rgb(var(--landing-moss-rgb)/0.30)] shadow-lg">
                        {profile?.profile_image_url && (
                            <AvatarImage src={profile.profile_image_url} alt={profile?.full_name} />
                        )}
                        <AvatarFallback className="bg-(--landing-clay) text-white text-lg font-bold">
                            {profile?.full_name ? getInitials(profile.full_name) : "Ph"}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold tracking-tight">
                                Welcome, {profile?.full_name || "Pharmacist"}
                            </h2>
                            {profile?.verification_status === "approved" && (
                                <BadgeCheck className="h-5 w-5 text-(--landing-moss)" />
                            )}
                        </div>
                        <p className="text-muted-foreground text-sm">
                            {profile?.specializations?.join(", ") || "Pharmacist"} • {profile?.experience_years || 0} years experience
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 bg-background/50 border border-border p-3 rounded-xl backdrop-blur-md shadow-sm">
                        <span className={`text-sm font-medium transition-colors ${isAvailable ? "text-(--landing-moss) drop-shadow-[0_0_8px_rgb(var(--landing-moss-rgb)/0.55)]" : "text-muted-foreground"}`}>
                            {isAvailable ? "Available for Calls" : "Offline"}
                        </span>
                        <Switch
                            checked={isAvailable}
                            onCheckedChange={handleAvailabilityChange}
                            className="data-[state=checked]:bg-(--landing-moss)"
                        />
                    </div>
                    <ModeToggle />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-(--landing-card) border-(--landing-border) shadow-lg hover:shadow-[rgb(var(--landing-moss-rgb)/0.14)] transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                        <div className="p-2 bg-[rgb(var(--landing-moss-rgb)/0.12)] rounded-lg">
                            <Wallet className="h-5 w-5 text-(--landing-moss)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">₹{stats?.total_earnings || 0}</div>
                        <p className="text-xs text-(--landing-moss) mt-1 font-medium">+20.1% from last month</p>
                    </CardContent>
                </Card>

                <Card className="bg-(--landing-card) border-(--landing-border) shadow-lg hover:shadow-[rgb(var(--landing-clay-rgb)/0.12)] transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Consultations</CardTitle>
                        <div className="p-2 bg-[rgb(var(--landing-clay-rgb)/0.12)] rounded-lg">
                            <Users className="h-5 w-5 text-(--landing-clay)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{stats?.completed_consultations || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Completed successfully</p>
                    </CardContent>
                </Card>

                <Card className="bg-(--landing-card) border-(--landing-border) shadow-lg hover:shadow-[rgb(var(--landing-clay-rgb)/0.12)] transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Average Rating</CardTitle>
                        <div className="p-2 bg-[rgb(var(--landing-clay-rgb)/0.10)] rounded-lg">
                            <Star className="h-5 w-5 text-(--landing-clay)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">{stats?.rating_avg || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Based on {stats?.rating_count || 0} reviews</p>
                    </CardContent>
                </Card>

                <Card className="bg-(--landing-card) border-(--landing-border) shadow-lg hover:shadow-[rgb(var(--landing-moss-rgb)/0.12)] transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payout</CardTitle>
                        <div className="p-2 bg-[rgb(var(--landing-moss-rgb)/0.10)] rounded-lg">
                            <CalendarDays className="h-5 w-5 text-(--landing-moss)" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-foreground">₹{stats?.pending_payout || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1">Processing on Monday</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Consultations / Upcoming */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 bg-background/50 border-border shadow-xl backdrop-blur-sm">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-xl">Upcoming Consultations</CardTitle>
                                <CardDescription className="text-muted-foreground">
                                    You have {stats?.upcoming_consultations || 0} bookings scheduled.
                                </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" className="bg-background hover:bg-muted transition-all">
                                View All
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {consultations.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border">
                                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                        <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                                    </div>
                                    <p className="text-lg font-medium">No upcoming consultations</p>
                                    <p className="text-sm mt-1 max-w-xs mx-auto">Set your availability to 'Available' to start receiving new bookings from patients.</p>
                                </div>
                            ) : (
                                consultations.slice(0, 5).map((consultation) => {
                                    const isJoinable = consultation.status === "confirmed" || consultation.status === "in_progress";
                                    return (
                                        <div key={consultation.id} className="group flex items-center justify-between p-4 bg-card rounded-xl border border-border hover:border-[rgb(var(--landing-moss-rgb)/0.22)] hover:bg-muted/50 transition-all duration-200">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="h-12 w-12 border-2 border-border shadow-sm">
                                                    <AvatarFallback className="bg-muted text-foreground font-semibold">
                                                        {consultation.patient_name?.slice(0, 2).toUpperCase() || "PT"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-semibold text-foreground group-hover:text-(--landing-moss) transition-colors">
                                                        {consultation.patient_name || `Patient #${consultation.patient_id.slice(0, 8)}`}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                                                            {format(new Date(consultation.scheduled_at), "h:mm a")}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            • {consultation.duration_minutes} Mins
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <Link href={`/pharmacist/consultations/${consultation.id}`}>
                                                    <Button
                                                        size="sm"
                                                        className={`transition-all duration-300 shadow-lg ${isJoinable
                                                            ? "bg-(--landing-moss) hover:bg-[rgb(var(--landing-moss-rgb)/0.9)] text-(--landing-bone) shadow-[rgb(var(--landing-moss-rgb)/0.18)]"
                                                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border"
                                                            }`}
                                                    >
                                                        {isJoinable ? (
                                                            <>
                                                                <Phone className="mr-2 h-3.5 w-3.5 animate-pulse" /> Join Call
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Play className="mr-2 h-3.5 w-3.5" /> View
                                                            </>
                                                        )}
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Recent Activity / Notifications */}
                <Card className="col-span-3 bg-background/50 border-border shadow-xl backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="text-xl">Recent Activity</CardTitle>
                        <CardDescription>Latest notifications and updates</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                                <div className="h-10 w-10 rounded-full bg-[rgb(var(--landing-moss-rgb)/0.10)] border border-[rgb(var(--landing-moss-rgb)/0.20)] flex items-center justify-center text-(--landing-moss) shrink-0 shadow-[0_0_10px_rgb(var(--landing-moss-rgb)/0.10)]">
                                    <Wallet className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Payout Processed</p>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Your weekly payout of <span className="text-foreground font-medium">₹12,400</span> has been successfully processed to your account.</p>
                                    <p className="text-[10px] text-muted-foreground mt-2 font-medium">2 hours ago</p>
                                </div>
                            </div>

                            <div className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                                <div className="h-10 w-10 rounded-full bg-[rgb(var(--landing-clay-rgb)/0.10)] border border-[rgb(var(--landing-clay-rgb)/0.22)] flex items-center justify-center text-(--landing-clay) shrink-0 shadow-[0_0_10px_rgb(var(--landing-clay-rgb)/0.10)]">
                                    <Star className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">New 5-Star Review</p>
                                    <p className="text-xs text-muted-foreground mt-1 italic leading-relaxed">"Dr. Pharmacist was very helpful explaining the dosage..."</p>
                                    <p className="text-[10px] text-muted-foreground mt-2 font-medium">Yesterday</p>
                                </div>
                            </div>

                            <div className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors opacity-60">
                                <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                                    <Users className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">New Profile Visit</p>
                                    <p className="text-xs text-muted-foreground mt-1">Your profile was viewed 12 times today.</p>
                                    <p className="text-[10px] text-muted-foreground mt-2 font-medium">2 days ago</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
