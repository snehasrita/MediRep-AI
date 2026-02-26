import { AuthPage } from "@/components/ui/auth-page";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextParam =
    (typeof params?.redirect === "string" && params.redirect) ||
    (typeof params?.next === "string" && params.next) ||
    undefined;

  const redirectTo = sanitizeRedirectPath(nextParam, "/dashboard");

  return <AuthPage mode="signup" redirectTo={redirectTo} />;
}
