import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/context/AuthContext";

export interface UserProfile {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    email?: string;
}

export function useProfile() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        async function fetchProfile() {
            if (!user?.id) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const supabase = createClient();

                // Try to get profile from Supabase
                // NOTE: This project uses `user_profiles` (see `backend/sql/schema.sql`),
                // not Supabase's default `profiles` table.
                const { data, error: fetchError } = await supabase
                    .from("user_profiles")
                    .select("display_name, avatar_url, preferences")
                    .eq("id", user.id)
                    .maybeSingle();

                if (fetchError) {
                    // Supabase error objects often stringify to `{}` in console,
                    // so log the useful fields explicitly.
                    console.error("Error fetching profile:", {
                        code: fetchError.code,
                        message: fetchError.message,
                        details: fetchError.details,
                        hint: fetchError.hint,
                    });
                }

                // Self-heal: if the row doesn't exist yet, create a minimal one.
                if (!data && !fetchError) {
                    await supabase.from("user_profiles").upsert(
                        {
                            id: user.id,
                            display_name:
                                (user.user_metadata?.full_name as string | undefined) ||
                                (user.user_metadata?.name as string | undefined) ||
                                user.email?.split("@")[0] ||
                                null,
                            avatar_url:
                                (user.user_metadata?.avatar_url as string | undefined) ||
                                (user.user_metadata?.picture as string | undefined) ||
                                null,
                            preferences: {},
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "id" }
                    );
                }

                // Construct profile object with fallbacks to user metadata
                const prefs = (data as unknown as { preferences?: Record<string, unknown> } | null)
                    ?.preferences;
                const userProfile: UserProfile = {
                    id: user.id,
                    email: user.email,
                    full_name:
                        (data as unknown as { display_name?: string | null } | null)?.display_name ||
                        (user.user_metadata?.full_name as string | undefined) ||
                        (user.user_metadata?.name as string | undefined) ||
                        null,
                    avatar_url:
                        (data as unknown as { avatar_url?: string | null } | null)?.avatar_url ||
                        (user.user_metadata?.avatar_url as string | undefined) ||
                        (user.user_metadata?.picture as string | undefined) ||
                        null,
                    bio: (typeof prefs?.bio === "string" ? prefs.bio : null),
                };

                setProfile(userProfile);
            } catch (err) {
                console.error("Unexpected error in useProfile:", err);
                setError(err instanceof Error ? err : new Error("Unknown error"));
            } finally {
                setLoading(false);
            }
        }

        fetchProfile();
    }, [user]);

    return { profile, loading, error };
}
