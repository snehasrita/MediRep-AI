import useSWR, { mutate } from "swr";
import { SessionSummary } from "@/types";
import { getUserSessions, deleteSession, renameSession } from "@/lib/api";

// Cache key for sessions
const SESSIONS_KEY = "user-sessions";

/**
 * Hook for fetching and caching chat sessions using SWR.
 * 
 * Features:
 * - Instant render from cache on subsequent visits
 * - Background revalidation for fresh data
 * - Optimistic updates when sessions change
 * - Automatic error handling and retry
 */
export function useSessions(limit: number = 50) {
    const { data, error, isLoading, isValidating, mutate: boundMutate } = useSWR<SessionSummary[]>(
        SESSIONS_KEY,
        () => getUserSessions(limit),
        {
            // Keep data fresh for 5 minutes before background revalidation
            refreshInterval: 0, // Manual refresh only
            revalidateIfStale: true,
            // Revalidate on mount to get fresh data in background
            revalidateOnMount: true,
            // Keep previous data while revalidating - this is the key for instant UI
            keepPreviousData: true,
        }
    );

    const deleteSessionHandler = async (id: string) => {
        // Optimistic update
        boundMutate((current) => current?.filter(s => s.id !== id), false);
        try {
            await deleteSession(id);
            boundMutate(); // Revalidate
        } catch (e) {
            boundMutate(); // Revert on error
            throw e;
        }
    };

    const renameSessionHandler = async (id: string, newTitle: string) => {
        // Optimistic update
        boundMutate(
            (current) => current?.map(s => s.id === id ? { ...s, title: newTitle } : s),
            false
        );
        try {
            await renameSession(id, newTitle);
            boundMutate();
        } catch (e) {
            boundMutate();
            throw e;
        }
    };

    return {
        sessions: data || [],
        isLoading,
        isValidating, // True when revalidating in background
        error,
        refresh: boundMutate,
        deleteSession: deleteSessionHandler,
        renameSession: renameSessionHandler,
    };
}

/**
 * Invalidate session cache globally.
 * Call this after creating a new session or sending a message.
 */
export async function invalidateSessionsCache() {
    await mutate(SESSIONS_KEY);
}

/**
 * Optimistically update session cache.
 * Use this for instant UI updates before server confirms.
 */
export async function updateSessionsCache(
    updater: (current: SessionSummary[] | undefined) => SessionSummary[]
) {
    await mutate(SESSIONS_KEY, updater, { revalidate: true });
}
