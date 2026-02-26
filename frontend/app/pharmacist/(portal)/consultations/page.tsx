"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { Loader2, Calendar, Clock, Video, MessageSquare, IndianRupee, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";

interface Consultation {
    id: string;
    patient_id: string;
    patient_name?: string;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    amount: number;
    pharmacist_earning: number;
    razorpay_order_id: string;
    patient_concern?: string;
}

export default function PharmacistConsultationsPage() {
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("upcoming");

    useEffect(() => {
        const fetchConsultations = async () => {
            setIsLoading(true);
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) return;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pharmacist/consultations?status_filter=${activeTab}`, {
                    headers: {
                        "Authorization": `Bearer ${session.access_token}`
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    setConsultations(data);
                }
            } catch (error) {
                console.error("Failed to fetch consultations", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchConsultations();
    }, [activeTab]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)]';
            case 'in_progress': return 'bg-[rgb(var(--landing-clay-rgb)/0.12)] text-[color:var(--landing-clay)]';
            case 'completed': return 'bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)]';
            case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Consultations</h1>
                    <p className="text-muted-foreground">View and manage your paid bookings.</p>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                    <TabsTrigger value="past">Past / Completed</TabsTrigger>
                    <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-6 space-y-4">
                    {isLoading ? (
                        <div className="flex justify-center p-12">
                            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--landing-clay)]" />
                        </div>
                    ) : consultations.length === 0 ? (
                        <Card className="bg-card border-border">
                            <CardContent className="flex flex-col items-center justify-center p-12 text-center h-64">
                                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold">No consultations found</h3>
                                <p className="text-muted-foreground mt-1">You don't have any {activeTab} consultations.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {consultations.map((c) => {
                                const isActive = c.status === 'confirmed' || c.status === 'in_progress';
                                return (
                                    <Card key={c.id} className="bg-card border-border hover:shadow-lg transition-shadow">
                                        <CardHeader className="pb-3">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-10 w-10 border-2 border-border">
                                                        <AvatarFallback className="bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)] font-semibold">
                                                            {c.patient_name?.slice(0, 2).toUpperCase() || "PT"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <CardTitle className="text-base font-medium">
                                                            {c.patient_name || `Patient #${c.patient_id.slice(0, 8)}`}
                                                        </CardTitle>
                                                        <CardDescription className="flex items-center mt-1">
                                                            <Clock className="w-3 h-3 mr-1" />
                                                            {format(new Date(c.scheduled_at), "MMM d, h:mm a")}
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                                <Badge variant="secondary" className={getStatusColor(c.status)}>
                                                    {c.status.replace('_', ' ')}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Duration</span>
                                                <span className="font-medium">{c.duration_minutes} min</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">Your Earning</span>
                                                <span className="font-semibold flex items-center text-[color:var(--landing-moss)]">
                                                    <IndianRupee className="w-3 h-3 mr-1" />
                                                    {c.pharmacist_earning}
                                                </span>
                                            </div>

                                            {c.patient_concern && (
                                                <div className="bg-muted/50 p-3 rounded-md text-xs border border-border">
                                                    <span className="font-semibold block mb-1">Patient Concern:</span>
                                                    <span className="text-muted-foreground">{c.patient_concern}</span>
                                                </div>
                                            )}

                                            <div className="flex gap-2 pt-2">
                                                <Link href={`/pharmacist/consultations/${c.id}`} className="flex-1">
                                                    <Button className="w-full" size="sm">
                                                        <MessageSquare className="w-4 h-4 mr-2" /> Chat
                                                    </Button>
                                                </Link>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
