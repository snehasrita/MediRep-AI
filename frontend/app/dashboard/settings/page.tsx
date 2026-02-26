import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ProfileSettings } from "@/components/account/profile-settings";

export default async function DashboardSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard/settings");
  }

  // Keep role routing consistent with `frontend/app/dashboard/page.tsx`.
  const metadataRole = user.user_metadata?.role || user.app_metadata?.role;
  if (metadataRole === "pharmacist") {
    redirect("/pharmacist/profile");
  }
  if (metadataRole === "admin") {
    redirect("/admin/verify");
  }

  // Ground-truth check (handles missing metadata role).
  const { data: pharmacistProfile } = await supabase
    .from("pharmacist_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pharmacistProfile) {
    redirect("/pharmacist/profile");
  }

  return (
    <ProfileSettings
      user={{
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.user_metadata,
      }}
    />
  );
}
