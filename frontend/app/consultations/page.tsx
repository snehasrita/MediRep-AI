"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";
import { Calendar, Clock, Video, FileText, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { marketplaceApi, Consultation } from "@/lib/marketplace-api";

export default function ConsultationsPage() {
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                setLoading(true);
                const data = await marketplaceApi.getMyConsultations();
                setConsultations(data);
            } catch (error) {
                toast.error("Failed to load consultations");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const upcoming = consultations.filter(c => ["pending_payment", "confirmed", "in_progress"].includes(c.status));
    const past = consultations.filter(c => ["completed", "cancelled", "refunded", "no_show"].includes(c.status));

    const ConsultationCard = ({ consultation }: { consultation: Consultation }) => {
        const isJoinable = consultation.status === "in_progress" || consultation.status === "confirmed";

        return (
            <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <CardTitle className="text-base text-slate-200">{consultation.pharmacist_name}</CardTitle>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(consultation.scheduled_at), "PPP p")}
                            </div>
                        </div>
                    </div>
                    <StatusBadge status={consultation.status} />
                </CardHeader>
                <CardContent className="pb-3">
                    <div className="flex items-center justify-between text-sm text-slate-400">
                        <span className="flex items-center gap-2">
                            <Clock className="h-3 w-3" /> {consultation.duration_minutes} Mins
                        </span>
                        <span>₹{consultation.amount}</span>
                    </div>
                </CardContent>
                <CardFooter className="pt-3 border-t border-slate-800 bg-slate-950/30 flex justify-between">
                    <Link href={`/consultations/${consultation.id}`} className="w-full">
                        <Button variant={isJoinable ? "default" : "outline"} className={`w-full ${isJoinable ? "bg-green-600 hover:bg-green-700" : "border-slate-700 hover:bg-slate-800"}`}>
                            {isJoinable ? (
                                <>
                                    <Video className="mr-2 h-4 w-4" /> Join Call
                                </>
                            ) : (
                                <>
                                    View Details <ChevronRight className="ml-2 h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </Link>
                </CardFooter>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-12">
            <div className="max-w-5xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold">My Consultations</h1>
                    <p className="text-slate-400">Manage your appointments and join video calls.</p>
                </div>

                <Tabs defaultValue="upcoming" className="w-full">
                    <TabsList className="bg-slate-900 border border-slate-800">
                        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                        <TabsTrigger value="past">Past</TabsTrigger>
                    </TabsList>

                    <TabsContent value="upcoming" className="mt-6">
                        {loading ? (
                            <p className="text-slate-500">Loading...</p>
                        ) : upcoming.length === 0 ? (
                            <div className="text-center py-12 bg-slate-900 rounded-lg border border-slate-800">
                                <Calendar className="h-12 w-12 mx-auto text-slate-600 mb-4" />
                                <h3 className="text-lg font-medium">No upcoming consultations</h3>
                                <p className="text-slate-500 mb-4">Book an appointment with a pharmacist today.</p>
                                <Link href="/marketplace">
                                    <Button>Browse Pharmacists</Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {upcoming.map(c => <ConsultationCard key={c.id} consultation={c} />)}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="past" className="mt-6">
                        {past.length === 0 ? (
                            <p className="text-slate-500">No past consultations found.</p>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {past.map(c => <ConsultationCard key={c.id} consultation={c} />)}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles = {
        confirmed: "bg-green-500/10 text-green-400 border-green-500/20",
        in_progress: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse",
        completed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
        cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
        pending_payment: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
        refunded: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        no_show: "bg-orange-500/10 text-orange-300 border-orange-500/20",
    };

    return (
        <Badge variant="outline" className={`${(styles as any)[status] || styles.pending_payment} capitalize`}>
            {status.replace("_", " ")}
        </Badge>
    );
}
