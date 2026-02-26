"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useChat } from "@/hooks/useChat";
import { useProfile } from "@/hooks/useProfile";
import { usePatientContext } from "@/lib/context/PatientContext";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  ChatMessages,
  ChatMessage,
  ChatSuggestions,
  ChatLoading,
} from "@/components/Chat";
import { ChatSidebar } from "@/components/Chat/ChatSidebar";
import { RepModeBadge } from "@/components/Chat/RepModeBadge";
import { PromptInputBox } from "@/components/ai-prompt-box";
import { VoiceCallOverlay } from "@/components/Voice/VoiceCallOverlay";
import { Bot, PanelLeftOpen, PanelLeftClose, Globe, ExternalLink, Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearRepModeStatus, getAvailableCompanies, setRepModeStatus } from "@/lib/api";

const MODE_SUGGESTIONS = {
  normal: [
    { label: "Drug interactions", prompt: "Check interactions between Aspirin and Warfarin" },
    { label: "Side effects", prompt: "What are the common side effects of Metformin?" },
    { label: "Dosage info", prompt: "What is the standard dosage for Amoxicillin?" },
    { label: "Identify pill", prompt: "Help me identify a pill based on its physical appearance" },
  ],
  insurance: [
    { label: "Check PMJAY Rates", prompt: "What is the PMJAY package rate for Angioplasty?" },
    { label: "Coverage Check", prompt: "Is Hip Replacement covered under PMJAY?" },
    { label: "Reimbursement", prompt: "How do I claim reimbursement for Cataract surgery?" },
    { label: "Package Code", prompt: "Find the package code for Knee Replacement" },
  ],
  moa: [
    { label: "Explain Mechanism", prompt: "Explain the mechanism of action of Ozempic" },
    { label: "Pathway", prompt: "Describe the molecular pathway of Metformin" },
    { label: "Pharmacology", prompt: "What is the pharmacokinetics of Atorvastatin?" },
    { label: "Compare MOA", prompt: "Compare the MOA of ACE inhibitors vs ARBs" },
  ],
  rep: [
    { label: "Product Portfolio", prompt: "List your top respiratory products" },
    { label: "Brand Benefits", prompt: "Why should I prescribe your brand over the generic?" },
    { label: "Comp. Differentiators", prompt: "How is your product better than the competitor?" },
    { label: "Support Programs", prompt: "What patient support programs do you offer?" },
  ]
};

const getSuggestions = (mode: string, company?: string) => {
  if (mode === "rep" && company) {
    return [
      { label: `${company} Portfolio`, prompt: `List top products for ${company}` },
      { label: `Prescribe ${company}`, prompt: `Why should I prescribe ${company} products?` },
      { label: `${company} Support`, prompt: `What support programs does ${company} offer?` },
      { label: "Clinical Evidence", prompt: "Show clinical evidence for key products" },
    ];
  }
  return MODE_SUGGESTIONS[mode as keyof typeof MODE_SUGGESTIONS] || MODE_SUGGESTIONS.normal;
};

const SESSION_UI_STATE_PREFIX = "chat_ui_state:";

type SessionUIState = {
  chatMode: string;
  selectedCompany: string;
};

function readSessionUIState(sessionId: string): SessionUIState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_UI_STATE_PREFIX}${sessionId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUIState;
    return {
      chatMode: parsed.chatMode || "normal",
      selectedCompany: parsed.selectedCompany || "",
    };
  } catch {
    return null;
  }
}

