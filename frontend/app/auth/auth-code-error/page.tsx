"use client";

import Link from "next/link";
import { Pill, AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";

export default function AuthCodeErrorPage() {
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
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">
              Authentication Error
            </h2>
            <p className="text-muted-foreground">
              We couldn&apos;t complete the authentication process. This might happen
              if:
            </p>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  The confirmation link has expired
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  The link was already used
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  The link was modified or incomplete
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  There was a temporary server issue
                </li>
              </ul>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Link href="/auth/login" className="block">
              <Button className="w-full h-11">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Sign In
              </Button>
            </Link>
            <Link href="/auth/signup" className="block">
              <Button variant="outline" className="w-full h-11">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Signing Up Again
              </Button>
            </Link>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            If the problem persists, please contact{" "}
            <a
              href="mailto:support@medirep.ai"
              className="text-primary hover:underline"
            >
              support@medirep.ai
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
