import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | MediRep AI",
  description: "Privacy Policy for MediRep AI.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: January 31, 2026</p>
        </div>

        <div className="prose prose-zinc dark:prose-invert mt-8 max-w-none">
          <p>
            This Privacy Policy explains how MediRep AI collects, uses, and shares information when
            you use the Service.
          </p>

          <h2>Brutal Summary</h2>
          <ul>
            <li>Don&rsquo;t share sensitive information you wouldn&rsquo;t want stored.</li>
            <li>
              We use your data to operate the Service (auth, security, payments/booking flows if
              applicable).
            </li>
            <li>We don&rsquo;t sell your personal information.</li>
          </ul>

          <h2>Information We Collect</h2>
          <ul>
            <li>
              <strong>Account data:</strong> email, authentication identifiers, basic profile
              details.
            </li>
            <li>
              <strong>Usage data:</strong> pages viewed, feature interactions, basic device/browser
              signals.
            </li>
            <li>
              <strong>Content you provide:</strong> prompts, messages, uploads, and pharmacist
              registration data (if applicable).
            </li>
          </ul>

          <h2>How We Use Information</h2>
          <ul>
            <li>Provide and maintain the Service.</li>
            <li>Authenticate users and enforce role-based access (user/pharmacist/admin).</li>
            <li>Prevent abuse, fraud, and security incidents.</li>
            <li>Improve product quality and reliability.</li>
          </ul>

          <h2>Sharing</h2>
          <p>We may share information with:</p>
          <ul>
            <li>
              <strong>Service providers</strong> (e.g., hosting, analytics, authentication) who
              process data on our behalf.
            </li>
            <li>
              <strong>Legal/compliance</strong> when required to comply with law or protect safety.
            </li>
            <li>
              <strong>Marketplace participants</strong> when you book or communicate (e.g., sharing
              what&rsquo;s necessary for a consultation).
            </li>
          </ul>

          <h2>Data Retention</h2>
          <p>
            We retain information as needed to provide the Service, comply with legal obligations,
            resolve disputes, and enforce agreements. Retention periods may vary by data type.
          </p>

          <h2>Your Choices</h2>
          <ul>
            <li>You can update certain profile details in-app.</li>
            <li>You can sign out and stop using the Service at any time.</li>
          </ul>

          <h2>Security</h2>
          <p>
            We use reasonable safeguards designed to protect your information, but no system is
            perfectly secure.
          </p>

          <h2>Terms</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link href="/terms">Terms of Service</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}

