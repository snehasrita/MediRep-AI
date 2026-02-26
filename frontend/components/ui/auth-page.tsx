"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AtSignIcon,
  ChevronLeftIcon,
  Grid2x2PlusIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { sanitizeRedirectPath } from "@/lib/auth/redirect";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/app/auth/actions";
import { PasswordStrength } from "@/components/auth/password-strength";

type AuthMode = "login" | "signup";

export function AuthPage({
  mode,
  redirectTo,
  className,
  variant = "default",
}: {
  mode: AuthMode;
  redirectTo?: string;
  className?: string;
  variant?: "default" | "pharmacist";
}) {
  const safeNext = useMemo(
    () => sanitizeRedirectPath(redirectTo, "/dashboard"),
    [redirectTo]
  );

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");

  const title =
    mode === "login" ? "Sign in to MediRep AI" : "Create your MediRep AI account";
  const subtitle =
    mode === "login"
      ? "Get instant, accurate drug and reimbursement information."
      : "Join to access AI guidance, pharmacist marketplace, and tools.";

  async function handleGoogle() {
    setIsGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle(safeNext);
    } catch (e: unknown) {
      // Re-throw NEXT_REDIRECT errors - they're expected behavior
      if (
        e &&
        typeof e === "object" &&
        "digest" in e &&
        typeof (e as { digest?: string }).digest === "string" &&
        (e as { digest: string }).digest.includes("NEXT_REDIRECT")
      ) {
        throw e;
      }
      setIsGoogleLoading(false);
      setError(e instanceof Error ? e.message : "Google sign-in failed.");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    formData.set("redirectTo", safeNext);

    try {
      const result =
        mode === "login"
          ? await signInWithEmail(formData)
          : await signUpWithEmail(formData);

      if (result?.error) setError(result.error);
      if (result?.success) setSuccess(result.success);
    } catch (err: unknown) {
      // Re-throw NEXT_REDIRECT errors - they're expected behavior
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: string }).digest === "string" &&
        (err as { digest: string }).digest.includes("NEXT_REDIRECT")
      ) {
        throw err;
      }
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main
      className={cn(
        "relative min-h-screen overflow-hidden lg:grid lg:grid-cols-2",
        className
      )}
    >
      {/* Left panel */}
      <div className="relative hidden h-full flex-col border-r p-10 lg:flex bg-linear-to-br from-[#f4a88a] via-[#f9c9a8] to-[#fde4c8]">
        <div className="absolute inset-0 z-10 bg-linear-to-t from-[#f9dcc4]/80 to-transparent" />

        <div className="z-10 flex items-center gap-2">
          <Grid2x2PlusIcon className="size-6 text-[#c85a3a]" />
          <p className="text-xl font-semibold font-display text-gray-900">
            MediRep AI
          </p>
        </div>

        <div className="z-10 mt-auto space-y-6">
          <blockquote className="space-y-3">
            <p className="text-xl leading-relaxed text-gray-900 font-medium">
              &ldquo;If the answer affects patient safety or coverage, it should be
              instant, sourced, and auditable.&rdquo;
            </p>
            <footer className="font-mono text-sm font-semibold text-gray-700">
              ~ Design principle
            </footer>
          </blockquote>

          <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div className="rounded-lg border border-orange-200/50 bg-white/80 backdrop-blur-sm p-3 shadow-sm hover:shadow-md transition-shadow">
              Drug: dosing, contraindications, interactions
            </div>
            <div className="rounded-lg border border-orange-200/50 bg-white/80 backdrop-blur-sm p-3 shadow-sm hover:shadow-md transition-shadow">
              Coverage: reimbursement, prior auth, formularies
            </div>
            <div className="rounded-lg border border-orange-200/50 bg-white/80 backdrop-blur-sm p-3 shadow-sm hover:shadow-md transition-shadow">
              Marketplace: book a verified pharmacist
            </div>
            <div className="rounded-lg border border-orange-200/50 bg-white/80 backdrop-blur-sm p-3 shadow-sm hover:shadow-md transition-shadow">
              Secure: roles, RLS, server-side verification
            </div>
          </div>
        </div>

        <div className="absolute inset-0">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>

      {/* Right panel */}
      <div className="relative flex min-h-screen flex-col justify-center p-4 bg-linear-to-br from-[#fef5f1] to-[#f9dcc4]">
        <div aria-hidden className="absolute inset-0 -z-10 opacity-40">
          <div className="absolute right-0 top-0 h-[520px] w-[520px] -translate-y-1/2 translate-x-1/4 rounded-full bg-[radial-gradient(circle_at_center,rgba(203,85,52,0.15)_0,transparent_65%)]" />
          <div className="absolute right-0 top-0 h-[420px] w-[320px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(244,168,138,0.2)_0,transparent_70%)]" />
        </div>

        <Button variant="ghost" className="absolute left-5 top-7" asChild>
          <Link href="/">
            <ChevronLeftIcon className="mr-2 size-4" />
            Home
          </Link>
        </Button>

        <div className="mx-auto w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 lg:hidden">
            <Grid2x2PlusIcon className="size-6" />
            <p className="text-xl font-semibold font-display">
              MediRep AI
            </p>
          </div>

          <div className="flex flex-col space-y-1">
            <h1 className="text-2xl font-bold tracking-wide font-display text-gray-900">
              {title}
            </h1>
            <p className="text-gray-700 text-base">{subtitle}</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500/50 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-200">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              type="button"
              size="lg"
              className="w-full bg-[#c85a3a] hover:bg-[#b14a2f] text-white shadow-lg"
              onClick={handleGoogle}
              disabled={isLoading || isGoogleLoading || !!success}
            >
              <GoogleIcon className="mr-2 size-4" />
              {isGoogleLoading ? "Connecting..." : "Continue with Google"}
            </Button>
          </div>

          <AuthSeparator />

          <form className="space-y-3" onSubmit={handleSubmit}>
            <p className="text-gray-700 text-start text-xs">
              {mode === "login"
                ? "Use your email and password to sign in."
                : "Use your email to create an account (confirmation email required)."}
            </p>

            <div className="relative">
              <Input
                placeholder="your.email@example.com"
                className={cn(
                  "peer pl-9 border-gray-300 text-gray-900 placeholder:text-gray-500",
                  variant === "pharmacist" ? "bg-gray-200" : "bg-white"
                )}
                type="email"
                name="email"
                autoComplete="email"
                required
                disabled={isLoading || isGoogleLoading || !!success}
              />
              <div className="text-gray-600 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50">
                <AtSignIcon className="size-4" aria-hidden="true" />
              </div>
            </div>

            <div className="relative">
              <Input
                placeholder={mode === "login" ? "Password" : "Create a password"}
                className={cn(
                  "peer pl-9 pr-9 border-gray-300 text-gray-900 placeholder:text-gray-500",
                  variant === "pharmacist" ? "bg-gray-200" : "bg-white"
                )}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "signup" ? 8 : undefined}
                disabled={isLoading || isGoogleLoading || !!success}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
              />
              <div className="text-gray-600 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50">
                <LockIcon className="size-4" aria-hidden="true" />
              </div>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-gray-600 absolute inset-y-0 right-0 flex items-center pr-3 hover:text-gray-900 disabled:opacity-50"
                disabled={isLoading || isGoogleLoading || !!success}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {mode === "signup" && <PasswordStrength password={password} />}

            {mode === "signup" && (
              <div className="relative">
                <Input
                  placeholder="Confirm password"
                  className={cn(
                    "peer pl-9 pr-9 border-gray-300 text-gray-900 placeholder:text-gray-500",
                    variant === "pharmacist" ? "bg-gray-200" : "bg-white"
                  )}
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  disabled={isLoading || isGoogleLoading || !!success}
                />
                <div className="text-gray-600 pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50">
                  <LockIcon className="size-4" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="text-gray-600 absolute inset-y-0 right-0 flex items-center pr-3 hover:text-gray-900 disabled:opacity-50"
                  disabled={isLoading || isGoogleLoading || !!success}
                  aria-label={
                    showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOffIcon className="size-4" aria-hidden="true" />
                  ) : (
                    <EyeIcon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            )}

            {mode === "login" && (
              <div className="flex justify-end">
                <Link
                  href={`/auth/forgot-password?next=${encodeURIComponent(safeNext)}`}
                  className="text-xs text-gray-700 hover:text-gray-900 underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-[#c85a3a] hover:bg-[#b14a2f] text-white shadow-lg"
              disabled={isLoading || isGoogleLoading || !!success}
            >
              {mode === "login"
                ? isLoading
                  ? "Signing in..."
                  : "Sign in"
                : isLoading
                  ? "Creating account..."
                  : "Create account"}
            </Button>
          </form>

          <p className="text-gray-700 mt-6 text-sm">
            {mode === "login" ? (
              <>
                No account yet?{" "}
                <Link
                  href={`/auth/signup?next=${encodeURIComponent(safeNext)}`}
                  className="text-gray-900 hover:text-[#c85a3a] underline underline-offset-4 font-medium"
                >
                  Create one
                </Link>
                .
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link
                  href={`/auth/login?next=${encodeURIComponent(safeNext)}`}
                  className="text-gray-900 hover:text-[#c85a3a] underline underline-offset-4 font-medium"
                >
                  Sign in
                </Link>
                .
              </>
            )}
          </p>

          <p className="text-gray-700 mt-4 text-xs leading-relaxed">
            By continuing, you agree to our{" "}
            <Link href="/terms" className="text-gray-900 hover:text-[#c85a3a] underline underline-offset-4">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-gray-900 hover:text-[#c85a3a] underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.6, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

const GoogleIcon = (props: React.ComponentProps<"svg">) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.479 14.265v-3.279h11.049c.108.571.164 1.247.164 1.979 0 2.46-.672 5.502-2.84 7.669C18.744 22.829 16.051 24 12.483 24 5.869 24 .308 18.613.308 12S5.869 0 12.483 0c3.659 0 6.265 1.436 8.223 3.307L18.392 5.62c-1.404-1.317-3.307-2.341-5.913-2.341-4.829 0-8.606 3.892-8.606 8.721s3.777 8.721 8.606 8.721c3.132 0 4.916-1.258 6.059-2.401.927-.927 1.537-2.251 1.777-4.059l-7.836.004z" />
  </svg>
);

const AuthSeparator = () => {
  return (
    <div className="flex w-full items-center justify-center">
      <div className="bg-gray-300 h-px w-full" />
      <span className="text-gray-700 px-2 text-xs">OR</span>
      <div className="bg-gray-300 h-px w-full" />
    </div>
  );
};
