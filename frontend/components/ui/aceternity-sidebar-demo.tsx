"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { LayoutDashboard, UserCog, Settings, LogOut, Pill } from "lucide-react";

import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/animated-sidebar";
import { cn } from "@/lib/utils";

export function SidebarDemo() {
  const links = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard className="h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Profile",
      href: "/dashboard/Profile",
      icon: <UserCog className="h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Settings",
      href: "/dashboard/Settings",
      icon: <Settings className="h-5 w-5 flex-shrink-0" />,
    },
  ];

  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl flex flex-col md:flex-row bg-background w-full flex-1 border border-border overflow-hidden",
        "h-[70vh]"
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col gap-1">
              {links.map((link) => (
                <SidebarLink key={link.href} link={link} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <SidebarLink
              link={{
                label: "Sign out",
                href: "#",
                icon: <LogOut className="h-5 w-5 flex-shrink-0" />,
              }}
              onClick={() => {
                // Demo-only: wire this to real signOut in app code.
                alert("Demo: connect this to /auth/actions signOut()");
              }}
            />
            <SidebarLink
              link={{
                label: "Alex (Demo)",
                href: "#",
                icon: (
                  <Image
                    src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80"
                    className="h-7 w-7 flex-shrink-0 rounded-full"
                    width={56}
                    height={56}
                    alt="Demo avatar"
                  />
                ),
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>

      <DashboardPlaceholder />
    </div>
  );
}

function Logo() {
  return (
    <Link
      href="/"
      className="font-normal flex space-x-2 items-center text-sm py-1 relative z-20"
    >
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 flex-shrink-0">
        <Pill className="h-4 w-4 text-white" />
      </div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-semibold text-foreground whitespace-pre font-[family-name:var(--font-display)]"
      >
        MediRep AI
      </motion.span>
    </Link>
  );
}

function LogoIcon() {
  return (
    <Link
      href="/"
      className="font-normal flex space-x-2 items-center text-sm py-1 relative z-20"
    >
      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 flex-shrink-0">
        <Pill className="h-4 w-4 text-white" />
      </div>
    </Link>
  );
}

function DashboardPlaceholder() {
  return (
    <div className="flex flex-1">
      <div className="p-3 md:p-10 rounded-tl-2xl border border-border bg-background flex flex-col gap-3 flex-1 w-full h-full">
        <div className="flex gap-3">
          {[...new Array(4)].map((_, i) => (
            <div
              key={`row1-${i}`}
              className="h-24 w-full rounded-xl bg-muted animate-pulse"
            />
          ))}
        </div>
        <div className="flex gap-3 flex-1">
          {[...new Array(2)].map((_, i) => (
            <div
              key={`row2-${i}`}
              className="h-full w-full rounded-xl bg-muted animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