function writeSessionUIState(sessionId: string, value: SessionUIState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_UI_STATE_PREFIX}${sessionId}`, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode or quota).
  }
}

export default function ChatPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [webSearchMode, setWebSearchMode] = useState(false);
  const [isVoiceCallOpen, setIsVoiceCallOpen] = useState(false);
  const [chatMode, setChatMode] = useState<string>("normal");
  const [companies, setCompanies] = useState<{ key: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const failedSessionParamRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const {
    messages,
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
  } = useChat();

  const { profile } = useProfile();
  const { patientContext } = usePatientContext();
  const searchParams = useSearchParams();

  const userName = profile?.full_name || profile?.email?.split('@')[0] || "there";
  const effectiveChatMode = useMemo(() => {
    if (chatMode === "rep") return "rep";
    if (activeRepMode?.active) return "rep";
    return chatMode;
  }, [chatMode, activeRepMode]);

  const effectiveSelectedCompany = useMemo(() => {
    if (selectedCompany) return selectedCompany;
    if (activeRepMode?.active) {
      return activeRepMode.company_key || activeRepMode.company_name || "";
    }
    return "";
  }, [selectedCompany, activeRepMode]);

  const selectedCompanyName = useMemo(() => {
    return (
      companies.find((c) => c.key === effectiveSelectedCompany)?.name ||
      effectiveSelectedCompany
    );
  }, [companies, effectiveSelectedCompany]);

  const displayRepMode = useMemo(() => {
    if (activeRepMode?.active) return activeRepMode;
    if (effectiveChatMode === "rep" && effectiveSelectedCompany) {
      return {
        active: true,
        company_key: effectiveSelectedCompany,
        company_name: selectedCompanyName,
      };
    }
    return undefined;
  }, [activeRepMode, effectiveChatMode, effectiveSelectedCompany, selectedCompanyName]);

  useEffect(() => {
    const checkSize = () => setIsSidebarOpen(window.innerWidth >= 768);
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  useEffect(() => {
    if (effectiveChatMode === "rep" && companies.length === 0) {
      getAvailableCompanies().then((data) => {
        if (data?.companies) {
          setCompanies(data.companies);
        }
      }).catch(console.error);
    }
  }, [effectiveChatMode, companies.length]);

  const handleNewChat = useCallback(async () => {
    await resetSession();
    setChatMode("normal");
    setSelectedCompany("");
    setWebSearchMode(false);
  }, [resetSession]);

  const handleSelectSession = useCallback(async (id: string) => {
    setChatMode("normal");
    setSelectedCompany("");
    setWebSearchMode(false);
    const loaded = await loadSession(id);
    if (!loaded) {
      failedSessionParamRef.current = id;
      if (searchParams.get("session") === id) {
        router.replace(pathname);
      }
      return;
    }
    failedSessionParamRef.current = null;

    const cachedState = readSessionUIState(id);
    if (cachedState) {
      setChatMode(cachedState.chatMode);
      setSelectedCompany(cachedState.selectedCompany);
    }

    try {
      const repStatus = await refreshRepMode({
        preserveInactive: Boolean(cachedState?.chatMode === "rep"),
      });
      if (repStatus?.active) {
        setChatMode("rep");
        setSelectedCompany(repStatus.company_key || repStatus.company_name || "");
      }
    } catch (e) {
      console.error("Failed to refresh rep mode after loading session:", e);
    }
  }, [loadSession, pathname, refreshRepMode, router, searchParams]);

  useEffect(() => {
    const sessionParam = searchParams.get("session");
    if (
      sessionParam &&
      sessionParam !== sessionId &&
      sessionParam !== failedSessionParamRef.current
    ) {
      const timer = window.setTimeout(() => {
        void handleSelectSession(sessionParam);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [searchParams, sessionId, handleSelectSession]);

  useEffect(() => {
    if (!sessionId) return;
    writeSessionUIState(sessionId, {
      chatMode: effectiveChatMode,
      selectedCompany: effectiveSelectedCompany,
    });
  }, [effectiveChatMode, effectiveSelectedCompany, sessionId]);

  const handleSend = async (message: string, files?: File[], isSearchMode?: boolean) => {
    if (!message.trim() && (!files || files.length === 0)) return;

    // Pass chatMode and company override if applicable
    let modeContext = effectiveChatMode;
    if (effectiveChatMode === "rep" && effectiveSelectedCompany) {
      try {
        if (
          !activeRepMode?.active ||
          (activeRepMode.company_key !== effectiveSelectedCompany &&
            activeRepMode.company_name !== effectiveSelectedCompany)
        ) {
          await setRepModeStatus(effectiveSelectedCompany);
          await refreshRepMode();
        }
      } catch (e) {
        console.error("Failed to sync rep mode before send:", e);
      }
      modeContext = `rep:${effectiveSelectedCompany}`;
    }

    await send(message, patientContext || undefined, isSearchMode || false, files, false, modeContext);
  };

  const handleVoiceTurn = useCallback(async (transcript: string): Promise<string | null> => {
    let modeContext = effectiveChatMode;
    if (effectiveChatMode === "rep" && effectiveSelectedCompany) {
      try {
        if (
          !activeRepMode?.active ||
          (activeRepMode.company_key !== effectiveSelectedCompany &&
            activeRepMode.company_name !== effectiveSelectedCompany)
        ) {
          await setRepModeStatus(effectiveSelectedCompany);
          await refreshRepMode();
        }
      } catch (e) {
        console.error("Failed to sync rep mode before voice turn:", e);
      }
      modeContext = `rep:${effectiveSelectedCompany}`;
    }
    const response = await send(transcript, patientContext || undefined, webSearchMode, undefined, true, modeContext);
    const assistant = (response?.response || "").trim();
    return assistant || null;
  }, [patientContext, send, webSearchMode, effectiveChatMode, effectiveSelectedCompany, activeRepMode, refreshRepMode]);

  const handleCompanyChange = useCallback((companyKey: string) => {
    setSelectedCompany(companyKey);
    setChatMode("rep");
    void setRepModeStatus(companyKey)
      .then(() => refreshRepMode())
      .catch((e) => {
        console.error("Failed to sync rep mode on company change:", e);
      });
  }, [refreshRepMode]);

  const handleModeChange = useCallback((nextMode: string) => {
    setChatMode(nextMode);
    if (nextMode !== "rep") {
      setSelectedCompany("");
      void clearRepModeStatus()
        .then(() => refreshRepMode())
        .catch((e) => {
          console.error("Failed to clear rep mode on mode switch:", e);
        });
    }
  }, [refreshRepMode]);

  const showEmptyState = messages.length === 0 && !isGenerating && !isLoadingHistory;

  return (
    <div className="h-dvh w-full flex bg-(--landing-paper) overflow-hidden">
      {/* Sidebar */}
      <ChatSidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0 min-h-0">
        {/* Header */}
        <header className="shrink-0 h-14 border-b border-(--landing-border) bg-(--landing-card-strong) flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard")}
            className="h-8 w-8 text-(--landing-muted) hover:text-(--landing-ink) mr-1"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="h-8 w-8 text-(--landing-muted) hover:text-(--landing-ink)"
          >
            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-(--landing-moss) flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-(--landing-ink)">MediRep AI</span>
          </div>

          <div className="ml-auto flex items-center gap-2">

            {/* Company Selector (Only in Rep Mode) */}
            {effectiveChatMode === "rep" && (
              <Select value={effectiveSelectedCompany} onValueChange={handleCompanyChange}>
                <SelectTrigger className="w-40 h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 animate-in fade-in slide-in-from-right-4 duration-300">
                  <SelectValue placeholder="Select Company" />
                </SelectTrigger>
                <SelectContent align="end">
                  {companies.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Mode Selector */}
            <Select value={effectiveChatMode} onValueChange={handleModeChange}>
              <SelectTrigger className="w-35 h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="normal">Default Chat</SelectItem>
                <SelectItem value="insurance">Insurance</SelectItem>
                <SelectItem value="moa">Mechanism (MOA)</SelectItem>
                <SelectItem value="rep">Rep Mode</SelectItem>
              </SelectContent>
            </Select>

            {effectiveChatMode === "rep" && displayRepMode && (
              <RepModeBadge
                repMode={displayRepMode}
                onExit={() => handleSend("exit rep mode")}
              />
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-zinc-950 min-h-0">
          {/* Loading History */}
          {isLoadingHistory && (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-2 text-(--landing-muted)">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading conversation...</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {showEmptyState && (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
              <div className="max-w-xl w-full space-y-8">
                {/* Welcome */}
                <div className="text-center space-y-3">
                  <div className="h-14 w-14 rounded-2xl bg-(--landing-moss) flex items-center justify-center mx-auto shadow-lg">
                    <Sparkles className="h-7 w-7 text-white" />
                  </div>
                  <h1 className="text-2xl font-bold text-(--landing-ink)">
                    Hi {userName}!
                  </h1>
                  <p className="text-(--landing-muted) text-sm max-w-sm mx-auto">
                    Ask me about medications, drug interactions, dosages, or help identifying pills.
                  </p>
                </div>

                {/* Input */}
                <PromptInputBox
                  onSend={handleSend}
                  onStop={stop}
                  isLoading={isGenerating}
                  placeholder="Ask about medications..."
                  onSearchModeChange={setWebSearchMode}
                  onVoiceCall={() => setIsVoiceCallOpen(true)}
                />

                {/* Suggestions */}
                <div className="flex flex-wrap justify-center gap-2">
                  {getSuggestions(effectiveChatMode, selectedCompanyName).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s.prompt)}
                      className="px-3 py-2 text-sm rounded-xl border border-(--landing-border) text-(--landing-muted) hover:text-(--landing-ink) hover:border-(--landing-border-strong) hover:bg-(--landing-card) transition-all"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {!showEmptyState && !isLoadingHistory && (
            <>
              <ChatMessages className="flex-1 min-h-0">
                {messages.map((message, index) => (
                  <ChatMessage
                    key={index}
                    message={message}
                    index={index}
                    isNewMessage={isNewMessage(index)}
                  />
                ))}

                {isGenerating && <ChatLoading />}

                {/* Web Sources */}
                {webSources.length > 0 && (
                  <div className="px-4 py-3">
                    <div className="flex gap-3 max-w-[95%] md:max-w-[85%]">
                      <div className="w-8" /> {/* Spacer for alignment */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Globe className="w-3.5 h-3.5 text-(--landing-muted)" />
                          <span className="text-xs font-medium text-(--landing-muted) uppercase tracking-wide">Sources</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {webSources.map((source, i) => (
                            <a
                              key={i}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 transition-colors border border-zinc-200 dark:border-zinc-700"
                            >
                              <span className="truncate max-w-35">{source.source}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </ChatMessages>

              {/* Input Area */}
              <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
                <div className="max-w-3xl mx-auto space-y-3">
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
                    onSearchModeChange={setWebSearchMode}
                    onVoiceCall={() => setIsVoiceCallOpen(true)}
                  />

                  <p className="text-[11px] text-center text-zinc-400">
                    MediRep AI can make mistakes. Always verify medical information.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Voice Call Overlay */}
      <VoiceCallOverlay
        isOpen={isVoiceCallOpen}
        onClose={() => setIsVoiceCallOpen(false)}
        onVoiceTurn={handleVoiceTurn}
      />
    </div>
  );
}
