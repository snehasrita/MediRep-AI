"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pill,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModeToggle } from "@/components/mode-toggle";
import { PasswordStrength } from "@/components/auth/password-strength";
import { updatePassword } from "@/app/auth/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updatePassword(formData);

      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(result.success);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 flex justify-between items-center border-b">
        <Link href="/" className="flex items-center gap-2">
          <Pill className="h-6 w-6 text-primary" />
          <span className="font-bold">MediRep AI</span>
        </Link>
        <ModeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              Set new password
            </h2>
            <p className="text-muted-foreground">
              Create a strong password for your account.
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950/50 animate-in fade-in-0 slide-in-from-top-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-400">
                {success} Redirecting to sign in...
              </AlertDescription>
            </Alert>
          )}

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <form action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="pl-10 pr-10 h-11"
                      disabled={isLoading || !!success}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="pl-10 pr-10 h-11"
                      disabled={isLoading || !!success}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 text-base font-medium"
                  disabled={isLoading || !!success}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating password...
                    </>
                  ) : success ? (
                    "Password updated!"
                  ) : (
                    "Update password"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
