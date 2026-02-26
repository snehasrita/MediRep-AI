"use client";

import { motion } from "framer-motion";
import { Circle, Pill } from "lucide-react";
import { cn } from "@/lib/utils";

function ElegantShape({
  className,
  delay = 0,
  width = 520,
  height = 140,
  rotate = 0,
  gradient = "from-[color:var(--landing-moss)]/18",
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -120, rotate: rotate - 10 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        duration: 2.1,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.0 },
      }}
      className={cn("absolute", className)}
    >
      <motion.div
        animate={{ y: [0, 16, 0] }}
        transition={{
          duration: 12,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
          delay: delay * 0.5,
        }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "backdrop-blur-[2px] border border-[color:var(--landing-border)]",
            "shadow-[0_18px_80px_rgba(0,0,0,0.10)]",
            "after:absolute after:inset-0 after:rounded-full",
            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.20),transparent_70%)]",
            "dark:after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.12),transparent_70%)]"
          )}
        />
      </motion.div>
    </motion.div>
  );
}

function FloatingPill({
  className,
  delay = 0,
  rotate = 0,
  tone = "moss",
  size = "md",
}: {
  className?: string;
  delay?: number;
  rotate?: number;
  tone?: "moss" | "clay" | "bone";
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm"
      ? "h-10 w-20"
      : size === "lg"
        ? "h-14 w-28"
        : "h-12 w-24";

  const left =
    tone === "moss"
      ? "from-[color:var(--landing-moss)]/55 to-[color:var(--landing-moss)]/22"
      : tone === "clay"
        ? "from-[color:var(--landing-clay)]/55 to-[color:var(--landing-clay)]/22"
        : "from-[color:var(--landing-bone)]/55 to-[color:var(--landing-bone)]/22";

  const right =
    tone === "moss"
      ? "from-[color:var(--landing-bone)]/38 to-[color:var(--landing-bone)]/16"
      : tone === "clay"
        ? "from-[color:var(--landing-bone)]/34 to-[color:var(--landing-bone)]/14"
        : "from-[color:var(--landing-moss)]/34 to-[color:var(--landing-moss)]/14";

  return (
    <motion.div
      initial={{ opacity: 0, y: -120, rotate: rotate - 18 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        duration: 1.9,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.0 },
      }}
      className={cn("absolute", className)}
      aria-hidden
      >
        <motion.div
          className={cn(
            "relative overflow-hidden rounded-full border border-[color:var(--landing-border)] backdrop-blur-sm",
            "shadow-[0_22px_90px_rgba(0,0,0,0.14)]",
            dims
          )}
          animate={{
            y: [0, -10, 0],
            rotate: [rotate, rotate + 6, rotate],
          }}
        transition={{
          duration: 10 + delay * 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      >
        <div className="absolute inset-0">
          <div className={cn("absolute inset-y-0 left-0 w-1/2 bg-gradient-to-br", left)} />
          <div className={cn("absolute inset-y-0 right-0 w-1/2 bg-gradient-to-br", right)} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.30),transparent_58%)] dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),transparent_60%)]" />
        </div>
        {/* Capsule split highlight */}
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(90deg,rgba(255,255,255,0.24),transparent_48%,rgba(0,0,0,0.18))] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.10),transparent_48%,rgba(0,0,0,0.28))]" />
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[color:var(--landing-border)]/70" />

        {/* Imprint */}
        <div className="pointer-events-none absolute left-[22%] top-1/2 -translate-y-1/2 font-[family-name:var(--font-display)] text-[10px] font-black tracking-[0.22em] text-[color:var(--landing-ink)]/20 dark:text-[color:var(--landing-ink)]/15">
          RX
        </div>
      </motion.div>
    </motion.div>
  );
}

