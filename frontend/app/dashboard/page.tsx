import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard/page";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Check role from metadata first (faster)
  const metadataRole = user.user_metadata?.role || user.app_metadata?.role;
  if (metadataRole === "pharmacist") {
    redirect('/pharmacist/dashboard');
  }
  if (metadataRole === "admin") {
    redirect('/admin/verify');
  }

  // Double-check by querying the database (ground truth)
  const { data: pharmacistProfile } = await supabase
    .from("pharmacist_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pharmacistProfile) {
    // Pharmacist found - redirect immediately
    redirect('/pharmacist/dashboard');
  }

  return (
    <Dashboard
      initialUserEmail={user?.email}
      initialUserName={user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]}
      initialUserAvatar={user?.user_metadata?.avatar_url}
    />
  );
}
