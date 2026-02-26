import { getSessionsServer } from "@/lib/api-server";
import { ChatLayoutClient } from "./layout-client";

export const dynamic = "force-dynamic";

/**
 * Server Component layout for Chat.
 * Prefetches sessions on the server for instant client-side hydration.
 */
export default async function ChatLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Prefetch sessions on the server (fast: server is closer to DB)
    const sessions = await getSessionsServer(50);

    return (
        <ChatLayoutClient initialSessions={sessions}>
            {children}
        </ChatLayoutClient>
    );
}