export function HeroGeometric({
  badge = "Evidence-first",
  title1 = "Prescription-grade answers",
  title2 = "with receipts & escalation",
  subtitle = "Drug safety, reimbursement, and price intelligence — plus a verified pharmacist marketplace when you need a human.",
  children,
}: {
  badge?: string;
  title1?: string;
  title2?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const ease = [0.25, 0.4, 0.25, 1] as const;
  const flagGradient = "linear-gradient(90deg, var(--landing-clay), var(--landing-bone), var(--landing-moss))";

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 26 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.95,
        delay: 0.45 + i * 0.15,
        ease,
      },
    }),
  };

  return (
    <div className="relative min-h-[92vh] w-full overflow-hidden bg-[color:var(--landing-paper)]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 18% 16%, rgb(var(--landing-marigold-rgb) / 0.14), transparent 55%), radial-gradient(circle at 85% 22%, rgb(var(--landing-moss-rgb) / 0.16), transparent 55%), radial-gradient(circle at 52% 105%, rgb(var(--landing-clay-rgb) / 0.14), transparent 60%)",
        }}
      />

      <div aria-hidden className="absolute inset-0 overflow-hidden">
        <ElegantShape
          delay={0.25}
          width={620}
          height={160}
          rotate={10}
          gradient="from-[color:var(--landing-bone)]/14"
          className="left-[-12%] top-[14%] md:left-[-6%] md:top-[16%]"
        />
        <ElegantShape
          delay={0.45}
          width={520}
          height={140}
          rotate={-14}
          gradient="from-[color:var(--landing-moss)]/16"
          className="right-[-12%] top-[62%] md:right-[-4%] md:top-[68%]"
        />
        <ElegantShape
          delay={0.35}
          width={340}
          height={100}
          rotate={-8}
          gradient="from-[color:var(--landing-clay)]/16"
          className="left-[6%] bottom-[6%] md:left-[10%] md:bottom-[10%]"
        />

        <FloatingPill delay={0.25} rotate={-18} tone="bone" size="lg" className="left-[12%] top-[10%]" />
        <FloatingPill delay={0.35} rotate={22} tone="moss" size="md" className="right-[18%] top-[14%]" />
        <FloatingPill delay={0.55} rotate={8} tone="clay" size="sm" className="right-[8%] top-[44%]" />
        <FloatingPill delay={0.6} rotate={-10} tone="moss" size="sm" className="left-[22%] top-[58%]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[92vh] w-full max-w-6xl flex-col justify-start px-4 pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="max-w-3xl">
          <motion.div
            custom={0}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center gap-2 rounded-full border bg-[color:var(--landing-card)] px-3 py-1 text-xs font-semibold backdrop-blur"
            style={{ borderColor: "var(--landing-border)", color: "var(--landing-muted)" }}
          >
            <Circle className="h-2 w-2 fill-[color:var(--landing-clay)]/80" />
            <span className="tracking-wide">{badge}</span>
            <span className="opacity-70">·</span>
            <Pill className="h-3.5 w-3.5" />
            <span className="opacity-80">Digital Medical Representative</span>
          </motion.div>

          <motion.div custom={1} variants={fadeUpVariants} initial="hidden" animate="visible">
            <h1 className="mt-5 text-balance font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight leading-[1.02] sm:text-6xl">
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: flagGradient,
                  filter: "drop-shadow(0 16px 42px rgba(0,0,0,0.28))",
                }}
              >
                {title1}
              </span>
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: flagGradient,
                  filter: "drop-shadow(0 16px 42px rgba(0,0,0,0.28))",
                }}
              >
                {title2}
              </span>
            </h1>
          </motion.div>

          <motion.div custom={2} variants={fadeUpVariants} initial="hidden" animate="visible">
            <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed" style={{ color: "var(--landing-muted)" }}>
              {subtitle}
            </p>
          </motion.div>

          {children ? (
            <motion.div custom={3} variants={fadeUpVariants} initial="hidden" animate="visible" className="mt-7">
              {children}
            </motion.div>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--landing-paper)] via-transparent to-[color:var(--landing-paper)]/60" />
    </div>
  );
}
