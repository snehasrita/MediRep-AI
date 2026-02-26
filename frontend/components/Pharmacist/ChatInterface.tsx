"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Clock, AlertTriangle, CheckCircle2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { io } from "socket.io-client";

interface Message {
    id: string;
    sender_type: "patient" | "pharmacist";
    content: string;
    created_at: string;
}

interface ChatInterfaceProps {
    consultationId: string;
    pharmacistName: string;
    endTime: string; // ISO string
    onExpired?: () => void;
}

export default function ChatInterface({ consultationId, pharmacistName, endTime, onExpired }: ChatInterfaceProps) {
    const { session } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [timeLeft, setTimeLeft] = useState("");
    const [isExpired, setIsExpired] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [sending, setSending] = useState(false);

    // Timer Logic
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const end = new Date(endTime);
            const diff = end.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeLeft("00:00");
                setIsExpired(true);
                clearInterval(interval);
                onExpired?.();
            } else {
                const mins = Math.floor((diff / 1000 / 60) % 60);
                const secs = Math.floor((diff / 1000) % 60);
                setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [endTime, onExpired]);

    // Fetch Messages & Socket.IO
    useEffect(() => {
        const fetchMessages = async () => {
            if (!session) return;
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${consultationId}/messages`, {
                    headers: {
                        "Authorization": `Bearer ${session.access_token}`
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages);
                }
            } catch (error) {
                console.error("Failed to load messages", error);
            }
        };

        fetchMessages();

        // Socket.IO Subscription
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://medirep-ai-production.up.railway.app";
        const socket = io(backendUrl, {
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

        const poll = setInterval(fetchMessages, 10000);

        return () => {
            socket.disconnect();
            clearInterval(poll);
        };
    }, [consultationId, session]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isExpired || sending || !session) return;
        setSending(true);

        const tempId = Date.now().toString();
        const optimisticMsg: Message = {
            id: tempId,
            sender_type: "patient",
            content: input,
            created_at: new Date().toISOString()
        };

        setMessages(prev => [...prev, optimisticMsg]);
        setInput("");

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/consultations/${consultationId}/message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ content: optimisticMsg.content }),
            });

            if (!res.ok) throw new Error("Failed to send");
            const realMsg = await res.json();
            setMessages(prev => {
                // If socket already delivered the message, just remove the optimistic one
                if (prev.some(m => m.id === realMsg.id)) {
                    return prev.filter(m => m.id !== tempId);
                }
                // Otherwise swap optimistic for real
                return prev.map(m => m.id === tempId ? realMsg : m);
            });
        } catch (error) {
            console.error(error);
            // Optionally remove optimistic message on error or show retry
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600">
                        <User className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-900">{pharmacistName}</h3>
                        <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            Live Consultation
                        </p>
                    </div>
                </div>

                <div className={`px-4 py-2 rounded-lg font-mono font-bold text-lg border flex items-center gap-2 ${isExpired
                    ? "bg-red-50 text-red-600 border-red-100"
                    : "bg-amber-50 text-amber-600 border-amber-100"
                    }`}>
                    <Clock className="h-5 w-5" />
                    {timeLeft}
                </div>
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                    {messages.map((msg, i) => {
                        const isMe = msg.sender_type === "patient";
                        return (
                            <div key={msg.id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${isMe
                                    ? "bg-cyan-600 text-white rounded-br-none"
                                    : "bg-white text-slate-800 border border-slate-100 rounded-bl-none"
                                    }`}>
                                    <p>{msg.content}</p>
                                    <p className={`text-[10px] mt-1 text-right ${isMe ? "text-cyan-100" : "text-slate-400"}`}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="bg-white p-4 border-t border-slate-200">
                {isExpired ? (
                    <div className="bg-slate-100 rounded-xl p-4 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Session ended. Please book a new consultation to continue.
                    </div>
                ) : (
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex gap-2"
                    >
                        <Input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Type your message..."
                            className="flex-1 bg-slate-50 border-slate-200 focus-visible:ring-cyan-500"
                        />
                        <Button
                            type="submit"
                            disabled={!input.trim() || sending}
                            className="bg-cyan-600 hover:bg-cyan-700 text-white w-12 h-10 px-0"
                        >
                            <Send className="h-5 w-5" />
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
