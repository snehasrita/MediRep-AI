import { useState, useEffect, useRef, useCallback } from "react";
import { Message, PatientContext, WebSearchResult, ChatResponse, RepModeContext } from "@/types";
import { sendMessage, getSessionMessages, getRepModeStatus, clearRepModeStatus } from "@/lib/api";
import { invalidateSessionsCache } from "@/hooks/useSessions";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false); // AI is generating response
  const [isLoadingHistory, setIsLoadingHistory] = useState(false); // Loading past messages
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [webSources, setWebSources] = useState<WebSearchResult[]>([]);
  const [activeRepMode, setActiveRepMode] = useState<RepModeContext | undefined>(undefined);
  // Track the count of messages loaded from session (not new)
  const loadedMessageCountRef = useRef<number>(0);
  // AbortController for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  const refreshRepMode = useCallback(async (
    options?: { preserveInactive?: boolean }
  ): Promise<RepModeContext | undefined> => {
    try {
      const repMode = await getRepModeStatus();
      if (repMode?.active) {
        setActiveRepMode(repMode);
      } else {
        if (!options?.preserveInactive) {
          setActiveRepMode(undefined);
        }
      }
      return repMode;
    } catch (e) {
      console.error("Failed to fetch rep mode status:", e);
      return undefined;
    }
  }, []);

  const extractRepCompanyFromHistory = useCallback((history: Message[]): string | null => {
    let activeCompany: string | null = null;

    for (const msg of history) {
      if (msg.role !== "user") continue;
      const raw = (msg.content || "").trim();
      if (!raw) continue;
      const lower = raw.toLowerCase();

      if (
        lower.includes("exit rep mode") ||
        lower.includes("clear rep mode") ||
        lower.includes("general mode")
      ) {
        activeCompany = null;
        continue;
      }

      let match = raw.match(/^set\s+rep\s+mode(?:\s+(?:for|to))?\s+(.+)$/i);
      if (!match) {
        match = raw.match(/^represent\s+(.+)$/i);
      }

      if (match?.[1]) {
        const candidate = match[1].trim().replace(/[.?!,:;]+$/g, "");
        if (candidate) {
          activeCompany = candidate;
        }
      }
    }

    return activeCompany;
  }, []);

  const loadHistory = useCallback(async (id: string): Promise<boolean> => {
    try {
      setIsLoadingHistory(true);
      const history = await getSessionMessages(id);
      setMessages(history);
      // Mark all loaded messages as "old" so they don't animate
      loadedMessageCountRef.current = history.length;

      const companyFromHistory = extractRepCompanyFromHistory(history);
      if (companyFromHistory) {
        // Restore UI mode from session history without mutating server-side rep state.
        setActiveRepMode({
          active: true,
          company_key: companyFromHistory,
          company_name: companyFromHistory,
        });
        await refreshRepMode({ preserveInactive: true });
      } else {
        // Do not clear server-side rep mode from partial history.
        // History pagination may not include the original activation command.
        await refreshRepMode();
      }
      return true;
    } catch (e) {
      console.error("Failed to load history:", e);
      // If session invalid, clear it
      sessionStorage.removeItem("current_chat_session_id");
      setSessionId(null);
      return false;
    } finally {
      setIsLoadingHistory(false);
    }
  }, [extractRepCompanyFromHistory, refreshRepMode]);

  // Load session from storage or props on mount
  useEffect(() => {
    const storedSessionId = sessionStorage.getItem("current_chat_session_id");
    if (storedSessionId) {
      setSessionId(storedSessionId);
      void loadHistory(storedSessionId);
    } else {
      void refreshRepMode();
    }
  }, [loadHistory, refreshRepMode]);

  const send = async (
    content: string,
    patientContext?: PatientContext,
    webSearchMode: boolean = false,
    files?: File[],
    voiceMode: boolean = false,
    chatMode: string = "normal"
  ): Promise<ChatResponse | null> => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

    setIsGenerating(true);
    setWebSources([]); // Clear previous web sources

    // Convert files to base64 if present
    const images: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            images.push(base64);
          } catch (e) {
            console.error("Failed to convert image to base64", e);
          }
        }
      }
    }

    // Add user message locally
    const userMessage: Message = {
      role: "user",
      content: content,
      timestamp: new Date().toISOString(),
      images: images.length > 0 ? images : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      // Send to backend with web search mode and images
      const response = await sendMessage(
        content,
        patientContext,
        undefined,
        sessionId || undefined,
        webSearchMode,
        images,
        abortControllerRef.current.signal,
        voiceMode,
        chatMode || "normal" // Pass chatMode explicitly
      );

      // Handle new session
      if (!sessionId && response.session_id) {
        setSessionId(response.session_id);
        sessionStorage.setItem("current_chat_session_id", response.session_id);
      }

      // Add assistant response
      const assistantMessage: Message = {
        role: "assistant",
        content: response.response,
        citations: response.citations,
        timestamp: new Date().toISOString(),
        track2: response.track2,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (response.suggestions) {
        setSuggestions(response.suggestions);
      }

      if (response.track2?.rep_mode) {
        const repMode = response.track2.rep_mode;
        if (repMode.active) {
          setActiveRepMode(repMode);
        } else {
          setActiveRepMode(undefined);
        }
      }

      // Store web sources if returned
      if (response.web_sources && response.web_sources.length > 0) {
        setWebSources(response.web_sources);
      }

      // Invalidate session cache so sidebar updates with new message count/timestamp
      invalidateSessionsCache();
      return response;
    } catch (error: unknown) {
      // Don't show error if request was aborted by user
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("Request cancelled by user");
        // Add a cancelled message indicator
        const cancelledMessage: Message = {
          role: "assistant",
          content: "_Response cancelled_",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, cancelledMessage]);
      } else {
        console.error("Chat error:", error);
        const errorMessage: Message = {
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
      return null;
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Stop/cancel the current generation
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const loadSession = async (id: string) => {
    setSessionId(id);
    sessionStorage.setItem("current_chat_session_id", id);
    return loadHistory(id);
  };

  const resetSession = async () => {
    setMessages([]);
    setSuggestions([]);
    setWebSources([]);
    setSessionId(null);
    loadedMessageCountRef.current = 0;
    sessionStorage.removeItem("current_chat_session_id");
    setActiveRepMode(undefined);
    try {
      await clearRepModeStatus();
    } catch (e) {
      console.error("Failed to clear rep mode on new chat:", e);
    }
  };

  // Helper to check if a message at given index is new (should animate)
  const isNewMessage = (index: number) => index >= loadedMessageCountRef.current;

  // Backwards compatibility: isLoading is true when generating (not when loading history)
  const isLoading = isGenerating;

  return {
    messages,
    isLoading,
    isGenerating,
    isLoadingHistory,
    suggestions,
    webSources,
    send,
    stop,
    resetSession,
    loadSession,
    sessionId,
    isNewMessage,
    activeRepMode,
    refreshRepMode,
  };
}
