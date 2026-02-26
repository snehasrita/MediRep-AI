"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, Volume2, Loader2, X, Bot } from "lucide-react";
import { useVoiceCall, type VoiceState } from "@/hooks/useVoiceCall";
import { cn } from "@/lib/utils";

interface VoiceCallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscript?: (text: string) => void;
  onVoiceTurn?: (text: string) => Promise<string | null> | string | null;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function VoiceOrb({ state, audioLevel }: { state: VoiceState; audioLevel: number }) {
  const scale = state === "listening" ? 1 + audioLevel * 0.6 : state === "speaking" ? 1.1 : 1;

  const orbColors: Record<VoiceState, string> = {
    idle: "from-zinc-400 to-zinc-500",
    connecting: "from-amber-400 to-orange-500",
    listening: "from-emerald-400 to-teal-500",
    processing: "from-blue-400 to-indigo-500",
    speaking: "from-violet-400 to-purple-500",
    error: "from-red-400 to-rose-500",
  };

  const glowColors: Record<VoiceState, string> = {
    idle: "rgba(161,161,170,0.2)",
    connecting: "rgba(251,191,36,0.3)",
    listening: "rgba(52,211,153,0.35)",
    processing: "rgba(96,165,250,0.3)",
    speaking: "rgba(167,139,250,0.35)",
    error: "rgba(248,113,113,0.3)",
  };

  return (
    <div className="relative flex items-center justify-center">
      <motion.div
        className="absolute rounded-full"
        animate={{
          width: state === "listening" ? 220 + audioLevel * 60 : state === "speaking" ? 230 : 200,
          height: state === "listening" ? 220 + audioLevel * 60 : state === "speaking" ? 230 : 200,
          opacity: state === "idle" ? 0.1 : 0.2,
        }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        style={{ background: `radial-gradient(circle, ${glowColors[state]}, transparent 70%)` }}
      />
      <motion.div
        className="absolute rounded-full"
        animate={{
          width: state === "listening" ? 180 + audioLevel * 40 : state === "speaking" ? 185 : 160,
          height: state === "listening" ? 180 + audioLevel * 40 : state === "speaking" ? 185 : 160,
          opacity: state === "idle" ? 0.15 : 0.3,
        }}
        transition={{ type: "spring", stiffness: 250, damping: 20 }}
        style={{ background: `radial-gradient(circle, ${glowColors[state]}, transparent 70%)` }}
      />

      <motion.div
        className={cn(
          "relative w-32 h-32 rounded-full bg-gradient-to-br flex items-center justify-center shadow-2xl",
          orbColors[state]
        )}
        animate={{ scale }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        <div className="absolute inset-2 rounded-full bg-white/10 backdrop-blur-sm" />

        <motion.div
          animate={state === "processing" ? { rotate: 360 } : { rotate: 0 }}
          transition={state === "processing" ? { duration: 2, repeat: Infinity, ease: "linear" } : {}}
        >
          {state === "connecting" && <Loader2 className="w-10 h-10 text-white animate-spin" />}
          {state === "listening" && <Mic className="w-10 h-10 text-white" />}
          {state === "processing" && <Loader2 className="w-10 h-10 text-white" />}
          {state === "speaking" && <Volume2 className="w-10 h-10 text-white" />}
          {state === "idle" && <Bot className="w-10 h-10 text-white/70" />}
          {state === "error" && <X className="w-10 h-10 text-white" />}
        </motion.div>

        {state === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-emerald-300/50"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        {state === "speaking" && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-violet-300/40"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border border-violet-200/20"
              animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}

function AudioBars({ audioLevel, state }: { audioLevel: number; state: VoiceState }) {
  const isActive = state === "listening" || state === "speaking";
  const barCount = 40;

  return (
    <div className="flex items-center justify-center gap-[2px] h-12 w-full max-w-xs mx-auto">
      {Array.from({ length: barCount }).map((_, i) => {
        const distance = Math.abs(i - barCount / 2) / (barCount / 2);
        const baseHeight = isActive ? (1 - distance * 0.7) * audioLevel : 0.05;
        const randomOffset = Math.sin(i * 0.8 + audioLevel * 12) * 0.3;
        const height = Math.max(0.05, Math.min(1, baseHeight + (isActive ? randomOffset * audioLevel : 0)));

        return (
          <motion.div
            key={i}
            className={cn(
              "w-[3px] rounded-full",
              state === "listening" ? "bg-emerald-400/70" :
              state === "speaking" ? "bg-violet-400/70" :
              "bg-zinc-500/30"
            )}
            animate={{ height: `${height * 48}px` }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          />
        );
      })}
    </div>
  );
}

function StateLabel({ state }: { state: VoiceState }) {
  const labels: Record<VoiceState, string> = {
    idle: "Ready",
    connecting: "Connecting...",
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "MediRep is speaking...",
    error: "Connection failed",
  };

  const dotColors: Record<VoiceState, string> = {
    idle: "bg-zinc-400",
    connecting: "bg-amber-400 animate-pulse",
    listening: "bg-emerald-400 animate-pulse",
    processing: "bg-blue-400 animate-pulse",
    speaking: "bg-violet-400 animate-pulse",
    error: "bg-red-400",
  };

  return (
    <motion.div
      className="flex items-center gap-2"
      key={state}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={cn("w-2 h-2 rounded-full", dotColors[state])} />
      <span className="text-sm font-medium text-zinc-400">{labels[state]}</span>
    </motion.div>
  );
}

function TranscriptBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
        role === "user"
          ? "ml-auto bg-[color:var(--landing-clay)] text-white rounded-br-md"
          : "mr-auto bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-md"
      )}
    >
      {text}
    </motion.div>
  );
}

export function VoiceCallOverlay({ isOpen, onClose, onTranscript, onVoiceTurn }: VoiceCallOverlayProps) {
  const {
    state,
    isConnected,
    messages,
    currentTranscript,
    duration,
    audioLevel,
    errorMessage,
    connect,
    disconnect,
    clearMessages,
  } = useVoiceCall({ onTranscript, onVoiceTurn });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-connect when opened
  const hasAutoConnected = useRef(false);
  useEffect(() => {
    if (isOpen && !isConnected && state === "idle" && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      connect();
    }
    if (!isOpen) {
      hasAutoConnected.current = false;
    }
  }, [isOpen, isConnected, state, connect]);

  const handleClose = () => {
    disconnect();
    clearMessages();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

          <div className="relative flex-1 flex flex-col items-center justify-between py-8 px-4 max-w-lg mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[color:var(--landing-moss)] flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">MediRep AI Voice</p>
                  <p className="text-zinc-500 text-xs">
                    {isConnected ? formatDuration(duration) : "Not connected"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Orb + State */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 -mt-8">
              <VoiceOrb state={state} audioLevel={audioLevel} />
              <StateLabel state={state} />
              <AudioBars audioLevel={audioLevel} state={state} />
            </div>

            {/* Transcript area */}
            {messages.length > 0 && (
              <div className="w-full max-h-[30vh] overflow-y-auto rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-3 mb-6 space-y-2 scrollbar-hide">
                {messages.map((msg, i) => (
                  <TranscriptBubble key={i} role={msg.role} text={msg.text} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Current transcript preview */}
            <AnimatePresence>
              {currentTranscript && state === "processing" && (
                <motion.p
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-zinc-400 text-sm text-center mb-4 italic"
                >
                  &ldquo;{currentTranscript}&rdquo;
                </motion.p>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex items-center gap-6">
              {!isConnected ? (
                <motion.button
                  onClick={connect}
                  className="h-16 w-16 rounded-full bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Phone className="w-7 h-7 text-white" />
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleClose}
                  className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-lg shadow-red-500/30 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </motion.button>
              )}
            </div>

            <p className="text-zinc-600 text-xs mt-4 text-center">
              {isConnected
                ? "Speak naturally. MediRep will respond with voice."
                : state === "error"
                  ? errorMessage || "Voice is unavailable in this browser right now. Check mic permission and try Chrome/Edge."
                  : "Start a voice conversation with MediRep AI"
              }
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
