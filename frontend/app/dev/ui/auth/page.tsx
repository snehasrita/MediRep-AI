import { notFound } from "next/navigation";

import { AuthPage } from "@/components/ui/auth-page";

export default function AuthDemoPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return <AuthPage mode="login" redirectTo="/dashboard" />;
}

