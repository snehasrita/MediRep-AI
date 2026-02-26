import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | MediRep AI",
  description: "Terms of Service for MediRep AI.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: January 31, 2026</p>
        </div>

        <div className="prose prose-zinc dark:prose-invert mt-8 max-w-none">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of MediRep
            AI (the &ldquo;Service&rdquo;). By using the Service, you agree to these Terms.
          </p>

          <h2>Brutal Summary</h2>
          <ul>
            <li>
              The Service can be wrong. Don&rsquo;t use it as your only source for clinical,
              reimbursement, or safety decisions.
            </li>
            <li>Not for emergencies. If it&rsquo;s urgent, call local emergency services.</li>
            <li>
              You are responsible for what you do with the outputs, including verifying facts.
            </li>
          </ul>

          <h2>Not Medical Advice</h2>
          <p>
            MediRep AI provides informational content only and does not provide medical advice,
            diagnosis, or treatment. Always seek the advice of a qualified healthcare professional
            with any questions regarding a medical condition or medication decision.
          </p>

          <h2>Eligibility & Accounts</h2>
          <ul>
            <li>You must provide accurate account information.</li>
            <li>You are responsible for maintaining the confidentiality of your credentials.</li>
            <li>We may suspend or terminate access for misuse, fraud, or policy violations.</li>
          </ul>

          <h2>Pharmacist Marketplace</h2>
          <p>
            If the Service enables booking or communicating with pharmacists, you understand that:
          </p>
          <ul>
            <li>Pharmacists are third parties and are responsible for their professional services.</li>
            <li>
              Availability, pricing, verification status, and consultation outcomes are not
              guaranteed.
            </li>
            <li>
              You agree to follow any platform rules for bookings, cancellations, refunds, and
              conduct.
            </li>
          </ul>

          <h2>Acceptable Use</h2>
          <ul>
            <li>Don&rsquo;t break the law.</li>
            <li>Don&rsquo;t attempt to access other users&rsquo; data.</li>
            <li>
              Don&rsquo;t upload or request content that violates privacy, IP rights, or safety rules.
            </li>
            <li>Don&rsquo;t abuse the Service (spam, scraping, or bypassing security).</li>
          </ul>

          <h2>Content & Outputs</h2>
          <p>
            You are responsible for evaluating outputs from the Service. Outputs may be incomplete,
            outdated, or incorrect. You must independently verify any information before relying on
            it.
          </p>

          <h2>Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES
            OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
            PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, MEDIREP AI WILL NOT BE LIABLE FOR INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR
            REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY.
          </p>

          <h2>Privacy</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms? Contact the team through the in-app support channels.
          </p>
        </div>
      </div>
    </main>
  );
}

