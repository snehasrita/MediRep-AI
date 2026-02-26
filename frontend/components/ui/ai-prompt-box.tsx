"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Send,
  StopCircle,
  Paperclip,
  X,
  Globe,
  Headphones,
  Mic,
  MicOff,
  Image as ImageIcon,
} from "lucide-react";

type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = { isFinal: boolean; 0?: SpeechRecognitionAlternativeLike };
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface PromptInputBoxProps {
  onSend: (message: string, files?: File[], isSearchMode?: boolean) => void;
  onStop?: () => void;
  isLoading: boolean;
  placeholder?: string;
  onSearchModeChange?: (enabled: boolean) => void;
  onVoiceCall?: () => void;
  className?: string;
}

export function PromptInputBox({
  onSend,
  onStop,
  isLoading,
  placeholder = "Type your message...",
  onSearchModeChange,
  onVoiceCall,
  className,
}: PromptInputBoxProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseRef = useRef("");
  const speechFinalRef = useRef("");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [message]);

  const handleSearchModeToggle = useCallback(() => {
    const newMode = !isSearchMode;
    setIsSearchMode(newMode);
    onSearchModeChange?.(newMode);
  }, [isSearchMode, onSearchModeChange]);

  const handleSend = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && files.length === 0) return;

    onSend(trimmedMessage, files.length > 0 ? files : undefined, isSearchMode);
    setMessage("");
    setFiles([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, files, isSearchMode, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isLoading) {
          handleSend();
        }
      }
    },
    [isLoading, handleSend]
  );

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selectedFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SpeechRecognition =
      (speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition) as
        | SpeechRecognitionCtor
        | undefined;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = result?.[0]?.transcript?.trim() || "";
        if (!piece) continue;
        if (result.isFinal) {
          speechFinalRef.current = `${speechFinalRef.current} ${piece}`.trim();
        } else {
          interim = `${interim} ${piece}`.trim();
        }
      }

      const prefix = speechBaseRef.current.trim();
      const finalText = speechFinalRef.current.trim();
      const draft = [prefix, finalText, interim].filter(Boolean).join(" ").trim();
      setMessage(draft);
    };

    recognition.onerror = () => setIsDictating(false);
    recognition.onend = () => setIsDictating(false);
    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggleDictation = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (isDictating) {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      return;
    }

    speechBaseRef.current = message;
    speechFinalRef.current = "";
    try {
      recognition.start();
      setIsDictating(true);
    } catch {
      setIsDictating(false);
    }
  }, [isDictating, message]);

  const hasContent = message.trim().length > 0 || files.length > 0;
  const canSend = hasContent && !isLoading;

  const handlePrimaryAction = useCallback(() => {
    if (isLoading) {
      onStop?.();
      return;
    }
    if (hasContent) {
      handleSend();
      return;
    }
    if (speechSupported) {
      toggleDictation();
      return;
    }
    if (onVoiceCall) {
      onVoiceCall();
    }
  }, [hasContent, handleSend, isLoading, onStop, onVoiceCall, speechSupported, toggleDictation]);

  return (
    <div className={cn("relative", className)}>
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {file.type.startsWith("image/") ? (
                <ImageIcon className="h-4 w-4" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
              <span className="max-w-30 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="transition-colors hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2 rounded-[30px] border border-zinc-700 bg-[#1f2126] p-2.5 shadow-[0_14px_32px_rgba(0,0,0,0.32)] transition-all focus-within:border-zinc-500">
        <div className="flex shrink-0 items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
            disabled={isLoading}
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <div className="h-5 w-px bg-zinc-600" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleSearchModeToggle}
            className={cn(
              "h-8 w-8 transition-colors",
              isSearchMode
                ? "bg-blue-500/20 text-blue-300 hover:bg-blue-500/25"
                : "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
            )}
            disabled={isLoading}
            title={isSearchMode ? "Web search enabled" : "Enable web search"}
          >
            <motion.div
              animate={{ rotate: isSearchMode ? 360 : 0, scale: isSearchMode ? 1.08 : 1 }}
              transition={{ type: "spring", stiffness: 250, damping: 22 }}
            >
              <Globe className="h-4 w-4" />
            </motion.div>
          </Button>
        </div>

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="max-h-45 min-h-[38px] flex-1 resize-none border-0 bg-transparent p-2 text-[28px] tracking-wide text-zinc-100 placeholder:text-zinc-400 focus-visible:border-0 focus-visible:ring-0"
        />

        <div className="flex shrink-0 items-center gap-1">
          {onVoiceCall && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onVoiceCall}
              className="h-8 w-8 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
              disabled={isLoading}
              title="Start voice interaction"
            >
              <Headphones className="h-4 w-4" />
            </Button>
          )}

          <motion.button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isLoading ? false : !hasContent && !speechSupported && !onVoiceCall}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-zinc-900 transition-colors",
              !isLoading && !hasContent && isDictating && "bg-emerald-100 text-emerald-700",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            whileTap={{ scale: 0.94 }}
            title={
              isLoading
                ? "Stop generating"
                : hasContent
                  ? "Send message"
                  : isDictating
                    ? "Stop voice-to-text"
                    : "Start voice-to-text"
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {isLoading ? (
                <motion.span
                  key="stop"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <StopCircle className="h-5 w-5 text-red-600" />
                </motion.span>
              ) : hasContent ? (
                <motion.span
                  key="send"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <Send className="h-5 w-5" />
                </motion.span>
              ) : isDictating ? (
                <motion.span
                  key="mic-off"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative"
                >
                  <motion.span
                    className="absolute inset-0 rounded-full border border-emerald-500"
                    animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <MicOff className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="mic"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Mic className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {isSearchMode && (
        <div className="absolute -top-6 left-0 flex items-center gap-1.5 text-xs text-blue-300">
          <Globe className="h-3 w-3" />
          <span>Web search enabled</span>
        </div>
      )}
    </div>
  );
}
