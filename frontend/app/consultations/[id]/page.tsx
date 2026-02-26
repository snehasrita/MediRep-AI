"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
    Calendar,
    Clock,
    Video,
    Send,
    Phone,
    ArrowLeft,
    MessageSquare,
    MoreVertical,
    XCircle,
    CheckCircle2,
    Mic,
    MicOff,
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { marketplaceApi, Consultation, Message } from "@/lib/marketplace-api";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";

const VoiceCall = dynamic(() => import("@/components/consultation/voice-call").then(mod => mod.VoiceCall), {
    ssr: false,
    loading: () => <div className="p-8 text-center text-slate-500 animate-pulse">Initializing Secure Line...</div>
});

export default function ConsultationDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [consultation, setConsultation] = useState<Consultation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);


    // Call State
    const [isCallActive, setIsCallActive] = useState(false);
    const [callCredentials, setCallCredentials] = useState<{
        appId: string;
        channel: string;
        token: string;
        uid: number;
    } | null>(null);

    // Speech to Text
    const { isListening, transcript, startListening, stopListening, hasSupport } = useSpeechToText();

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await marketplaceApi.getConsultation(id);
                setConsultation(data);

                // Load chat if confirmed/in_progress
                if (["confirmed", "in_progress", "completed"].includes(data.status)) {
                    const msgs = await marketplaceApi.getMessages(id);
                    setMessages(msgs.messages);
                }
            } catch (error) {
                toast.error("Failed to load consultation");
                router.push("/consultations");
            } finally {
                setLoading(false);
            }
        }
        load();

        // Set up Supabase Realtime subscription for instant message updates
        const supabase = createClient();
        const channel = supabase
            .channel(`consultation_messages:${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'consultation_messages',
                    filter: `consultation_id=eq.${id}`
                },
                (payload) => {
                    const newMessage = payload.new as Message;
                    // Only add if not already in the list (avoid duplicates)
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMessage.id)) {
                            return prev;
                        }
                        return [...prev, newMessage];
                    });
                }
            )
            .subscribe();
        // Fallback polling every 30s for any missed messages
        const interval = setInterval(async () => {
            if (id) {
                try {
                    // Ideally we check last message time or use realtime subscription
                    // For now, just re-fetch
                    const msgs = await marketplaceApi.getMessages(id);
                    setMessages(msgs.messages);
                } catch (e) { }
            }
        }, 30000);

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [id, router]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Effect to update input with transcript
    useEffect(() => {
        if (transcript) {
            setNewMessage(prev => {
                // Determine if we need a space (simple heuristic)
                const needsSpace = prev.length > 0 && !prev.endsWith(' ');
                return prev + (needsSpace ? ' ' : '') + transcript;
            });
        }
    }, [transcript]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!newMessage.trim() || sending) return;

        try {
            setSending(true);
            const res = await marketplaceApi.sendMessage(id, newMessage);
            setNewMessage("");
            // Optimistic update or wait for poll? Let's append
            setMessages(prev => [...prev, {
                id: res.message_id,
                content: newMessage,
                sender_type: "patient", // Assumption
                created_at: new Date().toISOString()
            }]);
        } catch (error) {
            toast.error("Failed to send message");
        } finally {
            setSending(false);
        }
    };

    const handleJoinCall = async () => {
        try {
            toast.loading("Connecting to secure server...");
            const credentials = await marketplaceApi.joinCall(id);
            toast.dismiss();

            setCallCredentials({
                appId: credentials.agora_app_id,
                channel: credentials.agora_channel,
                token: credentials.agora_token,
                uid: credentials.uid
            });
            setIsCallActive(true);
        } catch (error: any) {
            toast.dismiss();
            toast.error(error.message || "Failed to join call");
        }
    };

    const handleEndCall = () => {
        setIsCallActive(false);
        setCallCredentials(null);
    };

    if (loading) return <div className="p-8 text-slate-500">Loading details...</div>;

    if (!consultation) return null;

    // If Call is active, render call interface overlay
    if (isCallActive && callCredentials) {
        return (
            <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <VoiceCall
                    appId={callCredentials.appId}
                    channel={callCredentials.channel}
                    token={callCredentials.token}
                    uid={callCredentials.uid}
                    onEndCall={handleEndCall}
                />
                <p className="mt-8 text-slate-500 text-sm">
                    Consultation in progress • {consultation.pharmacist_name}
                </p>
            </div>
        );
    }

    const isChatEnabled = ["confirmed", "in_progress"].includes(consultation.status);

    return (
        <div className="h-screen bg-slate-950 flex flex-col">
            {/* Header */}
            <header className="h-16 border-b border-slate-800 bg-slate-900 flex items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push("/consultations")}>
                        <ArrowLeft className="h-5 w-5 text-slate-400" />
                    </Button>
                    <div>
                        <h1 className="text-sm font-bold text-slate-200">{consultation.pharmacist_name}</h1>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {consultation.duration_minutes} mins
                            </span>
                            <StatusBadge status={consultation.status} />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    {["confirmed", "in_progress"].includes(consultation.status) && (
                        <Button onClick={handleJoinCall} className="bg-green-600 hover:bg-green-700 text-white gap-2">
                            <Phone className="h-4 w-4" /> Join Call
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" className="text-slate-400">
                        <MoreVertical className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Main Content - Split View */}
            <div className="flex-1 flex overflow-hidden">
                {/* Messages Area */}
                <div className="flex-1 flex flex-col bg-slate-950 relative">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                <MessageSquare className="h-12 w-12 mb-2 opacity-20" />
                                <p>No messages yet. Start the conversation!</p>
                            </div>
                        ) : (
                            messages.map((msg) => {
                                const isMe = msg.sender_type === "patient"; // Assumption logic
                                return (
                                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                        <div className={`
                            max-w-[80%] rounded-2xl px-4 py-2 text-sm
                            ${isMe
                                                ? "bg-indigo-600 text-white rounded-tr-sm"
                                                : "bg-slate-800 text-slate-200 rounded-tl-sm"}
                          `}>
                                            <p>{msg.content}</p>
                                            <p className={`text-[10px] mt-1 ${isMe ? "text-indigo-200" : "text-slate-500"}`}>
                                                {format(new Date(msg.created_at), "p")}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
                        <form onSubmit={handleSendMessage} className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    placeholder={isListening ? "Listening..." : (isChatEnabled ? "Type a message..." : "Chat is closed")}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    disabled={!isChatEnabled || sending}
                                    className={`bg-slate-950 border-slate-800 focus-visible:ring-indigo-500 text-white placeholder:text-slate-400 pr-10 ${isListening ? "ring-2 ring-red-500/50 border-red-500/50" : ""}`}
                                />
                                {hasSupport && isChatEnabled && (
                                    <button
                                        type="button"
                                        onClick={isListening ? stopListening : startListening}
                                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${isListening ? "bg-red-500/20 text-red-400 animate-pulse" : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                                        title={isListening ? "Stop Dictation" : "Start Dictation"}
                                    >
                                        {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                    </button>
                                )}
                            </div>
                            <Button type="submit" size="icon" disabled={!isChatEnabled || sending || !newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Sidebar Details (Hidden on mobile usually, but simpler to keep visible for desktop first) */}
                <aside className="w-80 border-l border-slate-800 bg-slate-900 p-6 space-y-6 hidden lg:block">
                    <div>
                        <h3 className="text-sm font-medium text-slate-500 uppercase mb-4">Consultation Details</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Date</span>
                                <span className="text-slate-200">{format(new Date(consultation.scheduled_at), "PP")}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Time</span>
                                <span className="text-slate-200">{format(new Date(consultation.scheduled_at), "p")}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Amount</span>
                                <span className="text-slate-200 font-medium">₹{consultation.amount}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-400">Status</span>
                                <StatusBadge status={consultation.status} />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-800">
                        <h3 className="text-sm font-medium text-slate-500 uppercase mb-2">Help & Support</h3>
                        <p className="text-xs text-slate-400 mb-4">
                            Issues joining? Try refreshing or check your internet connection.
                        </p>
                        <div className="space-y-2">
                            {["pending_payment", "confirmed"].includes(consultation.status) && (
                                <Button variant="outline" className="w-full border-red-900/50 text-red-500 hover:bg-red-950/20 hover:text-red-400">
                                    <XCircle className="mr-2 h-4 w-4" /> Cancel Booking
                                </Button>
                            )}
                            {consultation.status === "completed" && (
                                <Button variant="outline" className="w-full border-slate-700 hover:bg-slate-800">
                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Submit Review
                                </Button>
                            )}
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles = {
        confirmed: "bg-green-500/10 text-green-400",
        in_progress: "bg-indigo-500/10 text-indigo-400 animate-pulse",
        completed: "bg-slate-500/10 text-slate-400",
        cancelled: "bg-red-500/10 text-red-400",
        pending_payment: "bg-yellow-500/10 text-yellow-400",
        refunded: "bg-amber-500/10 text-amber-300",
        no_show: "bg-orange-500/10 text-orange-300",
    };

    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase track-wider ${(styles as any)[status] || styles.pending_payment}`}>
            {status.replace("_", " ")}
        </span>
    );
}
