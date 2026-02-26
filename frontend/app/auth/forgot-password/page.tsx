"use client";

import { useState } from "react";
import Link from "next/link";
import { Pill, Mail, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModeToggle } from "@/components/mode-toggle";
import { resetPassword } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await resetPassword(formData);

      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(result.success);
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
          <Link
            href="/auth/login"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sign in
          </Link>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Reset your password</h2>
            <p className="text-muted-foreground">
              Enter your email address and we&apos;ll send you a link to reset your
              password.
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
                {success}
              </AlertDescription>
            </Alert>
          )}

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <form action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      className="pl-10 h-11"
                      disabled={isLoading || !!success}
                    />
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
                      Sending link...
                    </>
                  ) : success ? (
                    "Email sent!"
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link href="/auth/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
