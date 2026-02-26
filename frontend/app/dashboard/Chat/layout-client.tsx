"use client";

import { SWRConfig } from "swr";
import { SessionSummary } from "@/types";

interface ChatLayoutClientProps {
    children: React.ReactNode;
    initialSessions: SessionSummary[];
}

/**
 * Client Component that hydrates SWR cache with server-prefetched data.
 * 
 * This passes the prefetched sessions to SWR as `fallback` data.
 * SWR will render immediately from this data, then revalidate in background.
 */
export function ChatLayoutClient({ children, initialSessions }: ChatLayoutClientProps) {
    return (
        <SWRConfig
            value={{
                fallback: {
                    // This key must match the key used in useSessions hook
                    "user-sessions": initialSessions,
                },
            }}
        >
            {children}
        </SWRConfig>
    );
}
