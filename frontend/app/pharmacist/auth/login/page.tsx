import { AuthPage } from "@/components/ui/auth-page";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextParam =
    (typeof params?.redirect === "string" && params.redirect) ||
    (typeof params?.next === "string" && params.next) ||
    undefined;

  const redirectTo = sanitizeRedirectPath(nextParam, "/pharmacist/register");

  return <AuthPage mode="login" redirectTo={redirectTo} variant="pharmacist" />;
}
