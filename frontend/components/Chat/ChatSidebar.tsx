"use client";

import { useState } from "react";
import { useSessions } from "@/hooks/useSessions";
import { Plus, MessageSquare, ChevronLeft, MoreHorizontal, Trash2, Share, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createSessionShareLink } from "@/lib/api";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface ChatSidebarProps {
    currentSessionId: string | null;
    onSelectSession: (id: string) => void;
    onNewChat: () => void;
    isOpen: boolean;
    onToggle: () => void;
}

export function ChatSidebar({
    currentSessionId,
    onSelectSession,
    onNewChat,
    isOpen,
    onToggle
}: ChatSidebarProps) {
    const { sessions, isLoading, deleteSession, renameSession } = useSessions(50);

    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);

    const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        try {
            await deleteSession(sessionId);
            toast.success("Chat deleted");
            if (currentSessionId === sessionId) {
                onNewChat();
            }
        } catch {
            toast.error("Failed to delete chat");
        }
    };

    const handleShare = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        try {
            const share = await createSessionShareLink(sessionId);
            const path = share.share_path || `/shared/${share.share_token}`;
            const url = path.startsWith("http")
                ? path
                : `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;

            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = url;
                textArea.style.position = "fixed";
                textArea.style.left = "-9999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            toast.success("Link copied to clipboard");
        } catch {
            toast.error("Failed to copy link");
        }
    };

    const openRenameDialog = (e: React.MouseEvent, session: { id: string, title?: string }) => {
        e.stopPropagation();
        setEditingSessionId(session.id);
        setNewTitle(session.title || "");
        setIsRenameDialogOpen(true);
    };

    const handleRenameSubmit = async () => {
        if (!editingSessionId || !newTitle.trim()) return;

        try {
            await renameSession(editingSessionId, newTitle);
            toast.success("Chat renamed");
            setIsRenameDialogOpen(false);
        } catch {
            toast.error("Failed to rename chat");
        }
    };

    // Group sessions by date
    const groupSessionsByDate = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const groups: { label: string; sessions: typeof sessions }[] = [
            { label: "Today", sessions: [] },
            { label: "Yesterday", sessions: [] },
            { label: "Previous 7 Days", sessions: [] },
            { label: "Older", sessions: [] },
        ];

        sessions.forEach(session => {
            const date = new Date(session.last_message_at);
            date.setHours(0, 0, 0, 0);

            if (date.getTime() === today.getTime()) {
                groups[0].sessions.push(session);
            } else if (date.getTime() === yesterday.getTime()) {
                groups[1].sessions.push(session);
            } else if (date >= weekAgo) {
                groups[2].sessions.push(session);
            } else {
                groups[3].sessions.push(session);
            }
        });

        return groups.filter(g => g.sessions.length > 0);
    };

    const groupedSessions = groupSessionsByDate();

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-20 md:hidden backdrop-blur-sm"
                    onClick={onToggle}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-30 w-72 bg-[color:var(--landing-card-strong)] border-r border-[color:var(--landing-border)] transform transition-transform duration-300 ease-out flex flex-col h-full",
                    isOpen ? "translate-x-0" : "-translate-x-full",
                    "md:translate-x-0 md:relative",
                    !isOpen && "md:w-0 md:border-none md:overflow-hidden"
                )}
            >
                {/* Header */}
                <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--landing-border)]">
                    <span className="font-semibold text-[color:var(--landing-ink)]">Chats</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onToggle}
                        className="h-8 w-8 md:hidden text-[color:var(--landing-muted)]"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                </div>

                {/* New Chat */}
                <div className="p-3">
                    <Button
                        onClick={() => {
                            onNewChat();
                            if (window.innerWidth < 768) onToggle();
                        }}
                        className="w-full h-10 bg-[color:var(--landing-clay)] hover:bg-[color:var(--landing-clay)]/90 text-white border-0 shadow-sm"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        New Chat
                    </Button>
                </div>

                {/* Sessions */}
                <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-hide">
                    {isLoading && sessions.length === 0 ? (
                        <div className="space-y-2 mt-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-12 w-full bg-[color:var(--landing-border)] animate-pulse rounded-lg" />
                            ))}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageSquare className="w-10 h-10 mx-auto text-[color:var(--landing-muted-2)] mb-3" />
                            <p className="text-sm text-[color:var(--landing-muted)]">No conversations yet</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {groupedSessions.map((group) => (
                                <div key={group.label}>
                                    <p className="text-[11px] font-medium text-[color:var(--landing-muted-2)] uppercase tracking-wider px-2 mb-1.5">
                                        {group.label}
                                    </p>
                                    <div className="space-y-0.5">
                                        {group.sessions.map((session) => (
                                            <div
                                                key={session.id}
                                                className={cn(
                                                    "group relative flex items-center rounded-lg transition-all duration-150",
                                                    currentSessionId === session.id
                                                        ? "bg-[rgb(var(--landing-clay-rgb)/0.12)]"
                                                        : "hover:bg-[rgb(var(--landing-dot-rgb)/0.04)]"
                                                )}
                                            >
                                                <button
                                                    onClick={() => {
                                                        onSelectSession(session.id);
                                                        if (window.innerWidth < 768) onToggle();
                                                    }}
                                                    className="flex-1 text-left px-3 py-2.5 min-w-0"
                                                >
                                                    <span className={cn(
                                                        "block truncate text-sm",
                                                        currentSessionId === session.id
                                                            ? "text-[color:var(--landing-clay)] font-medium"
                                                            : "text-[color:var(--landing-ink)]"
                                                    )}>
                                                        {session.title || "New Chat"}
                                                    </span>
                                                </button>

                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={cn(
                                                                "h-7 w-7 mr-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                                                                "text-[color:var(--landing-muted)] hover:text-[color:var(--landing-ink)]",
                                                                currentSessionId === session.id && "opacity-100"
                                                            )}
                                                        >
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-44">
                                                        <DropdownMenuItem onClick={(e) => openRenameDialog(e, session)}>
                                                            <Pencil className="mr-2 h-4 w-4" />
                                                            Rename
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={(e) => handleShare(e, session.id)}>
                                                            <Share className="mr-2 h-4 w-4" />
                                                            Share
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            className="text-red-600 focus:text-red-600"
                                                            onClick={(e) => handleDelete(e, session.id)}
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" />
                                                            Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </aside>

            {/* Rename Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename conversation</DialogTitle>
                        <DialogDescription>
                            Give this conversation a memorable name.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Enter a title..."
                            onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRenameSubmit}
                            className="bg-[color:var(--landing-clay)] hover:bg-[color:var(--landing-clay)]/90"
                        >
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
