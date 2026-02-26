"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import {
  MessageSquare, Activity, Pill, AlertTriangle, User, ArrowRight, Scale,
  LayoutDashboard, LogOut, Stethoscope, Camera
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarLogo,
  SidebarTrigger,
} from "@/components/ui/animated-sidebar";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface BentoGridItemProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  url: string;
  accent?: string;
}

const BentoGridItem = ({
  title,
  description,
  icon,
  className,
  url,
  accent = "bg-[#c85a3a]",
}: BentoGridItemProps) => {
  const variants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", damping: 25 },
    },
  };

  return (
    <motion.div
      variants={variants}
      whileHover={{ y: -8, scale: 1.03 }}
      className={cn(
        "group relative flex h-full min-h-[180px] cursor-pointer flex-col justify-between overflow-hidden rounded-3xl p-6 sm:p-8",
        "bg-white/90 backdrop-blur-xl",
        "border-2 border-orange-200/50",
        "shadow-lg hover:shadow-2xl",
        "transition-all duration-500",
        className
      )}
    >
      <Link href={url} className="absolute inset-0 z-20" />

      {/* Decorative background circles */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-orange-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-pink-200/20 rounded-full blur-2xl" />
      <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-orange-100/40 rounded-full blur-xl" />
      
      {/* Animated gradient background on hover */}
      <div className="absolute inset-0 bg-linear-to-br from-orange-50/80 via-transparent to-pink-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* Floating particles effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-orange-200/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className={cn(
            "mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl",
            "shadow-xl group-hover:shadow-2xl",
            accent,
            "group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 relative"
          )}>
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
                 style={{ boxShadow: '0 0 30px rgba(203, 85, 52, 0.6)' }} 
            />
            <span className="text-white text-xl relative z-10">{icon}</span>
          </div>
          <h3 className="mb-2 text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
            {title}
          </h3>
          <p className="text-gray-600 text-sm sm:text-base leading-relaxed">
            {description}
          </p>
        </div>
        <div className="mt-4 flex items-center text-sm font-semibold text-[#c85a3a] group-hover:text-[#b14a2f]">
          <span className="mr-2">Open</span>
          <ArrowRight className="size-4 transition-all duration-300 group-hover:translate-x-2" />
        </div>
      </div>

      {/* Shine effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      </div>
    </motion.div>
  );
};

type DashboardItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  description: string;
  colSpan: string;
  accent: string;
};

const items: DashboardItem[] = [
  {
    title: "AI Chat",
    url: "/dashboard/Chat",
    icon: <MessageSquare className="size-6" />,
    description: "Ask questions about medications and get instant AI-powered answers",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
  {
    title: "Drug Interactions",
    url: "/dashboard/InteractionGraph",
    icon: <Activity className="size-6" />,
    description: "Visualize and check drug interactions",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
  {
    title: "Pill Scanner",
    url: "/dashboard/PillScanner",
    icon: <Camera className="size-6" />,
    description: "Identify pills using image recognition",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
  {
    title: "Patient Context",
    url: "/dashboard/PatientContext",
    icon: <User className="size-6" />,
    description: "Manage patient health information",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
  {
    title: "Book Pharmacist",
    url: "/dashboard/BookPharmacist",
    icon: <Stethoscope className="size-6" />,
    description: "Connect with expert pharmacists",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
  {
    title: "Price Compare",
    url: "/compare",
    icon: <Scale className="size-6" />,
    description: "Compare medicine prices across pharmacies",
    colSpan: "md:col-span-1",
    accent: "bg-[color:var(--landing-clay)]",
  },
];

const sidebarLinks = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "AI Chat",
    href: "/dashboard/Chat",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    label: "Drug Interactions",
    href: "/dashboard/InteractionGraph",
    icon: <Activity className="h-5 w-5" />,
  },
  {
    label: "Pill Scanner",
    href: "/dashboard/PillScanner",
    icon: <Camera className="h-5 w-5" />,
  },

  {
    label: "Patient Context",
    href: "/dashboard/PatientContext",
    icon: <User className="h-5 w-5" />,
  },
  {
    label: "Book Pharmacist",
    href: "/dashboard/BookPharmacist",
    icon: <Stethoscope className="h-5 w-5" />,
  },
  {
    label: "Price Compare",
    href: "/compare",
    icon: <Scale className="h-5 w-5" />,
  },
];

interface DashboardProps {
  initialUserEmail?: string | null;
  initialUserName?: string | null;
  initialUserAvatar?: string | null;
}

export default function Dashboard({ initialUserEmail, initialUserName, initialUserAvatar }: DashboardProps) {
  const [open, setOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  };

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-(--landing-paper) border-b border-(--landing-border) px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="MediRep AI" width={24} height={24} className="h-6 w-6 dark:invert" />
          <span className="font-bold text-lg text-(--landing-ink)">MediRep AI</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-[rgb(var(--landing-dot-rgb)/0.06)] transition-colors"
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

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div className={cn(
        "lg:hidden fixed top-[57px] right-0 bottom-0 z-40 w-64 bg-(--landing-paper) border-l border-(--landing-border) transform transition-transform duration-300 overflow-y-auto",
        mobileMenuOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-4 flex flex-col gap-2">
          {sidebarLinks.map((link, idx) => (
            <Link
              key={idx}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                pathname === link.href
                  ? "bg-(--landing-moss) text-white shadow-lg"
                  : "text-(--landing-muted) hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
              )}
            >
              {link.icon}
              <span className="text-sm font-medium">{link.label}</span>
            </Link>
          ))}
          
          <div className="border-t border-(--landing-border) mt-4 pt-4">
            <Link
              href="/dashboard/settings"
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                pathname === "/dashboard/settings"
                  ? "bg-(--landing-moss) text-white shadow-lg"
                  : "text-(--landing-muted) hover:bg-[rgb(var(--landing-dot-rgb)/0.06)]"
              )}
            >
              <User className="h-5 w-5" />
              <span className="text-sm font-medium">Profile</span>
            </Link>
            
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleSignOut();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-(--landing-muted) hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 mt-2"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <Sidebar open={open} setOpen={setOpen}>
      <div className="flex h-screen bg-(--landing-paper) text-(--landing-ink) overflow-hidden">
        {/* Animated Background */}
        <div className="fixed inset-0 z-0">
          {/* Keep it clean (no gradients) */}
        </div>

        {/* Desktop Sidebar - Hidden on mobile */}
        <div className="hidden lg:block">
          <SidebarBody className="justify-between gap-10 relative z-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <SidebarLogo
              open={open}
              icon={<Image src="/logo.png" alt="MediRep AI" width={20} height={20} className="h-5 w-5 dark:invert" />}
              title="MediRep AI"
              subtitle="Medical Assistant"
            />

            <div className="mt-8 flex flex-col gap-1">
              {sidebarLinks.map((link, idx) => (
                <SidebarLink
                  key={idx}
                  link={link}
                  isActive={pathname === link.href}
                />
              ))}
            </div>
          </div>

          {/* User section at bottom */}
          <div className="border-t border-(--landing-border) pt-4">
            <SidebarLink
              link={{
                label: "Profile",
                href: "/dashboard/settings",
                icon: <User className="h-5 w-5" />,
              }}
              isActive={pathname === "/dashboard/settings"}
            />
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 py-3 px-3 rounded-xl text-(--landing-muted) hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              {open && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm font-medium whitespace-pre"
                >
                  Sign Out
                </motion.span>
              )}
            </button>
          </div>


        </SidebarBody>
        </div>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative z-10 lg:pt-0 pt-[57px] bg-linear-to-br from-[#fef5f1] to-[#f9dcc4]">
          <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 md:mb-8"
            >
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-(--landing-ink) mb-2 tracking-tight font-display">
                Welcome back, {initialUserName || initialUserEmail?.split('@')[0] || 'User'}
              </h1>
              <p className="text-(--landing-muted) text-base md:text-lg">
                Your AI-powered medical assistant is ready to help.
              </p>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {items.map((item, i) => (
                <BentoGridItem
                  key={i}
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                  url={item.url}
                  className={item.colSpan}
                  accent={item.accent}
                />
              ))}
            </motion.div>
          </div>
        </main>
      </div>
    </Sidebar>
    </>
  );
}
