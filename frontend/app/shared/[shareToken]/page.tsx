"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Loader2, Lock, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChatMessages, ChatMessage } from "@/components/Chat";
import { continueSharedSession, getSharedSession, isAuthenticated } from "@/lib/api";
import type { Message, SharedSessionDetail } from "@/types";

export default function SharedSessionPage() {
  const params = useParams<{ shareToken: string }>();
  const router = useRouter();
  const shareToken = useMemo(
    () => (Array.isArray(params?.shareToken) ? params.shareToken[0] : params?.shareToken || ""),
    [params],
  );

  const [data, setData] = useState<SharedSessionDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isContinuing, setIsContinuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!shareToken) {
        setError("Invalid shared link.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await getSharedSession(shareToken);
        if (!alive) return;
        setData(response);
        setMessages(
          (response.messages || []).map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || msg.created_at || new Date().toISOString(),
          })),
        );
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load shared conversation.");
      } finally {
        if (alive) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [shareToken]);

  const handleContinue = useCallback(async () => {
    if (!shareToken) return;

    setIsContinuing(true);
    try {
      const authed = await isAuthenticated();
      if (!authed) {
        const redirect = encodeURIComponent(`/shared/${shareToken}`);
        router.push(`/auth/login?redirect=${redirect}`);
        return;
      }

      const forked = await continueSharedSession(shareToken);
      router.push(`/dashboard/Chat?session=${forked.session_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to continue this conversation.");
    } finally {
      setIsContinuing(false);
    }
  }, [router, shareToken]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Shared link copied");
    } catch {
      toast.error("Failed to copy link");
    }
  }, []);

  return (
    <div className="h-dvh w-full flex flex-col bg-(--landing-paper)">
      <header className="h-14 shrink-0 border-b border-(--landing-border) bg-(--landing-card-strong) px-4 flex items-center gap-2">
        <Link href="/" className="inline-flex">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate text-(--landing-ink)">
            {data?.title || "Shared Conversation"}
          </p>
          <p className="text-[11px] text-(--landing-muted)">Read-only shared view</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCopyLink}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-(--landing-clay) hover:bg-(--landing-clay)/90 text-white"
            onClick={handleContinue}
            disabled={isContinuing || !shareToken}
          >
            {isContinuing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Continuing...
              </>
            ) : (
              <>
                <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                Continue This Chat
              </>
            )}
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-(--landing-border) bg-white/70">
          <div className="inline-flex items-center gap-1.5 text-xs text-(--landing-muted)">
            <Lock className="h-3.5 w-3.5" />
            View-only mode. You cannot send messages in this shared transcript.
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-(--landing-muted)">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading conversation...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center max-w-md">
              <p className="text-sm font-medium text-(--landing-ink) mb-1">Unable to load shared conversation</p>
              <p className="text-xs text-(--landing-muted)">{error}</p>
            </div>
          </div>
        ) : (
          <ChatMessages className="flex-1 min-h-0">
            {messages.map((message, index) => (
              <ChatMessage key={`${message.role}-${index}`} message={message} index={index} isNewMessage={false} />
            ))}
          </ChatMessages>
        )}
      </main>
    </div>
  );
}
