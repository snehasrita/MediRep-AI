"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    MessageSquareText,
    Search,
    IndianRupee,
    ShieldCheck,
    BadgeCheck,
    PhoneCall,
    ArrowRight,
    ChevronRight,
    Lock,
    Pill,
} from "lucide-react";
import BlurText from "@/components/ui/blur-text";
import ScrambledText from "@/components/ui/scrambled-text";
import ScrollFloat from "@/components/ui/scroll-float";


// --- Components ---

const DotGrid = () => {
    return (
        <div
            className="absolute inset-0 z-0 opacity-[0.4]"
            style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, var(--landing-muted-2) 1px, transparent 0)`,
                backgroundSize: "24px 24px",
            }}
        />
    );
};

interface FeatureTileProps {
    tone: "clay" | "marigold" | "moss";
    icon: React.ReactNode;
    title: string;
    body: string;
}

const FeatureTile = ({ tone, icon, title, body }: FeatureTileProps) => {
    const colors = {
        clay: {
            bg: "var(--landing-clay)",
            rgb: "var(--landing-clay-rgb)",
        },
        marigold: {
            bg: "var(--landing-marigold, #F5A623)", // Fallback if variable doesn't exist
            rgb: "245, 166, 35",
        },
        moss: {
            bg: "var(--landing-moss)",
            rgb: "var(--landing-moss-rgb)",
        },
    };

    const color = colors[tone] || colors.clay;

    return (
        <div
            className="group relative overflow-hidden rounded-2xl border p-4 transition-colors hover:bg-[color:var(--landing-card-strong)]"
            style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
        >
            <div className="mb-3 flex items-center gap-3">
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                        backgroundColor: `rgba(${color.rgb}, 0.1)`,
                        color: color.bg,
                    }}
                >
                    {icon}
                </div>
                <div className="font-bold text-[color:var(--landing-ink)]">{title}</div>
            </div>
            <div className="text-sm leading-relaxed text-[color:var(--landing-muted)]">
                {body}
            </div>
        </div>
    );
};

interface SectionProps {
    id: string;
    eyebrow: string;
    title: React.ReactNode;
    subtitle?: string;
    children: React.ReactNode;
}

const Section = ({ id, eyebrow, title, subtitle, children }: SectionProps) => {
    return (
        <section id={id} className="py-20 md:py-32">
            <div className="mx-auto max-w-6xl px-4">
                <div className="mb-12 md:text-center">
                    <div
                        className="mb-4 text-xs font-bold uppercase tracking-widest text-[color:var(--landing-clay)]"
                    >
                        {eyebrow}
                    </div>
                    <h2 className="mb-4 text-3xl font-bold tracking-tight text-[color:var(--landing-ink)] md:text-5xl font-[family-name:var(--font-display)]">
                        {title}
                    </h2>
                    {subtitle && (
                        <p className="mx-auto max-w-2xl text-lg text-[color:var(--landing-muted)]">
                            {subtitle}
                        </p>
                    )}
                </div>
                {children}
            </div>
        </section>
    );
};

export default function NewLandingPage() {
    const scrollToHash = (hash: string) => {
        const el = document.querySelector(hash);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
        }
    };

    return (
        <div className="min-h-screen bg-[color:var(--landing-paper)] text-[color:var(--landing-ink)] font-sans selection:bg-[color:var(--landing-clay)] selection:text-white">
            <main>
                <Section
                    id="product"
                    eyebrow="Product"
                    title={
                        <>
                            A workflow built for{" "}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[color:var(--landing-clay)] via-[color:var(--landing-bone)] to-[color:var(--landing-moss)]">
                                clinical speed
                            </span>
                            , not demo vibes.
                        </>
                    }
                    subtitle="We optimized for clarity, speed, and escalation — the parts users actually feel."
                >
                    <div className="relative overflow-hidden rounded-[32px] border p-6 backdrop-blur"
                        style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
                    >
                        <div aria-hidden className="absolute inset-0">
                            <DotGrid />
                        </div>

                        <div className="relative z-10">
                            <ScrollFloat containerClassName="mb-6" textClassName="opacity-90">
                                Evidence
                            </ScrollFloat>

                            <div className="grid gap-4 md:grid-cols-2">
                                <FeatureTile
                                    tone="clay"
                                    icon={<MessageSquareText className="h-5 w-5" />}
                                    title="Cited answers"
                                    body="We bias toward source trails. If evidence is missing, we say so."
                                />
                                <FeatureTile
                                    tone="marigold"
                                    icon={<Search className="h-5 w-5" />}
                                    title="Hybrid retrieval"
                                    body="Structured drug DB + semantic search + guardrails, merged by intent."
                                />
                                <FeatureTile
                                    tone="moss"
                                    icon={<IndianRupee className="h-5 w-5" />}
                                    title="Price & reimbursement"
                                    body="Compare options, surface coverage constraints, and reduce surprises."
                                />
                                <FeatureTile
                                    tone="moss"
                                    icon={<ShieldCheck className="h-5 w-5" />}
                                    title="Hard boundaries"
                                    body="Role-based portals, payment-state gating, RLS, and signature checks."
                                />
                            </div>

                            <div className="mt-6 rounded-2xl border p-4"
                                style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                            >
                                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--landing-muted-2)" }}>
                                    Demo prompt
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--landing-ink)" }}>
                                    <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--landing-border)" }}>
                                        warfarin + aspirin
                                    </span>
                                    <span className="opacity-50">→</span>
                                    <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--landing-border)" }}>
                                        interaction + mitigation
                                    </span>
                                    <span className="opacity-50">→</span>
                                    <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--landing-border)" }}>
                                        cite sources
                                    </span>
                                    <span className="opacity-50">→</span>
                                    <span className="rounded-full border px-3 py-1" style={{ borderColor: "var(--landing-border)" }}>
                                        escalate if uncertain
                                    </span>
                                </div>

                                <div className="mt-3 text-sm leading-relaxed" style={{ color: "var(--landing-muted)" }}>
                                    <BlurText
                                        text="Brutal truth: AI isn’t the product unless the workflow is checkable. We designed for receipts, not confidence."
                                        delay={90}
                                        animateBy="words"
                                        direction="top"
                                        className="leading-relaxed"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                <Section
                    id="marketplace"
                    eyebrow="Marketplace"
                    title={
                        <>
                            When AI shouldn’t answer,{" "}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[color:var(--landing-clay)] via-[color:var(--landing-bone)] to-[color:var(--landing-moss)]">
                                a verified pharmacist
                            </span>{" "}
                            should.
                        </>
                    }
                    subtitle="Browse pharmacists, pay securely, then start chat/voice — unlocked only after confirmation."
                >
                    <div className="relative overflow-hidden rounded-[32px] border p-6 backdrop-blur"
                        style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
                    >
                        <div aria-hidden className="absolute inset-0">
                            <DotGrid />
                        </div>

                        <div className="relative z-10 grid gap-4 lg:grid-cols-[1.3fr_1fr] lg:items-start">
                            <div className="rounded-3xl border p-5"
                                style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                            >
                                <div className="text-sm font-extrabold tracking-tight" style={{ color: "var(--landing-ink)" }}>
                                    Flow
                                </div>
                                <div className="mt-4 grid gap-3">
                                    {[
                                        {
                                            icon: <Search className="h-5 w-5" />,
                                            title: "Discover",
                                            body: "Browse verified pharmacist profiles and availability.",
                                        },
                                        {
                                            icon: <IndianRupee className="h-5 w-5" />,
                                            title: "Pay",
                                            body: "Pay securely and get an instant confirmation.",
                                        },
                                        {
                                            icon: <PhoneCall className="h-5 w-5" />,
                                            title: "Consult",
                                            body: "Start chat or voice call only after payment is confirmed.",
                                        },
                                    ].map((s) => (
                                        <div
                                            key={s.title}
                                            className="rounded-2xl border p-4"
                                            style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                                                    style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                                                >
                                                    {s.icon}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold" style={{ color: "var(--landing-ink)" }}>
                                                        {s.title}
                                                    </div>
                                                    <div className="mt-1 text-sm" style={{ color: "var(--landing-muted)" }}>
                                                        {s.body}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-5 rounded-2xl border p-4"
                                    style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
                                >
                                    <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--landing-muted-2)" }}>
                                        Brutal honesty
                                    </div>
                                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--landing-muted)" }}>
                                        The marketplace lives or dies on real availability and verification. We built the flow; production would need stronger onboarding and quality enforcement.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-3xl border p-5"
                                style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                            >
                                <div className="text-sm font-extrabold tracking-tight" style={{ color: "var(--landing-ink)" }}>
                                    Marketplace CTA
                                </div>
                                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--landing-muted)" }}>
                                    If you want to judge the product, judge the escalation. This is where it becomes real.
                                </p>
                                <div className="mt-4 flex flex-col gap-2">
                                    <Link href="/dashboard/BookPharmacist">
                                        <Button className="w-full rounded-2xl bg-[color:var(--landing-moss)] text-[color:var(--landing-bone)] hover:brightness-95">
                                            Open marketplace <ArrowRight className="ml-2 h-4 w-4" />
                                        </Button>
                                    </Link>
                                    <Link href="/pharmacist/register">
                                        <Button
                                            variant="outline"
                                            className="w-full rounded-2xl bg-[color:var(--landing-card)] hover:bg-[color:var(--landing-card-strong)]"
                                            style={{ borderColor: "var(--landing-border)", color: "var(--landing-ink)" }}
                                        >
                                            Register as pharmacist <ChevronRight className="ml-1 h-4 w-4" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </Section>

                <Section
                    id="how"
                    eyebrow="How it works"
                    title="Three steps. No guessing."
                    subtitle="Get the answer. See options. Escalate to a human when it matters."
                >
                    <div
                        className="relative overflow-hidden rounded-[32px] border p-6 backdrop-blur"
                        style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card)" }}
                    >
                        <div aria-hidden className="absolute inset-0">
                            <DotGrid />
                        </div>

                        <div className="relative z-10 grid gap-4 md:grid-cols-3">
                            <FeatureTile
                                tone="clay"
                                icon={<MessageSquareText className="h-5 w-5" />}
                                title="Ask"
                                body="Type a medication question. Get a short answer you can verify."
                            />
                            <FeatureTile
                                tone="marigold"
                                icon={<Search className="h-5 w-5" />}
                                title="Check"
                                body="See citations and key warnings so you don’t rely on blind confidence."
                            />
                            <FeatureTile
                                tone="moss"
                                icon={<PhoneCall className="h-5 w-5" />}
                                title="Escalate"
                                body="Book a verified pharmacist for chat or voice if you need a human."
                            />
                        </div>

                        <div
                            className="mt-6 rounded-2xl border p-4"
                            style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                        >
                            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--landing-muted-2)" }}>
                                What users actually want
                            </div>
                            <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--landing-muted)" }}>
                                <BlurText
                                    text="Less searching. Fewer surprises. Clear next steps when the answer is uncertain."
                                    delay={90}
                                    animateBy="words"
                                    direction="top"
                                    className="leading-relaxed"
                                />
                            </div>
                        </div>
                    </div>
                </Section>

                <Section
                    id="trust"
                    eyebrow="Trust"
                    title="No ghost consults. No surprise access."
                    subtitle="We keep the experience simple: you unlock chat/voice only after payment is confirmed, and pharmacist profiles go through verification."
                >
                    <div className="grid gap-4 md:grid-cols-3">
                        <FeatureTile
                            tone="moss"
                            icon={<ShieldCheck className="h-5 w-5" />}
                            title="Verified access"
                            body="Chat and voice unlock only after payment is confirmed."
                        />
                        <FeatureTile
                            tone="clay"
                            icon={<BadgeCheck className="h-5 w-5" />}
                            title="Verified profiles"
                            body="Marketplace listings are reviewed before they go live."
                        />
                        <FeatureTile
                            tone="marigold"
                            icon={<Lock className="h-5 w-5" />}
                            title="Private by default"
                            body="Sensitive documents stay private and aren't shown publicly."
                        />
                    </div>

                    <div className="mt-6">
                        <ScrambledText radius={110} duration={0.9} speed={0.35} scrambleChars=".:/[]{}<>" className="mx-auto">
                            Trust is built into the flow: show the source, admit uncertainty, escalate to a human, and unlock consults only
                            after payment clears. Private documents stay private.
                        </ScrambledText>
                    </div>
                </Section>

                {/* Footer */}
                <footer className="px-4 pb-14 pt-10">
                    <div className="mx-auto w-full max-w-6xl">
                        <div
                            className="flex flex-col gap-5 rounded-3xl border bg-[color:var(--landing-card)] p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between"
                            style={{ borderColor: "var(--landing-border)" }}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                                    style={{ borderColor: "var(--landing-border)", backgroundColor: "var(--landing-card-strong)" }}
                                >
                                    <Pill className="h-5 w-5" style={{ color: "var(--landing-ink)" }} />
                                </div>
                                <div>
                                    <div className="text-base font-extrabold tracking-tight" style={{ color: "var(--landing-ink)" }}>
                                        MediRep AI
                                    </div>
                                    <div className="text-xs" style={{ color: "var(--landing-muted-2)" }}>
                                        Evidence-first drug intelligence + pharmacist marketplace
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold" style={{ color: "var(--landing-muted)" }}>
                                <a href="#product" onClick={(e) => { e.preventDefault(); scrollToHash("#product"); }} className="hover:text-[color:var(--landing-ink)] hover:underline">
                                    Product
                                </a>
                                <a href="#marketplace" onClick={(e) => { e.preventDefault(); scrollToHash("#marketplace"); }} className="hover:text-[color:var(--landing-ink)] hover:underline">
                                    Marketplace
                                </a>
                                <a href="#how" onClick={(e) => { e.preventDefault(); scrollToHash("#how"); }} className="hover:text-[color:var(--landing-ink)] hover:underline">
                                    How it works
                                </a>
                                <Link href="/compare" className="hover:text-[color:var(--landing-ink)] hover:underline">
                                    Price compare
                                </Link>
                                <Link href="/auth/login" className="hover:text-[color:var(--landing-ink)] hover:underline">
                                    Sign in
                                </Link>
                            </div>
                        </div>

                        <div className="mt-4 text-xs" style={{ color: "var(--landing-muted-2)" }}>
                            © 2026 MediRep AI. Prototype built for a hackathon; not medical advice.
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
}
