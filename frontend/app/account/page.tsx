import { AccountSettings } from "@/components/account/account-settings"
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const supabase = await createClient();
  
  const { data, error } = await supabase.auth.getUser();
  
  if (error || !data?.user) {
    redirect("/auth/login");
  }
  
  const { user } = data;
  
  return (
    <div className="container mx-auto p-6">
      <AccountSettings user={user} />
    </div>
  ) 
}