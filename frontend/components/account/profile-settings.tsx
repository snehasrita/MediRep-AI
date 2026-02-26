"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User as UserIcon, ArrowLeft, Save, LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type SerializableUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export function ProfileSettings({ user }: { user: SerializableUser }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [existingPreferences, setExistingPreferences] = useState<Record<string, unknown>>({});

  const fallbackName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "User";

  const fallbackAvatar =
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      setSuccess(null);

      const { data, error: fetchError } = await supabase
        .from("user_profiles")
        .select("display_name, avatar_url, preferences")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError) {
        // PostgREST errors can be hard to read in console; show a short message.
        setError(fetchError.message || "Failed to load profile.");
      }

      const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
      setExistingPreferences(prefs);

      setDisplayName((data?.display_name as string | null) || fallbackName);
      setAvatarUrl((data?.avatar_url as string | null) || fallbackAvatar);
      setBio(typeof prefs.bio === "string" ? prefs.bio : "");

      // Self-heal: make sure a row exists for older accounts.
      if (!data && !fetchError) {
        await supabase.from("user_profiles").upsert(
          {
            id: user.id,
            display_name: fallbackName,
            avatar_url: fallbackAvatar || null,
            preferences: {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, user?.id, fallbackName, fallbackAvatar]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const name = displayName.trim();
    const avatar = avatarUrl.trim();
    const nextBio = bio.trim();

    // Merge preferences to avoid wiping future keys.
    const mergedPreferences = {
      ...existingPreferences,
      bio: nextBio,
    };

    const { error: upsertError } = await supabase.from("user_profiles").upsert(
      [
        {
          id: user.id,
          display_name: name || null,
          avatar_url: avatar || null,
          preferences: mergedPreferences,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" }
    );

    if (upsertError) {
      setSaving(false);
      setError(upsertError.message || "Failed to save profile.");
      return;
    }

    setExistingPreferences(mergedPreferences);
    setSaving(false);
    setSuccess("Profile updated.");

    // Keep UI consistent with any places that read metadata/profile.
    router.refresh();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight font-display">
            Profile
          </h1>
          <p className="mt-1 text-muted-foreground">
            Edit your personal details.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl border border-green-600/20 bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-200">
          {success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How your profile appears inside the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback>
                  <UserIcon className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate font-medium">{displayName || fallbackName}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              {bio ? bio : "No bio yet."}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
            <CardDescription>Keep it short and professional.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                disabled={loading || saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                disabled={loading || saving}
              />
              <p className="text-xs text-muted-foreground">
                Tip: Google avatars and Supabase Storage URLs are supported.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="What should MediRep AI know about you?"
                rows={5}
                disabled={loading || saving}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={onSave}
                disabled={loading || saving}
                className="bg-(--landing-moss) text-(--landing-bone) hover:bg-[rgb(var(--landing-moss-rgb)/0.9)]"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/dashboard")}
                disabled={saving}
                className="border-(--landing-border-strong) hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleSignOut}
                disabled={saving}
                className="ml-auto"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
