"use client";

import { useRef, useEffect } from "react";
import { useChat } from "@/hooks/useChat";
import { usePatientContext } from "@/lib/context/PatientContext";
import {
  ChatMessages,
  ChatMessage,
  ChatSuggestions,
  ChatLoading,
} from "@/components/Chat";
import { PromptInputBox } from "@/components/ai-prompt-box";
import { Bot, Loader2 } from "lucide-react";

export default function ChatWidget() {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isGenerating, isLoadingHistory, suggestions, send, stop, isNewMessage } = useChat();
  const { patientContext } = usePatientContext();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGenerating]);

  const handleSend = async (message: string, files?: File[]) => {
    if (!message.trim() && (!files || files.length === 0)) return;
    await send(message, patientContext || undefined);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingHistory && (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        )}

        {!isLoadingHistory && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-(--landing-moss) shadow-sm">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <p className="text-zinc-500 text-sm text-center">
              Ask about medications...
            </p>
          </div>
        )}

        {!isLoadingHistory && messages.length > 0 && (
          <ChatMessages className="py-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                message={message}
                index={index}
                isNewMessage={isNewMessage(index)}
              />
            ))}

            {isGenerating && <ChatLoading />}
            <div ref={messagesEndRef} />
          </ChatMessages>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
        {suggestions.length > 0 && (
          <ChatSuggestions
            suggestions={suggestions}
            onSelect={(suggestion) => handleSend(suggestion)}
          />
        )}

        <PromptInputBox
          onSend={handleSend}
          onStop={stop}
          isLoading={isGenerating}
          placeholder="Message MediRep AI..."
        />
      </div>
    </div>
  );
}
