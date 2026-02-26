"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { format, addMinutes, isBefore } from "date-fns";
import { Send, ArrowLeft, Clock, AlertTriangle, Loader2, User, Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { io } from "socket.io-client";

interface Message {
    id: string;
    sender_type: "patient" | "pharmacist";
    content: string;
    created_at: string;
}

interface ConsultationDetail {
    id: string;
    patient_id: string;
    patient_name?: string;
    scheduled_at: string;
    duration_minutes: number;
    status: string;
    amount: number;
    pharmacist_earning: number;
    patient_concern?: string;
}

export default function ConsultationChatPage() {
    const params = useParams();
    const router = useRouter();
    const consultationId = params.id as string;

    const [consultation, setConsultation] = useState<ConsultationDetail | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState("");
    const [isExpired, setIsExpired] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch consultation details
    useEffect(() => {
        const fetchConsultation = async () => {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pharmacist/consultations/${consultationId}`, {
                    headers: { "Authorization": `Bearer ${session.access_token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setConsultation(data);
                }
            } catch (error) {
                console.error("Failed to fetch consultation", error);
            } finally {
                setLoading(false);
            }
        };

        fetchConsultation();
    }, [consultationId]);

    // Fetch messages
    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${consultationId}/messages`, {
                    headers: { "Authorization": `Bearer ${session.access_token}` }
                });

                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages || []);
                }
            } catch (error) {
                console.error("Failed to fetch messages", error);
            }
        };

        fetchMessages();

        // Socket.IO Subscription
        const socket = io(`${process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app"}`, {
            transports: ["websocket"],
            path: "/socket.io/"
        });

        socket.on("connect", () => {
            console.log("Socket connected");
            socket.emit("join_room", { room: `consultation_${consultationId}` });
        });

        socket.on("new_message", (message: Message) => {
            setMessages(prev => {
                if (prev.some(m => m.id === message.id)) return prev;
                return [...prev, message];
            });
        });

        // Fallback polling every 10s for any missed messages
        const interval = setInterval(fetchMessages, 10000);

        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, [consultationId]);

    // Timer countdown
    useEffect(() => {
        if (!consultation) return;

        const endTime = addMinutes(new Date(consultation.scheduled_at), consultation.duration_minutes);

        const updateTimer = () => {
            const now = new Date();
            if (isBefore(endTime, now)) {
                setIsExpired(true);
                setTimeRemaining("Session Ended");
            } else {
                const diff = endTime.getTime() - now.getTime();
                const mins = Math.floor(diff / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                setTimeRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [consultation]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim() || isExpired || sending) return;

        setSending(true);
        try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${consultationId}/message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content: newMessage })
            });

            if (res.ok) {
                const msg = await res.json();
                setMessages(prev => {
                    if (prev.some(m => m.id === msg.id)) return prev;
                    return [...prev, msg];
                });
                setNewMessage("");
                inputRef.current?.focus();
            }
        } catch (error) {
            console.error("Failed to send message", error);
        } finally {
            setSending(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)]';
            case 'in_progress': return 'bg-[rgb(var(--landing-clay-rgb)/0.12)] text-[color:var(--landing-clay)]';
            case 'completed': return 'bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)]';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!consultation) {
        return (
            <div className="p-8">
                <p className="text-muted-foreground">Consultation not found.</p>
                <Link href="/pharmacist/consultations">
                    <Button variant="outline" className="mt-4">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Consultations
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between py-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <Link href="/pharmacist/consultations">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <Avatar className="h-10 w-10 border-2 border-border">
                        <AvatarFallback className="bg-[rgb(var(--landing-moss-rgb)/0.12)] text-[color:var(--landing-moss)] font-semibold">
                            {consultation.patient_name?.slice(0, 2).toUpperCase() || "PT"}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="font-semibold">{consultation.patient_name || `Patient #${consultation.patient_id.slice(0, 8)}`}</h2>
                        <p className="text-xs text-muted-foreground">
                            {format(new Date(consultation.scheduled_at), "MMM d, h:mm a")} • {consultation.duration_minutes} min
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={getStatusColor(consultation.status)}>
                        {consultation.status.replace('_', ' ')}
                    </Badge>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isExpired ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                        <Clock className="h-4 w-4" />
                        {timeRemaining}
                    </div>
                </div>
            </div>

            {/* Patient Concern */}
            {consultation.patient_concern && (
                <div className="bg-muted/50 border border-border rounded-lg p-4 my-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Patient's Concern:</p>
                    <p className="text-sm">{consultation.patient_concern}</p>
                </div>
            )}

            {/* Chat Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                        <User className="h-12 w-12 mb-4 opacity-50" />
                        <p>No messages yet.</p>
                        <p className="text-sm">Start the conversation with your patient.</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.sender_type === "pharmacist" ? "justify-end" : "justify-start"}`}
                        >
                            <div
                                className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${msg.sender_type === "pharmacist"
                                    ? "bg-[color:var(--landing-moss)] text-[color:var(--landing-bone)] rounded-br-sm"
                                    : "bg-muted text-foreground rounded-bl-sm"
                                    }`}
                            >
                                <p className="text-sm">{msg.content}</p>
                                <p
                                    className={`text-[10px] mt-1 ${msg.sender_type === "pharmacist"
                                        ? "text-[rgb(var(--landing-marigold-rgb)/0.75)]"
                                        : "text-muted-foreground"
                                        }`}
                                >
                                    {format(new Date(msg.created_at), "h:mm a")}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Session Expired Warning */}
            {isExpired && (
                <div className="flex items-center gap-2 p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Session has ended. You can no longer send messages.</span>
                </div>
            )}

            {/* Message Input */}
            <div className="border-t border-border pt-4 pb-2">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex items-center gap-3"
                >
                    <Input
                        ref={inputRef}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={isExpired ? "Session ended" : "Type a message..."}
                        disabled={isExpired || sending}
                        className="flex-1 bg-background border-border"
                    />
                    <Button
                        type="submit"
                        disabled={!newMessage.trim() || isExpired || sending}
                        className="bg-[color:var(--landing-moss)] hover:bg-[rgb(var(--landing-moss-rgb)/0.9)] text-[color:var(--landing-bone)]"
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </div>
        </div>
    );
}
