"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Shield,
  Loader2,
  Github,
  MessageSquareText,
  Search,
  IndianRupee,
  ShieldCheck,
  BadgeCheck,
  PhoneCall,
  ChevronRight,
  Lock,
  CircleHelp,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import Image from "next/image";
import BlurText from "@/components/ui/blur-text";
import ScrambledText from "@/components/ui/scrambled-text";
import ScrollFloat from "@/components/ui/scroll-float";

// --- Helper Components ---

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
      bg: "var(--landing-marigold, #F5A623)",
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
      className="group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:-translate-y-1 cursor-pointer bg-white/90 backdrop-blur-sm"
      style={{ borderColor: "rgba(203, 85, 52, 0.2)" }}
    >
      {/* Animated gradient background on hover */}
      <div className="absolute inset-0 bg-linear-to-br from-orange-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-md"
            style={{
              backgroundColor: `rgba(${color.rgb}, 0.15)`,
              color: color.bg,
            }}
          >
            {icon}
          </div>
          <div className="font-bold text-gray-900 text-lg">{title}</div>
        </div>
        <div className="text-sm leading-relaxed text-gray-600">
          {body}
        </div>
      </div>

      {/* Shine effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
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
    <section id={id} className="py-20 md:py-32 relative z-10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-12 md:text-center">
          <div
            className="mb-4 text-xs font-bold uppercase tracking-widest text-(--landing-clay)"
          >
            {eyebrow}
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-(--landing-ink) md:text-5xl font-display">
            {title}
          </h2>
          {subtitle && (
            <p className="mx-auto max-w-2xl text-lg text-(--landing-muted)">
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
};

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Scroll detection
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll(); // Check initial state

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-[#fde4c8] text-(--landing-ink) font-sans selection:bg-(--landing-clay) selection:text-white">
      {/* Video Background - Only for Hero Section */}
      <div className="absolute top-0 left-0 right-0 h-screen z-0 pointer-events-none overflow-hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/dna-video.webm" type="video/webm" />
        </video>
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/40 to-black/60" />
      </div>

      {/* Navbar - Liquid Glass Effect */}
      <nav className="fixed z-50 w-full px-2 pt-2">
        <div
          className={cn(
            "mx-auto px-4 sm:px-6 transition-all duration-500 ease-out lg:px-5",
            scrolled
              ? "max-w-4xl rounded-[24px] border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-white/10"
              : "max-w-6xl rounded-[24px] border border-white/20 bg-white/10 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] ring-1 ring-white/10"
          )}
        >
          <div className="relative flex items-center justify-between py-3 lg:py-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="MediRep AI" width={32} height={32} className="h-7 w-7 sm:h-8 sm:w-8 brightness-0 invert" />
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">MediRep AI</h1>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white/70" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  <Link href="/pharmacist/dashboard">
                    <Button variant="ghost" size={scrolled ? "sm" : "default"} className="text-white/90 hover:text-white hover:bg-white/10 font-medium">Pharmacist</Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size={scrolled ? "sm" : "default"} className="bg-[#c85a3a] text-white hover:bg-[#b14a2f] shadow-lg font-semibold">
                      Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/auth/login">
                    <Button variant="ghost" size={scrolled ? "sm" : "default"} className="text-white/90 hover:text-white hover:bg-white/10 font-medium">Sign In</Button>
                  </Link>
                  <Link href="/auth/signup">
                    <Button size={scrolled ? "sm" : "default"} className="bg-[#c85a3a] text-white hover:bg-[#b14a2f] shadow-lg font-semibold">Get Started</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors text-white"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <>
            <div
              className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm top-[72px]"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="md:hidden fixed top-[72px] left-2 right-2 bg-white/10 backdrop-blur-2xl rounded-2xl border border-white/20 shadow-2xl p-4 space-y-2 z-50 ring-1 ring-white/10">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                </div>
              ) : user ? (
                <>
                  <Link href="/pharmacist/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start text-white/90 hover:text-white hover:bg-white/10 font-medium">Pharmacist Portal</Button>
                  </Link>
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-[#c85a3a] text-white hover:bg-[#b14a2f] font-semibold">
                      Dashboard
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start text-white/90 hover:text-white hover:bg-white/10 font-medium">Sign In</Button>
                  </Link>
                  <Link href="/auth/signup" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full bg-[#c85a3a] text-white hover:bg-[#b14a2f] font-semibold">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Hero Section - Takes remaining viewport height */}
      <main className="flex-1 relative z-10">
        <section className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16 sm:py-20 md:py-24 pt-24 sm:pt-28 md:pt-32">
          <div className="container mx-auto text-center space-y-8 max-w-4xl">
            {/* Hero Content - Floating freely */}
            <div className="relative z-10 space-y-8 py-10">
              {/* Subtle ambient glow - Blue in dark mode, Purple in light mode */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 dark:bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

              <div className="relative">
                <div className="inline-flex items-center rounded-full border border-white/30 bg-white/10 backdrop-blur-md px-5 py-2.5 text-sm font-medium text-white shadow-lg mb-8 ring-1 ring-white/20">
                  <Shield className="mr-2 h-4 w-4 text-white" />
                  Trusted by healthcare professionals
                </div>

                <h1 className="font-sans text-4xl xs:text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-[7rem] font-black tracking-tighter text-white leading-[0.9] drop-shadow-2xl uppercase">
                  MediRep <span className="text-[#c85a3a] inline-block hover:scale-105 transition-transform duration-300">AI</span>
                  <br />
                  <span className="font-serif italic font-light tracking-normal text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl normal-case text-white/90 block mt-2">
                    Medical Assistant
                  </span>
                </h1>

                <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-white font-medium max-w-3xl mx-auto leading-relaxed mt-6 sm:mt-8 md:mt-10 drop-shadow-md bg-black/10 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10">
                  Get instant access to drug information, interaction checks, and
                  MOA and representation. Built for medical representatives who need accurate
                  information fast.
                </p>
              </div>
            </div>

            <div className="flex gap-3 sm:gap-4 justify-center items-center flex-wrap pt-4 sm:pt-6 px-2">
              {user ? (
                <>
                  <Link href="/dashboard">
                    <Button size="lg" className="h-11 sm:h-14 px-6 sm:px-10 text-sm sm:text-base rounded-full bg-[#c85a3a] text-white hover:bg-[#b14a2f] shadow-xl transition-all hover:scale-105 duration-200 font-semibold">
                      Go to Dashboard
                    </Button>
                  </Link>
                  <Link href="/pharmacist/dashboard">
                    <Button size="lg" variant="outline" className="h-11 sm:h-14 px-6 sm:px-10 text-sm sm:text-base text-white hover:text-white hover:bg-white/10 font-semibold rounded-full backdrop-blur-md border-2 border-white/30 bg-white/5 shadow-lg transition-all hover:scale-105 duration-200">
                      Pharmacist Portal
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/auth/signup?role=patient">
                    <Button size="lg" className="h-11 sm:h-14 px-6 sm:px-10 text-sm sm:text-base rounded-full bg-[#c85a3a] text-white hover:bg-[#b14a2f] shadow-xl transition-all hover:scale-105 duration-200 font-semibold">
                      Get Started
                    </Button>
                  </Link>
                  <Link href="/pharmacist/auth/signup">
                    <Button size="lg" variant="outline" className="h-11 sm:h-14 px-6 sm:px-10 text-sm sm:text-base text-white hover:text-white hover:bg-white/10 font-semibold rounded-full backdrop-blur-md border-2 border-white/30 bg-white/5 shadow-lg transition-all hover:scale-105 duration-200">
                      Join as Pharmacist
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>



        {/* --- Rendered v2 Sections --- */}

        <Section
          id="product"
          eyebrow="Product"
          title={
            <>
              A workflow built for{" "}
              <span className="text-primary font-bold">
                clinical speed
              </span>
              , not demo vibes.
            </>
          }
          subtitle="We optimized for clarity, speed, and escalation — the parts users actually feel."
        >
          <div className="relative overflow-hidden rounded-3xl border border-orange-200/50 p-8 bg-white/90 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-[1.01] group">
            {/* Animated background gradient */}
            <div className="absolute inset-0 bg-linear-to-br from-orange-50/80 via-transparent to-pink-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Floating particles effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-200/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-pink-200/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

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
                  tone="clay"
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

                <div className="mt-3 flex flex-wrap items-center justify-start gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold" style={{ color: "var(--landing-ink)" }}>
                  <span className="rounded-full border px-2 sm:px-3 py-0.5 sm:py-1" style={{ borderColor: "var(--landing-border)" }}>
                    warfarin + aspirin
                  </span>
                  <span className="opacity-50 hidden sm:inline">→</span>
                  <span className="rounded-full border px-2 sm:px-3 py-0.5 sm:py-1" style={{ borderColor: "var(--landing-border)" }}>
                    interaction + mitigation
                  </span>
                  <span className="opacity-50 hidden sm:inline">→</span>
                  <span className="rounded-full border px-2 sm:px-3 py-0.5 sm:py-1" style={{ borderColor: "var(--landing-border)" }}>
                    cite sources
                  </span>
                  <span className="opacity-50 hidden sm:inline">→</span>
                  <span className="rounded-full border px-2 sm:px-3 py-0.5 sm:py-1" style={{ borderColor: "var(--landing-border)" }}>
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
              <span className="text-primary font-bold">
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
                    <Button className="w-full rounded-2xl bg-(--landing-moss) text-(--landing-bone) hover:brightness-95">
                      Open marketplace <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/pharmacist/register">
                    <Button
                      variant="outline"
                      className="w-full rounded-2xl bg-(--landing-card) hover:bg-(--landing-card-strong)"
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
                tone="clay"
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
              tone="clay"
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
      </main>

      {/* Discord-style Footer */}
      <footer className="bg-[#c85a3a] pt-12 sm:pt-16 md:pt-24 pb-8 sm:pb-12 relative overflow-hidden">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 relative flex flex-col justify-center min-h-[280px] sm:min-h-[320px] md:min-h-[400px]">

          {/* Floating Elements - Hidden on very small screens */}
          <div className="hidden sm:block absolute top-0 right-4 sm:right-6 text-white/80 text-[10px] sm:text-xs font-bold tracking-widest uppercase mt-4 sm:mt-6 font-mono z-10">
            Official AI Medical Assistant
          </div>

          {/* Giant Typography - Responsive sizing with clamp */}
          <div className="flex justify-center md:justify-start items-center w-full py-6 sm:py-8 md:py-0">
            <h1
              className="font-black leading-[0.9] tracking-tighter text-white uppercase font-sans select-none mix-blend-overlay opacity-90 text-center md:text-left"
              style={{ fontSize: "clamp(2.5rem, 10vw, 12rem)" }}
            >
              MediRep AI
            </h1>
          </div>

          {/* Mobile Footer Links */}
          <div className="flex md:hidden flex-wrap justify-center gap-4 text-white/70 text-sm font-semibold mt-4 mb-6">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="https://github.com/MitudruDutta/MediRep-AI" target="_blank" className="hover:text-white transition-colors flex items-center gap-2">
              <Github className="w-4 h-4" />
              GitHub
            </Link>
          </div>

          {/* Mobile Help Button & Copyright */}
          <div className="flex md:hidden flex-col items-center gap-4 mt-2">
            <Link href="/help">
              <Button className="rounded-full bg-white text-[#c85a3a] hover:bg-white/90 font-bold px-5 py-5 shadow-xl hover:shadow-2xl transition-all flex items-center gap-2 text-sm">
                <CircleHelp className="w-4 h-4" />
                Help
              </Button>
            </Link>
            <div className="text-white/40 text-[10px] font-mono text-center leading-tight">
              © 2026 MediRep AI. System Status: <span className="text-green-300">Operational</span>
            </div>
          </div>

          {/* Desktop Bottom Controls */}
          <div className="hidden md:flex absolute bottom-6 right-6 items-center gap-4 z-10">
            <div className="flex items-center gap-6 text-white/70 text-sm font-semibold mr-4">
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="https://github.com/MitudruDutta/MediRep-AI" target="_blank" className="hover:text-white transition-colors flex items-center gap-2">
                <Github className="w-4 h-4" />
                GitHub
              </Link>
            </div>

            <Link href="/help">
              <Button className="rounded-full bg-white text-[#c85a3a] hover:bg-white/90 font-bold px-6 py-6 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all flex items-center gap-2 text-base">
                <CircleHelp className="w-5 h-5" />
                Help
              </Button>
            </Link>
          </div>

          {/* Desktop Copyright/Status (Tiny) */}
          <div className="hidden md:block absolute bottom-8 left-8 text-white/40 text-[10px] font-mono max-w-xs leading-tight z-10">
            © 2026 MediRep AI.<br />
            System Status: <span className="text-green-300">Operational</span>
          </div>

        </div>
      </footer>
    </div>
  );
}
